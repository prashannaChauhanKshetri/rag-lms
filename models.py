import logging
import threading

logger = logging.getLogger("rag-models")
_EMBED_MODEL = None
_MODEL_LOCK = threading.Lock()

def get_embed_model():
    global _EMBED_MODEL
    with _MODEL_LOCK:
        if _EMBED_MODEL is None:
            from sentence_transformers import SentenceTransformer
            logger.info("Lazy loading SentenceTransformer (all-MiniLM-L6-v2)...")
            # Set TOKENIZERS_PARALLELISM to avoid initial fork warning/deadlock
            import os
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            _EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _EMBED_MODEL
