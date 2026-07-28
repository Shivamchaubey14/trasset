"""Maintenance records (SRS §4.1, FR-6.1 – FR-6.3)."""
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

from .constants import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    STATUS_COLORS,
    MaintenanceStatus,
    MaintenanceType,
)


class MaintenanceRecord(TimeStampedModel):
    """
    One piece of work booked against an asset.

    ``asset_status_before`` is the important field: completing maintenance has
    to put the asset back where it came from. A laptop that was *Assigned* when
    it went in for a screen repair belongs back with its holder afterwards, not
    dropped into the Available pool — which is what a naive "restore to
    Available" would do (FR-6.3).
    """

    asset = models.ForeignKey(
        "assets.Asset", on_delete=models.CASCADE, related_name="maintenance_records"
    )
    type = models.CharField(
        max_length=20, choices=MaintenanceType.choices,
        default=MaintenanceType.CORRECTIVE,
    )
    status = models.CharField(
        max_length=16, choices=MaintenanceStatus.choices,
        default=MaintenanceStatus.SCHEDULED, db_index=True,
    )

    scheduled_date = models.DateField(help_text="When the work is booked for.")
    started_at = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateField(null=True, blank=True)

    technician = models.CharField(
        max_length=150, blank=True,
        help_text="Person doing the work, when it isn't a vendor.",
    )
    vendor = models.ForeignKey(
        "masters.Vendor", on_delete=models.SET_NULL,
        related_name="maintenance_records", null=True, blank=True,
    )

    cost_estimate = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00")
    )
    actual_cost = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Captured on completion.",
    )

    notes = models.TextField(blank=True)
    completion_notes = models.TextField(blank=True)

    #: Where the asset was before work started, so it can be put back (FR-6.3).
    asset_status_before = models.CharField(max_length=24, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="scheduled_maintenance", null=True, blank=True,
    )
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="completed_maintenance", null=True, blank=True,
    )

    class Meta:
        db_table = "maintenance_records"
        ordering = ("-scheduled_date", "-id")
        indexes = [
            models.Index(fields=["asset", "-scheduled_date"], name="idx_maint_asset_date"),
            models.Index(fields=["status", "scheduled_date"], name="idx_maint_status_date"),
        ]

    def __str__(self):
        return f"{self.get_type_display()} · {self.asset.asset_tag}"

    # -- state -------------------------------------------------------------
    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES

    @property
    def is_closed(self) -> bool:
        return self.status in CLOSED_STATUSES

    @property
    def status_color(self) -> str:
        return STATUS_COLORS.get(self.status, "#7B8794")

    @property
    def is_overdue(self) -> bool:
        """Booked for a date that has passed and still not finished (FR-6.5)."""
        if self.status != MaintenanceStatus.SCHEDULED:
            return False
        return self.scheduled_date < timezone.now().date()

    @property
    def days_until_due(self) -> int | None:
        if self.status != MaintenanceStatus.SCHEDULED:
            return None
        return (self.scheduled_date - timezone.now().date()).days

    @property
    def cost_variance(self) -> Decimal | None:
        """Actual minus estimate — positive means it came in over."""
        if self.actual_cost is None:
            return None
        return self.actual_cost - (self.cost_estimate or Decimal("0.00"))

    @property
    def duration_days(self) -> int | None:
        if not self.started_at or not self.completed_date:
            return None
        return max(0, (self.completed_date - self.started_at.date()).days)
