"""
Push delivery backends (SRS §12.4, BE-3).

Structured the way Django structures email: one interface, a backend chosen by
setting, a console backend for development and an in-memory one for tests. The
alternative — calling the provider inline — would make the notification path
untestable without a network and pin the whole app to one vendor.

The provider is Expo (SRS §12.2), which fronts APNs and FCM so the server never
handles either directly.
"""
import json
import logging
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from django.conf import settings
from django.utils.module_loading import import_string

logger = logging.getLogger("trasset")


@dataclass
class PushMessage:
    """One notification bound for one device."""

    token: str
    title: str
    body: str = ""
    #: Routed on by the app when the notification is tapped (FR-14.23).
    data: dict = field(default_factory=dict)

    def as_expo_payload(self) -> dict:
        return {
            "to": self.token,
            "title": self.title,
            "body": self.body,
            "data": self.data,
            "sound": "default",
        }


@dataclass
class PushResult:
    """What became of one message."""

    ok: bool
    detail: str = ""
    #: The provider says this token no longer belongs to a live install, so the
    #: row should go. Distinct from an ordinary failure, which is worth a retry.
    token_is_dead: bool = False


class BasePushBackend:
    def send(self, message: PushMessage) -> PushResult:
        raise NotImplementedError


class ConsolePushBackend(BasePushBackend):
    """Development default — writes the payload to the log and claims success."""

    def send(self, message: PushMessage) -> PushResult:
        logger.info("PUSH to %s… — %s | %s | data=%s",
                    message.token[:12], message.title, message.body, message.data)
        return PushResult(ok=True, detail="logged")


class LocMemPushBackend(BasePushBackend):
    """
    Test backend. Collects messages on the class so a test can read them,
    mirroring Django's ``locmem`` email backend.
    """

    sent: list = []

    def send(self, message: PushMessage) -> PushResult:
        LocMemPushBackend.sent.append(message)
        return PushResult(ok=True, detail="collected")

    @classmethod
    def clear(cls):
        cls.sent = []


class ExpoPushBackend(BasePushBackend):
    """
    Deliver through Expo's push service.

    Uses ``urllib`` rather than adding an HTTP library for one POST. Expo
    accepts up to 100 messages per request; this sends one at a time because
    each device is dispatched by its own Celery task, so that one dead handset
    cannot fail or delay the others. Worth batching if the estate ever grows to
    where the request count matters.
    """

    def send(self, message: PushMessage) -> PushResult:
        payload = json.dumps(message.as_expo_payload()).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if settings.EXPO_ACCESS_TOKEN:
            headers["Authorization"] = f"Bearer {settings.EXPO_ACCESS_TOKEN}"

        request = urllib.request.Request(
            settings.EXPO_PUSH_URL, data=payload, headers=headers, method="POST"
        )

        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            # Transport-level failure: the caller retries with backoff.
            return PushResult(ok=False, detail=str(exc))

        return self._read_ticket(body)

    @staticmethod
    def _read_ticket(body: dict) -> PushResult:
        """
        Interpret Expo's reply.

        A ticket of ``DeviceNotRegistered`` means the app was uninstalled or the
        token rotated. Retrying that for ever is pointless, so it is reported as
        a dead token for the caller to prune.
        """
        tickets = body.get("data") or []
        if isinstance(tickets, dict):
            tickets = [tickets]
        if not tickets:
            return PushResult(ok=False, detail="Provider returned no ticket")

        ticket = tickets[0]
        if ticket.get("status") == "ok":
            return PushResult(ok=True, detail=ticket.get("id", ""))

        error = (ticket.get("details") or {}).get("error", "")
        return PushResult(
            ok=False,
            detail=ticket.get("message") or error or "Push rejected",
            token_is_dead=error == "DeviceNotRegistered",
        )


def get_push_backend() -> BasePushBackend:
    """The configured backend. Cheap to construct, so built per call."""
    return import_string(settings.PUSH_BACKEND)()
