"""Asset serializers (FR-3.1 – FR-3.8, FR-4.x)."""
from rest_framework import serializers

from apps.accounts.serializers import UserSerializer
from apps.masters.models import Category, Department, Location, Vendor
from common.validators import validate_document_upload

from .constants import AssetStatus, DepreciationMethod, RequestStatus
from .models import Asset, AssetAssignment, AssetRequest, Attachment


class RefSerializer(serializers.Serializer):
    """Compact {id, name} shape for nested masters."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)


class CategoryRefSerializer(RefSerializer):
    color = serializers.CharField(read_only=True)
    icon = serializers.CharField(read_only=True)


class AssigneeRefSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    initials = serializers.CharField(read_only=True)


class AttachmentSerializer(serializers.ModelSerializer):
    """Documents hanging off an asset (FR-3.7)."""

    file = serializers.FileField(validators=[validate_document_upload])
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.full_name", read_only=True, default=None
    )
    size_display = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = (
            "id", "asset", "file", "filename", "description",
            "size_bytes", "size_display", "uploaded_by", "uploaded_by_name",
            "created_at",
        )
        read_only_fields = ("id", "filename", "size_bytes", "uploaded_by", "created_at")

    def get_size_display(self, obj) -> str:
        size = obj.size_bytes or 0
        if size < 1024:
            return f"{size} B"
        if size < 1024 * 1024:
            return f"{size / 1024:.0f} KB"
        return f"{size / 1024 / 1024:.1f} MB"


class AssetAssignmentSerializer(serializers.ModelSerializer):
    """Immutable history row (FR-4.3)."""

    user = AssigneeRefSerializer(read_only=True)
    assigned_by = AssigneeRefSerializer(read_only=True)
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = AssetAssignment
        fields = (
            "id", "action", "action_label", "user", "assigned_by",
            "notes", "days_held", "created_at",
        )
        read_only_fields = fields


class AssetListSerializer(serializers.ModelSerializer):
    """
    Row shape for the asset table — deliberately flat and cheap.

    Nested objects are limited to what the table renders, so a 25-row page
    stays a couple of queries with ``select_related``.
    """

    category = CategoryRefSerializer(read_only=True)
    location = RefSerializer(read_only=True)
    department = RefSerializer(read_only=True)
    assigned_to = AssigneeRefSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    status_color = serializers.CharField(read_only=True)
    warranty_expiring_soon = serializers.BooleanField(read_only=True)
    warranty_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Asset
        fields = (
            "id", "asset_tag", "name", "serial_number",
            "category", "status", "status_label", "status_color",
            "location", "department", "assigned_to", "assigned_at",
            "purchase_date", "purchase_cost", "current_value",
            "warranty_expiry", "warranty_expiring_soon", "warranty_expired",
            "image", "created_at", "updated_at",
        )
        read_only_fields = fields


class AssetDetailSerializer(AssetListSerializer):
    """Everything the detail page shows."""

    vendor = RefSerializer(read_only=True)
    created_by = AssigneeRefSerializer(read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    depreciation_method_label = serializers.CharField(
        source="get_depreciation_method_display", read_only=True
    )
    accumulated_depreciation = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    warranty_days_remaining = serializers.IntegerField(read_only=True)
    can_be_assigned = serializers.BooleanField(read_only=True)
    can_be_maintained = serializers.BooleanField(read_only=True)
    is_terminal = serializers.BooleanField(read_only=True)

    class Meta(AssetListSerializer.Meta):
        fields = AssetListSerializer.Meta.fields + (
            "description", "model_number", "manufacturer",
            "vendor", "salvage_value", "useful_life_years",
            "depreciation_method", "depreciation_method_label",
            "accumulated_depreciation", "warranty_days_remaining",
            "custom_data", "notes", "attachments", "created_by",
            "can_be_assigned", "can_be_maintained", "is_terminal",
        )
        read_only_fields = fields


class AssetWriteSerializer(serializers.ModelSerializer):
    """
    Create/update payload.

    Related records are set by id (``category_id``, ``location_id``, …) to match
    the SRS §5.3 example, while reads return nested objects.
    """

    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all()
    )
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all(),
        required=False, allow_null=True,
    )
    department_id = serializers.PrimaryKeyRelatedField(
        source="department", queryset=Department.objects.all(),
        required=False, allow_null=True,
    )
    vendor_id = serializers.PrimaryKeyRelatedField(
        source="vendor", queryset=Vendor.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = Asset
        fields = (
            "id", "asset_tag", "name", "description",
            "serial_number", "model_number", "manufacturer",
            "category_id", "status", "location_id", "department_id", "vendor_id",
            "purchase_date", "purchase_cost", "salvage_value",
            "useful_life_years", "depreciation_method",
            "warranty_expiry", "image", "custom_data", "notes",
        )
        extra_kwargs = {
            # Blank means "generate one" (FR-3.2).
            "asset_tag": {"required": False, "allow_blank": True},
        }

    # -- field-level -------------------------------------------------------
    def validate_asset_tag(self, value):
        value = (value or "").strip()
        if not value:
            return value
        queryset = Asset.all_objects.filter(asset_tag__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An asset with this tag already exists.")
        return value

    def validate_serial_number(self, value):
        value = (value or "").strip()
        if not value:
            return value
        queryset = Asset.all_objects.filter(serial_number__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                "Another asset already records this serial number."
            )
        return value

    def validate_useful_life_years(self, value):
        if value is not None and value > 100:
            raise serializers.ValidationError("Useful life must be 100 years or fewer.")
        return value

    def validate_status(self, value):
        """
        Status is a lifecycle outcome, not a free-text field.

        Assignment-driven states must go through the dedicated endpoints so the
        history and the assignee stay consistent (FR-4.3).
        """
        if not self.instance:
            if value and value != AssetStatus.AVAILABLE:
                raise serializers.ValidationError(
                    "New assets start as Available. Use the assign or retire "
                    "actions to move them on."
                )
            return value

        if value == self.instance.status:
            return value
        if value == AssetStatus.ASSIGNED:
            raise serializers.ValidationError(
                "Use POST /assets/{id}/assign/ to assign an asset."
            )
        if value == AssetStatus.AVAILABLE and self.instance.status == AssetStatus.ASSIGNED:
            raise serializers.ValidationError(
                "Use POST /assets/{id}/checkin/ to return an assigned asset."
            )
        if value in (AssetStatus.RETIRED, AssetStatus.LOST, AssetStatus.DISPOSED):
            raise serializers.ValidationError(
                "Use POST /assets/{id}/retire/ to retire, lose or dispose of an asset."
            )
        return value

    # -- object-level ------------------------------------------------------
    def validate(self, attrs):
        errors = {}

        cost = attrs.get("purchase_cost",
                         getattr(self.instance, "purchase_cost", None))
        salvage = attrs.get("salvage_value",
                            getattr(self.instance, "salvage_value", None))
        if cost is not None and salvage is not None and salvage > cost:
            errors["salvage_value"] = [
                "Salvage value cannot exceed the purchase cost."
            ]

        purchased = attrs.get("purchase_date",
                              getattr(self.instance, "purchase_date", None))
        warranty = attrs.get("warranty_expiry",
                             getattr(self.instance, "warranty_expiry", None))
        if purchased and warranty and warranty < purchased:
            errors["warranty_expiry"] = [
                "Warranty expiry cannot be before the purchase date."
            ]

        category = attrs.get("category", getattr(self.instance, "category", None))
        custom_data = attrs.get("custom_data",
                                getattr(self.instance, "custom_data", None))
        if category is not None and custom_data is not None:
            missing = self._missing_required_custom_fields(category, custom_data)
            if missing:
                errors["custom_data"] = [
                    f"{category.name} requires: {', '.join(missing)}."
                ]

        if errors:
            raise serializers.ValidationError(errors)
        return attrs

    @staticmethod
    def _missing_required_custom_fields(category, custom_data):
        """Enforce the required flags a category declares (FR-3.8)."""
        data = custom_data or {}
        missing = []
        for field in (category.custom_fields or []):
            if not field.get("required"):
                continue
            key = field.get("key")
            value = data.get(key)
            if value in (None, "", []):
                missing.append(field.get("label") or key)
        return missing

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)

    def to_representation(self, instance):
        return AssetDetailSerializer(instance, context=self.context).data


# ---------------------------------------------------------------------------
# Action payloads
# ---------------------------------------------------------------------------
class AssignSerializer(serializers.Serializer):
    """POST /assets/{id}/assign/ (FR-4.1)."""

    user_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_user_id(self, value):
        from apps.accounts.models import User

        user = User.objects.filter(pk=value).first()
        if not user:
            raise serializers.ValidationError("That user does not exist.")
        if not user.is_active:
            raise serializers.ValidationError(
                "That user is deactivated and cannot hold assets."
            )
        self.context["target_user"] = user
        return value


class CheckinSerializer(serializers.Serializer):
    """POST /assets/{id}/checkin/ (FR-4.2)."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")
    location_id = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True,
        help_text="Optional — record where the asset came back to.",
    )


class RetireSerializer(serializers.Serializer):
    """POST /assets/{id}/retire/ (FR-4.5)."""

    status = serializers.ChoiceField(
        choices=[
            (AssetStatus.RETIRED, "Retired"),
            (AssetStatus.LOST, "Lost"),
            (AssetStatus.DISPOSED, "Disposed"),
        ],
        default=AssetStatus.RETIRED,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class DepreciationScheduleSerializer(serializers.Serializer):
    """GET /assets/{id}/depreciation/ (FR-8.3)."""

    asset_tag = serializers.CharField(read_only=True)
    method = serializers.CharField(read_only=True)
    method_label = serializers.CharField(read_only=True)
    purchase_cost = serializers.CharField(read_only=True)
    salvage_value = serializers.CharField(read_only=True)
    useful_life_years = serializers.IntegerField(read_only=True)
    current_value = serializers.CharField(read_only=True)
    accumulated_depreciation = serializers.CharField(read_only=True)
    schedule = serializers.ListField(read_only=True)


# ---------------------------------------------------------------------------
# Asset requests (FR-4.4)
# ---------------------------------------------------------------------------
class AssetRequestSerializer(serializers.ModelSerializer):
    """Read shape for the requests list and inbox."""

    requester = AssigneeRefSerializer(read_only=True)
    decided_by = AssigneeRefSerializer(read_only=True)
    asset = AssetListSerializer(read_only=True)
    fulfilled_asset = AssetListSerializer(read_only=True)
    category = CategoryRefSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    status_color = serializers.CharField(read_only=True)
    target_label = serializers.CharField(read_only=True)
    is_pending = serializers.BooleanField(read_only=True)

    class Meta:
        model = AssetRequest
        fields = (
            "id", "requester", "asset", "category", "target_label",
            "reason", "needed_by",
            "status", "status_label", "status_color", "is_pending",
            "decided_by", "decided_at", "decision_notes", "fulfilled_asset",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class AssetRequestCreateSerializer(serializers.ModelSerializer):
    """
    What an employee submits.

    Either name an asset or name a category — one of the two is required, so a
    request always says what is actually wanted.
    """

    asset_id = serializers.PrimaryKeyRelatedField(
        source="asset", queryset=Asset.objects.all(),
        required=False, allow_null=True,
    )
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(),
        required=False, allow_null=True,
    )

    class Meta:
        model = AssetRequest
        fields = ("id", "asset_id", "category_id", "reason", "needed_by")

    def validate_reason(self, value):
        value = (value or "").strip()
        if len(value) < 10:
            raise serializers.ValidationError(
                "Give a bit more detail — at least 10 characters, so whoever "
                "reviews this knows why it's needed."
            )
        return value

    def validate_needed_by(self, value):
        from django.utils import timezone

        if value and value < timezone.now().date():
            raise serializers.ValidationError("The date needed cannot be in the past.")
        return value

    def validate(self, attrs):
        asset = attrs.get("asset")
        category = attrs.get("category")

        if not asset and not category:
            raise serializers.ValidationError({
                "asset_id": ["Choose a specific asset, or a category if any one will do."]
            })

        if asset:
            if asset.is_terminal:
                raise serializers.ValidationError({
                    "asset_id": [f"{asset.asset_tag} is "
                                 f"{asset.get_status_display().lower()} and cannot be requested."]
                })
            # Duplicate pending requests from the same person add noise for the
            # approver without adding information.
            requester = self.context["request"].user
            already = AssetRequest.objects.filter(
                requester=requester, asset=asset, status=RequestStatus.PENDING
            ).exists()
            if already:
                raise serializers.ValidationError({
                    "asset_id": ["You already have a pending request for this asset."]
                })

        return attrs

    def create(self, validated_data):
        validated_data["requester"] = self.context["request"].user
        return super().create(validated_data)

    def to_representation(self, instance):
        return AssetRequestSerializer(instance, context=self.context).data


class RequestApproveSerializer(serializers.Serializer):
    """POST /asset-requests/{id}/approve/"""

    asset_id = serializers.PrimaryKeyRelatedField(
        queryset=Asset.objects.all(), required=False, allow_null=True,
        help_text="Required when the request named a category; also lets an "
                  "approver substitute an equivalent asset.",
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class RequestRejectSerializer(serializers.Serializer):
    """POST /asset-requests/{id}/reject/"""

    notes = serializers.CharField(
        help_text="Why it was turned down — the requester sees this.",
    )

    def validate_notes(self, value):
        value = (value or "").strip()
        if len(value) < 5:
            raise serializers.ValidationError(
                "Give the requester a reason, however brief."
            )
        return value


class AssetRequestStatsSerializer(serializers.Serializer):
    """Counts for the cards above the requests table."""

    total = serializers.IntegerField()
    pending = serializers.IntegerField()
    approved = serializers.IntegerField()
    rejected = serializers.IntegerField()
    cancelled = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Bulk import (FR-10.1)
# ---------------------------------------------------------------------------
class AssetImportSerializer(serializers.Serializer):
    """POST /assets/import/"""

    file = serializers.FileField(
        help_text="CSV or XLSX matching the template.",
    )
    dry_run = serializers.BooleanField(
        default=False,
        help_text="Validate and report without writing anything.",
    )
    partial = serializers.BooleanField(
        default=False,
        help_text="Import the valid rows and report the rest. Off by default, "
                  "so one bad row aborts the whole file.",
    )

    def validate_file(self, value):
        name = (value.name or "").lower()
        if not name.endswith((".csv", ".xlsx", ".xlsm")):
            raise serializers.ValidationError(
                "Upload a .csv or .xlsx file. Download the template if you need "
                "the right column headers."
            )
        # Reuse the platform upload limit rather than inventing a second one.
        from django.conf import settings

        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f"That file is {value.size / 1024 / 1024:.1f} MB — the limit is "
                f"{settings.MAX_UPLOAD_SIZE_MB} MB."
            )
        return value


class ImportRowSerializer(serializers.Serializer):
    row = serializers.IntegerField(help_text="Spreadsheet row number.")
    ok = serializers.BooleanField()
    name = serializers.CharField(allow_blank=True)
    asset_tag = serializers.CharField(allow_blank=True)
    errors = serializers.DictField(child=serializers.ListField())


class ImportResultSerializer(serializers.Serializer):
    """What the import did, row by row."""

    total_rows = serializers.IntegerField()
    valid_rows = serializers.IntegerField()
    invalid_rows = serializers.IntegerField()
    created = serializers.IntegerField()
    committed = serializers.BooleanField(
        help_text="False for a dry run, or when errors aborted the import."
    )
    partial = serializers.BooleanField()
    rows = ImportRowSerializer(many=True)


class ImportColumnSerializer(serializers.Serializer):
    header = serializers.CharField()
    required = serializers.BooleanField()
    help_text = serializers.CharField(allow_blank=True)
    example = serializers.CharField(allow_blank=True)
    lookup = serializers.CharField(allow_blank=True)


class AssetStatsSerializer(serializers.Serializer):
    """Counts shown above the asset table."""

    total = serializers.IntegerField()
    available = serializers.IntegerField()
    assigned = serializers.IntegerField()
    under_maintenance = serializers.IntegerField()
    retired = serializers.IntegerField()
    total_value = serializers.CharField()
