"""Purchase orders (SRS §4.1, FR-7.1 – FR-7.3)."""
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

from .constants import (
    CLOSED_STATUSES,
    RECEIVABLE_STATUSES,
    STATUS_COLORS,
    PurchaseOrderStatus,
)


class PurchaseOrder(TimeStampedModel):
    """
    An order placed with a vendor (FR-7.1).

    ``total_amount`` is stored rather than computed on read, because it is a
    financial figure that should not drift if a line item is edited later — but
    it is always recalculated from the line items on save, never taken from the
    client.
    """

    po_number = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    vendor = models.ForeignKey(
        "masters.Vendor", on_delete=models.PROTECT, related_name="purchase_orders"
    )
    status = models.CharField(
        max_length=24, choices=PurchaseOrderStatus.choices,
        default=PurchaseOrderStatus.DRAFT, db_index=True,
    )

    po_date = models.DateField(default=timezone.now)
    expected_delivery = models.DateField(null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)

    total_amount = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00"),
        help_text="Derived from the line items; never accepted from the client.",
    )

    #: Applied to assets created when the order is received (FR-7.3).
    warranty_months = models.PositiveSmallIntegerField(
        default=0, help_text="Warranty length to stamp on assets created on receipt."
    )

    location = models.ForeignKey(
        "masters.Location", on_delete=models.SET_NULL,
        related_name="purchase_orders", null=True, blank=True,
        help_text="Where the goods land, used for assets created on receipt.",
    )
    department = models.ForeignKey(
        "masters.Department", on_delete=models.SET_NULL,
        related_name="purchase_orders", null=True, blank=True,
    )

    reference = models.CharField(
        max_length=120, blank=True, help_text="Supplier quote or invoice reference."
    )
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="purchase_orders", null=True, blank=True,
    )

    class Meta:
        db_table = "purchase_orders"
        ordering = ("-po_date", "-id")
        indexes = [
            models.Index(fields=["status", "-po_date"], name="idx_po_status_date"),
            models.Index(fields=["vendor", "-po_date"], name="idx_po_vendor_date"),
        ]

    def __str__(self):
        return f"{self.po_number} — {self.vendor.name}"

    def save(self, *args, **kwargs):
        if not self.po_number:
            from apps.assets.services.tagging import next_sequence

            from .constants import PO_NUMBER_PREFIX

            year = self.po_date.year if self.po_date else timezone.now().year
            self.po_number = next_sequence(PO_NUMBER_PREFIX, year)
        super().save(*args, **kwargs)

    # -- money -------------------------------------------------------------
    def recalculate_total(self, save=True) -> Decimal:
        """Sum the line items. The client never sets this."""
        total = sum(
            (item.line_total for item in self.items.all()), Decimal("0.00")
        )
        self.total_amount = total
        if save:
            super().save(update_fields=["total_amount", "updated_at"])
        return total

    # -- state -------------------------------------------------------------
    @property
    def is_receivable(self) -> bool:
        return self.status in RECEIVABLE_STATUSES

    @property
    def is_closed(self) -> bool:
        return self.status in CLOSED_STATUSES

    @property
    def status_color(self) -> str:
        return STATUS_COLORS.get(self.status, "#7B8794")

    @property
    def total_ordered(self) -> int:
        return sum(item.quantity for item in self.items.all())

    @property
    def total_received(self) -> int:
        return sum(item.received_quantity for item in self.items.all())

    @property
    def outstanding_quantity(self) -> int:
        return max(0, self.total_ordered - self.total_received)

    @property
    def is_overdue(self) -> bool:
        """Past its expected delivery and still not fully in."""
        if not self.expected_delivery or not self.is_receivable:
            return False
        return self.expected_delivery < timezone.now().date()


class PurchaseOrderItem(TimeStampedModel):
    """
    One line on an order.

    ``create_assets`` decides whether receiving this line generates asset
    records. Consumables (cables, toner) usually shouldn't; laptops should.
    """

    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="items"
    )
    description = models.CharField(max_length=200)
    category = models.ForeignKey(
        "masters.Category", on_delete=models.PROTECT,
        related_name="purchase_order_items", null=True, blank=True,
    )

    quantity = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)]
    )
    received_quantity = models.PositiveIntegerField(default=0)

    unit_cost = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    create_assets = models.BooleanField(
        default=True,
        help_text="Generate asset records when this line is received (FR-7.2).",
    )
    manufacturer = models.CharField(max_length=150, blank=True)
    model_number = models.CharField(max_length=120, blank=True)

    class Meta:
        db_table = "purchase_order_items"
        ordering = ("id",)

    def __str__(self):
        return f"{self.description} x{self.quantity}"

    @property
    def line_total(self) -> Decimal:
        return (self.unit_cost or Decimal("0.00")) * self.quantity

    @property
    def outstanding(self) -> int:
        return max(0, self.quantity - self.received_quantity)

    @property
    def is_fully_received(self) -> bool:
        return self.received_quantity >= self.quantity
