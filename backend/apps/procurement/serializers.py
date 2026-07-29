"""Purchase order serializers (FR-7.1 – FR-7.3)."""
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.assets.serializers import AssetListSerializer, AssigneeRefSerializer, RefSerializer
from apps.masters.models import Category, Department, Location, Vendor

from .models import PurchaseOrder, PurchaseOrderItem


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    """A line on the order, readable and writable as part of the order."""

    category = RefSerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(),
        required=False, allow_null=True, write_only=True,
    )
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2,
                                          read_only=True)
    outstanding = serializers.IntegerField(read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = (
            "id", "description", "category", "category_id",
            "quantity", "received_quantity", "outstanding", "is_fully_received",
            "unit_cost", "line_total",
            "create_assets", "manufacturer", "model_number",
        )
        read_only_fields = ("id", "received_quantity", "outstanding",
                            "is_fully_received", "line_total")

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("A line item needs a quantity of at least 1.")
        if value > 10000:
            raise serializers.ValidationError(
                "That quantity looks wrong. Split very large orders across lines."
            )
        return value

    def validate(self, attrs):
        # Creating assets needs somewhere to file them.
        create_assets = attrs.get("create_assets", True)
        category = attrs.get("category")
        if create_assets and not category:
            raise serializers.ValidationError({
                "category_id": [
                    "Choose a category, or untick 'create assets' if this line "
                    "is a consumable that shouldn't be tracked."
                ]
            })
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    """Read shape for the list and detail views."""

    vendor = RefSerializer(read_only=True)
    location = RefSerializer(read_only=True)
    department = RefSerializer(read_only=True)
    created_by = AssigneeRefSerializer(read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)

    status_label = serializers.CharField(source="get_status_display", read_only=True)
    status_color = serializers.CharField(read_only=True)
    is_receivable = serializers.BooleanField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    total_ordered = serializers.IntegerField(read_only=True)
    total_received = serializers.IntegerField(read_only=True)
    outstanding_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = (
            "id", "po_number", "vendor", "status", "status_label", "status_color",
            "po_date", "expected_delivery", "received_date", "is_overdue",
            "total_amount", "warranty_months",
            "location", "department", "reference", "notes",
            "items", "total_ordered", "total_received", "outstanding_quantity",
            "is_receivable", "created_by", "created_at", "updated_at",
        )
        read_only_fields = fields


class PurchaseOrderWriteSerializer(serializers.ModelSerializer):
    """
    Create/update an order together with its lines.

    ``total_amount`` is deliberately absent: it is derived from the line items,
    so a client cannot claim an order is worth something it isn't. ``status`` is
    likewise driven by the place / receive / cancel actions.
    """

    vendor_id = serializers.PrimaryKeyRelatedField(
        source="vendor", queryset=Vendor.objects.all()
    )
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all(),
        required=False, allow_null=True,
    )
    department_id = serializers.PrimaryKeyRelatedField(
        source="department", queryset=Department.objects.all(),
        required=False, allow_null=True,
    )
    items = PurchaseOrderItemSerializer(many=True)

    class Meta:
        model = PurchaseOrder
        fields = (
            "id", "po_number", "vendor_id", "po_date", "expected_delivery",
            "warranty_months", "location_id", "department_id",
            "reference", "notes", "items",
        )
        extra_kwargs = {"po_number": {"required": False, "allow_blank": True}}

    def validate_po_number(self, value):
        value = (value or "").strip()
        if not value:
            return value
        queryset = PurchaseOrder.objects.filter(po_number__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("That PO number is already in use.")
        return value

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("An order needs at least one line item.")
        return value

    def validate(self, attrs):
        po_date = attrs.get("po_date") or getattr(self.instance, "po_date", None)
        expected = attrs.get("expected_delivery")
        if po_date and expected and expected < po_date:
            raise serializers.ValidationError({
                "expected_delivery": ["Delivery cannot be expected before the order date."]
            })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        order = PurchaseOrder.objects.create(**validated_data)
        for item in items:
            PurchaseOrderItem.objects.create(purchase_order=order, **item)

        order.recalculate_total()
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()

        if items is not None:
            # Lines are replaced wholesale rather than diffed — but only while
            # nothing has been received, or the received quantities would be lost.
            if instance.total_received:
                raise serializers.ValidationError({
                    "items": [
                        "Goods have already been received against this order, so "
                        "its line items can no longer be changed."
                    ]
                })
            instance.items.all().delete()
            for item in items:
                PurchaseOrderItem.objects.create(purchase_order=instance, **item)

        instance.recalculate_total()
        return instance

    def to_representation(self, instance):
        return PurchaseOrderSerializer(instance, context=self.context).data


class ReceiveLineSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=0)


class PurchaseOrderReceiveSerializer(serializers.Serializer):
    """POST /purchase-orders/{id}/receive/ (FR-7.2)."""

    lines = ReceiveLineSerializer(
        many=True, required=False,
        help_text="Per-line quantities. Omit to receive everything outstanding.",
    )
    received_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_received_date(self, value):
        from django.utils import timezone

        if value and value > timezone.now().date():
            raise serializers.ValidationError("A receipt date cannot be in the future.")
        return value

    def as_line_map(self):
        lines = self.validated_data.get("lines")
        if not lines:
            return None
        return {line["item_id"]: line["quantity"] for line in lines}


class PurchaseOrderCancelSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReceiveResultSerializer(serializers.Serializer):
    """What comes back after receiving."""

    purchase_order = PurchaseOrderSerializer()
    created_assets = AssetListSerializer(many=True)
    created_count = serializers.IntegerField()


class PurchaseOrderStatsSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    draft = serializers.IntegerField()
    ordered = serializers.IntegerField()
    partially_received = serializers.IntegerField()
    received = serializers.IntegerField()
    overdue = serializers.IntegerField()
    total_value = serializers.CharField()
    outstanding_value = serializers.CharField()
