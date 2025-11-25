# retrieval.py
"""
Hybrid Retrieval System for RAG-LMS
Implements BM25 + FAISS hybrid search with re-ranking
Based on MARK system research (arXiv 2506.23026v1)
"""

import logging
from typing import List, Dict, Tuple
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
import faiss

logger = logging.getLogger("rag-retrieval")

class BM25Retriever:
    """Keyword-based retrieval using BM25 algorithm"""
    
    def __init__(self):
        self.corpus_texts = []
        self.corpus_metadata = []
        self.bm25 = None
        self.tokenized_corpus = []
        
    def index_documents(self, documents: List[Dict]):
        """
        Index documents for BM25 search
        Args:
            documents: List of dicts with 'text' and metadata
        """
        self.corpus_texts = []
        self.corpus_metadata = []
        self.tokenized_corpus = []
        
        for doc in documents:
            text = doc.get('text', '')
            self.corpus_texts.append(text)
            self.corpus_metadata.append(doc)
            # Simple tokenization (split by whitespace and lowercase)
            tokens = text.lower().split()
            self.tokenized_corpus.append(tokens)
        
        # Build BM25 index
        if self.tokenized_corpus:
            self.bm25 = BM25Okapi(self.tokenized_corpus)
            logger.info(f"BM25 index built with {len(self.tokenized_corpus)} documents")
        else:
            logger.warning("No documents to index for BM25")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """
        Search using BM25
        Returns list of dicts with text, metadata, and BM25 score
        """
        if not self.bm25:
            logger.warning("BM25 index not built")
            return []
        
        # Tokenize query
        query_tokens = query.lower().split()
        
        # Get BM25 scores
        scores = self.bm25.get_scores(query_tokens)
        
        # Get top-k indices
        top_indices = np.argsort(scores)[::-1][:top_k]
        
        results = []
        for idx in top_indices:
            if scores[idx] > 0:  # Only include docs with positive scores
                result = {
                    **self.corpus_metadata[idx],
                    'bm25_score': float(scores[idx]),
                    'retrieval_method': 'bm25'
                }
                results.append(result)
        
        return results


class FAISSRetriever:
    """Semantic retrieval using FAISS vector similarity"""
    
    def __init__(self, embedding_model: SentenceTransformer, dimension: int = 384):
        self.model = embedding_model
        self.dimension = dimension
        self.index = None
        self.corpus_metadata = []
        
    def index_documents(self, documents: List[Dict], embeddings: np.ndarray = None):
        """
        Index documents for FAISS search
        Args:
            documents: List of dicts with 'text' and metadata
            embeddings: Pre-computed embeddings (optional, will compute if None)
        """
        self.corpus_metadata = documents
        
        if embeddings is None:
            # Compute embeddings
            texts = [doc.get('text', '') for doc in documents]
            logger.info(f"Computing embeddings for {len(texts)} documents...")
            embeddings = self.model.encode(
                texts, 
                show_progress_bar=False, 
                convert_to_numpy=True
            )
        
        # Create FAISS index
        embeddings = np.asarray(embeddings).astype('float32')
        
        if embeddings.shape[1] != self.dimension:
            logger.warning(f"Embedding dimension mismatch: expected {self.dimension}, got {embeddings.shape[1]}")
            self.dimension = embeddings.shape[1]
        
        # Use flat L2 index for simplicity
        self.index = faiss.IndexFlatL2(self.dimension)
        self.index.add(embeddings)
        
        logger.info(f"FAISS index built with {self.index.ntotal} vectors")
    
    def search(self, query: str, top_k: int = 10) -> List[Dict]:
        """
        Search using FAISS semantic similarity
        Returns list of dicts with text, metadata, and similarity score
        """
        if not self.index or self.index.ntotal == 0:
            logger.warning("FAISS index not built or empty")
            return []
        
        # Encode query
        query_embedding = self.model.encode([query], convert_to_numpy=True).astype('float32')
        
        # Search
        distances, indices = self.index.search(query_embedding, top_k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx != -1 and idx < len(self.corpus_metadata):
                result = {
                    **self.corpus_metadata[idx],
                    'faiss_distance': float(dist),
                    'faiss_similarity': float(1 / (1 + dist)),  # Convert distance to similarity
                    'retrieval_method': 'faiss'
                }
                results.append(result)
        
        return results


class HybridRetriever:
    """
    Combines BM25 and FAISS for hybrid retrieval
    Based on research showing 15-20% accuracy improvement
    """
    
    def __init__(self, embedding_model: SentenceTransformer, dimension: int = 384):
        self.bm25_retriever = BM25Retriever()
        self.faiss_retriever = FAISSRetriever(embedding_model, dimension)
        
    def index_documents(self, documents: List[Dict], embeddings: np.ndarray = None):
        """Index documents for both BM25 and FAISS"""
        logger.info("Building hybrid index...")
        self.bm25_retriever.index_documents(documents)
        self.faiss_retriever.index_documents(documents, embeddings)
        logger.info("Hybrid index ready")
    
    def search(
        self, 
        query: str, 
        top_k: int = 15,
        bm25_weight: float = 0.3,
        faiss_weight: float = 0.7
    ) -> List[Dict]:
        """
        Hybrid search combining BM25 and FAISS
        
        Args:
            query: Search query
            top_k: Number of results to return
            bm25_weight: Weight for BM25 scores (default 0.3)
            faiss_weight: Weight for FAISS scores (default 0.7)
        
        Returns:
            List of documents with combined scores
        """
        # Get results from both retrievers
        bm25_results = self.bm25_retriever.search(query, top_k=top_k * 2)
        faiss_results = self.faiss_retriever.search(query, top_k=top_k * 2)
        
        # Create a dict to merge results by document ID
        merged_results = {}
        
        # Process BM25 results
        for result in bm25_results:
            doc_id = id(result.get('text', ''))  # Use text as unique identifier
            merged_results[doc_id] = {
                **result,
                'bm25_score': result.get('bm25_score', 0.0),
                'faiss_similarity': 0.0
            }
        
        # Process FAISS results
        for result in faiss_results:
            doc_id = id(result.get('text', ''))
            if doc_id in merged_results:
                # Document found by both retrievers
                merged_results[doc_id]['faiss_similarity'] = result.get('faiss_similarity', 0.0)
                merged_results[doc_id]['retrieval_method'] = 'hybrid'
            else:
                # Document only found by FAISS
                merged_results[doc_id] = {
                    **result,
                    'bm25_score': 0.0
                }
        
        # Normalize scores to [0, 1]
        all_bm25_scores = [doc['bm25_score'] for doc in merged_results.values()]
        all_faiss_scores = [doc['faiss_similarity'] for doc in merged_results.values()]
        
        max_bm25 = max(all_bm25_scores) if all_bm25_scores else 1.0
        max_faiss = max(all_faiss_scores) if all_faiss_scores else 1.0
        
        # Compute hybrid scores
        for doc in merged_results.values():
            norm_bm25 = doc['bm25_score'] / max_bm25 if max_bm25 > 0 else 0
            norm_faiss = doc['faiss_similarity'] / max_faiss if max_faiss > 0 else 0
            
            # Weighted combination
            doc['hybrid_score'] = (bm25_weight * norm_bm25) + (faiss_weight * norm_faiss)
        
        # Sort by hybrid score and return top-k
        sorted_results = sorted(
            merged_results.values(), 
            key=lambda x: x['hybrid_score'], 
            reverse=True
        )
        
        return sorted_results[:top_k]


def reciprocal_rank_fusion(
    rankings: List[List[Dict]], 
    k: int = 60
) -> List[Dict]:
    """
    Reciprocal Rank Fusion for combining multiple rankings
    RRF score = sum(1 / (k + rank)) for each ranking
    
    This is an alternative to weighted combination
    """
    doc_scores = {}
    
    for ranking in rankings:
        for rank, doc in enumerate(ranking, start=1):
            doc_id = id(doc.get('text', ''))
            score = 1.0 / (k + rank)
            
            if doc_id not in doc_scores:
                doc_scores[doc_id] = {'doc': doc, 'score': 0.0}
            doc_scores[doc_id]['score'] += score
    
    # Sort by RRF score
    sorted_docs = sorted(
        doc_scores.values(), 
        key=lambda x: x['score'], 
        reverse=True
    )
    
    return [item['doc'] for item in sorted_docs]


if __name__ == "__main__":
    # Quick test
    from sentence_transformers import SentenceTransformer
    
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    # Sample documents
    docs = [
        {"text": "Newton's first law states that objects in motion stay in motion", "page": 1},
        {"text": "Force equals mass times acceleration according to Newton", "page": 2},
        {"text": "Photosynthesis is the process plants use to create energy", "page": 3},
    ]
    
    # Create hybrid retriever
    retriever = HybridRetriever(model, dimension=384)
    retriever.index_documents(docs)
    
    # Test search
    results = retriever.search("What is Newton's law?", top_k=2)
    
    for i, result in enumerate(results, 1):
        print(f"{i}. Score: {result['hybrid_score']:.3f} | {result['text'][:50]}...")
