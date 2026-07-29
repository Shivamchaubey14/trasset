"""Maintenance endpoints (SRS §5.2 — Maintenance)."""
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from common.permissions import HasRolePermission, is_manager
from common.responses import ok
from common.roles import Roles
from common.sync import UPDATED_SINCE_PARAMETER, DeltaSyncMixin
from common.viewsets import BaseModelViewSet

from . import services
from .constants import MaintenanceStatus
from .models import MaintenanceRecord
from .serializers import (
    MaintenanceCancelSerializer,
    MaintenanceCompleteSerializer,
    MaintenanceRecordSerializer,
    MaintenanceStatsSerializer,
    MaintenanceWriteSerializer,
)

MONEY = DecimalField(max_digits=14, decimal_places=2)
ZERO = Decimal("0.00")


class MaintenanceFilter(filters.FilterSet):
    """Answers the questions the maintenance screen actually asks."""

    status = filters.MultipleChoiceFilter(choices=MaintenanceStatus.choices)
    asset = filters.NumberFilter(field_name="asset_id")
    vendor = filters.NumberFilter(field_name="vendor_id")
    category = filters.NumberFilter(field_name="asset__category_id")

    scheduled_after = filters.DateFilter(field_name="scheduled_date", lookup_expr="gte")
    scheduled_before = filters.DateFilter(field_name="scheduled_date", lookup_expr="lte")

    open_only = filters.BooleanFilter(method="filter_open_only",
                                      label="Only scheduled or in-progress")
    overdue = filters.BooleanFilter(method="filter_overdue",
                                    label="Scheduled and past its date")

    class Meta:
        model = MaintenanceRecord
        fields = ("status", "type", "asset", "vendor")

    def filter_open_only(self, queryset, name, value):
        if value:
            return queryset.filter(status__in=(MaintenanceStatus.SCHEDULED,
                                               MaintenanceStatus.IN_PROGRESS))
        return queryset

    def filter_overdue(self, queryset, name, value):
        if value:
            return queryset.filter(status=MaintenanceStatus.SCHEDULED,
                                   scheduled_date__lt=timezone.now().date())
        return queryset


@extend_schema(tags=["Maintenance"])
@extend_schema_view(list=extend_schema(parameters=[UPDATED_SINCE_PARAMETER]))
class MaintenanceViewSet(DeltaSyncMixin, BaseModelViewSet):
    """
    Scheduling and completing maintenance (FR-6.1 – FR-6.3).

    Everyone signed in can see what is booked — an employee holding a laptop
    should be able to see it is going in for repair on Tuesday. Only managers
    can start, complete or cancel.

    **Reporting a problem is not the same as booking work.** SRS §2.3 gives the
    Employee role "reports issues", and FR-14.14 requires it from the phone —
    the person holding a broken laptop is who notices first, and routing that
    through a manager means it often never gets reported at all. So anyone may
    *create* a record, narrowed in :meth:`perform_create` to an asset they are
    actually holding. Everything after the report stays with managers.
    """

    queryset = MaintenanceRecord.objects.all()
    serializer_class = MaintenanceRecordSerializer
    resource_name = "Maintenance record"
    resource_name_plural = "Maintenance records"
    permission_classes = [IsAuthenticated, HasRolePermission]

    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS
    action_roles = {
        # Narrowed further in perform_create — the role check only gets a
        # reporter through the door. Auditors are still excluded: the
        # read-only guard in HasRolePermission applies to every unsafe method
        # regardless of what a view declares.
        "create": Roles.ALL,
        "destroy": (Roles.SUPER_ADMIN,),
    }

    filterset_class = MaintenanceFilter
    search_fields = ("asset__asset_tag", "asset__name", "technician",
                     "notes", "vendor__name")
    ordering_fields = ("scheduled_date", "completed_date", "status",
                       "actual_cost", "created_at")
    ordering = ("-scheduled_date", "-id")

    def get_queryset(self):
        return MaintenanceRecord.objects.select_related(
            "asset", "asset__category", "asset__location", "asset__assigned_to",
            "vendor", "created_by", "completed_by",
        )

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return MaintenanceWriteSerializer
        return MaintenanceRecordSerializer

    #: A reporter may say what is wrong and when they noticed. Everything else
    #: on the form is a scheduling decision that belongs to a manager.
    REPORTER_FIELDS = frozenset({"asset", "type", "scheduled_date", "notes"})

    def perform_create(self, serializer):
        """Routed through the service so `start_now` also moves the asset."""
        data = dict(serializer.validated_data)
        asset = data.pop("asset")
        start_now = data.pop("start_now", False)
        user = self.request.user

        if not is_manager(user):
            # A non-manager is reporting, not booking. Two limits follow:
            if asset.assigned_to_id != user.pk:
                raise PermissionDenied(
                    "You can only report an issue on an asset you are holding."
                )
            # Taking an asset out of service is a scheduling decision, and
            # naming a technician or a cost is a manager's judgement. Silently
            # dropping them is right here rather than erroring — the reporter
            # did not put them there, a crafted request did.
            start_now = False
            data = {key: value for key, value in data.items()
                    if key in self.REPORTER_FIELDS}

        record = services.schedule(
            asset, actor=user, start_now=start_now, **data
        )
        serializer.instance = record

    # -----------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------
    @extend_schema(
        summary="Start the work",
        description=(
            "Takes the asset out of service (FR-6.2). Its current status is "
            "stored first so completing the record can put it back."
        ),
        request=None,
        responses={200: MaintenanceRecordSerializer},
    )
    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        record = services.start(self.get_object(), actor=request.user)
        return ok(
            MaintenanceRecordSerializer(record, context=self.get_serializer_context()).data,
            f"{record.asset.asset_tag} is now under maintenance",
        )

    @extend_schema(
        summary="Mark the work complete",
        description=(
            "Captures the actual cost and returns the asset to the status it "
            "held before the work started (FR-6.3)."
        ),
        request=MaintenanceCompleteSerializer,
        responses={200: MaintenanceRecordSerializer},
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        serializer = MaintenanceCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        record = services.complete(
            self.get_object(),
            actor=request.user,
            actual_cost=serializer.validated_data.get("actual_cost"),
            completed_date=serializer.validated_data.get("completed_date"),
            notes=serializer.validated_data.get("notes", ""),
        )
        record.refresh_from_db()
        return ok(
            MaintenanceRecordSerializer(record, context=self.get_serializer_context()).data,
            f"Maintenance completed — {record.asset.asset_tag} is "
            f"{record.asset.get_status_display().lower()} again",
        )

    @extend_schema(
        summary="Cancel the work",
        request=MaintenanceCancelSerializer,
        responses={200: MaintenanceRecordSerializer},
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = MaintenanceCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        record = services.cancel(
            self.get_object(), actor=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        record.refresh_from_db()
        return ok(
            MaintenanceRecordSerializer(record, context=self.get_serializer_context()).data,
            "Maintenance cancelled",
        )

    @extend_schema(
        summary="Maintenance summary",
        description="Counts and costs for the cards above the table. Respects filters.",
        responses={200: MaintenanceStatsSerializer},
    )
    @action(detail=False, methods=["get"])
    def stats(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.now().date()

        totals = queryset.aggregate(
            total=Count("id"),
            scheduled=Count("id", filter=Q(status=MaintenanceStatus.SCHEDULED)),
            in_progress=Count("id", filter=Q(status=MaintenanceStatus.IN_PROGRESS)),
            completed=Count("id", filter=Q(status=MaintenanceStatus.COMPLETED)),
            overdue=Count("id", filter=Q(status=MaintenanceStatus.SCHEDULED,
                                         scheduled_date__lt=today)),
            total_actual_cost=Coalesce(Sum("actual_cost", output_field=MONEY),
                                       ZERO, output_field=MONEY),
            total_estimated_cost=Coalesce(Sum("cost_estimate", output_field=MONEY),
                                          ZERO, output_field=MONEY),
        )
        totals["total_actual_cost"] = str(totals["total_actual_cost"])
        totals["total_estimated_cost"] = str(totals["total_estimated_cost"])
        return ok(totals, "Maintenance statistics retrieved successfully")
