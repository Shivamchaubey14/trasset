"""
Signal wiring for the tracked models (FR-13.1).

``pre_save`` reads the stored row so ``post_save`` can diff against it. That is
one extra SELECT per update on audited models — an acceptable price for a
trustworthy trail, and it costs nothing on create.

Soft deletes arrive as an update with ``is_deleted`` flipping to True, so they
are translated into a DELETE row rather than an anonymous field change.
"""
import logging

from django.apps import apps
from django.db.models.signals import post_delete, post_save, pre_save

from .constants import TRACKED_MODELS
from .services import (
    is_suspended,
    record_model_change,
    record_model_delete,
    snapshot,
)

logger = logging.getLogger("trasset")

#: Stashes the pre-save state on the instance itself, so concurrent saves of
#: different instances never see each other's snapshots.
SNAPSHOT_ATTR = "_audit_snapshot"


def capture_previous_state(sender, instance, **kwargs):
    if is_suspended() or instance.pk is None:
        return
    try:
        previous = sender._default_manager.filter(pk=instance.pk).first()
        # Soft-deleted rows are hidden by the default manager; fall back so an
        # edit to a deleted record still diffs correctly.
        if previous is None and hasattr(sender, "all_objects"):
            previous = sender.all_objects.filter(pk=instance.pk).first()
        setattr(instance, SNAPSHOT_ATTR, snapshot(previous) if previous else None)
    except Exception:  # noqa: BLE001 - auditing must never break a save
        logger.exception("Audit: could not snapshot %s #%s", sender.__name__, instance.pk)
        setattr(instance, SNAPSHOT_ATTR, None)


def record_change(sender, instance, created, **kwargs):
    if is_suspended():
        return
    before = getattr(instance, SNAPSHOT_ATTR, None)

    try:
        # A soft delete is an update in disguise — log it as a deletion.
        if (not created and before is not None
                and before.get("is_deleted") is False
                and getattr(instance, "is_deleted", False) is True):
            record_model_delete(instance, soft=True)
            return

        record_model_change(instance, created=created, before=before)
    finally:
        if hasattr(instance, SNAPSHOT_ATTR):
            delattr(instance, SNAPSHOT_ATTR)


def record_delete(sender, instance, **kwargs):
    if is_suspended():
        return
    record_model_delete(instance, soft=False)


def connect():
    """Wire the signals for every model in TRACKED_MODELS."""
    for label in TRACKED_MODELS:
        try:
            model = apps.get_model(label)
        except LookupError:  # pragma: no cover - a typo in the registry
            logger.warning("Audit: unknown tracked model %s", label)
            continue

        uid = f"audit_{label}"
        pre_save.connect(capture_previous_state, sender=model,
                         dispatch_uid=f"{uid}_pre_save")
        post_save.connect(record_change, sender=model,
                          dispatch_uid=f"{uid}_post_save")
        post_delete.connect(record_delete, sender=model,
                            dispatch_uid=f"{uid}_post_delete")
