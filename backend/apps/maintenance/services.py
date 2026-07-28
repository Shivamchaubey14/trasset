"""
Maintenance state machine (FR-6.1 – FR-6.3, SRS §11.2).

    Scheduled ──start──▶ In progress ──complete──▶ Completed
         │                     │
         └───────cancel────────┴──▶ Cancelled

Starting takes the asset out of service; completing puts it back **where it
came from**, using ``asset_status_before``. Every transition runs in a
transaction with the asset row locked, so a start and an assignment racing on
the same asset cannot both win.
"""
from django.db import transaction
from django.utils import timezone

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.audit.constants import AuditAction
from apps.audit.services import domain_action
from common.exceptions import Conflict

from .constants import MaintenanceStatus


def _locked_asset(asset_id):
    return Asset.objects.select_for_update().get(pk=asset_id)


def _guard_open(record):
    """Refuse anything that would change a record that is already settled."""
    if record.status == MaintenanceStatus.COMPLETED:
        raise Conflict(
            detail=f"This maintenance was completed on {record.completed_date} "
                   f"and can no longer be changed."
        )
    if record.status == MaintenanceStatus.CANCELLED:
        raise Conflict(
            detail="This maintenance was cancelled. Schedule a new record instead."
        )


@transaction.atomic
def schedule(asset, actor=None, start_now=False, **fields):
    """
    Book work against an asset (FR-6.1).

    Scheduling alone leaves the asset usable; pass ``start_now`` to take it out
    of service straight away.
    """
    from .models import MaintenanceRecord

    asset = _locked_asset(asset.pk)

    if asset.is_terminal:
        raise Conflict(
            detail=f"{asset.asset_tag} is {asset.get_status_display().lower()} "
                   f"and cannot be booked in for maintenance."
        )

    record = MaintenanceRecord(asset=asset, created_by=actor, **fields)
    record.save()

    if start_now:
        return start(record, actor=actor)
    return record


@transaction.atomic
def start(record, actor=None):
    """
    Begin the work — the asset goes to ``Under Maintenance`` (FR-6.2).

    The asset's current status is stashed first so completion can restore it.
    """
    _guard_open(record)
    if record.status == MaintenanceStatus.IN_PROGRESS:
        raise Conflict(detail="This maintenance is already in progress.")

    asset = _locked_asset(record.asset_id)

    if asset.status == AssetStatus.UNDER_MAINTENANCE:
        raise Conflict(
            detail=f"{asset.asset_tag} is already under maintenance under another "
                   f"record. Complete that one first."
        )
    if not asset.can_be_maintained:
        raise Conflict(
            detail=f"{asset.asset_tag} is {asset.get_status_display().lower()} "
                   f"and cannot be taken in for maintenance."
        )

    record.asset_status_before = asset.status
    record.status = MaintenanceStatus.IN_PROGRESS
    record.started_at = timezone.now()
    record.save()

    asset.status = AssetStatus.UNDER_MAINTENANCE
    with domain_action(AuditAction.UPDATE, {
        "maintenance": record.get_type_display(),
        "taken_out_of_service": True,
    }):
        asset.save()

    return record


@transaction.atomic
def complete(record, actor=None, actual_cost=None, completed_date=None, notes=""):
    """
    Finish the work and put the asset back where it was (FR-6.3).

    An asset that was Assigned when it went in returns to Assigned, still with
    its holder — not to Available.
    """
    _guard_open(record)

    if record.status == MaintenanceStatus.SCHEDULED:
        raise Conflict(
            detail="This maintenance hasn't started yet. Start it before "
                   "marking it complete."
        )

    asset = _locked_asset(record.asset_id)

    record.status = MaintenanceStatus.COMPLETED
    record.completed_date = completed_date or timezone.now().date()
    record.completed_by = actor
    if actual_cost is not None:
        record.actual_cost = actual_cost
    if notes:
        record.completion_notes = notes
    record.save()

    # Only put the asset back if this record is what took it out. If something
    # else moved it in the meantime, leave that alone rather than overwriting it.
    if asset.status == AssetStatus.UNDER_MAINTENANCE:
        restored = record.asset_status_before or AssetStatus.AVAILABLE

        # An asset restored to Assigned must still have a holder; if the holder
        # was cleared while it was in the workshop, fall back to Available.
        if restored == AssetStatus.ASSIGNED and not asset.assigned_to_id:
            restored = AssetStatus.AVAILABLE

        asset.status = restored
        with domain_action(AuditAction.UPDATE, {
            "maintenance": record.get_type_display(),
            "returned_to_service_as": restored,
            "actual_cost": str(record.actual_cost) if record.actual_cost else None,
        }):
            asset.save()

    return record


@transaction.atomic
def cancel(record, actor=None, notes=""):
    """Call the work off. If it had started, the asset goes back into service."""
    _guard_open(record)

    was_in_progress = record.status == MaintenanceStatus.IN_PROGRESS
    asset = _locked_asset(record.asset_id)

    record.status = MaintenanceStatus.CANCELLED
    if notes:
        record.completion_notes = notes
    record.save()

    if was_in_progress and asset.status == AssetStatus.UNDER_MAINTENANCE:
        restored = record.asset_status_before or AssetStatus.AVAILABLE
        if restored == AssetStatus.ASSIGNED and not asset.assigned_to_id:
            restored = AssetStatus.AVAILABLE

        asset.status = restored
        with domain_action(AuditAction.UPDATE, {
            "maintenance": "cancelled",
            "returned_to_service_as": restored,
        }):
            asset.save()

    return record
