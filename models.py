import logging
import threading

logger = logging.getLogger("rag-models")
_EMBED_MODEL = None
_RERANK_MODEL = None
_MODEL_LOCK = threading.Lock()

def get_embed_model():
    global _EMBED_MODEL
    with _MODEL_LOCK:
        if _EMBED_MODEL is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Lazy loading SentenceTransformer (paraphrase-multilingual-MiniLM-L12-v2)...")
            # Set TOKENIZERS_PARALLELISM to avoid initial fork warning/deadlock
            import os
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            # 384-dim multilingual model — supports 50+ languages including Nepali
            _EMBED_MODEL = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _EMBED_MODEL


def get_rerank_model():
    """Lazy-load a multilingual cross-encoder reranker.
    Supports 100+ languages including Nepali — matches the multilingual
    embedding model used for Stage-1 retrieval.
    Runs on CPU — scores ~30 passages in <1s on modern hardware."""
    global _RERANK_MODEL
    with _MODEL_LOCK:
        if _RERANK_MODEL is None:
            from sentence_transformers import CrossEncoder
            logger.info("Lazy loading multilingual CrossEncoder reranker (mmarco-mMiniLMv2-L12-H384-v1)...")
            import os
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            _RERANK_MODEL = CrossEncoder("cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")
    return _RERANK_MODEL
