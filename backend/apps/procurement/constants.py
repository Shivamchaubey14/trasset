"""Procurement vocabulary (SRS §4.1, FR-7.x)."""
from django.db import models


class PurchaseOrderStatus(models.TextChoices):
    """
    Lifecycle of a purchase order.

        Draft ──place──▶ Ordered ──receive──▶ Partially received ──▶ Received
          │                 │                        │
          └────cancel───────┴────────────────────────┴──▶ Cancelled

    "Partially received" is a real state, not a nicety: suppliers routinely ship
    part of an order, and the outstanding quantity has to stay visible.
    """

    DRAFT = "draft", "Draft"
    ORDERED = "ordered", "Ordered"
    PARTIALLY_RECEIVED = "partially_received", "Partially Received"
    RECEIVED = "received", "Received"
    CANCELLED = "cancelled", "Cancelled"


#: Nothing more can be received against an order in these states.
CLOSED_STATUSES = (
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
)

#: Goods may be booked in against an order in these states.
RECEIVABLE_STATUSES = (
    PurchaseOrderStatus.ORDERED,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
)

STATUS_COLORS = {
    PurchaseOrderStatus.DRAFT: "#7B8794",               # Slate
    PurchaseOrderStatus.ORDERED: "#253D4E",             # Ink
    PurchaseOrderStatus.PARTIALLY_RECEIVED: "#FDC040",  # Cream Yolk
    PurchaseOrderStatus.RECEIVED: "#3BB77E",            # Nest Green
    PurchaseOrderStatus.CANCELLED: "#E5484D",           # Coral
}

#: Prefix for generated PO numbers, e.g. PO-2026-000001.
PO_NUMBER_PREFIX = "PO"
