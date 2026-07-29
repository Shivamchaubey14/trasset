"""Housekeeping for cross-cutting infrastructure (SRS §10.4)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from common.models import IdempotencyKey

logger = logging.getLogger("trasset")


@shared_task
def purge_idempotency_keys():
    """
    Drop stored responses past their TTL (BE-4).

    Keys are only useful while a client might still retry the action they
    guard. Keeping them beyond that turns a safety mechanism into a table that
    grows for ever — the same trap noted against the audit trail.
    """
    cutoff = timezone.now() - timedelta(hours=settings.IDEMPOTENCY_TTL_HOURS)
    deleted, _ = IdempotencyKey.objects.filter(created_at__lt=cutoff).delete()
    logger.info("Purged %s idempotency keys older than %s hours",
                deleted, settings.IDEMPOTENCY_TTL_HOURS)
    return deleted
