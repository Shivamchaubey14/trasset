"""Asset enumerations (SRS §3.3, §3.8, §11.2)."""
from django.db import models


class AssetStatus(models.TextChoices):
    """FR-3.3 — the six lifecycle states."""

    AVAILABLE = "available", "Available"
    ASSIGNED = "assigned", "Assigned"
    UNDER_MAINTENANCE = "under_maintenance", "Under Maintenance"
    RETIRED = "retired", "Retired"
    LOST = "lost", "Lost"
    DISPOSED = "disposed", "Disposed"


#: Terminal states — an asset here cannot be assigned or maintained (SRS §11.2).
TERMINAL_STATUSES = (
    AssetStatus.RETIRED,
    AssetStatus.LOST,
    AssetStatus.DISPOSED,
)

#: States an asset may be assigned from.
ASSIGNABLE_STATUSES = (AssetStatus.AVAILABLE,)

#: States maintenance may be scheduled from.
MAINTAINABLE_STATUSES = (AssetStatus.AVAILABLE, AssetStatus.ASSIGNED)

#: Colours the UI uses for status pills (SRS §7.1).
STATUS_COLORS = {
    AssetStatus.AVAILABLE: "#3BB77E",          # Nest Green
    AssetStatus.ASSIGNED: "#253D4E",           # Ink
    AssetStatus.UNDER_MAINTENANCE: "#FDC040",  # Cream Yolk
    AssetStatus.RETIRED: "#7B8794",            # Slate
    AssetStatus.LOST: "#E5484D",               # Coral
    AssetStatus.DISPOSED: "#7B8794",           # Slate
}


class DepreciationMethod(models.TextChoices):
    """FR-8.1 — straight-line is the default."""

    STRAIGHT_LINE = "straight_line", "Straight Line"
    DECLINING_BALANCE = "declining_balance", "Declining Balance"


class AssignmentAction(models.TextChoices):
    """Immutable assignment history entries (FR-4.3)."""

    CHECKOUT = "checkout", "Check-out"
    CHECKIN = "checkin", "Check-in"


class RequestStatus(models.TextChoices):
    """Employee asset requests (FR-4.4)."""

    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"


#: A request in any of these has been settled and cannot be decided again.
DECIDED_REQUEST_STATUSES = (
    RequestStatus.APPROVED,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
)

REQUEST_STATUS_COLORS = {
    RequestStatus.PENDING: "#FDC040",   # Cream Yolk — needs attention
    RequestStatus.APPROVED: "#3BB77E",  # Nest Green
    RequestStatus.REJECTED: "#E5484D",  # Coral
    RequestStatus.CANCELLED: "#7B8794", # Slate
}
