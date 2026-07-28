"""Audit trail endpoints (FR-13.2)."""
from django.db.models import Count
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from common.permissions import IsAdminOrAuditor
from common.responses import ok
from common.viewsets import BaseReadOnlyViewSet

from .constants import ACTION_COLORS, AuditAction
from .models import AuditLog
from .serializers import AuditLogSerializer, AuditSummarySerializer


class AuditLogFilter(filters.FilterSet):
    """Narrow the trail down to the question being asked."""

    action = filters.MultipleChoiceFilter(choices=AuditAction.choices)
    entity_type = filters.CharFilter(lookup_expr="iexact")
    entity_id = filters.CharFilter()
    user = filters.NumberFilter(field_name="user_id")
    date_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = AuditLog
        fields = ("action", "entity_type", "entity_id", "user")


@extend_schema(tags=["Audit"])
class AuditLogViewSet(BaseReadOnlyViewSet):
    """
    The immutable trail (FR-13.1, FR-13.2).

    Read-only by design: there is no create, update or delete route, and the
    model refuses both at the ORM level. Visible to Super Admins and Auditors
    only — an Asset Manager can change data but cannot read the record of who
    changed what.
    """

    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrAuditor]
    resource_name = "Audit record"
    resource_name_plural = "Audit records"

    filterset_class = AuditLogFilter
    search_fields = ("entity_label", "entity_type", "user_display", "entity_id")
    ordering_fields = ("created_at", "action", "entity_type")
    ordering = ("-created_at",)

    @extend_schema(
        summary="Audit summary",
        description="Totals for the cards above the trail. Respects the active filters.",
        responses={200: AuditSummarySerializer},
    )
    @action(detail=False, methods=["get"])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.now().date()

        by_action = (
            queryset.values("action")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        labels = dict(AuditAction.choices)
        return ok(
            {
                "total": queryset.count(),
                "today": queryset.filter(created_at__date=today).count(),
                "actors": queryset.exclude(user__isnull=True)
                                  .values("user").distinct().count(),
                "by_action": [
                    {
                        "action": row["action"],
                        "label": labels.get(row["action"], row["action"]),
                        "count": row["count"],
                        "color": ACTION_COLORS.get(row["action"], "#7B8794"),
                    }
                    for row in by_action
                ],
            },
            "Audit summary retrieved successfully",
        )
