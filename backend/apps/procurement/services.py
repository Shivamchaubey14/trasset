"""
Purchase order workflow (FR-7.1 – FR-7.3).

    Draft ──place──▶ Ordered ──receive──▶ Partially received ──▶ Received
      │                 │                        │
      └────cancel───────┴────────────────────────┴──▶ Cancelled

Receiving is the interesting part: booking in three of a line item creates
three assets, each with its own generated tag, in one transaction. Either every
asset is created and the quantities move, or nothing happens.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.audit.constants import AuditAction
from apps.audit.services import record as audit_record
from common.exceptions import Conflict

from .constants import PurchaseOrderStatus


def _locked(order_id):
    from .models import PurchaseOrder

    return PurchaseOrder.objects.select_for_update().get(pk=order_id)


@transaction.atomic
def place(order, actor=None):
    """Move a draft to Ordered — it can then be received against."""
    order = _locked(order.pk)

    if order.status != PurchaseOrderStatus.DRAFT:
        raise Conflict(
            detail=f"{order.po_number} is already "
                   f"{order.get_status_display().lower()}."
        )
    if not order.items.exists():
        raise Conflict(
            detail="Add at least one line item before placing this order."
        )

    order.status = PurchaseOrderStatus.ORDERED
    order.save(update_fields=["status", "updated_at"])

    audit_record(AuditAction.UPDATE, instance=order, changes={"_context": {
        "placed": True,
        "vendor": order.vendor.name,
        "total": str(order.total_amount),
    }})
    return order


@transaction.atomic
def receive(order, actor=None, lines=None, received_date=None, notes=""):
    """
    Book goods in against an order (FR-7.2).

    :param lines: ``{item_id: quantity}``. Omit to receive everything still
        outstanding.
    :returns: ``(order, created_assets)``
    :raises Conflict: if the order can't be received against, or a quantity
        exceeds what is outstanding.
    """
    order = _locked(order.pk)

    if order.status == PurchaseOrderStatus.DRAFT:
        raise Conflict(
            detail=f"{order.po_number} is still a draft. Place the order before "
                   f"receiving against it."
        )
    if not order.is_receivable:
        raise Conflict(
            detail=f"{order.po_number} is {order.get_status_display().lower()} — "
                   f"nothing further can be received against it."
        )

    items = list(order.items.select_related("category").all())
    if not items:
        raise Conflict(detail="This order has no line items to receive.")

    # Work out what is actually being booked in.
    to_receive = {}
    for item in items:
        if lines is None:
            quantity = item.outstanding
        else:
            quantity = int(lines.get(item.id, lines.get(str(item.id), 0)) or 0)

        if quantity < 0:
            raise Conflict(detail="A received quantity cannot be negative.")
        if quantity > item.outstanding:
            raise Conflict(
                detail=f"'{item.description}' has only {item.outstanding} "
                       f"outstanding, but {quantity} was entered."
            )
        if quantity:
            to_receive[item.id] = quantity

    if not to_receive:
        raise Conflict(
            detail="Nothing left to receive on this order — every line is "
                   "already fully booked in."
        )

    receipt_date = received_date or timezone.now().date()
    created_assets = []

    for item in items:
        quantity = to_receive.get(item.id, 0)
        if not quantity:
            continue

        if item.create_assets and item.category_id:
            created_assets.extend(
                _create_assets_for_line(order, item, quantity, receipt_date, actor)
            )

        item.received_quantity += quantity
        item.save(update_fields=["received_quantity", "updated_at"])

    # Re-read the items so the status reflects what was just written.
    order.refresh_from_db()
    fully_received = all(line.is_fully_received for line in order.items.all())

    order.status = (PurchaseOrderStatus.RECEIVED if fully_received
                    else PurchaseOrderStatus.PARTIALLY_RECEIVED)
    if fully_received:
        order.received_date = receipt_date
    if notes:
        order.notes = f"{order.notes}\n{notes}".strip() if order.notes else notes
    order.save(update_fields=["status", "received_date", "notes", "updated_at"])

    audit_record(AuditAction.UPDATE, instance=order, changes={"_context": {
        "received": sum(to_receive.values()),
        "assets_created": len(created_assets),
        "status": order.status,
        "notes": notes,
    }})

    return order, created_assets


def _create_assets_for_line(order, item, quantity, receipt_date, actor):
    """
    One asset per unit received (FR-7.2).

    Quantity 3 of "Dell Latitude 5440" becomes three separate asset records,
    each with its own tag, because they are three physical things that will be
    assigned and maintained independently.
    """
    warranty_expiry = None
    if order.warranty_months:
        # Approximate months as 30 days — exact enough for a warranty flag, and
        # avoids a dateutil dependency for the sake of a few days.
        warranty_expiry = receipt_date + timedelta(days=30 * order.warranty_months)

    created = []
    for _ in range(quantity):
        asset = Asset(
            name=item.description,
            category=item.category,
            manufacturer=item.manufacturer,
            model_number=item.model_number,
            vendor=order.vendor,
            location=order.location,
            department=order.department,
            status=AssetStatus.AVAILABLE,
            purchase_date=receipt_date,
            purchase_cost=item.unit_cost or Decimal("0.00"),
            warranty_expiry=warranty_expiry,
            created_by=actor,
            notes=f"Created on receipt of {order.po_number}.",
        )
        asset.save()
        created.append(asset)

    return created


@transaction.atomic
def cancel(order, actor=None, notes=""):
    """Call an order off. Anything already received stays received."""
    order = _locked(order.pk)

    if order.is_closed:
        raise Conflict(
            detail=f"{order.po_number} is already "
                   f"{order.get_status_display().lower()}."
        )

    order.status = PurchaseOrderStatus.CANCELLED
    if notes:
        order.notes = f"{order.notes}\n{notes}".strip() if order.notes else notes
    order.save(update_fields=["status", "notes", "updated_at"])

    audit_record(AuditAction.CANCEL, instance=order, changes={"_context": {
        "reason": notes,
        "received_before_cancelling": order.total_received,
    }})
    return order
