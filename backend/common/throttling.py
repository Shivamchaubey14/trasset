"""
Per-device rate limiting (SRS §12.4, BE-8).

A phone coming back online drains its offline queue in a burst. Keyed on the
user alone, that burst eats the same budget the person's browser session is
using, and one device can throttle another — or the same person sitting at
their desk.

The device is identified by the access token's ``jti``, because each device
holds its own token chain. Nothing about it is client-supplied, so unlike a
header there is nothing to forge: a caller cannot mint itself extra budget by
varying a value it controls. The trade-off is that the identity changes when
the token rotates, which resets that device's counter every refresh at worst —
acceptable for a burst control, and refreshing is itself throttled under the
``auth`` scope.
"""
import hashlib

from rest_framework.throttling import ScopedRateThrottle


def device_identity(request) -> str | None:
    """A stable-per-token identifier, or ``None`` when there is no token."""
    token = getattr(request, "auth", None)
    if token is None:
        return None
    try:
        jti = token.get("jti")
    except (AttributeError, TypeError):      # pragma: no cover - defensive
        return None
    if not jti:
        return None
    return hashlib.sha256(str(jti).encode("utf-8")).hexdigest()[:16]


class DeviceScopedRateThrottle(ScopedRateThrottle):
    """``ScopedRateThrottle`` with a separate bucket per device."""

    def get_cache_key(self, request, view):
        key = super().get_cache_key(request, view)
        if key is None:
            return None

        # Anonymous callers keep a single bucket keyed on their address.
        # Splitting those per token would be meaningless — there is no token —
        # and splitting them on anything the caller sends would hand an
        # attacker unlimited sign-in attempts, since /auth/login/ is exactly
        # where an unauthenticated request is throttled (SEC-7).
        if not request.user or not request.user.is_authenticated:
            return key

        device = device_identity(request)
        return f"{key}:{device}" if device else key
