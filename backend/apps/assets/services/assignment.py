"""
Asset assignment state machine (FR-4.1 – FR-4.5, SRS §11.2).

Every transition runs inside a transaction and re-reads the asset with
``select_for_update()``, so two managers assigning the same asset at the same
moment can't both win — the second sees the updated status and gets a 409.

    Available ──assign──▶ Assigned ──checkin──▶ Available
    Any (non-terminal) ──retire──▶ Retired / Lost / Disposed   (terminal)
"""
from django.db import transaction
from django.utils import timezone

from apps.audit.constants import AuditAction
from apps.audit.services import domain_action
from apps.notifications import services as notifications
from common.exceptions import Conflict

from ..constants import TERMINAL_STATUSES, AssetStatus, AssignmentAction
from ..models import Asset, AssetAssignment

#: Statuses ``retire()`` is allowed to move an asset into.
RETIREMENT_STATUSES = (
    AssetStatus.RETIRED,
    AssetStatus.LOST,
    AssetStatus.DISPOSED,
)


def _locked(asset_id):
    """Re-read the asset under a row lock so status checks are race-free."""
    return Asset.objects.select_for_update().get(pk=asset_id)


@transaction.atomic
def assign(asset, user, actor=None, notes=""):
    """
    Check an asset out to ``user``.

    :raises Conflict: if the asset isn't Available, or the target is inactive.
    """
    asset = _locked(asset.pk)

    if asset.status == AssetStatus.ASSIGNED:
        holder = asset.assigned_to.full_name if asset.assigned_to_id else "someone else"
        raise Conflict(
            detail=f"{asset.asset_tag} is already assigned to {holder}. "
                   f"Check it in before assigning it again."
        )
    if asset.status == AssetStatus.UNDER_MAINTENANCE:
        raise Conflict(
            detail=f"{asset.asset_tag} is under maintenance and cannot be assigned. "
                   f"Complete the maintenance record first."
        )
    if asset.status in TERMINAL_STATUSES:
        raise Conflict(
            detail=f"{asset.asset_tag} is {asset.get_status_display().lower()} "
                   f"and cannot be assigned."
        )
    if not user.is_active:
        raise Conflict(detail=f"{user.full_name} is deactivated and cannot hold assets.")

    asset.assigned_to = user
    asset.assigned_at = timezone.now()
    asset.status = AssetStatus.ASSIGNED
    # Log this as "Assigned" rather than a bare field update (FR-13.1).
    with domain_action(AuditAction.ASSIGN, {"assigned_to": user.full_name,
                                            "notes": notes}):
        asset.save()

    AssetAssignment.objects.create(
        asset=asset,
        user=user,
        assigned_by=actor,
        action=AssignmentAction.CHECKOUT,
        notes=notes,
    )

    notifications.asset_assigned(asset, user=user, actor=actor)
    return asset


def checkin(asset, actor=None, notes="", location=None):
    """
    Return an asset to the pool.

    :param location: optional new location, for when kit comes back elsewhere.
    :raises Conflict: if the asset isn't currently assigned.
    """
    orphan_tag = None

    with transaction.atomic():
        locked = _locked(asset.pk)

        if locked.status != AssetStatus.ASSIGNED:
            # Nothing written yet, so rolling back here costs nothing.
            raise Conflict(
                detail=f"{locked.asset_tag} is not currently assigned "
                       f"(it is {locked.get_status_display().lower()})."
            )

        holder = locked.assigned_to
        if holder is None:
            # Data drift: status says Assigned but nobody holds it. Repair the
            # row and let the transaction commit, then report it below — raising
            # in here would roll the repair straight back.
            locked.status = AssetStatus.AVAILABLE
            locked.assigned_at = None
            locked.save()
            orphan_tag = locked.asset_tag
        else:
            held_days = None
            if locked.assigned_at:
                held_days = max(0, (timezone.now() - locked.assigned_at).days)

            locked.assigned_to = None
            locked.assigned_at = None
            locked.status = AssetStatus.AVAILABLE
            if location is not None:
                locked.location = location
            with domain_action(AuditAction.CHECKIN, {"returned_by": holder.full_name,
                                                     "days_held": held_days,
                                                     "notes": notes}):
                locked.save()

            AssetAssignment.objects.create(
                asset=locked,
                user=holder,
                assigned_by=actor,
                action=AssignmentAction.CHECKIN,
                notes=notes,
                days_held=held_days,
            )

            notifications.asset_checked_in(locked, user=holder, actor=actor)
            return locked

    raise Conflict(
        detail=f"{orphan_tag} had no assignee on record. "
               f"Its status has been reset to Available."
    )


@transaction.atomic
def retire(asset, status=AssetStatus.RETIRED, actor=None, notes=""):
    """
    Move an asset to a terminal state (FR-4.5, SRS §11.2).

    If it was assigned, it is checked in first so the history closes cleanly
    rather than leaving a dangling holder.
    """
    asset = _locked(asset.pk)

    if status not in RETIREMENT_STATUSES:
        raise Conflict(
            detail=f"'{status}' is not a retirement status. "
                   f"Use one of: {', '.join(RETIREMENT_STATUSES)}."
        )
    if asset.status in TERMINAL_STATUSES:
        raise Conflict(
            detail=f"{asset.asset_tag} is already {asset.get_status_display().lower()}."
        )

    if asset.assigned_to_id:
        holder = asset.assigned_to
        held_days = None
        if asset.assigned_at:
            held_days = max(0, (timezone.now() - asset.assigned_at).days)

        AssetAssignment.objects.create(
            asset=asset,
            user=holder,
            assigned_by=actor,
            action=AssignmentAction.CHECKIN,
            notes=f"Auto check-in on {status}. {notes}".strip(),
            days_held=held_days,
        )
        asset.assigned_to = None
        asset.assigned_at = None

    asset.status = status
    if notes:
        asset.notes = f"{asset.notes}\n{notes}".strip() if asset.notes else notes
    with domain_action(AuditAction.RETIRE, {"outcome": status, "notes": notes}):
        asset.save()
    return asset


def history(asset):
    """Assignment timeline for one asset, newest first (FR-4.3)."""
    return (
        AssetAssignment.objects.filter(asset=asset)
        .select_related("user", "assigned_by")
        .order_by("-created_at", "-id")
    )
