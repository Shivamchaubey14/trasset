"""Master data: categories, locations, departments, vendors (SRS §4.1, FR-5.x)."""
from django.db import models

from common.models import TimeStampedModel
from common.validators import validate_hex_color


class Category(TimeStampedModel):
    """
    Asset category. ``custom_fields`` drives the per-category extra inputs the
    asset form renders (FR-3.8), e.g.::

        [{"key": "ram_gb", "label": "RAM (GB)", "type": "number", "required": false}]
    """

    FIELD_TYPES = ("text", "number", "date", "select", "boolean")

    name = models.CharField(max_length=120, unique=True)
    description = models.CharField(max_length=255, blank=True)
    icon = models.CharField(
        max_length=60, blank=True,
        help_text="Icon key used by the frontend, e.g. 'laptop'.",
    )
    color = models.CharField(
        max_length=7, default="#3BB77E",
        validators=[validate_hex_color],
        help_text="Hex colour used for chips and charts.",
    )
    custom_fields = models.JSONField(
        default=list, blank=True,
        help_text="List of {key, label, type, required, options} definitions.",
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "categories"
        ordering = ("name",)
        verbose_name = "category"
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Location(TimeStampedModel):
    """Physical site or room where assets live (FR-5.2)."""

    name = models.CharField(max_length=150, unique=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "locations"
        ordering = ("name",)

    def __str__(self):
        return self.name

    @property
    def full_address(self) -> str:
        parts = [self.address, self.city, self.state, self.postal_code, self.country]
        return ", ".join(p for p in parts if p)


class Department(TimeStampedModel):
    """Organisational unit an asset or user belongs to (FR-5.3)."""

    name = models.CharField(max_length=150, unique=True)
    code = models.CharField(max_length=30, blank=True)
    description = models.CharField(max_length=255, blank=True)
    head_user = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        related_name="headed_departments",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "departments"
        ordering = ("name",)

    def __str__(self):
        return self.name


class Vendor(TimeStampedModel):
    """Supplier or service provider (FR-5.4)."""

    name = models.CharField(max_length=180, unique=True)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    website = models.URLField(max_length=200, blank=True)
    tax_number = models.CharField(max_length=60, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "vendors"
        ordering = ("name",)

    def __str__(self):
        return self.name
