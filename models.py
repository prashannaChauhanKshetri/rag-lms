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
            logger.info("Lazy loading SentenceTransformer (paraphrase-multilingual-MiniLM-L12-v2)...")
            # Set TOKENIZERS_PARALLELISM to avoid initial fork warning/deadlock
            import os
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            # 384-dim multilingual model — supports 50+ languages including Nepali
            _EMBED_MODEL = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _EMBED_MODEL
