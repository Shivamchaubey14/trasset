"""
Notification dispatch (FR-12.1, FR-12.2).

One entry point, :func:`notify`, which writes the in-app record and — for the
types that warrant it — queues an email. Callers never touch email directly.

Two rules the rest of the codebase depends on:

* **Notifying never breaks the action being notified about.** A failure here is
  logged and swallowed. Nobody should fail to check in a laptop because the
  mail server is down.
* **Nobody is notified about their own action.** A manager assigning an asset to
  themselves does not need telling they did it.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from .constants import EMAIL_TYPES, NotificationType

logger = logging.getLogger("trasset")


def notify(user, notification_type, title, message="", related=None, link="",
           actor=None, send_email=None):
    """
    Create a notification for ``user``.

    :param related: the object it refers to, used for type/id and nothing else.
    :param actor: whoever caused it. If they are the recipient, nothing is sent.
    :param send_email: override the per-type default.
    :returns: the Notification, or ``None`` if it was skipped or failed.
    """
    from .models import Notification

    if user is None or not getattr(user, "is_active", False):
        return None

    # Telling someone what they just did is noise.
    if actor is not None and getattr(actor, "pk", None) == user.pk:
        return None

    try:
        notification = Notification.objects.create(
            user=user,
            type=notification_type,
            title=title[:200],
            message=message,
            related_object_type=related.__class__.__name__ if related is not None else "",
            related_object_id=str(getattr(related, "pk", "") or ""),
            link=link,
        )
    except Exception:  # noqa: BLE001 - never break the caller
        logger.exception("Failed to create notification for user %s", getattr(user, "pk", "?"))
        return None

    wants_email = send_email if send_email is not None else (
        notification_type in EMAIL_TYPES
    )
    if wants_email and user.email_notifications:
        # Only after the surrounding transaction commits — otherwise a rollback
        # leaves someone holding an email about something that never happened.
        transaction.on_commit(lambda: queue_email(notification.pk))

    # Push goes out for every type, unlike email (BE-3). The reasoning differs:
    # an email per check-in would train people to ignore Trasset's mail, but a
    # push is the whole reason the app is on the phone, and the person can mute
    # it per-device at the OS level as well as here.
    if user.push_notifications:
        transaction.on_commit(lambda: queue_push(notification.pk))

    return notification


def notify_many(users, *args, **kwargs):
    """Notify a collection, skipping duplicates and the actor."""
    seen = set()
    created = []
    for user in users:
        if user is None or user.pk in seen:
            continue
        seen.add(user.pk)
        result = notify(user, *args, **kwargs)
        if result:
            created.append(result)
    return created


def queue_email(notification_id):
    """
    Hand the email to Celery, or send inline if Celery is not configured.

    Eager mode in development runs the task synchronously, so this behaves the
    same either way.
    """
    try:
        from .tasks import send_notification_email

        send_notification_email.delay(notification_id)
    except Exception:  # noqa: BLE001 - broker down, bad config, anything
        logger.exception("Could not queue notification email %s; sending inline",
                         notification_id)
        try:
            deliver_email(notification_id)
        except Exception:  # noqa: BLE001
            logger.exception("Inline send also failed for notification %s",
                             notification_id)


def deliver_email(notification_id) -> bool:
    """
    Actually send it. Idempotent: a notification already emailed is skipped, so
    a retried task cannot double-send.
    """
    from .models import Notification

    notification = Notification.objects.select_related("user").filter(
        pk=notification_id
    ).first()

    if notification is None:
        return False
    if notification.emailed_at is not None:
        return False
    if not notification.user.email_notifications:
        return False

    link = notification.link or ""
    url = f"{settings.FRONTEND_URL}/{link.lstrip('/')}" if link else settings.FRONTEND_URL

    body = (
        f"Hello {notification.user.full_name},\n\n"
        f"{notification.title}\n\n"
        f"{notification.message}\n\n"
        f"View it in Trasset: {url}\n\n"
        f"— Trasset\n\n"
        f"You can turn these emails off under Settings in Trasset."
    )

    send_mail(
        subject=f"[Trasset] {notification.title}",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[notification.user.email],
        fail_silently=False,
    )

    Notification.objects.filter(pk=notification.pk).update(emailed_at=timezone.now())
    return True


# ---------------------------------------------------------------------------
# Push (SRS §12.4, BE-3)
# ---------------------------------------------------------------------------
def queue_push(notification_id):
    """
    Fan a notification out to every device its recipient has registered.

    **One task per device, not one per notification.** A single task looping
    over devices would, on retry after a partial failure, re-send to the
    handsets that already got it — and one dead device would delay the rest.
    Separate tasks fail and back off independently.

    **Nothing in here may raise.** It runs from ``transaction.on_commit``,
    which fires while the action that caused it is still completing — an
    exception escaping would fail the check-out this was only meant to report.
    """
    from .models import Notification

    try:
        notification = Notification.objects.select_related("user").filter(
            pk=notification_id
        ).first()
        if notification is None or not notification.user.push_notifications:
            return 0

        device_ids = list(notification.user.devices.values_list("id", flat=True))
    except Exception:  # noqa: BLE001 - see the guarantee below
        logger.exception("Could not look up push targets for notification %s",
                         notification_id)
        return 0

    if not device_ids:
        # Nobody has registered a handset. Not a failure — most users are on
        # the web only — so this stays quiet.
        return 0

    for device_id in device_ids:
        try:
            from .tasks import send_notification_push

            send_notification_push.delay(notification_id, device_id)
        except Exception:  # noqa: BLE001 - broker down, bad config, anything
            logger.exception("Could not queue push for notification %s device %s; "
                             "sending inline", notification_id, device_id)
            try:
                deliver_push(notification_id, device_id)
            except Exception:  # noqa: BLE001
                logger.exception("Inline push also failed for notification %s",
                                 notification_id)

    try:
        Notification.objects.filter(pk=notification_id, pushed_at__isnull=True).update(
            pushed_at=timezone.now()
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not stamp pushed_at on notification %s", notification_id)

    return len(device_ids)


def deliver_push(notification_id, device_id) -> bool:
    """
    Send one notification to one device.

    Returns True when the provider accepted it. A dead token is pruned here
    rather than retried — the app has been uninstalled or the token rotated,
    and no amount of backoff will fix that.
    """
    from apps.accounts.models import Device

    from .models import Notification
    from .push import PushMessage, get_push_backend

    notification = Notification.objects.select_related("user").filter(
        pk=notification_id
    ).first()
    if notification is None:
        return False
    if not notification.user.push_notifications:
        return False

    device = Device.objects.filter(pk=device_id, user=notification.user).first()
    if device is None:
        # Deregistered between the fan-out and now, or never belonged to this
        # user. Either way there is nothing to send to.
        return False

    result = get_push_backend().send(PushMessage(
        token=device.push_token,
        title=notification.title,
        body=notification.message,
        data=notification.push_payload(),
    ))

    if result.token_is_dead:
        logger.info("Pruning dead push token for device %s: %s",
                    device.pk, result.detail)
        device.delete()
        return False

    if not result.ok:
        # Raised so the task retries with backoff.
        raise PushDeliveryError(result.detail or "Push was not accepted")

    return True


class PushDeliveryError(Exception):
    """A push failed in a way that is worth retrying."""


# ---------------------------------------------------------------------------
# Event helpers — the vocabulary the rest of the app calls
# ---------------------------------------------------------------------------
def asset_assigned(asset, user, actor=None):
    return notify(
        user,
        NotificationType.ASSET_ASSIGNED,
        title=f"{asset.name} has been assigned to you",
        message=f"{asset.asset_tag} is now in your name. "
                f"Please look after it and check it back in when you are done.",
        related=asset,
        link=f"asset-detail.html?id={asset.pk}",
        actor=actor,
    )


def asset_checked_in(asset, user, actor=None):
    return notify(
        user,
        NotificationType.ASSET_CHECKED_IN,
        title=f"{asset.name} has been checked in",
        message=f"{asset.asset_tag} is no longer assigned to you.",
        related=asset,
        link=f"asset-detail.html?id={asset.pk}",
        actor=actor,
    )


def request_submitted(asset_request, approvers):
    return notify_many(
        approvers,
        NotificationType.REQUEST_SUBMITTED,
        title=f"{asset_request.requester.full_name} requested {asset_request.target_label}",
        message=asset_request.reason,
        related=asset_request,
        link="requests.html",
        actor=asset_request.requester,
    )


def request_approved(asset_request, actor=None):
    asset = asset_request.fulfilled_asset
    return notify(
        asset_request.requester,
        NotificationType.REQUEST_APPROVED,
        title=f"Your request for {asset_request.target_label} was approved",
        message=(f"{asset.asset_tag} — {asset.name} has been assigned to you."
                 if asset else "It has been approved."),
        related=asset_request,
        link=f"asset-detail.html?id={asset.pk}" if asset else "requests.html",
        actor=actor,
    )


def request_rejected(asset_request, actor=None):
    return notify(
        asset_request.requester,
        NotificationType.REQUEST_REJECTED,
        title=f"Your request for {asset_request.target_label} was not approved",
        message=asset_request.decision_notes or "No reason was given.",
        related=asset_request,
        link="requests.html",
        actor=actor,
    )


def maintenance_scheduled(record, actor=None):
    """Tell whoever is holding the asset that it is going in."""
    holder = record.asset.assigned_to
    if holder is None:
        return None

    return notify(
        holder,
        NotificationType.MAINTENANCE_SCHEDULED,
        title=f"{record.asset.name} is booked in for {record.get_type_display().lower()}",
        message=f"Scheduled for {record.scheduled_date}. "
                f"You will get it back when the work is done.",
        related=record,
        link=f"asset-detail.html?id={record.asset_id}",
        actor=actor,
    )


def maintenance_completed(record, actor=None):
    holder = record.asset.assigned_to
    if holder is None:
        return None

    return notify(
        holder,
        NotificationType.MAINTENANCE_COMPLETED,
        title=f"{record.asset.name} is back from maintenance",
        message=record.completion_notes or "The work has been completed.",
        related=record,
        link=f"asset-detail.html?id={record.asset_id}",
        actor=actor,
    )
