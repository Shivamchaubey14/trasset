"""Asset filtering (FR-3.5)."""
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from django_filters import rest_framework as filters

from .constants import TERMINAL_STATUSES, AssetStatus
from .models import Asset


class AssetFilter(filters.FilterSet):
    """
    Query parameters for the asset list.

    Beyond the plain field matches, a few filters answer questions the UI asks
    directly: "what's expiring?", "what's unassigned?", "what's in this value
    band?".
    """

    # Multi-select: ?status=available&status=assigned
    status = filters.MultipleChoiceFilter(choices=AssetStatus.choices)

    category = filters.NumberFilter(field_name="category_id")
    location = filters.NumberFilter(field_name="location_id")
    department = filters.NumberFilter(field_name="department_id")
    vendor = filters.NumberFilter(field_name="vendor_id")
    assigned_to = filters.NumberFilter(field_name="assigned_to_id")

    unassigned = filters.BooleanFilter(
        field_name="assigned_to", lookup_expr="isnull",
        label="Only assets with nobody holding them",
    )

    # Date ranges
    purchased_after = filters.DateFilter(field_name="purchase_date", lookup_expr="gte")
    purchased_before = filters.DateFilter(field_name="purchase_date", lookup_expr="lte")
    created_after = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_before = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    warranty_after = filters.DateFilter(field_name="warranty_expiry", lookup_expr="gte")
    warranty_before = filters.DateFilter(field_name="warranty_expiry", lookup_expr="lte")

    # Value band
    min_value = filters.NumberFilter(field_name="current_value", lookup_expr="gte")
    max_value = filters.NumberFilter(field_name="current_value", lookup_expr="lte")

    # Derived
    warranty = filters.ChoiceFilter(
        method="filter_warranty",
        choices=(
            ("expiring", "Expiring within 30 days"),
            ("expired", "Already expired"),
            ("active", "Still covered"),
            ("none", "No warranty recorded"),
        ),
        label="Warranty state",
    )
    active_only = filters.BooleanFilter(
        method="filter_active_only",
        label="Exclude retired, lost and disposed",
    )

    class Meta:
        model = Asset
        fields = (
            "status", "category", "location", "department", "vendor",
            "assigned_to", "depreciation_method",
        )

    def filter_warranty(self, queryset, name, value):
        today = timezone.now().date()
        horizon = today + timedelta(days=settings.WARRANTY_EXPIRY_WARN_DAYS)

        if value == "expiring":
            return queryset.filter(
                warranty_expiry__isnull=False,
                warranty_expiry__gte=today,
                warranty_expiry__lte=horizon,
            )
        if value == "expired":
            return queryset.filter(
                warranty_expiry__isnull=False, warranty_expiry__lt=today
            )
        if value == "active":
            return queryset.filter(
                warranty_expiry__isnull=False, warranty_expiry__gt=horizon
            )
        if value == "none":
            return queryset.filter(Q(warranty_expiry__isnull=True))
        return queryset

    def filter_active_only(self, queryset, name, value):
        if value:
            return queryset.exclude(status__in=TERMINAL_STATUSES)
        return queryset
