import os
import json
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_REDIS_URL = os.getenv("REDIS_URL", "").strip()
_DEFAULT_TTL = int(os.getenv("CACHE_TTL_SECONDS", "30") or "30")

_redis = None
if _REDIS_URL:
    try:
        import redis.asyncio as aioredis
        _redis = aioredis.from_url(_REDIS_URL, encoding="utf-8", decode_responses=True)
        logger.info("Redis cache enabled")
    except Exception as exc:  # pragma: no cover
        logger.warning("Redis unavailable, falling back to in-memory cache: %s", exc)
        _redis = None

# In-memory fallback: {key: (expires_at_epoch, json_value)}
_mem: dict = {}


async def cache_get(key: str):
    if _redis is not None:
        try:
            raw = await _redis.get(key)
            return json.loads(raw) if raw is not None else None
        except Exception as exc:  # pragma: no cover
            logger.warning("Redis get failed (%s): %s", key, exc)
            return None
    entry = _mem.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at < time.time():
        _mem.pop(key, None)
        return None
    return value


async def cache_set(key: str, value, ttl: Optional[int] = None):
    ttl = ttl or _DEFAULT_TTL
    if _redis is not None:
        try:
            await _redis.set(key, json.dumps(value), ex=ttl)
            return
        except Exception as exc:  # pragma: no cover
            logger.warning("Redis set failed (%s): %s", key, exc)
            return
    _mem[key] = (time.time() + ttl, value)


async def cache_invalidate_prefix(prefix: str):
    """Drop cached entries by prefix (used after writes)."""
    if _redis is not None:
        try:
            async for k in _redis.scan_iter(match=f"{prefix}*"):
                await _redis.delete(k)
            return
        except Exception as exc:  # pragma: no cover
            logger.warning("Redis invalidate failed (%s): %s", prefix, exc)
            return
    for k in [k for k in _mem if k.startswith(prefix)]:
        _mem.pop(k, None)
