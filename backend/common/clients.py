"""
Which kind of client is calling (SRS §12.4, BE-1).

A phone and a browser want different session lengths. A browser session is
short on purpose — the machine may be shared and the tab may be left open. A
phone is a personal device kept in a pocket, and a weekly forced logout there
teaches people to distrust the app, which is exactly what an app used in a
stock room cannot afford.

The client announces itself with an ``X-Client`` header on sign-in. The value
is then stamped into the refresh token as a claim, so every later decision —
rotation today, per-device throttling in BE-8 — reads it from the token the
caller already holds rather than trusting a header that a proxy might drop.
"""
from datetime import timedelta

from django.conf import settings
from rest_framework_simplejwt.settings import api_settings

#: Request header naming the client type.
CLIENT_HEADER = "X-Client"

#: Token claim the header is recorded under.
CLIENT_CLAIM = "client"

CLIENT_WEB = "web"
CLIENT_MOBILE = "mobile"

#: Anything else is treated as web. Unrecognised values must not earn the
#: longer session — otherwise a typo, or a caller guessing at header values,
#: quietly buys itself a 30-day token.
KNOWN_CLIENTS = (CLIENT_WEB, CLIENT_MOBILE)

DEFAULT_CLIENT = CLIENT_WEB


def client_from_request(request) -> str:
    """Read ``X-Client`` off a request, falling back to ``web``."""
    if request is None:
        return DEFAULT_CLIENT
    raw = (request.headers.get(CLIENT_HEADER) or "").strip().lower()
    return raw if raw in KNOWN_CLIENTS else DEFAULT_CLIENT


def client_from_token(token) -> str:
    """Read the client claim back off a token payload."""
    raw = token.get(CLIENT_CLAIM) if token is not None else None
    return raw if raw in KNOWN_CLIENTS else DEFAULT_CLIENT


def refresh_lifetime_for(client: str) -> timedelta:
    """How long a refresh token issued to ``client`` should live."""
    if client == CLIENT_MOBILE:
        return settings.JWT_MOBILE_REFRESH_LIFETIME
    return api_settings.REFRESH_TOKEN_LIFETIME
