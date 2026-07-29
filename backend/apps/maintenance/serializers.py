"""Maintenance serializers (FR-6.1 – FR-6.3)."""
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.assets.models import Asset
from apps.assets.serializers import AssigneeRefSerializer, RefSerializer
from apps.masters.models import Vendor

from .constants import MaintenanceStatus, MaintenanceType
from .models import MaintenanceRecord


class MaintenanceAssetSerializer(serializers.ModelSerializer):
    """Just enough of the asset to render a maintenance row."""

    category = RefSerializer(read_only=True)
    location = RefSerializer(read_only=True)
    assigned_to = AssigneeRefSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Asset
        fields = ("id", "asset_tag", "name", "status", "status_label",
                  "category", "location", "assigned_to")
        read_only_fields = fields


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    """Read shape for the maintenance list and detail."""

    asset = MaintenanceAssetSerializer(read_only=True)
    vendor = RefSerializer(read_only=True)
    created_by = AssigneeRefSerializer(read_only=True)
    completed_by = AssigneeRefSerializer(read_only=True)

    type_label = serializers.CharField(source="get_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    status_color = serializers.CharField(read_only=True)
    is_open = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    days_until_due = serializers.IntegerField(read_only=True)
    cost_variance = serializers.DecimalField(max_digits=12, decimal_places=2,
                                             read_only=True)
    duration_days = serializers.IntegerField(read_only=True)

    class Meta:
        model = MaintenanceRecord
        fields = (
            "id", "asset", "type", "type_label",
            "status", "status_label", "status_color", "is_open", "is_overdue",
            "scheduled_date", "days_until_due", "started_at", "completed_date",
            "duration_days",
            "technician", "vendor",
            "cost_estimate", "actual_cost", "cost_variance",
            "notes", "completion_notes",
            "asset_status_before",
            "created_by", "completed_by",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class MaintenanceWriteSerializer(serializers.ModelSerializer):
    """
    Booking work in (FR-6.1).

    ``status`` is not writable — the lifecycle runs through the start, complete
    and cancel actions so the asset's status stays in step.
    """

    asset_id = serializers.PrimaryKeyRelatedField(
        source="asset", queryset=Asset.objects.all()
    )
    vendor_id = serializers.PrimaryKeyRelatedField(
        source="vendor", queryset=Vendor.objects.all(),
        required=False, allow_null=True,
    )
    start_now = serializers.BooleanField(
        write_only=True, required=False, default=False,
        help_text="Take the asset out of service immediately rather than just booking it.",
    )

    class Meta:
        model = MaintenanceRecord
        fields = (
            "id", "asset_id", "type", "scheduled_date",
            "technician", "vendor_id", "cost_estimate", "notes", "start_now",
        )

    def validate_scheduled_date(self, value):
        # Past dates are allowed on create — people record work after the fact —
        # but a wildly wrong date is usually a typo.
        if value and value.year < 2000:
            raise serializers.ValidationError("That date doesn't look right.")
        return value

    def validate_cost_estimate(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("A cost estimate cannot be negative.")
        return value

    def validate(self, attrs):
        asset = attrs.get("asset") or getattr(self.instance, "asset", None)

        if asset and asset.is_terminal:
            raise serializers.ValidationError({
                "asset_id": [f"{asset.asset_tag} is "
                             f"{asset.get_status_display().lower()} and cannot be "
                             f"booked in for maintenance."]
            })

        # Two open records against one asset means nobody knows which one is
        # holding it out of service.
        if asset and not self.instance:
            open_record = MaintenanceRecord.objects.filter(
                asset=asset,
                status__in=(MaintenanceStatus.SCHEDULED, MaintenanceStatus.IN_PROGRESS),
            ).first()
            if open_record:
                raise serializers.ValidationError({
                    "asset_id": [
                        f"{asset.asset_tag} already has "
                        f"{open_record.get_status_display().lower()} maintenance "
                        f"booked for {open_record.scheduled_date}. Complete or "
                        f"cancel that first."
                    ]
                })

        return attrs

    def to_representation(self, instance):
        return MaintenanceRecordSerializer(instance, context=self.context).data


class MaintenanceCompleteSerializer(serializers.Serializer):
    """POST /maintenance/{id}/complete/ (FR-6.3)."""

    actual_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True,
        min_value=Decimal("0.00"),
    )
    completed_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_completed_date(self, value):
        if value and value > timezone.now().date():
            raise serializers.ValidationError("A completion date cannot be in the future.")
        return value


class MaintenanceCancelSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class MaintenanceStatsSerializer(serializers.Serializer):
    """Counts for the cards above the maintenance table."""

    total = serializers.IntegerField()
    scheduled = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    completed = serializers.IntegerField()
    overdue = serializers.IntegerField()
    total_actual_cost = serializers.CharField()
    total_estimated_cost = serializers.CharField()
