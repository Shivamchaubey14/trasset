"""
Idempotent writes (SRS §12.4, BE-4).

A client sends ``Idempotency-Key: <uuid>`` on an unsafe request. The first
time, the request runs normally and its response is stored against the key.
Every later request with that key gets the stored response back instead of
being executed again.

**Why a mixin and not middleware.** Keys are scoped per user — a key from one
account must never replay another account's response — and DRF authenticates
*inside* the view, so ``request.user`` at middleware time is the anonymous
session user. Day 10 hit this with the audit middleware and worked around it by
resolving the user lazily. Sitting at the DRF layer avoids the problem instead
of re-solving it.

Requests without the header behave exactly as they always have.
"""
import hashlib
import json
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.response import Response

from common.exceptions import Conflict
from common.models import IdempotencyKey

logger = logging.getLogger("trasset")

IDEMPOTENCY_HEADER = "Idempotency-Key"
REPLAY_HEADER = "Idempotent-Replay"
UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class ReplayedResponse(Exception):
    """Carries a stored response back up to ``handle_exception``.

    Raising is the only way out of ``initial()``; DRF routes anything raised
    there through ``handle_exception``, which the mixin intercepts.
    """

    def __init__(self, response: Response):
        self.response = response
        super().__init__("Replayed a stored idempotent response")


def request_fingerprint(request) -> str:
    """
    Identify what was asked, so a key reused for something else is detectable.

    File uploads fingerprint by filename rather than content — reading an
    upload here would consume the stream the view needs. In practice a queued
    mobile action carries JSON, not a file.
    """
    try:
        body = json.dumps(request.data, sort_keys=True, default=str)
    except (TypeError, ValueError):          # pragma: no cover - defensive
        body = ""
    raw = f"{request.method}\n{request.path}\n{body}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _stored_response(record: IdempotencyKey) -> Response:
    """Rebuild the original response.

    ``response_body`` is the rendered envelope, and ``EnvelopeJSONRenderer``
    passes an already-enveloped payload through untouched — so the replay is
    byte-for-byte what the caller got the first time, key order included.
    """
    response = Response(json.loads(record.response_body), status=record.status_code)
    response[REPLAY_HEADER] = "true"
    return response


class IdempotentWriteMixin:
    """Give a view's unsafe methods ``Idempotency-Key`` support."""

    #: Set False on a view where replaying a stored response would be wrong.
    idempotency_enabled = True

    def initial(self, request, *args, **kwargs):
        # Authentication, permissions and throttling first: an unauthorised
        # request must not be able to claim a key, and a rejected one must not
        # be cached as though it were a real outcome.
        super().initial(request, *args, **kwargs)
        self._idempotency_record = None

        if not self.idempotency_enabled or request.method not in UNSAFE_METHODS:
            return
        key = (request.headers.get(IDEMPOTENCY_HEADER) or "").strip()
        if not key or not request.user.is_authenticated:
            return

        self._idempotency_record = self._claim_idempotency_key(request, key)

    def _claim_idempotency_key(self, request, key: str):
        """Take ownership of ``key``, or answer for the request that already has it."""
        fingerprint = request_fingerprint(request)

        try:
            with transaction.atomic():
                return IdempotencyKey.objects.create(
                    user=request.user,
                    key=key[:128],
                    endpoint=f"{request.method} {request.path}"[:255],
                    fingerprint=fingerprint,
                    lease_expires_at=IdempotencyKey.new_lease_expiry(),
                )
        except IntegrityError:
            pass    # somebody else holds this key — work out what to tell them

        existing = IdempotencyKey.objects.filter(user=request.user, key=key).first()
        if existing is None:
            # Purged in the gap between the collision and this read. Vanishingly
            # rare, and the safe answer is to run the request unprotected rather
            # than refuse it.
            return None

        if existing.fingerprint != fingerprint:
            raise Conflict(
                "This Idempotency-Key has already been used for a different "
                "request. Generate a new key for a new action."
            )

        if existing.is_complete:
            raise ReplayedResponse(_stored_response(existing))

        if existing.lease_is_live:
            raise Conflict(
                "A request with this Idempotency-Key is still being processed. "
                "Try again in a moment."
            )

        # The lease has expired, so whoever claimed it never finished. Take it
        # over — but conditionally, so that of several requests noticing the
        # stale lease at once, exactly one wins.
        claimed = IdempotencyKey.objects.filter(
            pk=existing.pk,
            status_code__isnull=True,
            lease_expires_at__lte=timezone.now(),
        ).update(lease_expires_at=IdempotencyKey.new_lease_expiry())

        if not claimed:
            raise Conflict(
                "A request with this Idempotency-Key is still being processed. "
                "Try again in a moment."
            )

        existing.refresh_from_db()
        return existing

    def handle_exception(self, exc):
        if isinstance(exc, ReplayedResponse):
            return exc.response
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)

        record = getattr(self, "_idempotency_record", None)
        if record is None:
            return response

        # A server error must stay retryable. Caching a 500 would hand the
        # client the same failure forever, for a fault that may already be over.
        if response.status_code >= 500:
            record.delete()
            return response

        try:
            body = response.rendered_content.decode("utf-8")
            json.loads(body)        # a body we cannot replay is not worth storing
        except (AttributeError, UnicodeDecodeError, ValueError):
            # Streamed or bodyless (exports, 204). Nothing worth replaying, and
            # holding the key would only block a genuine retry.
            record.delete()
            return response

        record.complete(status_code=response.status_code, body=body)
        return response
