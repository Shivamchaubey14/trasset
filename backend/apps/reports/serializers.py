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
