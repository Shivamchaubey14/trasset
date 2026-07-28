"""Notification vocabulary (SRS §4.1, FR-12.1, FR-12.2)."""
from django.db import models


class NotificationType(models.TextChoices):
    """
    What happened. The type drives the icon and colour in the UI, and lets a
    user reason about what they are being told rather than reading every line.
    """

    ASSET_ASSIGNED = "asset_assigned", "Asset assigned to you"
    ASSET_CHECKED_IN = "asset_checked_in", "Asset returned"

    REQUEST_SUBMITTED = "request_submitted", "Asset request awaiting approval"
    REQUEST_APPROVED = "request_approved", "Request approved"
    REQUEST_REJECTED = "request_rejected", "Request rejected"

    MAINTENANCE_SCHEDULED = "maintenance_scheduled", "Maintenance scheduled"
    MAINTENANCE_DUE = "maintenance_due", "Maintenance due"
    MAINTENANCE_COMPLETED = "maintenance_completed", "Maintenance completed"

    WARRANTY_EXPIRING = "warranty_expiring", "Warranty expiring"

    PURCHASE_RECEIVED = "purchase_received", "Purchase order received"


#: Icon key and colour per type, so the frontend does not hard-code a mapping.
TYPE_STYLES = {
    NotificationType.ASSET_ASSIGNED: ("box", "#3BB77E"),
    NotificationType.ASSET_CHECKED_IN: ("check", "#7B8794"),
    NotificationType.REQUEST_SUBMITTED: ("inbox", "#FDC040"),
    NotificationType.REQUEST_APPROVED: ("checkCircle", "#3BB77E"),
    NotificationType.REQUEST_REJECTED: ("close", "#E5484D"),
    NotificationType.MAINTENANCE_SCHEDULED: ("wrench", "#253D4E"),
    NotificationType.MAINTENANCE_DUE: ("clock", "#FDC040"),
    NotificationType.MAINTENANCE_COMPLETED: ("checkCircle", "#3BB77E"),
    NotificationType.WARRANTY_EXPIRING: ("warning", "#E5484D"),
    NotificationType.PURCHASE_RECEIVED: ("truck", "#3BB77E"),
}

#: Types that also go out by email when the user has not opted out (FR-12.2).
#: Deliberately not everything — an email per check-in would train people to
#: ignore Trasset's mail entirely.
EMAIL_TYPES = frozenset({
    NotificationType.ASSET_ASSIGNED,
    NotificationType.REQUEST_SUBMITTED,
    NotificationType.REQUEST_APPROVED,
    NotificationType.REQUEST_REJECTED,
    NotificationType.MAINTENANCE_DUE,
    NotificationType.WARRANTY_EXPIRING,
})
