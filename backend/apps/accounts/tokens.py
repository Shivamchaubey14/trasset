"""
Client-aware refresh tokens (SRS §12.4, BE-1).

``RefreshToken`` takes its lifetime from a single class attribute, which is
fine when every client is the same. Mobile is not: it needs a 30-day refresh
where the web keeps 7.

Rather than special-casing the two places a refresh token gets an expiry —
issue and rotation — the lifetime is derived from the token's own ``client``
claim. SimpleJWT's rotation code already calls ``set_exp()`` with no argument,
so overriding that one method is enough for a rotated mobile token to stay
mobile without touching the rotation logic at all.
"""
from datetime import datetime, timedelta

from rest_framework_simplejwt.tokens import RefreshToken

from common.clients import CLIENT_CLAIM, client_from_token, refresh_lifetime_for


class ClientAwareRefreshToken(RefreshToken):
    """A refresh token whose lifetime follows the client that asked for it."""

    def set_exp(
        self,
        claim: str = "exp",
        from_time: datetime | None = None,
        lifetime: timedelta | None = None,
    ) -> None:
        # Only the expiry claim is client-dependent, and only when the caller
        # has not named a lifetime explicitly. Construction passes one, so a
        # brand-new token (which has no client claim yet) is unaffected.
        if lifetime is None and claim == "exp":
            lifetime = refresh_lifetime_for(client_from_token(self))
        super().set_exp(claim=claim, from_time=from_time, lifetime=lifetime)

    def stamp_client(self, client: str) -> "ClientAwareRefreshToken":
        """Record the client and re-derive the expiry from it."""
        self[CLIENT_CLAIM] = client
        self.set_exp()
        return self
