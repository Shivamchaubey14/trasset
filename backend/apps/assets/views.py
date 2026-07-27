"""Asset endpoints (SRS §5.2 — Assets)."""
from decimal import Decimal
from io import BytesIO

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status as http_status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from common.exceptions import Conflict
from common.permissions import HasRolePermission
from common.responses import ok
from common.roles import Roles
from common.viewsets import BaseModelViewSet

from .constants import TERMINAL_STATUSES, AssetStatus
from .filters import AssetFilter
from .models import Asset, Attachment
from .serializers import (
    AssetAssignmentSerializer,
    AssetDetailSerializer,
    AssetListSerializer,
    AssetStatsSerializer,
    AssetWriteSerializer,
    AssignSerializer,
    AttachmentSerializer,
    CheckinSerializer,
    DepreciationScheduleSerializer,
    RetireSerializer,
)
from .services import assignment as assignment_service

MONEY = DecimalField(max_digits=14, decimal_places=2)


@extend_schema(tags=["Assets"])
class AssetViewSet(BaseModelViewSet):
    """
    The asset register.

    Everyone signed in can read; managers create, edit and run the lifecycle
    actions; only Super Admins may soft-delete (SEC-3).
    """

    queryset = Asset.objects.all()
    resource_name = "Asset"
    permission_classes = [IsAuthenticated, HasRolePermission]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS
    action_roles = {"destroy": (Roles.SUPER_ADMIN,)}

    filterset_class = AssetFilter
    search_fields = ("asset_tag", "name", "serial_number", "model_number", "manufacturer")
    ordering_fields = (
        "asset_tag", "name", "status", "purchase_date",
        "purchase_cost", "current_value", "warranty_expiry", "created_at",
    )
    ordering = ("-created_at",)

    def get_queryset(self):
        """Join everything the serializers touch, so lists stay flat on queries."""
        queryset = Asset.objects.select_related(
            "category", "location", "department", "vendor", "assigned_to", "created_by"
        )
        if self.action == "retrieve":
            queryset = queryset.prefetch_related("attachments__uploaded_by")
        return queryset

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return AssetWriteSerializer
        if self.action == "list":
            return AssetListSerializer
        return AssetDetailSerializer

    # -----------------------------------------------------------------
    # Lifecycle actions (SRS §11.2)
    # -----------------------------------------------------------------
    @extend_schema(
        summary="Assign an asset to a user",
        description="Checks the asset out. Returns 409 if it is not Available (FR-4.1, FR-4.5).",
        request=AssignSerializer,
        responses={200: AssetDetailSerializer},
    )
    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        asset = self.get_object()
        serializer = AssignSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        updated = assignment_service.assign(
            asset,
            user=serializer.context["target_user"],
            actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return ok(
            AssetDetailSerializer(updated, context=self.get_serializer_context()).data,
            f"{updated.asset_tag} assigned to {updated.assigned_to.full_name}",
        )

    @extend_schema(
        summary="Check an asset back in",
        description="Returns the asset to the pool. 409 if it is not currently assigned (FR-4.2).",
        request=CheckinSerializer,
        responses={200: AssetDetailSerializer},
    )
    @action(detail=True, methods=["post"])
    def checkin(self, request, pk=None):
        asset = self.get_object()
        serializer = CheckinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = assignment_service.checkin(
            asset,
            actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
            location=serializer.validated_data.get("location_id"),
        )
        return ok(
            AssetDetailSerializer(updated, context=self.get_serializer_context()).data,
            f"{updated.asset_tag} checked in",
        )

    @extend_schema(
        summary="Retire, lose or dispose of an asset",
        description="Terminal transition. Any current assignment is closed first (FR-4.5).",
        request=RetireSerializer,
        responses={200: AssetDetailSerializer},
    )
    @action(detail=True, methods=["post"])
    def retire(self, request, pk=None):
        asset = self.get_object()
        serializer = RetireSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = assignment_service.retire(
            asset,
            status=serializer.validated_data["status"],
            actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return ok(
            AssetDetailSerializer(updated, context=self.get_serializer_context()).data,
            f"{updated.asset_tag} marked {updated.get_status_display().lower()}",
        )

    # -----------------------------------------------------------------
    # Read-only extras
    # -----------------------------------------------------------------
    @extend_schema(
        summary="Assignment history",
        description="Immutable check-out / check-in timeline, newest first (FR-4.3).",
        responses={200: AssetAssignmentSerializer(many=True)},
    )
    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        asset = self.get_object()
        rows = assignment_service.history(asset)
        return ok(
            AssetAssignmentSerializer(rows, many=True, context=self.get_serializer_context()).data,
            "Asset history retrieved successfully",
        )

    @extend_schema(
        summary="Depreciation schedule",
        description="Year-by-year book value for this asset (FR-8.3).",
        responses={200: DepreciationScheduleSerializer},
    )
    @action(detail=True, methods=["get"])
    def depreciation(self, request, pk=None):
        asset = self.get_object()
        return ok(
            {
                "asset_tag": asset.asset_tag,
                "method": asset.depreciation_method,
                "method_label": asset.get_depreciation_method_display(),
                "purchase_cost": str(asset.purchase_cost),
                "salvage_value": str(asset.salvage_value),
                "useful_life_years": asset.useful_life_years,
                "purchase_date": asset.purchase_date.isoformat() if asset.purchase_date else None,
                "current_value": str(asset.current_value),
                "accumulated_depreciation": str(asset.accumulated_depreciation),
                "schedule": asset.depreciation_schedule(),
            },
            "Depreciation schedule retrieved successfully",
        )

    @extend_schema(
        summary="QR code for this asset",
        description=(
            "PNG encoding the asset's detail URL so a scan resolves straight to it "
            "(FR-9.1, FR-9.2). Returned as an image, not the standard envelope."
        ),
        parameters=[
            OpenApiParameter("size", int, description="Box size in pixels (1–20, default 10)."),
        ],
        responses={(200, "image/png"): bytes},
    )
    @action(detail=True, methods=["get"], url_path="qr")
    def qr(self, request, pk=None):
        import qrcode

        from django.conf import settings

        asset = self.get_object()
        try:
            box_size = max(1, min(20, int(request.query_params.get("size", 10))))
        except (TypeError, ValueError):
            box_size = 10

        target = f"{settings.FRONTEND_URL}/asset-detail.html?tag={asset.asset_tag}"

        image = qrcode.make(target, box_size=box_size, border=2)
        buffer = BytesIO()
        image.save(buffer, format="PNG")

        response = HttpResponse(buffer.getvalue(), content_type="image/png")
        response["Content-Disposition"] = f'inline; filename="{asset.asset_tag}.png"'
        # Tags never change, so the browser can hold onto this.
        response["Cache-Control"] = "private, max-age=86400"
        return response

    @extend_schema(
        summary="Register summary counts",
        description="Totals for the cards above the asset table.",
        responses={200: AssetStatsSerializer},
    )
    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Respects the current filters, so the cards match the table."""
        queryset = self.filter_queryset(self.get_queryset())

        totals = queryset.aggregate(
            total=Count("id"),
            total_value=Coalesce(
                Sum("current_value", output_field=MONEY), Decimal("0.00"),
                output_field=MONEY,
            ),
            available=Count("id", filter=Q(status=AssetStatus.AVAILABLE)),
            assigned=Count("id", filter=Q(status=AssetStatus.ASSIGNED)),
            under_maintenance=Count("id", filter=Q(status=AssetStatus.UNDER_MAINTENANCE)),
            retired=Count("id", filter=Q(status__in=TERMINAL_STATUSES)),
        )
        totals["total_value"] = str(totals["total_value"])
        return ok(totals, "Asset statistics retrieved successfully")

    # -----------------------------------------------------------------
    # Delete
    # -----------------------------------------------------------------
    def destroy(self, request, *args, **kwargs):
        """Soft delete (FR-3.4) — refuse while somebody still holds the asset."""
        asset = self.get_object()
        if asset.status == AssetStatus.ASSIGNED:
            raise Conflict(
                detail=f"{asset.asset_tag} is still assigned to "
                       f"{asset.assigned_to.full_name if asset.assigned_to_id else 'someone'}. "
                       f"Check it in before deleting it."
            )
        asset.delete()
        return ok(None, f"{asset.asset_tag} deleted successfully")


@extend_schema(tags=["Assets"])
class AttachmentViewSet(BaseModelViewSet):
    """Documents attached to assets (FR-3.7)."""

    queryset = Attachment.objects.select_related("asset", "uploaded_by")
    serializer_class = AttachmentSerializer
    resource_name = "Attachment"
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS

    filterset_fields = ("asset",)
    ordering = ("-created_at",)

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)

    def perform_destroy(self, instance):
        # Attachments aren't soft-deleted — drop the stored file with the row so
        # media doesn't accumulate orphans.
        instance.file.delete(save=False)
        instance.delete()
