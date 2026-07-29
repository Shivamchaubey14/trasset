"""
Documentation serializers for the dashboard.

The dashboard view assembles a plain dict from aggregate queries rather than a
model, so these exist to give drf-spectacular a concrete shape to publish
(NFR-13). They are never used to parse input.
"""
from rest_framework import serializers


class DashboardKpiSerializer(serializers.Serializer):
    total_assets = serializers.IntegerField()
    total_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    total_purchase_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    accumulated_depreciation = serializers.DecimalField(max_digits=14, decimal_places=2)
    available = serializers.IntegerField()
    assigned = serializers.IntegerField()
    under_maintenance = serializers.IntegerField()
    retired = serializers.IntegerField()
    expiring_warranties = serializers.IntegerField()
    expired_warranties = serializers.IntegerField()
    categories = serializers.IntegerField()


class StatusBreakdownSerializer(serializers.Serializer):
    status = serializers.CharField()
    label = serializers.CharField()
    count = serializers.IntegerField()
    value = serializers.DecimalField(max_digits=14, decimal_places=2)
    color = serializers.CharField(help_text="Brand hex colour for this status.")


class CategoryBreakdownSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    color = serializers.CharField()
    count = serializers.IntegerField()
    value = serializers.DecimalField(max_digits=14, decimal_places=2)


class ValuePointSerializer(serializers.Serializer):
    month = serializers.DateField()
    label = serializers.CharField(help_text="Short month label, e.g. 'Jul 26'.")
    value = serializers.DecimalField(max_digits=14, decimal_places=2)
    added = serializers.DecimalField(max_digits=14, decimal_places=2)


class AddedPointSerializer(serializers.Serializer):
    month = serializers.DateField()
    label = serializers.CharField()
    count = serializers.IntegerField()


class RecentAssetSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    asset_tag = serializers.CharField()
    name = serializers.CharField()
    status = serializers.CharField()
    status_label = serializers.CharField()
    category = serializers.CharField(allow_null=True)
    category_color = serializers.CharField(allow_null=True)
    assigned_to = serializers.CharField(allow_null=True)
    current_value = serializers.DecimalField(max_digits=14, decimal_places=2)
    created_at = serializers.DateTimeField()


class ExpiringWarrantySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    asset_tag = serializers.CharField()
    name = serializers.CharField()
    warranty_expiry = serializers.DateField()
    days_remaining = serializers.IntegerField()
    category = serializers.CharField(allow_null=True)


class ReportColumnSerializer(serializers.Serializer):
    """Column metadata, so the UI can render any report without knowing it."""

    key = serializers.CharField()
    header = serializers.CharField()
    kind = serializers.CharField(help_text="text | number | money | date")


class ReportDefinitionSerializer(serializers.Serializer):
    """A report as advertised by the index — what it is and what it contains."""

    key = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    columns = ReportColumnSerializer(many=True)


class ReportSerializer(serializers.Serializer):
    """A report page: what it is, its columns, its rows and its totals."""

    key = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    columns = ReportColumnSerializer(many=True)
    totals = serializers.DictField()
    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    results = serializers.ListField(child=serializers.DictField())


class ReportFilterSerializer(serializers.Serializer):
    """Query parameters shared by every report (FR-11.4)."""

    date_from = serializers.DateField(required=False, allow_null=True)
    date_to = serializers.DateField(required=False, allow_null=True)
    department = serializers.IntegerField(required=False, allow_null=True)
    location = serializers.IntegerField(required=False, allow_null=True)
    category = serializers.IntegerField(required=False, allow_null=True)
    # Deliberately not called `format`: DRF reserves that query parameter for
    # content negotiation and returns 404 when no renderer matches the value.
    export = serializers.ChoiceField(
        choices=("json", "csv", "xlsx"), required=False, default="json",
        help_text="csv or xlsx downloads the report; json paginates it. "
                  "PDF is deferred to v1.1.",
    )
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(
        required=False, min_value=1, max_value=500, default=50
    )

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_to < date_from:
            raise serializers.ValidationError({
                "date_to": ["The end date cannot be before the start date."]
            })
        return attrs


class DashboardStatsSerializer(serializers.Serializer):
    """Everything `GET /dashboard/stats/` returns."""

    kpis = DashboardKpiSerializer()
    by_status = StatusBreakdownSerializer(many=True)
    by_category = CategoryBreakdownSerializer(many=True)
    value_over_time = ValuePointSerializer(many=True)
    assets_added = AddedPointSerializer(many=True)
    recent_assets = RecentAssetSerializer(many=True)
    expiring_soon = ExpiringWarrantySerializer(many=True)
    generated_at = serializers.DateTimeField()
