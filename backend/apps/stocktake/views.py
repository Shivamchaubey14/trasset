"""Stock take endpoints (SRS §12.4 BE-7, FR-14.18 – FR-14.21)."""
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from common.permissions import HasRolePermission
from common.responses import created, ok
from common.roles import Roles
from common.viewsets import BaseModelViewSet

from . import services
from .constants import StockTakeStatus
from .models import StockTake
from .serializers import (
    CancelSerializer,
    ScanBatchSerializer,
    ScanResponseSerializer,
    StockTakeCreateSerializer,
    StockTakeReportSerializer,
    StockTakeSerializer,
)


class StockTakeFilter(filters.FilterSet):
    status = filters.MultipleChoiceFilter(choices=StockTakeStatus.choices)
    open_only = filters.BooleanFilter(method="filter_open_only")

    class Meta:
        model = StockTake
        fields = ("status", "location", "started_by")

    def filter_open_only(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(status=StockTakeStatus.IN_PROGRESS)


@extend_schema(tags=["Stock take"])
class StockTakeViewSet(BaseModelViewSet):
    """
    Counting sessions (FR-14.18 – FR-14.21).

    Managers run stock takes; auditors read them, since reconciling the
    register against reality is exactly the evidence an auditor is looking for.
    Nobody else has a reason to see them, so unlike most resources here the
    read set is narrower than "everyone signed in".

    Editing a session directly is not a route: a stock take is changed by
    scanning into it, submitting it, or cancelling it. Letting a caller PATCH
    the status would put a session into *submitted* without the reconciliation
    that gives the word meaning.
    """

    queryset = StockTake.objects.all()
    resource_name = "Stock take"
    resource_name_plural = "Stock takes"
    permission_classes = [IsAuthenticated, HasRolePermission]

    read_roles = (Roles.SUPER_ADMIN, Roles.ASSET_MANAGER, Roles.AUDITOR)
    write_roles = Roles.MANAGERS
    action_roles = {"destroy": (Roles.SUPER_ADMIN,)}

    http_method_names = ["get", "post", "delete", "head", "options"]

    filterset_class = StockTakeFilter
    search_fields = ("location__name", "notes", "started_by__full_name")
    ordering_fields = ("started_at", "submitted_at", "status")
    ordering = ("-started_at", "-id")

    def get_queryset(self):
        return StockTake.objects.select_related(
            "location", "started_by", "submitted_by"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return StockTakeCreateSerializer
        return StockTakeSerializer

    @extend_schema(
        summary="Open a stock take",
        description=(
            "Starts a counting session for one location (FR-14.18). Returns 409 "
            "if that location already has one open — two people counting the "
            "same room produce two contradictory reports."
        ),
        request=StockTakeCreateSerializer,
        responses={201: StockTakeSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        stock_take = services.start(
            location=serializer.validated_data["location"],
            user=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return created(
            StockTakeSerializer(stock_take, context=self.get_serializer_context()).data,
            f"Stock take of {stock_take.location.name} started",
        )

    @extend_schema(
        summary="Record a batch of scans",
        description=(
            "Applies scans and answers for each one (FR-14.19). A batch is the "
            "normal case: an offline session submits everything it collected "
            "when signal returns (FR-14.21). An unrecognised tag is reported "
            "against that scan rather than failing the batch."
        ),
        request=ScanBatchSerializer,
        responses={200: ScanResponseSerializer},
    )
    @action(detail=True, methods=["post"])
    def scan(self, request, pk=None):
        stock_take = self.get_object()
        serializer = ScanBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        results = services.record_scans(
            stock_take, serializer.validated_data["scans"], user=request.user
        )

        stock_take.refresh_from_db()
        recorded = sum(1 for result in results if result["outcome"] == "recorded")
        return ok(
            {"results": results, "counts": stock_take.counts()},
            f"{recorded} of {len(results)} scans recorded",
        )

    @extend_schema(
        summary="Submit and reconcile",
        description=(
            "Closes the session and reconciles scanned against expected "
            "(FR-14.20). Idempotent: submitting again returns the same "
            "reconciliation rather than producing a second one, because an "
            "offline client will replay this call."
        ),
        request=None,
        responses={200: StockTakeReportSerializer},
    )
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        stock_take = services.submit(self.get_object(), user=request.user)
        report = StockTakeReportSerializer.build(
            stock_take, context=self.get_serializer_context()
        )
        counts = stock_take.counts()
        return ok(
            report.data,
            f"Stock take submitted — {counts['found']} found, "
            f"{counts['missing']} missing, {counts['unexpected']} unexpected",
        )

    @extend_schema(
        summary="Reconciliation report",
        responses={200: StockTakeReportSerializer},
    )
    @action(detail=True, methods=["get"])
    def report(self, request, pk=None):
        report = StockTakeReportSerializer.build(
            self.get_object(), context=self.get_serializer_context()
        )
        return ok(report.data, "Stock take report retrieved successfully")

    @extend_schema(
        summary="Cancel a stock take",
        request=CancelSerializer,
        responses={200: StockTakeSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        stock_take = services.cancel(
            self.get_object(), reason=serializer.validated_data.get("reason", "")
        )
        return ok(
            StockTakeSerializer(stock_take, context=self.get_serializer_context()).data,
            "Stock take cancelled",
        )
