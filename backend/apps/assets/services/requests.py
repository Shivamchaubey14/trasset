"""
Asset request workflow (FR-4.4).

    Pending ──approve──▶ Approved   (asset is checked out to the requester)
       │
       ├────reject────▶ Rejected
       └────cancel────▶ Cancelled   (requester changes their mind)

Approval delegates to :func:`apps.assets.services.assignment.assign`, inside the
same transaction. If the asset was taken by someone else between the request and
the decision, ``assign`` raises and the whole approval rolls back — the request
stays pending rather than being marked approved with nothing handed over.
"""
from django.db import transaction
from django.utils import timezone

from apps.audit.constants import AuditAction
from apps.audit.services import record as audit_record
from apps.notifications import services as notifications
from common.exceptions import Conflict

from ..constants import RequestStatus
from ..models import AssetRequest
from . import assignment as assignment_service


def _locked(request_id):
    return AssetRequest.objects.select_for_update().get(pk=request_id)


def _guard_pending(asset_request):
    if asset_request.status != RequestStatus.PENDING:
        raise Conflict(
            detail=f"This request has already been "
                   f"{asset_request.get_status_display().lower()} and cannot be "
                   f"changed."
        )


@transaction.atomic
def approve(asset_request, actor, asset=None, notes=""):
    """
    Approve a request and hand the asset over.

    :param asset: the asset to give out. Required when the request named a
        category rather than a specific asset; also allows an approver to
        substitute an equivalent item.
    :raises Conflict: if the request is already decided, no asset was chosen,
        or the asset is not available.
    """
    asset_request = _locked(asset_request.pk)
    _guard_pending(asset_request)

    target = asset or asset_request.asset
    if target is None:
        raise Conflict(
            detail="This request asks for a category rather than a specific "
                   "asset. Choose which asset to hand over."
        )

    # Raises Conflict (409) if the asset isn't Available — rolls this back.
    assignment_service.assign(
        target,
        user=asset_request.requester,
        actor=actor,
        notes=f"Approved request #{asset_request.pk}. {notes}".strip(),
    )

    asset_request.status = RequestStatus.APPROVED
    asset_request.decided_by = actor
    asset_request.decided_at = timezone.now()
    asset_request.decision_notes = notes
    asset_request.fulfilled_asset = target
    asset_request.save()

    audit_record(AuditAction.APPROVE, instance=asset_request, changes={"_context": {
        "requester": asset_request.requester.full_name,
        "asset": target.asset_tag,
        "notes": notes,
    }})

    # The assign above already told them the asset is theirs; this says the
    # request they raised was granted, which is a different thing to know.
    notifications.request_approved(asset_request, actor=actor)
    return asset_request


@transaction.atomic
def reject(asset_request, actor, notes=""):
    """Turn a request down. A reason is worth insisting on, so it's required."""
    asset_request = _locked(asset_request.pk)
    _guard_pending(asset_request)

    asset_request.status = RequestStatus.REJECTED
    asset_request.decided_by = actor
    asset_request.decided_at = timezone.now()
    asset_request.decision_notes = notes
    asset_request.save()

    audit_record(AuditAction.REJECT, instance=asset_request, changes={"_context": {
        "requester": asset_request.requester.full_name,
        "reason": notes,
    }})

    notifications.request_rejected(asset_request, actor=actor)
    return asset_request


@transaction.atomic
def cancel(asset_request, actor):
    """Withdraw a request. Only the requester may do this, while still pending."""
    asset_request = _locked(asset_request.pk)
    _guard_pending(asset_request)

    if asset_request.requester_id != actor.pk:
        raise Conflict(detail="Only the person who raised a request can cancel it.")

    asset_request.status = RequestStatus.CANCELLED
    asset_request.decided_by = actor
    asset_request.decided_at = timezone.now()
    asset_request.save()

    audit_record(AuditAction.CANCEL, instance=asset_request, changes={"_context": {
        "requester": asset_request.requester.full_name,
    }})
    return asset_request


def record_created(asset_request):
    """
    Log the submission with its own verb.

    ``AssetRequest`` is deliberately kept out of ``TRACKED_MODELS``: every state
    change here is a named business event (Requested / Approved / Rejected /
    Cancelled), so recording them explicitly reads better than a generic
    Created-then-Updated pair, and avoids double rows.
    """
    audit_record(
        AuditAction.REQUEST,
        instance=asset_request,
        changes={"_context": {
            "requested": asset_request.target_label,
            "reason": asset_request.reason,
        }},
    )

    notifications.request_submitted(asset_request, approvers=_approvers_for(asset_request))


def _approvers_for(asset_request):
    """
    Who should see this request.

    Managers see everything; a department head sees their own department's, so
    they are told about exactly what they are able to act on.
    """
    from django.db.models import Q

    from apps.accounts.models import User
    from common.roles import Roles

    requester_department = asset_request.requester.department_id

    query = Q(role__name__in=Roles.MANAGERS)
    if requester_department:
        query |= Q(role__name=Roles.DEPARTMENT_HEAD, department_id=requester_department)

    return list(
        User.objects.filter(is_active=True)
        .filter(query)
        .exclude(pk=asset_request.requester_id)
        .select_related("role")
    )
