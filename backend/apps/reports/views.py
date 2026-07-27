"""Dashboard aggregates (FR-11.1, FR-11.2).

One request returns every KPI and chart dataset the dashboard needs, computed
with database aggregates rather than per-row Python (NFR-1).
"""
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, DecimalField, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.assets.constants import TERMINAL_STATUSES, AssetStatus
from apps.assets.models import Asset
from apps.masters.models import Category
from common.responses import ok

from .serializers import DashboardStatsSerializer

MONEY = DecimalField(max_digits=14, decimal_places=2)
ZERO = Decimal("0.00")
TREND_MONTHS = 12
RECENT_LIMIT = 6


def _money_sum(field):
    return Coalesce(Sum(field, output_field=MONEY), ZERO, output_field=MONEY)


@extend_schema(
    tags=["Reports"],
    summary="Dashboard statistics",
    description=(
        "KPI totals and chart datasets for the dashboard, in a single call.\n\n"
        "Counts exclude soft-deleted assets. Auditors and employees see the same "
        "figures as managers — visibility is read-only for them, not narrower."
    ),
    responses={200: DashboardStatsSerializer},
)
class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]
    resource_name = "Dashboard statistics"
    serializer_class = DashboardStatsSerializer  # documentation only

    def get(self, request):
        today = timezone.now().date()
        assets = Asset.objects.all()  # manager already excludes soft-deleted rows

        # --- Status counts in one pass -----------------------------------
        status_rows = assets.values("status").annotate(
            count=Count("id"),
            value=_money_sum("current_value"),
        )
        by_status = {row["status"]: row for row in status_rows}

        def status_count(status):
            row = by_status.get(status)
            return row["count"] if row else 0

        totals = assets.aggregate(
            count=Count("id"),
            book_value=_money_sum("current_value"),
            purchase_value=_money_sum("purchase_cost"),
        )

        active = assets.exclude(status__in=TERMINAL_STATUSES)

        # --- Warranty windows (FR-7.3) ------------------------------------
        warn_days = settings.WARRANTY_EXPIRY_WARN_DAYS
        expiring = active.filter(
            warranty_expiry__isnull=False,
            warranty_expiry__gte=today,
            warranty_expiry__lte=today + timedelta(days=warn_days),
        ).count()
        expired = active.filter(
            warranty_expiry__isnull=False, warranty_expiry__lt=today
        ).count()

        kpis = {
            "total_assets": totals["count"],
            "total_value": str(totals["book_value"]),
            "total_purchase_value": str(totals["purchase_value"]),
            "accumulated_depreciation": str(
                totals["purchase_value"] - totals["book_value"]
            ),
            "available": status_count(AssetStatus.AVAILABLE),
            "assigned": status_count(AssetStatus.ASSIGNED),
            "under_maintenance": status_count(AssetStatus.UNDER_MAINTENANCE),
            "retired": (
                status_count(AssetStatus.RETIRED)
                + status_count(AssetStatus.DISPOSED)
                + status_count(AssetStatus.LOST)
            ),
            "expiring_warranties": expiring,
            "expired_warranties": expired,
            "categories": Category.objects.filter(is_active=True).count(),
        }

        return ok(
            {
                "kpis": kpis,
                "by_status": self._by_status(by_status),
                "by_category": self._by_category(),
                "value_over_time": self._value_over_time(),
                "assets_added": self._assets_added(),
                "recent_assets": self._recent_assets(),
                "expiring_soon": self._expiring_soon(today, warn_days),
                "generated_at": timezone.now().isoformat(),
            },
            "Dashboard statistics retrieved successfully",
        )

    # -- chart datasets ----------------------------------------------------
    def _by_status(self, by_status):
        """Doughnut: every status, including the ones sitting at zero."""
        from apps.assets.constants import STATUS_COLORS

        return [
            {
                "status": value,
                "label": label,
                "count": by_status.get(value, {}).get("count", 0),
                "value": str(by_status.get(value, {}).get("value", ZERO)),
                "color": STATUS_COLORS.get(value, "#7B8794"),
            }
            for value, label in AssetStatus.choices
        ]

    def _by_category(self):
        """Bar: asset count and book value per category, busiest first."""
        rows = (
            Category.objects.annotate(
                count=Count("assets", filter=Q(assets__is_deleted=False)),
                value=Coalesce(
                    Sum("assets__current_value",
                        filter=Q(assets__is_deleted=False),
                        output_field=MONEY),
                    ZERO,
                    output_field=MONEY,
                ),
            )
            .filter(count__gt=0)
            .order_by("-count", "name")[:10]
        )
        return [
            {
                "id": row.id,
                "name": row.name,
                "color": row.color,
                "count": row.count,
                "value": str(row.value),
            }
            for row in rows
        ]

    def _month_series(self):
        """Last N months as (date, 'Mon YY') pairs, oldest first."""
        today = date.today().replace(day=1)
        months = []
        year, month = today.year, today.month
        for _ in range(TREND_MONTHS):
            months.append(date(year, month, 1))
            month -= 1
            if month == 0:
                month = 12
                year -= 1
        return list(reversed(months))

    def _value_over_time(self):
        """
        Line: cumulative purchase value of the register, month by month.

        Built from purchase dates, so it shows how the asset base grew rather
        than a historical revaluation.
        """
        months = self._month_series()
        start = months[0]

        rows = (
            Asset.objects.filter(purchase_date__isnull=False)
            .annotate(month=TruncMonth("purchase_date"))
            .values("month")
            .annotate(value=_money_sum("purchase_cost"), count=Count("id"))
            .order_by("month")
        )
        per_month = {row["month"]: row for row in rows if row["month"]}

        # Everything bought before the window forms the opening balance.
        opening = sum(
            (row["value"] for month, row in per_month.items() if month < start),
            ZERO,
        )

        series = []
        running = opening
        for month in months:
            row = per_month.get(month)
            running += row["value"] if row else ZERO
            series.append({
                "month": month.isoformat(),
                "label": month.strftime("%b %y"),
                "value": str(running),
                "added": str(row["value"]) if row else "0.00",
            })
        return series

    def _assets_added(self):
        """Bar: how many assets entered the register each month."""
        months = self._month_series()
        rows = (
            Asset.objects.filter(purchase_date__isnull=False)
            .annotate(month=TruncMonth("purchase_date"))
            .values("month")
            .annotate(count=Count("id"))
        )
        counts = {row["month"]: row["count"] for row in rows if row["month"]}
        return [
            {
                "month": month.isoformat(),
                "label": month.strftime("%b %y"),
                "count": counts.get(month, 0),
            }
            for month in months
        ]

    def _recent_assets(self):
        rows = (
            Asset.objects.select_related("category", "assigned_to")
            .order_by("-created_at")[:RECENT_LIMIT]
        )
        return [
            {
                "id": asset.id,
                "asset_tag": asset.asset_tag,
                "name": asset.name,
                "status": asset.status,
                "status_label": asset.get_status_display(),
                "category": asset.category.name if asset.category_id else None,
                "category_color": asset.category.color if asset.category_id else None,
                "assigned_to": asset.assigned_to.full_name if asset.assigned_to_id else None,
                "current_value": str(asset.current_value),
                "created_at": asset.created_at.isoformat(),
            }
            for asset in rows
        ]

    def _expiring_soon(self, today, warn_days):
        rows = (
            Asset.objects.exclude(status__in=TERMINAL_STATUSES)
            .filter(
                warranty_expiry__isnull=False,
                warranty_expiry__gte=today,
                warranty_expiry__lte=today + timedelta(days=warn_days),
            )
            .select_related("category")
            .order_by("warranty_expiry")[:RECENT_LIMIT]
        )
        return [
            {
                "id": asset.id,
                "asset_tag": asset.asset_tag,
                "name": asset.name,
                "warranty_expiry": asset.warranty_expiry.isoformat(),
                "days_remaining": (asset.warranty_expiry - today).days,
                "category": asset.category.name if asset.category_id else None,
            }
            for asset in rows
        ]
