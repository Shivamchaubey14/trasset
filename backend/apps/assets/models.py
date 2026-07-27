"""Asset registry (SRS §4.1) — the centre of the system."""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from common.models import SoftDeleteModel, TimeStampedModel
from common.validators import validate_document_upload, validate_image_upload

from .constants import (
    ASSIGNABLE_STATUSES,
    MAINTAINABLE_STATUSES,
    TERMINAL_STATUSES,
    AssignmentAction,
    AssetStatus,
    DepreciationMethod,
    STATUS_COLORS,
)
from .services import depreciation as depreciation_service
from .services.tagging import next_asset_tag


class AssetTagCounter(TimeStampedModel):
    """Per-year sequence backing :func:`next_asset_tag` (FR-3.2)."""

    prefix = models.CharField(max_length=10)
    year = models.PositiveSmallIntegerField()
    last_sequence = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "asset_tag_counters"
        unique_together = ("prefix", "year")
        verbose_name = "asset tag counter"

    def __str__(self):
        return f"{self.prefix}-{self.year}: {self.last_sequence}"


class Asset(TimeStampedModel, SoftDeleteModel):
    """A tracked item — physical or digital (FR-3.1)."""

    asset_tag = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    serial_number = models.CharField(max_length=120, blank=True, db_index=True)
    model_number = models.CharField(max_length=120, blank=True)
    manufacturer = models.CharField(max_length=150, blank=True)

    category = models.ForeignKey(
        "masters.Category", on_delete=models.PROTECT, related_name="assets"
    )
    status = models.CharField(
        max_length=24, choices=AssetStatus.choices,
        default=AssetStatus.AVAILABLE, db_index=True,
    )
    location = models.ForeignKey(
        "masters.Location", on_delete=models.SET_NULL,
        related_name="assets", null=True, blank=True,
    )
    department = models.ForeignKey(
        "masters.Department", on_delete=models.SET_NULL,
        related_name="assets", null=True, blank=True,
    )
    vendor = models.ForeignKey(
        "masters.Vendor", on_delete=models.SET_NULL,
        related_name="assets", null=True, blank=True,
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="assigned_assets", null=True, blank=True, db_index=True,
    )
    assigned_at = models.DateTimeField(null=True, blank=True)

    # --- Financials (FR-8.2) ---
    purchase_date = models.DateField(null=True, blank=True)
    purchase_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    salvage_value = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    useful_life_years = models.PositiveSmallIntegerField(default=5)
    depreciation_method = models.CharField(
        max_length=24, choices=DepreciationMethod.choices,
        default=DepreciationMethod.STRAIGHT_LINE,
    )
    current_value = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
        help_text="Book value, recomputed on save and by the monthly job.",
    )
    warranty_expiry = models.DateField(null=True, blank=True, db_index=True)

    image = models.ImageField(
        upload_to="assets/images/%Y/%m/", null=True, blank=True,
        validators=[validate_image_upload],
    )
    custom_data = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="created_assets", null=True, blank=True,
    )

    class Meta:
        db_table = "assets"
        ordering = ("-created_at",)
        indexes = [
            # SRS §4.3
            models.Index(fields=["status", "category"], name="idx_asset_status_category"),
            models.Index(fields=["status", "is_deleted"], name="idx_asset_status_deleted"),
            models.Index(fields=["department", "status"], name="idx_asset_dept_status"),
            models.Index(fields=["warranty_expiry"], name="idx_asset_warranty"),
        ]

    def __str__(self):
        return f"{self.asset_tag} — {self.name}"

    # -- persistence -------------------------------------------------------
    def save(self, *args, **kwargs):
        if not self.asset_tag:
            year = self.purchase_date.year if self.purchase_date else timezone.now().year
            self.asset_tag = next_asset_tag(year)

        self.current_value = self.compute_current_value()

        # Keep the assignment stamp honest even if a caller sets status directly.
        if self.assigned_to_id and not self.assigned_at:
            self.assigned_at = timezone.now()
        elif not self.assigned_to_id:
            self.assigned_at = None

        super().save(*args, **kwargs)

    # -- valuation (FR-8.1) ------------------------------------------------
    def compute_current_value(self, as_of=None) -> Decimal:
        return depreciation_service.current_value(
            purchase_cost=self.purchase_cost,
            salvage_value=self.salvage_value,
            useful_life_years=self.useful_life_years,
            method=self.depreciation_method,
            purchase_date=self.purchase_date,
            as_of=as_of,
        )

    def depreciation_schedule(self) -> list[dict]:
        return [
            row.as_dict()
            for row in depreciation_service.schedule(
                purchase_cost=self.purchase_cost,
                salvage_value=self.salvage_value,
                useful_life_years=self.useful_life_years,
                method=self.depreciation_method,
                purchase_date=self.purchase_date,
            )
        ]

    @property
    def accumulated_depreciation(self) -> Decimal:
        return max(Decimal("0.00"), self.purchase_cost - self.current_value)

    # -- state machine (SRS §11.2) ----------------------------------------
    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def can_be_assigned(self) -> bool:
        return self.status in ASSIGNABLE_STATUSES and not self.is_deleted

    @property
    def can_be_maintained(self) -> bool:
        return self.status in MAINTAINABLE_STATUSES and not self.is_deleted

    @property
    def status_color(self) -> str:
        return STATUS_COLORS.get(self.status, "#7B8794")

    # -- warranty (FR-7.3) -------------------------------------------------
    @property
    def warranty_days_remaining(self) -> int | None:
        if not self.warranty_expiry:
            return None
        return (self.warranty_expiry - timezone.now().date()).days

    @property
    def warranty_expiring_soon(self) -> bool:
        days = self.warranty_days_remaining
        return days is not None and 0 <= days <= settings.WARRANTY_EXPIRY_WARN_DAYS

    @property
    def warranty_expired(self) -> bool:
        days = self.warranty_days_remaining
        return days is not None and days < 0


class AssetAssignment(TimeStampedModel):
    """
    One immutable row per check-out or check-in (FR-4.3).

    Rows are never edited or deleted — the history is the audit story of who
    held an asset and when. ``save()`` refuses updates to enforce that.
    """

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name="asset_assignments",
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="assignments_made", null=True, blank=True,
    )
    action = models.CharField(max_length=12, choices=AssignmentAction.choices)
    notes = models.TextField(blank=True)

    #: Set on the check-in row so reports can measure how long an asset was held.
    days_held = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "asset_assignments"
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=["asset", "-created_at"], name="idx_assign_asset_date"),
            models.Index(fields=["user", "-created_at"], name="idx_assign_user_date"),
        ]

    def __str__(self):
        return f"{self.get_action_display()} · {self.asset_id} → {self.user_id}"

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValueError(
                "Assignment history is immutable — create a new row instead of editing one."
            )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError("Assignment history is immutable and cannot be deleted.")


class Attachment(TimeStampedModel):
    """Invoice, warranty PDF or photo attached to an asset (FR-3.7)."""

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(
        upload_to="assets/documents/%Y/%m/", validators=[validate_document_upload]
    )
    filename = models.CharField(max_length=255, blank=True)
    description = models.CharField(max_length=255, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="uploaded_attachments", null=True, blank=True,
    )

    class Meta:
        db_table = "attachments"
        ordering = ("-created_at",)

    def __str__(self):
        return self.filename or self.file.name

    def save(self, *args, **kwargs):
        if self.file and not self.filename:
            self.filename = self.file.name.rsplit("/", 1)[-1]
        if self.file and not self.size_bytes:
            try:
                self.size_bytes = self.file.size
            except (OSError, ValueError):
                self.size_bytes = 0
        super().save(*args, **kwargs)
