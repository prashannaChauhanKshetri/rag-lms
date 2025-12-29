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
    added_count = 0
    
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for i in range(n):
                embedding_list = embeddings[i].tolist()
                metadata = metadatas[i]
                
                # Extract fields from metadata
                text = metadata.get('text', '')
                original_text = metadata.get('original_text', text)
                source = metadata.get('source', '')
                page = metadata.get('page')
                heading = metadata.get('heading', '')
                is_feedback = metadata.get('is_feedback', False)
                
                # Store additional metadata as JSONB
                extra_metadata = {k: v for k, v in metadata.items() 
                                if k not in ['text', 'original_text', 'source', 'page', 'heading', 'is_feedback']}
                
                try:
                    cur.execute(
                        """INSERT INTO document_chunks 
                           (chatbot_id, text, original_text, embedding, source, page, heading, is_feedback, metadata)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (chatbot_id, text, original_text, embedding_list, source, page, 
                         heading, is_feedback, psycopg2.extras.Json(extra_metadata))
                    )
                    added_count += 1
                except Exception as e:
                    logger.error(f"Error inserting chunk {i}: {e}")
                    # Continue with other chunks
    
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
                """SELECT id, text, original_text, source, page, heading, is_feedback,
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
                    "score": float(1 - row['similarity']),  # Convert to distance for compatibility
                    "text": row['text'],
                    "original_text": row['original_text'],
                    "source": row['source'],
                    "page": row['page'],
                    "heading": row['heading'] or ""
                })
    
    return results


def hybrid_query(
    chatbot_id: str, 
    query: str, 
    query_embedding: np.ndarray, 
    top_k: int = 15,
    bm25_weight: float = 0.3,
    faiss_weight: float = 0.7
) -> List[Dict]:
    """
    Hybrid query combining PostgreSQL full-text search and pgvector similarity
    
    Args:
        chatbot_id: Chatbot identifier
        query: Query text for full-text search
        query_embedding: Query embedding for vector similarity
        top_k: Number of results to return
        bm25_weight: Weight for text search scores (default 0.3)
        faiss_weight: Weight for vector similarity scores (default 0.7)
    
    Returns:
        List of documents with hybrid scores
    """
    if query_embedding.ndim == 1:
        query_embedding = query_embedding.reshape(1, -1)
    
    query_vector = query_embedding[0].tolist()
    
    results = []
    
    with get_db_connection() as conn:
        with get_dict_cursor(conn) as cur:
            # Use the hybrid_search function defined in the database
            cur.execute(
                """SELECT * FROM hybrid_search(%s, %s, %s::vector, %s, %s::real, %s::real)""",
                (chatbot_id, query, query_vector, top_k, bm25_weight, faiss_weight)
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
                    "is_feedback": row['is_feedback'],
                    "hybrid_score": float(row['hybrid_score']),
                    "bm25_score": float(row['bm25_score']),
                    "faiss_similarity": float(row['vector_similarity']),
                    "retrieval_method": "hybrid"
                })
    
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
