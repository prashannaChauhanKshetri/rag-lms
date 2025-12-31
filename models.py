import logging

logger = logging.getLogger("rag-models")
_EMBED_MODEL = None

def get_embed_model():
    global _EMBED_MODEL
    if _EMBED_MODEL is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Lazy loading SentenceTransformer (all-MiniLM-L6-v2)...")
        _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL
