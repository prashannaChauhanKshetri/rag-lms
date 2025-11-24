# vectorstore.py
import os
import pickle
from typing import List, Dict

import numpy as np

try:
    import faiss
except Exception as e:
    raise ImportError("faiss not installed. Install faiss-cpu (pip). Error: " + str(e))

BASE_DIR = os.path.join(os.path.dirname(__file__), "vectorstores")
os.makedirs(BASE_DIR, exist_ok=True)

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2

def _paths_for_subject(subject: str):
    idx_path = os.path.join(BASE_DIR, f"{subject}.index")
    meta_path = os.path.join(BASE_DIR, f"{subject}_meta.pkl")
    return idx_path, meta_path

def load_index_and_meta(subject: str):
    idx_path, meta_path = _paths_for_subject(subject)
    if os.path.exists(idx_path) and os.path.exists(meta_path):
        index = faiss.read_index(idx_path)
        with open(meta_path, "rb") as f:
            meta = pickle.load(f)
        return index, meta
    index = faiss.IndexIDMap(faiss.IndexFlatL2(EMBEDDING_DIM))
    meta = {"next_id": 0, "docs": {}}
    return index, meta

def save_index_and_meta(subject: str, index, meta: Dict):
    idx_path, meta_path = _paths_for_subject(subject)
    faiss.write_index(index, idx_path)
    with open(meta_path, "wb") as f:
        pickle.dump(meta, f)

def add_documents(subject: str, embeddings: np.ndarray, metadatas: List[Dict]):
    if embeddings is None:
        raise ValueError("embeddings is None")
    if embeddings.ndim != 2 or embeddings.shape[1] != EMBEDDING_DIM:
        raise ValueError(f"Embeddings must be shape (n, {EMBEDDING_DIM})")
    index, meta = load_index_and_meta(subject)
    n = embeddings.shape[0]
    start_id = int(meta.get("next_id", 0))
    ids = np.arange(start_id, start_id + n).astype("int64")
    index.add_with_ids(embeddings, ids)
    for i, m in enumerate(metadatas):
        meta["docs"][int(ids[i])] = m
    meta["next_id"] = start_id + n
    save_index_and_meta(subject, index, meta)
    return {"added": n, "next_id": meta["next_id"]}

def query_index(subject: str, query_embedding: np.ndarray, top_k: int = 5):
    index, meta = load_index_and_meta(subject)
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
            "source": doc.get("source"),
            "page": doc.get("page")
        })
    return results
