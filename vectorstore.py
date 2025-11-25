# vectorstore.py - UPGRADED for Hybrid Retrieval
"""
Enhanced vector store with BM25 + FAISS hybrid search support
Supports chatbot-level namespacing and feedback ingestion
"""
import os
import pickle
import json
from typing import List, Dict, Optional

import numpy as np

try:
    import faiss
except Exception as e:
    raise ImportError("faiss not installed. Install faiss-cpu (pip). Error: " + str(e))

from rank_bm25 import BM25Okapi

BASE_DIR = os.path.join(os.path.dirname(__file__), "vectorstores")
os.makedirs(BASE_DIR, exist_ok=True)

# UPGRADED: Support 512-dimensional embeddings (jina-embeddings-v2-small-en)
# Reverted to 384 for all-MiniLM-L6-v2 compatibility
EMBEDDING_DIM = 384  # Changed from 512

def _paths_for_chatbot(chatbot_id: str):
    """Get file paths for a specific chatbot"""
    idx_path = os.path.join(BASE_DIR, f"{chatbot_id}.index")
    meta_path = os.path.join(BASE_DIR, f"{chatbot_id}_meta.pkl")
    bm25_path = os.path.join(BASE_DIR, f"{chatbot_id}_bm25.pkl")
    return idx_path, meta_path, bm25_path


def load_index_and_meta(chatbot_id: str):
    """Load FAISS index, metadata, and BM25 index for a chatbot"""
    idx_path, meta_path, bm25_path = _paths_for_chatbot(chatbot_id)
    
    # Load FAISS index
    if os.path.exists(idx_path) and os.path.exists(meta_path):
        index = faiss.read_index(idx_path)
        with open(meta_path, "rb") as f:
            meta = pickle.load(f)
    else:
        index = faiss.IndexIDMap(faiss.IndexFlatL2(EMBEDDING_DIM))
        meta = {"next_id": 0, "docs": {}}
    
    # Load BM25 index
    bm25_data = None
    if os.path.exists(bm25_path):
        with open(bm25_path, "rb") as f:
            bm25_data = pickle.load(f)
    
    return index, meta, bm25_data


def save_index_and_meta(chatbot_id: str, index, meta: Dict, bm25_data: Optional[Dict] = None):
    """Save FAISS index, metadata, and BM25 index"""
    idx_path, meta_path, bm25_path = _paths_for_chatbot(chatbot_id)
    
    faiss.write_index(index, idx_path)
    
    with open(meta_path, "wb") as f:
        pickle.dump(meta, f)
    
    if bm25_data is not None:
        with open(bm25_path, "wb") as f:
            pickle.dump(bm25_data, f)


def add_documents(chatbot_id: str, embeddings: np.ndarray, metadatas: List[Dict]):
    """
    Add documents to vectorstore with hybrid indexing
    
    Args:
        chatbot_id: Unique chatbot identifier
        embeddings: Document embeddings (n x EMBEDDING_DIM)
        metadatas: List of metadata dicts containing 'text', 'page', etc.
    """
    if embeddings is None:
        raise ValueError("embeddings is None")
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_DIM:
        raise ValueError(f"Embeddings must be shape (n, {EMBEDDING_DIM}), got {embeddings.shape}")
    
    # Load existing indices
    index, meta, bm25_data = load_index_and_meta(chatbot_id)
    
    # Add to FAISS index
    n = embeddings.shape[0]
    start_id = int(meta.get("next_id", 0))
    ids = np.arange(start_id, start_id + n).astype("int64")
    index.add_with_ids(embeddings, ids)
    
    # Update metadata
    for i, m in enumerate(metadatas):
        meta["docs"][int(ids[i])] = m
    meta["next_id"] = start_id + n
    
    # Build BM25 index
    # Extract text for BM25 (use 'original_text' if available, otherwise 'text')
    corpus_texts = []
    for doc_id in sorted(meta["docs"].keys()):
        doc = meta["docs"][doc_id]
        text = doc.get("original_text", doc.get("text", ""))
        corpus_texts.append(text)
    
    # Tokenize corpus for BM25
    tokenized_corpus = [text.lower().split() for text in corpus_texts]
    bm25 = BM25Okapi(tokenized_corpus)
    
    bm25_data = {
        "bm25": bm25,
        "corpus_texts": corpus_texts,
        "doc_ids": sorted(meta["docs"].keys())
    }
    
    # Save everything
    save_index_and_meta(chatbot_id, index, meta, bm25_data)
    
    return {"added": n, "next_id": meta["next_id"], "total_docs": len(meta["docs"])}


def query_index(chatbot_id: str, query_embedding: np.ndarray, top_k: int = 5, use_faiss: bool = True):
    """
    Query using FAISS only (for backward compatibility)
    For hybrid search, use hybrid_query() instead
    """
    index, meta, _ = load_index_and_meta(chatbot_id)
    
    if index.ntotal == 0:
        return []
    
    q = np.asarray(query_embedding).astype("float32").reshape(1, -1)
    distances, ids = index.search(q, top_k)
    
    results = []
    for dist, _id in zip(distances[0], ids[0]):
        if int(_id) == -1:
            continue
        doc = meta["docs"].get(int(_id), {})
        results.append({
            "id": int(_id),
            "score": float(dist),
            "text": doc.get("text"),
            "original_text": doc.get("original_text"),
            "source": doc.get("source"),
            "page": doc.get("page"),
            "heading": doc.get("heading", "")
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
    Hybrid query combining BM25 and FAISS
    
    Args:
        chatbot_id: Chatbot identifier
        query: Query text for BM25
        query_embedding: Query embedding for FAISS
        top_k: Number of results to return
        bm25_weight: Weight for BM25 scores (default 0.3)
        faiss_weight: Weight for FAISS scores (default 0.7)
    
    Returns:
        List of documents with hybrid scores
    """
    index, meta, bm25_data = load_index_and_meta(chatbot_id)
    
    if index.ntotal == 0:
        return []
    
    # FAISS search
    q = np.asarray(query_embedding).astype("float32").reshape(1, -1)
    distances, ids = index.search(q, top_k * 2)  # Get more for merging
    
    faiss_results = {}
    for dist, _id in zip(distances[0], ids[0]):
        if int(_id) != -1:
            doc = meta["docs"].get(int(_id), {})
            faiss_results[int(_id)] = {
                **doc,
                "id": int(_id),
                "faiss_distance": float(dist),
                "faiss_similarity": float(1 / (1 + dist))
            }
    
    # BM25 search
    bm25_results = {}
    if bm25_data and bm25_data.get("bm25"):
        query_tokens = query.lower().split()
        scores = bm25_data["bm25"].get_scores(query_tokens)
        doc_ids = bm25_data["doc_ids"]
        
        # Get top BM25 results
        top_indices = np.argsort(scores)[::-1][:top_k * 2]
        for idx in top_indices:
            if scores[idx] > 0:
                doc_id = doc_ids[idx]
                doc = meta["docs"].get(doc_id, {})
                bm25_results[doc_id] = {
                    **doc,
                    "id": doc_id,
                    "bm25_score": float(scores[idx])
                }
    
    # Merge results
    all_doc_ids = set(faiss_results.keys()) | set(bm25_results.keys())
    merged = []
    
    for doc_id in all_doc_ids:
        faiss_sim = faiss_results.get(doc_id, {}).get("faiss_similarity", 0.0)
        bm25_score = bm25_results.get(doc_id, {}).get("bm25_score", 0.0)
        
        # Get document data
        doc_data = faiss_results.get(doc_id) or bm25_results.get(doc_id)
        
        merged.append({
            **doc_data,
            "faiss_similarity": faiss_sim,
            "bm25_score": bm25_score
        })
    
    # Normalize scores
    if merged:
        max_faiss = max(d["faiss_similarity"] for d in merged)
        max_bm25 = max(d["bm25_score"] for d in merged)
        
        for doc in merged:
            norm_faiss = doc["faiss_similarity"] / max_faiss if max_faiss > 0 else 0
            norm_bm25 = doc["bm25_score"] / max_bm25 if max_bm25 > 0 else 0
            
            # Compute hybrid score
            doc["hybrid_score"] = (faiss_weight * norm_faiss) + (bm25_weight * norm_bm25)
            doc["retrieval_method"] = "hybrid"
    
    # Sort by hybrid score and return top-k
    merged.sort(key=lambda x: x["hybrid_score"], reverse=True)
    
    return merged[:top_k]


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
    metadata = {
        "text": f"Q: {question}\nA: {corrected_answer}",
        "original_text": f"Q: {question}\nA: {corrected_answer}",
        "source": "instructor_feedback",
        "page": "N/A",
        "heading": "Instructor Feedback",
        "is_feedback": True
    }
    
    embedding_array = np.array([embedding]).astype("float32")
    
    return add_documents(chatbot_id, embedding_array, [metadata])


def delete_chatbot(chatbot_id: str):
    """Delete all indices and metadata for a chatbot"""
    idx_path, meta_path, bm25_path = _paths_for_chatbot(chatbot_id)
    
    for path in [idx_path, meta_path, bm25_path]:
        if os.path.exists(path):
            os.remove(path)


def get_chatbot_stats(chatbot_id: str) -> Dict:
    """Get statistics for a chatbot's vector store"""
    index, meta, bm25_data = load_index_and_meta(chatbot_id)
    
    return {
        "chatbot_id": chatbot_id,
        "total_vectors": index.ntotal,
        "total_documents": len(meta.get("docs", {})),
        "has_bm25": bm25_data is not None,
        "embedding_dimension": EMBEDDING_DIM
    }


if __name__ == "__main__":
    # Quick test
    print("Vectorstore module ready")
    print(f"Embedding dimension: {EMBEDDING_DIM}")
    print(f"Storage directory: {BASE_DIR}")
