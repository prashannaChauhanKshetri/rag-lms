"""Rate limiting for expensive endpoints.

Uses slowapi (Flask-Limiter port) with in-memory storage by default.
Set RATE_LIMIT_STORAGE=redis://... to share limits across workers.

Key function prefers authenticated user ID (via cookie) so the limit
follows the student, not the IP — fairer on shared networks.
"""
import os
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key_func(request: Request) -> str:
    """Rate-limit key: user ID if authenticated, otherwise client IP."""
    try:
        import utils_auth
        token = request.cookies.get("access_token")
        if token:
            payload = utils_auth.decode_access_token(token)
            if payload and payload.get("sub"):
                return f"user:{payload['sub']}"
    except Exception:
        pass
    return get_remote_address(request)


limiter = Limiter(
    key_func=_key_func,
    storage_uri=os.getenv("RATE_LIMIT_STORAGE", "memory://"),
    default_limits=[],
)
