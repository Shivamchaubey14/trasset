"""Procurement endpoints (SRS §5.2 — Procurement)."""
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from apps.assets.serializers import AssetListSerializer
from common.permissions import HasRolePermission
from common.responses import ok
from common.roles import Roles
from common.schema import write_responses
from common.viewsets import BaseModelViewSet

from . import services
from .constants import RECEIVABLE_STATUSES, PurchaseOrderStatus
from .models import PurchaseOrder
from .serializers import (
    PurchaseOrderCancelSerializer,
    PurchaseOrderReceiveSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderStatsSerializer,
    PurchaseOrderWriteSerializer,
    ReceiveResultSerializer,
)

MONEY = DecimalField(max_digits=16, decimal_places=2)
ZERO = Decimal("0.00")


class PurchaseOrderFilter(filters.FilterSet):
    status = filters.MultipleChoiceFilter(choices=PurchaseOrderStatus.choices)
    vendor = filters.NumberFilter(field_name="vendor_id")
    ordered_after = filters.DateFilter(field_name="po_date", lookup_expr="gte")
    ordered_before = filters.DateFilter(field_name="po_date", lookup_expr="lte")

    open_only = filters.BooleanFilter(method="filter_open_only",
                                      label="Only orders still expecting goods")
    overdue = filters.BooleanFilter(method="filter_overdue",
                                    label="Past expected delivery, not fully received")

    class Meta:
        model = PurchaseOrder
        fields = ("status", "vendor")

    def filter_open_only(self, queryset, name, value):
        if value:
            return queryset.filter(status__in=RECEIVABLE_STATUSES)
        return queryset

    def filter_overdue(self, queryset, name, value):
        if value:
            return queryset.filter(
                status__in=RECEIVABLE_STATUSES,
                expected_delivery__isnull=False,
                expected_delivery__lt=timezone.now().date(),
            )
        return queryset


@extend_schema(tags=["Procurement"])
# PurchaseOrderWriteSerializer.to_representation returns the read shape.
@extend_schema_view(**write_responses(PurchaseOrderSerializer))
class PurchaseOrderViewSet(BaseModelViewSet):
    """
    Purchase orders and goods receipt (FR-7.1 – FR-7.3).

    Everyone signed in can read — knowing what is on order is useful across the
    business — but only managers can raise, place, receive or cancel one.
    """

    queryset = PurchaseOrder.objects.all()
    serializer_class = PurchaseOrderSerializer
    resource_name = "Purchase order"
    permission_classes = [IsAuthenticated, HasRolePermission]

    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS
    action_roles = {"destroy": (Roles.SUPER_ADMIN,)}

    filterset_class = PurchaseOrderFilter
    search_fields = ("po_number", "vendor__name", "reference",
                     "items__description", "notes")
    ordering_fields = ("po_date", "expected_delivery", "total_amount",
                       "status", "created_at")
    ordering = ("-po_date", "-id")

    def get_queryset(self):
        return (
            PurchaseOrder.objects
            .select_related("vendor", "location", "department", "created_by")
            .prefetch_related("items__category")
            .distinct()  # search spans items, which can duplicate rows
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return PurchaseOrderWriteSerializer
        return PurchaseOrderSerializer

    def destroy(self, request, *args, **kwargs):
        """Only an untouched order can be deleted; the rest is financial history."""
        from common.exceptions import Conflict

        order = self.get_object()
        if order.total_received:
            raise Conflict(
                detail=f"{order.po_number} has goods received against it and is "
                       f"part of the financial record. Cancel it instead."
            )
        po_number = order.po_number
        order.delete()
        return ok(None, f"{po_number} deleted successfully")

    # -----------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------
    @extend_schema(
        summary="Place the order",
        description="Moves a draft to Ordered so goods can be received against it.",
        request=None,
        responses={200: PurchaseOrderSerializer},
    )
    @action(detail=True, methods=["post"])
    def place(self, request, pk=None):
        order = services.place(self.get_object(), actor=request.user)
        return ok(
            PurchaseOrderSerializer(order, context=self.get_serializer_context()).data,
            f"{order.po_number} placed with {order.vendor.name}",
        )

    @extend_schema(
        summary="Receive goods",
        description=(
            "Books goods in and, for lines flagged to do so, creates one asset "
            "per unit received with its own generated tag (FR-7.2). Omit `lines` "
            "to receive everything still outstanding. All-or-nothing: if any "
            "asset fails to create, no quantities move."
        ),
        request=PurchaseOrderReceiveSerializer,
        responses={200: ReceiveResultSerializer},
    )
    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        serializer = PurchaseOrderReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order, created = services.receive(
            self.get_object(),
            actor=request.user,
            lines=serializer.as_line_map(),
            received_date=serializer.validated_data.get("received_date"),
            notes=serializer.validated_data.get("notes", ""),
        )
        order.refresh_from_db()

        context = self.get_serializer_context()
        message = f"{order.po_number} received"
        if created:
            message += f" — {len(created)} asset{'s' if len(created) != 1 else ''} created"

        return ok(
            {
                "purchase_order": PurchaseOrderSerializer(order, context=context).data,
                "created_assets": AssetListSerializer(created, many=True,
                                                      context=context).data,
                "created_count": len(created),
            },
            message,
        )

    @extend_schema(
        summary="Cancel the order",
        request=PurchaseOrderCancelSerializer,
        responses={200: PurchaseOrderSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = PurchaseOrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order = services.cancel(
            self.get_object(), actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return ok(
            PurchaseOrderSerializer(order, context=self.get_serializer_context()).data,
            f"{order.po_number} cancelled",
        )

    @extend_schema(
        summary="Procurement summary",
        responses={200: PurchaseOrderStatsSerializer},
    )
    @action(detail=False, methods=["get"])
    def stats(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.now().date()

        totals = queryset.aggregate(
            total=Count("id", distinct=True),
            draft=Count("id", filter=Q(status=PurchaseOrderStatus.DRAFT), distinct=True),
            ordered=Count("id", filter=Q(status=PurchaseOrderStatus.ORDERED),
                          distinct=True),
            partially_received=Count(
                "id", filter=Q(status=PurchaseOrderStatus.PARTIALLY_RECEIVED),
                distinct=True),
            received=Count("id", filter=Q(status=PurchaseOrderStatus.RECEIVED),
                           distinct=True),
            overdue=Count(
                "id",
                filter=Q(status__in=RECEIVABLE_STATUSES,
                         expected_delivery__isnull=False,
                         expected_delivery__lt=today),
                distinct=True,
            ),
            total_value=Coalesce(Sum("total_amount", output_field=MONEY),
                                 ZERO, output_field=MONEY),
            outstanding_value=Coalesce(
                Sum("total_amount", filter=Q(status__in=RECEIVABLE_STATUSES),
                    output_field=MONEY),
                ZERO, output_field=MONEY,
            ),
        )
        totals["total_value"] = str(totals["total_value"])
        totals["outstanding_value"] = str(totals["outstanding_value"])
        return ok(totals, "Procurement statistics retrieved successfully")
