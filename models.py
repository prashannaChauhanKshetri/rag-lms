import logging
import os
import threading
from typing import List, Union

logger = logging.getLogger("rag-models")
_EMBED_MODEL = None
_EMBED_MODEL_V2 = None
_RERANK_MODEL = None
_MODEL_LOCK = threading.Lock()

# Feature flag: opt-in E5 embedding model. Default OFF so existing pgvector
# rows (384-dim MiniLM vectors) stay compatible. Set EMBED_MODEL=e5 to switch.
USE_E5_MODEL: bool = os.getenv("EMBED_MODEL", "minilm").lower() == "e5"


def get_embed_model():
    """Lazy-load the default MiniLM multilingual SentenceTransformer.

    384-dim, supports 50+ languages including Nepali. Used for backwards
    compatibility with existing pgvector data.
    """
    global _EMBED_MODEL
    with _MODEL_LOCK:
        if _EMBED_MODEL is None:
            from sentence_transformers import SentenceTransformer
            logger.info(
                "Lazy loading SentenceTransformer "
                "(paraphrase-multilingual-MiniLM-L12-v2)..."
            )
            # Set TOKENIZERS_PARALLELISM to avoid initial fork warning/deadlock
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            # 384-dim multilingual model — supports 50+ languages including Nepali
            _EMBED_MODEL = SentenceTransformer(
                "paraphrase-multilingual-MiniLM-L12-v2"
            )
    return _EMBED_MODEL


def get_embed_model_v2():
    """Lazy-load the E5 multilingual instruction-tuned embedding model.

    `intfloat/multilingual-e5-small` — 384-dim, instruction-tuned, generally
    stronger than MiniLM for multilingual retrieval. Requires the E5 prefix
    convention:
        - Index-time:  text must be prefixed with "passage: "
        - Query-time:  text must be prefixed with "query: "

    Use `encode_e5_passage` / `encode_e5_query` to apply prefixes correctly.
    This is opt-in via the `EMBED_MODEL=e5` env var — do NOT switch the
    default, since existing pgvector embeddings would be invalidated.
    """
    global _EMBED_MODEL_V2
    with _MODEL_LOCK:
        if _EMBED_MODEL_V2 is None:
            from sentence_transformers import SentenceTransformer
            logger.info(
                "Lazy loading SentenceTransformer (intfloat/multilingual-e5-small)..."
            )
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            _EMBED_MODEL_V2 = SentenceTransformer(
                "intfloat/multilingual-e5-small"
            )
    return _EMBED_MODEL_V2


def get_active_embed_model():
    """Return whichever embedding model is active per the `USE_E5_MODEL` flag.

    Call-sites should use this instead of `get_embed_model` directly if they
    want the flag to take effect.
    """
    return get_embed_model_v2() if USE_E5_MODEL else get_embed_model()


def encode_e5_passage(
    texts: Union[str, List[str]],
    **encode_kwargs,
):
    """Encode chunk text for indexing with the E5 model.

    E5 requires a `"passage: "` prefix at index time. This helper wraps
    `SentenceTransformer.encode` so the prefix is always applied consistently.
    Call only when `USE_E5_MODEL` is True.
    """
    model = get_embed_model_v2()
    if isinstance(texts, str):
        payload = f"passage: {texts}"
    else:
        payload = [f"passage: {t}" for t in texts]
    return model.encode(payload, **encode_kwargs)


def encode_e5_query(
    texts: Union[str, List[str]],
    **encode_kwargs,
):
    """Encode query text for retrieval with the E5 model.

    E5 requires a `"query: "` prefix at retrieval time. Call only when
    `USE_E5_MODEL` is True.
    """
    model = get_embed_model_v2()
    if isinstance(texts, str):
        payload = f"query: {texts}"
    else:
        payload = [f"query: {t}" for t in texts]
    return model.encode(payload, **encode_kwargs)


def encode_passage(
    texts: Union[str, List[str]],
    **encode_kwargs,
):
    """Unified passage-encoding entry point.

    Dispatches to the E5 prefixed encoder when `USE_E5_MODEL` is True,
    otherwise uses the default MiniLM model with no prefix. Call-sites in
    the indexing pipeline should use this so toggling the env var works
    without code changes.
    """
    if USE_E5_MODEL:
        return encode_e5_passage(texts, **encode_kwargs)
    return get_embed_model().encode(texts, **encode_kwargs)


def encode_query(
    texts: Union[str, List[str]],
    **encode_kwargs,
):
    """Unified query-encoding entry point. Mirror of `encode_passage`."""
    if USE_E5_MODEL:
        return encode_e5_query(texts, **encode_kwargs)
    return get_embed_model().encode(texts, **encode_kwargs)


def get_rerank_model():
    """Lazy-load a multilingual cross-encoder reranker.

    Supports 100+ languages including Nepali — matches the multilingual
    embedding model used for Stage-1 retrieval. Runs on CPU — scores ~30
    passages in <1s on modern hardware.
    """
    global _RERANK_MODEL
    with _MODEL_LOCK:
        if _RERANK_MODEL is None:
            from sentence_transformers import CrossEncoder
            logger.info(
                "Lazy loading multilingual CrossEncoder reranker "
                "(mmarco-mMiniLMv2-L12-H384-v1)..."
            )
            os.environ["TOKENIZERS_PARALLELISM"] = "false"
            _RERANK_MODEL = CrossEncoder(
                "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
            )
    return _RERANK_MODEL
