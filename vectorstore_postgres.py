# vectorstore_postgres.py - PostgreSQL with pgvector support
"""
Enhanced vector store using PostgreSQL pgvector for hybrid search
Replaces FAISS file-based storage with database-backed vector search
"""
import os
import logging
import psycopg2
import psycopg2.extras
import numpy as np
from typing import List, Dict, Optional
from contextlib import contextmanager
from dotenv import load_dotenv
from pgvector.psycopg2 import register_vector

# Load environment variables
load_dotenv()

# Database connection parameters
DB_PARAMS = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': os.getenv('POSTGRES_PORT', '5432'),
    'database': os.getenv('POSTGRES_DB', 'rag_lms'),
    'user': os.getenv('POSTGRES_USER', 'rag_lms_user'),
    'password': os.getenv('POSTGRES_PASSWORD', 'raglms_secure_2025')
}

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2

logger = logging.getLogger("rag-vectorstore")

@contextmanager
def get_db_connection():
    """Context manager for database connections with pgvector support"""
    conn = psycopg2.connect(**DB_PARAMS)
    register_vector(conn)  # Register pgvector type
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        conn.close()

def get_dict_cursor(conn):
    """Get a cursor that returns dictionaries"""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


def add_documents(chatbot_id: str, embeddings: np.ndarray, metadatas: List[Dict]):
    """
    Add documents to vectorstore with hybrid indexing
    
    Args:
        chatbot_id: Unique chatbot identifier
        embeddings: Document embedd (n x EMBEDDING_DIM)
        metadatas: List of metadata dicts containing 'text', 'page', etc.
    
    Returns:
        Dict with stats about added documents
    """
    if embeddings is None:
        raise ValueError("embeddings is None")
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_DIM:
        raise ValueError(f"Embeddings must be shape (n, {EMBEDDING_DIM}), got {embeddings.shape}")
    
    if len(embeddings) != len(metadatas):
        raise ValueError(f"Embeddings count ({len(embeddings)}) must match metadata count ({len(metadatas)})")
    
    n = embeddings.shape[0]

    # Build all rows first, then batch-insert in one round-trip
    rows = []
    for i in range(n):
        metadata = metadatas[i]
        text = metadata.get('text', '')
        original_text = metadata.get('original_text', text)
        source = metadata.get('source', '')
        page = metadata.get('page')
        heading = metadata.get('heading', '')
        section_type = metadata.get('section_type', 'content')
        is_feedback = metadata.get('is_feedback', False)
        extra_metadata = {k: v for k, v in metadata.items()
                          if k not in ['text', 'original_text', 'source', 'page', 'heading', 'section_type', 'is_feedback']}
        rows.append((
            chatbot_id, text, original_text, embeddings[i].tolist(),
            source, page, heading, section_type, is_feedback,
            psycopg2.extras.Json(extra_metadata)
        ))

    added_count = 0
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            try:
                psycopg2.extras.execute_values(
                    cur,
                    """INSERT INTO document_chunks
                       (chatbot_id, text, original_text, embedding, source, page, heading, section_type, is_feedback, metadata)
                       VALUES %s""",
                    rows,
                    page_size=100
                )
                added_count = n
            except Exception as e:
                logger.error(f"Batch insert failed: {e}")
                conn.rollback()  # clear aborted transaction before fallback
                # Row-by-row fallback so partial failures don't lose everything
                for idx, row in enumerate(rows):
                    try:
                        cur.execute(
                            """INSERT INTO document_chunks
                               (chatbot_id, text, original_text, embedding, source, page, heading, section_type, is_feedback, metadata)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                            row
                        )
                        added_count += 1
                    except Exception as e2:
                        logger.error(f"Error inserting chunk {idx}: {e2}")
    
    # Get total document count
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,)
            )
            total_docs = cur.fetchone()[0]
    
    return {
        "added": added_count,
        "total_docs": total_docs,
        "chatbot_id": chatbot_id
    }


def query_index(chatbot_id: str, query_embedding: np.ndarray, top_k: int = 5, use_faiss: bool = True):
    """
    Query using vector similarity only (for backward compatibility)
    For hybrid search, use hybrid_query() instead
    
    Args:
        chatbot_id: Chatbot identifier
        query_embedding: Query embedding vector
        top_k: Number of results to return
        use_faiss: Ignored (for backward compatibility)
    
    Returns:
        List of documents with similarity scores
    """
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)
    
    query_vector = query_embedding[0].tolist()
    
    results = []
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Cosine similarity search using pgvector
            cur.execute(
                """SELECT id, text, original_text, source, page, heading, section_type, is_feedback,
                          1 - (embedding <=> %s) as similarity
                   FROM document_chunks
                   WHERE chatbot_id = %s
                   ORDER BY embedding <=> %s
                   LIMIT %s""",
                (query_vector, chatbot_id, query_vector, top_k)
            )

            rows = cur.fetchall()

            for row in rows:
                results.append({
                    "id": row['id'],
                    "score": float(1 - row['similarity']),
                    "text": row['text'],
                    "original_text": row['original_text'],
                    "source": row['source'],
                    "page": row['page'],
                    "heading": row['heading'] or "",
                    "section_type": row.get('section_type', 'content'),
                })
    
    return results


def _rerank_results(query: str, results: List[Dict], top_k: int) -> List[Dict]:
    """
    Stage-3 reranking using a multilingual cross-encoder.

    The cross-encoder reads (query, passage) jointly — far more accurate than
    bi-encoder cosine similarity for deciding relevance.
    Supports 100+ languages including Nepali.

    Each passage is enriched with chapter + heading + section_type metadata
    so the cross-encoder can see context (e.g. a trig exercise chunk knows
    it belongs to 'Trigonometry | Exercise 20.1 | exercise').

    Combines: 50% cross-encoder + 50% hybrid (preserves section/chapter boosts
    and keyword/vector signals from earlier stages).
    """
    from models import get_rerank_model
    reranker = get_rerank_model()

    # Build (query, enriched_passage) pairs
    pairs = []
    for r in results:
        # Prepend chapter + heading + section_type so the cross-encoder
        # sees the structural context, not just raw text
        prefix_parts = []
        if r.get('chapter'):
            prefix_parts.append(r['chapter'])
        if r.get('heading'):
            prefix_parts.append(r['heading'])
        sec_type = r.get('section_type', 'content')
        if sec_type != 'content':
            prefix_parts.append(sec_type.replace('_', ' '))
        prefix = " | ".join(prefix_parts)
        passage = f"{prefix}: {r['text'][:480]}" if prefix else r['text'][:512]
        pairs.append((query, passage))

    ce_scores = reranker.predict(pairs, batch_size=32)

    # Normalise cross-encoder scores to [0, 1]
    ce_min, ce_max = float(min(ce_scores)), float(max(ce_scores))
    ce_range = ce_max - ce_min if ce_max > ce_min else 1.0

    for r, ce_raw in zip(results, ce_scores):
        ce_norm = (float(ce_raw) - ce_min) / ce_range
        r['rerank_score'] = float(ce_raw)
        # Final score: 50% cross-encoder + 50% hybrid (preserves section/chapter boosts)
        r['hybrid_score'] = 0.5 * ce_norm + 0.5 * r['hybrid_score']

    results.sort(key=lambda r: r['hybrid_score'], reverse=True)
    return results[:top_k]


def hybrid_query(
    chatbot_id: str,
    query: str,
    query_embedding: np.ndarray,
    top_k: int = 15,
    bm25_weight: float = 0.3,
    faiss_weight: float = 0.7,
    section_type_filter: str = None,
    use_reranker: bool = True,
) -> List[Dict]:
    """
    3-stage hybrid retrieval pipeline:

      Stage 1 — BM25 + pgvector hybrid search  (SQL function, fast)
      Stage 2 — Section-type & chapter boosting (lightweight rule-based)
      Stage 3 — Cross-encoder reranking         (accurate, ~30 passages/s)

    Args:
        chatbot_id: Chatbot identifier
        query: Query text for full-text search
        query_embedding: Query embedding for vector similarity
        top_k: Number of results to return
        bm25_weight: Weight for text search scores (default 0.3)
        faiss_weight: Weight for vector similarity scores (default 0.7)
        section_type_filter: Optional section type prefix to boost (e.g. "exercise")
        use_reranker: Whether to apply cross-encoder reranking (default True)

    Returns:
        List of documents with hybrid scores
    """
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)

    query_vector = query_embedding[0].tolist()

    # Always over-fetch candidates so re-ranking has enough to work with
    fetch_k = top_k * 3

    results = []

    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            cur.execute(
                """SELECT * FROM hybrid_search(%s, %s, %s::vector, %s, %s::real, %s::real)""",
                (chatbot_id, query, query_vector, fetch_k, bm25_weight, faiss_weight)
            )

            rows = cur.fetchall()

            for row in rows:
                results.append({
                    "id": row['id'],
                    "text": row['text'],
                    "original_text": row['original_text'],
                    "source": row['source'],
                    "page": row['page'],
                    "heading": row['heading'] or "",
                    "section_type": row.get('section_type', 'content'),
                    "is_feedback": row['is_feedback'],
                    "hybrid_score": float(row['hybrid_score']),
                    "bm25_score": float(row['bm25_score']),
                    "faiss_similarity": float(row['vector_similarity']),
                    "retrieval_method": "hybrid"
                })

    # Enrich results with chapter metadata from JSONB column
    if results:
        chunk_ids = [r['id'] for r in results]
        with get_db_connection() as conn:
            with get_dict_cursor(conn) as cur:
                cur.execute(
                    """SELECT id, metadata FROM document_chunks WHERE id = ANY(%s)""",
                    (chunk_ids,)
                )
                meta_rows = {row['id']: row['metadata'] for row in cur.fetchall()}

                for result in results:
                    meta = meta_rows.get(result['id']) or {}
                    result['chapter'] = meta.get('chapter', '')

    # ── Stage 2: Section-type & chapter boosting ──
    if section_type_filter and results:
        q_lower = query.lower()
        noise_words = {
            "exercise", "exercises", "problem", "problems", "question",
            "questions", "example", "examples", "activity", "activities",
            "glossary", "program", "programs", "code", "list", "show",
            "me", "the", "all", "from", "of", "in", "a", "an", "can",
            "you", "what", "are", "is", "give", "find",
        }
        topic_words = [w for w in q_lower.split() if w not in noise_words and len(w) > 2]

        SECTION_BOOST = 0.10
        CHAPTER_BOOST = 0.15

        for r in results:
            boost = 0.0
            sec = r.get('section_type', '')
            if sec.startswith(section_type_filter):
                boost += SECTION_BOOST
            chapter_lower = r.get('chapter', '').lower()
            heading_lower = r.get('heading', '').lower()
            text_first_200 = r.get('text', '')[:200].lower()
            if topic_words and any(
                tw in chapter_lower or tw in heading_lower or tw in text_first_200
                for tw in topic_words
            ):
                boost += CHAPTER_BOOST
            r['hybrid_score'] += boost

    # ── Stage 3: Cross-encoder reranking ──
    if use_reranker and results:
        try:
            results = _rerank_results(query, results, top_k)
        except Exception as e:
            logger.warning(f"Reranker failed, falling back to hybrid scores: {e}")
            results.sort(key=lambda r: r['hybrid_score'], reverse=True)
            results = results[:top_k]
    else:
        results.sort(key=lambda r: r['hybrid_score'], reverse=True)
        results = results[:top_k]

    return results


def add_feedback_document(chatbot_id: str, question: str, corrected_answer: str, embedding: np.ndarray):
    """
    Add a corrected answer as a feedback document to the RAG database
    This allows the monitoring panel corrections to improve future responses
    
    Args:
        chatbot_id: Chatbot identifier
        question: Original question
        corrected_answer: Instructor's corrected answer
        embedding: Embedding of the corrected answer
    """
    text = f"Q: {question}\nA: {corrected_answer}"
    
    metadata = {
        "text": text,
        "original_text": text,
        "source": "instructor_feedback",
        "page": None,
        "heading": "Instructor Feedback",
        "is_feedback": True
    }
    
    embedding_array = np.array([embedding]).astype("float32")
    
    return add_documents(chatbot_id, embedding_array, [metadata])


def delete_chatbot(chatbot_id: str):
    """Delete all chunks for a chatbot (cascades automatically via foreign key)"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,)
            )
            deleted_count = cur.rowcount
    
    logger.info(f"Deleted {deleted_count} chunks for chatbot {chatbot_id}")
    return {"deleted_chunks": deleted_count}


def get_chatbot_stats(chatbot_id: str) -> Dict:
    """Get statistics for a chatbot's vector store"""
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Total chunks
            cur.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,)
            )
            total_chunks = cur.fetchone()[0]
            
            # Feedback chunks
            cur.execute(
                "SELECT COUNT(*) FROM document_chunks WHERE chatbot_id = %s AND is_feedback = TRUE",
                (chatbot_id,)
            )
            feedback_chunks = cur.fetchone()[0]
            
            # Unique sources
            cur.execute(
                "SELECT COUNT(DISTINCT source) FROM document_chunks WHERE chatbot_id = %s",
                (chatbot_id,)
            )
            unique_sources = cur.fetchone()[0]
    
    return {
        "chatbot_id": chatbot_id,
        "total_vectors": total_chunks,
        "total_documents": total_chunks,
        "feedback_documents": feedback_chunks,
        "unique_sources": unique_sources,
        "has_bm25": total_chunks > 0,  # Full-text search always available
        "embedding_dimension": EMBEDDING_DIM,
        "backend": "postgresql_pgvector"
    }


# Legacy compatibility - load/save functions (no-ops for PostgreSQL)
def load_index_and_meta(chatbot_id: str):
    """Legacy compatibility - not needed for PostgreSQL"""
    logger.warning("load_index_and_meta is deprecated with PostgreSQL backend")
    return None, {"chatbot_id": chatbot_id}, None


def save_index_and_meta(chatbot_id: str, index, meta: Dict, bm25_data: Optional[Dict] = None):
    """Legacy compatibility - not needed for PostgreSQL"""
    logger.warning("save_index_and_meta is deprecated with PostgreSQL backend")
    pass


if __name__ == "__main__":
    # Quick test
    print("PostgreSQL Vectorstore module ready")
    print(f"Embedding dimension: {EMBEDDING_DIM}")
    print(f"Database: {DB_PARAMS['database']}@{DB_PARAMS['host']}:{DB_PARAMS['port']}")
    
    # Test connection
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
                print(f"✓ Connected to PostgreSQL: {version}")
                
                cur.execute("SELECT COUNT(*) FROM document_chunks")
                count = cur.fetchone()[0]
                print(f"✓ Total chunks in database: {count}")
    except Exception as e:
        print(f"✗ Connection test failed: {e}")
