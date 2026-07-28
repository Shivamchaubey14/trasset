"""Maintenance vocabulary (SRS §4.1, FR-6.x)."""
from django.db import models


class MaintenanceStatus(models.TextChoices):
    """
    Lifecycle of a maintenance record.

        Scheduled ──start──▶ In progress ──complete──▶ Completed
             │                     │
             └───────cancel────────┴──▶ Cancelled

    Note that *scheduling* does not take the asset out of service — an asset
    booked in for next Tuesday is still usable today. The asset only moves to
    ``Under Maintenance`` when the work actually starts (FR-6.2).
    """

    SCHEDULED = "scheduled", "Scheduled"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


#: Records here are settled and cannot be started, completed or cancelled again.
CLOSED_STATUSES = (
    MaintenanceStatus.COMPLETED,
    MaintenanceStatus.CANCELLED,
)

#: Records here still hold the asset out of service.
OPEN_STATUSES = (
    MaintenanceStatus.SCHEDULED,
    MaintenanceStatus.IN_PROGRESS,
)

STATUS_COLORS = {
    MaintenanceStatus.SCHEDULED: "#7B8794",    # Slate — booked, not started
    MaintenanceStatus.IN_PROGRESS: "#FDC040",  # Cream Yolk — asset is out
    MaintenanceStatus.COMPLETED: "#3BB77E",    # Nest Green
    MaintenanceStatus.CANCELLED: "#E5484D",    # Coral
}


class MaintenanceType(models.TextChoices):
    """What kind of work it is (FR-6.1)."""

    PREVENTIVE = "preventive", "Preventive"
    CORRECTIVE = "corrective", "Corrective"
    REPAIR = "repair", "Repair"
    INSPECTION = "inspection", "Inspection"
    CALIBRATION = "calibration", "Calibration"
    UPGRADE = "upgrade", "Upgrade"
    OTHER = "other", "Other"
