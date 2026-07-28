"""
Scheduled and background jobs for notifications (SRS §10.4, FR-6.5, FR-7.3).

The beat schedule in ``config/celery.py`` calls the two scan tasks daily. Both
are written to be safe to run twice: they check whether the same reminder has
already gone out today before creating another, so a retry or a double-trigger
does not spam anyone.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .constants import NotificationType

logger = logging.getLogger("trasset")


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    ignore_result=True,
)
def send_notification_email(self, notification_id):
    """Deliver one notification by email, retrying with backoff on failure."""
    from .services import deliver_email

    sent = deliver_email(notification_id)
    return {"notification_id": notification_id, "sent": sent}


def _already_notified_today(user, notification_type, related_id) -> bool:
    """Has this exact reminder already gone out today?"""
    from .models import Notification

    return Notification.objects.filter(
        user=user,
        type=notification_type,
        related_object_id=str(related_id),
        created_at__date=timezone.now().date(),
    ).exists()


def _managers():
    """Everyone who should hear about assets in general."""
    from apps.accounts.models import User
    from common.roles import Roles

    return list(
        User.objects.filter(is_active=True, role__name__in=Roles.MANAGERS)
        .select_related("role")
    )


@shared_task(ignore_result=True)
def scan_expiring_warranties():
    """
    Daily: warn managers about warranties lapsing inside the warning window
    (FR-7.3).

    Assets already out of circulation are skipped — chasing a warranty on a
    disposed asset wastes everyone's attention.
    """
    from apps.assets.constants import TERMINAL_STATUSES
    from apps.assets.models import Asset

    from .services import notify

    today = timezone.now().date()
    horizon = today + timedelta(days=settings.WARRANTY_EXPIRY_WARN_DAYS)

    assets = (
        Asset.objects.exclude(status__in=TERMINAL_STATUSES)
        .filter(warranty_expiry__isnull=False,
                warranty_expiry__gte=today,
                warranty_expiry__lte=horizon)
        .select_related("category", "assigned_to")
        .order_by("warranty_expiry")
    )

    recipients = _managers()
    if not recipients:
        logger.warning("Warranty scan: no active managers to notify")
        return {"assets": 0, "notifications": 0}

    created = 0
    for asset in assets:
        days_left = (asset.warranty_expiry - today).days
        for manager in recipients:
            if _already_notified_today(manager, NotificationType.WARRANTY_EXPIRING, asset.pk):
                continue
            result = notify(
                manager,
                NotificationType.WARRANTY_EXPIRING,
                title=f"Warranty on {asset.asset_tag} expires in {days_left} days",
                message=f"{asset.name} — cover ends {asset.warranty_expiry}. "
                        f"Renew it or plan the replacement.",
                related=asset,
                link=f"asset-detail.html?id={asset.pk}",
            )
            if result:
                created += 1

    logger.info("Warranty scan: %s assets expiring, %s notifications",
                len(assets), created)
    return {"assets": len(assets), "notifications": created}


@shared_task(ignore_result=True)
def scan_due_maintenance():
    """
    Daily: flag maintenance due within the week, and anything overdue (FR-6.5).

    Overdue work is reported every day it stays overdue — that is the point of
    a nag — but only once per day per person.
    """
    from apps.maintenance.constants import MaintenanceStatus
    from apps.maintenance.models import MaintenanceRecord

    from .services import notify

    today = timezone.now().date()
    horizon = today + timedelta(days=7)

    records = (
        MaintenanceRecord.objects
        .filter(status=MaintenanceStatus.SCHEDULED)
        .filter(Q(scheduled_date__lte=horizon))
        .select_related("asset", "asset__assigned_to")
        .order_by("scheduled_date")
    )

    recipients = _managers()
    if not recipients:
        logger.warning("Maintenance scan: no active managers to notify")
        return {"records": 0, "notifications": 0}

    created = 0
    for record in records:
        overdue = record.scheduled_date < today
        days = abs((record.scheduled_date - today).days)

        if overdue:
            title = f"Maintenance on {record.asset.asset_tag} is {days} days overdue"
        elif days == 0:
            title = f"Maintenance on {record.asset.asset_tag} is due today"
        else:
            title = f"Maintenance on {record.asset.asset_tag} is due in {days} days"

        for manager in recipients:
            if _already_notified_today(manager, NotificationType.MAINTENANCE_DUE, record.pk):
                continue
            result = notify(
                manager,
                NotificationType.MAINTENANCE_DUE,
                title=title,
                message=f"{record.get_type_display()} on {record.asset.name}, "
                        f"booked for {record.scheduled_date}.",
                related=record,
                link="maintenance.html",
            )
            if result:
                created += 1

    logger.info("Maintenance scan: %s records due, %s notifications",
                len(records), created)
    return {"records": len(records), "notifications": created}


@shared_task(ignore_result=True)
def purge_read_notifications(days=90):
    """
    Housekeeping: drop read notifications older than ``days``.

    Unread ones are left alone however old they are — if nobody has looked, the
    system should not decide it no longer matters.
    """
    from .models import Notification

    cutoff = timezone.now() - timedelta(days=days)
    deleted, _ = Notification.objects.filter(
        is_read=True, created_at__lt=cutoff
    ).delete()

    logger.info("Purged %s read notifications older than %s days", deleted, days)
    return {"deleted": deleted}
