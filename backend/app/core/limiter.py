from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    """Use the socket peer by default; only use forwarding headers when trusted.

    Configure TRUSTED_PROXY_HOPS to the number of proxy hops that overwrite or
    append X-Forwarded-For. An untrusted client-provided header is never used.
    """
    try:
        trusted_hops = max(0, int(__import__("os").environ.get("TRUSTED_PROXY_HOPS", "0")))
    except ValueError:
        trusted_hops = 0

    peer = get_remote_address(request) or "unknown"
    if trusted_hops == 0:
        return peer

    forwarded = request.headers.get("x-forwarded-for", "")
    chain = [part.strip() for part in forwarded.split(",") if part.strip()]
    # The proxy chain must contain the configured hops plus a client address.
    if len(chain) < trusted_hops + 1:
        return peer
    return chain[-(trusted_hops + 1)]


limiter = Limiter(key_func=get_client_ip)
