"""Redis utility layer for RAG-LMS.

Provides:
  - Connection pool (singleton)
  - Typed get/set/delete helpers (JSON + numpy)
  - TTL constants

Environment variable:
  REDIS_URL  — Redis connection URL (default: redis://localhost:6379/0)
"""
import json
import hashlib
import logging
import os
from typing import Any, Optional

import numpy as np

logger = logging.getLogger("rag-redis")

# ── TTL constants (seconds) ───────────────────────────────────────────────────
TTL_SESSION      = 86_400        # 24 h  — matches JWT expiry
TTL_RAG_CACHE    = 604_800       # 7 days — invalidated explicitly on re-index
TTL_EMBEDDING    = 2_592_000     # 30 days — LRU eviction handles pressure
TTL_CONV_MEMORY  = 86_400        # 24 h  — active-session LLM context window
CONV_MAX_TURNS   = 10            # keep last 10 messages (5 back-and-forth turns)

# ── Connection pool ───────────────────────────────────────────────────────────
_pool = None

def get_redis():
    """Return the shared Redis connection pool. Returns None if Redis unavailable."""
    global _pool
    if _pool is not None:
        return _pool
    try:
        import redis as _redis
        url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        _pool = _redis.Redis.from_url(
            url,
            decode_responses=False,   # we handle encoding ourselves
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        _pool.ping()
        logger.info(f"Redis connected: {url}")
    except Exception as e:
        logger.warning(f"Redis unavailable ({e}). Caching disabled — app continues without it.")
        _pool = None
    return _pool


# ── Key helpers ───────────────────────────────────────────────────────────────

def _h(text: str) -> str:
    """Short SHA-256 hex digest (16 chars) for use in cache keys."""
    return hashlib.sha256(text.encode()).hexdigest()[:16]

def session_key(token: str) -> str:
    return f"sess:{_h(token)}"

def rag_key(chatbot_id: str, question: str) -> str:
    return f"rag:{chatbot_id}:{_h(question.strip().lower())}"

def emb_key(text: str) -> str:
    return f"emb:{_h(text)}"

def conv_key(user_id: str, chatbot_id: str) -> str:
    return f"conv:{user_id}:{chatbot_id}"


# ── Generic JSON cache ────────────────────────────────────────────────────────

def cache_get(key: str) -> Optional[Any]:
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.debug(f"cache_get({key}) failed: {e}")
        return None


def cache_set(key: str, value: Any, ttl: int) -> bool:
    r = get_redis()
    if r is None:
        return False
    try:
        r.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.debug(f"cache_set({key}) failed: {e}")
        return False


def cache_delete(key: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.delete(key)
    except Exception as e:
        logger.debug(f"cache_delete({key}) failed: {e}")


def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a glob pattern. Returns count deleted."""
    r = get_redis()
    if r is None:
        return 0
    try:
        keys = r.keys(pattern)
        if keys:
            return r.delete(*keys)
        return 0
    except Exception as e:
        logger.debug(f"cache_delete_pattern({pattern}) failed: {e}")
        return 0


# ── Numpy array serialization ─────────────────────────────────────────────────

def emb_set(key: str, arr: np.ndarray, ttl: int = TTL_EMBEDDING) -> bool:
    r = get_redis()
    if r is None:
        return False
    try:
        r.setex(key, ttl, arr.astype("float32").tobytes())
        return True
    except Exception as e:
        logger.debug(f"emb_set({key}) failed: {e}")
        return False


def emb_get(key: str) -> Optional[np.ndarray]:
    r = get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        if raw is None:
            return None
        return np.frombuffer(raw, dtype="float32")
    except Exception as e:
        logger.debug(f"emb_get({key}) failed: {e}")
        return None


# ── Conversation memory ───────────────────────────────────────────────────────

def conv_append(user_id: str, chatbot_id: str, role: str, content: str) -> None:
    """Append one message to the conversation memory list and trim to CONV_MAX_TURNS."""
    key = conv_key(user_id, chatbot_id)
    history = cache_get(key) or []
    history.append({"role": role, "content": content})
    # keep only the last N messages
    if len(history) > CONV_MAX_TURNS:
        history = history[-CONV_MAX_TURNS:]
    cache_set(key, history, TTL_CONV_MEMORY)


def conv_get(user_id: str, chatbot_id: str) -> list:
    """Return the stored conversation history (list of {role, content} dicts)."""
    return cache_get(conv_key(user_id, chatbot_id)) or []


def conv_clear(user_id: str, chatbot_id: str) -> None:
    cache_delete(conv_key(user_id, chatbot_id))
