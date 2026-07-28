"""Puts the acting user and their IP where the audit signals can find them."""
from .services import bind_request, unbind_request


def client_ip(request) -> str | None:
    """
    Best-effort client address.

    Behind Nginx the real address is the first entry in X-Forwarded-For. Only
    trust that header when the proxy in front is one you control — a client can
    set it freely otherwise.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class AuditContextMiddleware:
    """
    Binds the request to a ContextVar for the life of the request/response.

    The *user* is deliberately not read here. DRF authenticates lazily inside
    the view, so ``request.user`` at middleware time would be the session user
    (usually anonymous) rather than the bearer-token user. DRF's ``Request.user``
    setter writes through to the underlying ``HttpRequest``, so by the time an
    audit signal fires inside the view the user is available — the audit layer
    therefore reads it on demand instead of caching it now.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = bind_request(
            request,
            ip_address=client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            path=request.get_full_path(),
        )
        try:
            return self.get_response(request)
        finally:
            unbind_request(token)
