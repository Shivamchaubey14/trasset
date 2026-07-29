"""
Report definitions (FR-11.3, FR-11.4).

Each report is one class that knows three things: how to build its queryset
from the filters, what its columns are, and how to turn a row into values.
Everything else — JSON, CSV, XLSX, filtering, totals — is shared, so adding a
report means adding a class, not another endpoint.

Rows are produced by a generator over ``.iterator()`` so a 100k-row register
(NFR-5) never lands in memory all at once.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Callable

from django.db.models import Q

from apps.assets.constants import TERMINAL_STATUSES
from apps.assets.models import Asset, AssetAssignment
from apps.maintenance.constants import MaintenanceStatus
from apps.maintenance.models import MaintenanceRecord

#: How many rows to pull from the database at a time while exporting.
EXPORT_CHUNK = 500


@dataclass(frozen=True)
class Column:
    """One column: its key, its header, and how to read it off a row."""

    key: str
    header: str
    getter: Callable
    #: "text" | "number" | "money" | "date" — drives export formatting.
    kind: str = "text"


def _money(value) -> Decimal:
    return Decimal(value or 0)


class BaseReport:
    """Shared filtering and row production."""

    key = ""
    title = ""
    description = ""
    columns: list[Column] = []

    #: Field paths used by the standard filters, per report.
    date_field: str | None = None
    department_field: str | None = None
    location_field: str | None = None
    category_field: str | None = None

    def __init__(self, filters=None):
        self.filters = filters or {}

    # -- queryset ----------------------------------------------------------
    def base_queryset(self):
        raise NotImplementedError

    def apply_filters(self, queryset):
        """The four filters SRS §11.4 asks for, applied where they make sense."""
        date_from = self.filters.get("date_from")
        date_to = self.filters.get("date_to")
        department = self.filters.get("department")
        location = self.filters.get("location")
        category = self.filters.get("category")

        if self.date_field:
            if date_from:
                queryset = queryset.filter(**{f"{self.date_field}__gte": date_from})
            if date_to:
                queryset = queryset.filter(**{f"{self.date_field}__lte": date_to})

        if department and self.department_field:
            queryset = queryset.filter(**{self.department_field: department})
        if location and self.location_field:
            queryset = queryset.filter(**{self.location_field: location})
        if category and self.category_field:
            queryset = queryset.filter(**{self.category_field: category})

        return queryset

    def queryset(self):
        return self.apply_filters(self.base_queryset())

    # -- rows --------------------------------------------------------------
    def row(self, obj) -> dict:
        return {column.key: column.getter(obj) for column in self.columns}

    def rows(self, queryset=None):
        """Generator over report rows, chunked so memory stays flat."""
        queryset = self.queryset() if queryset is None else queryset
        for obj in queryset.iterator(chunk_size=EXPORT_CHUNK):
            yield self.row(obj)

    def headers(self) -> list[str]:
        return [column.header for column in self.columns]

    def totals(self, queryset=None) -> dict:
        """Optional summary shown above the table and on the export."""
        return {}


class AssetRegisterReport(BaseReport):
    """Every asset on the books, with its current value."""

    key = "asset-register"
    title = "Asset Register"
    description = "The full inventory with purchase cost and current book value."

    date_field = "purchase_date"
    department_field = "department_id"
    location_field = "location_id"
    category_field = "category_id"

    columns = [
        Column("asset_tag", "Asset Tag", lambda a: a.asset_tag),
        Column("name", "Name", lambda a: a.name),
        Column("category", "Category", lambda a: a.category.name if a.category_id else ""),
        Column("serial_number", "Serial Number", lambda a: a.serial_number),
        Column("status", "Status", lambda a: a.get_status_display()),
        Column("location", "Location", lambda a: a.location.name if a.location_id else ""),
        Column("department", "Department",
               lambda a: a.department.name if a.department_id else ""),
        Column("assigned_to", "Assigned To",
               lambda a: a.assigned_to.full_name if a.assigned_to_id else ""),
        Column("vendor", "Vendor", lambda a: a.vendor.name if a.vendor_id else ""),
        Column("purchase_date", "Purchase Date", lambda a: a.purchase_date, "date"),
        Column("purchase_cost", "Purchase Cost", lambda a: _money(a.purchase_cost), "money"),
        Column("current_value", "Book Value", lambda a: _money(a.current_value), "money"),
        Column("warranty_expiry", "Warranty Expiry", lambda a: a.warranty_expiry, "date"),
    ]

    def base_queryset(self):
        return (
            Asset.objects
            .select_related("category", "location", "department", "vendor", "assigned_to")
            .order_by("asset_tag")
        )

    def totals(self, queryset=None):
        from django.db.models import Count, Sum

        queryset = self.queryset() if queryset is None else queryset
        aggregate = queryset.aggregate(
            count=Count("id"),
            purchase_cost=Sum("purchase_cost"),
            current_value=Sum("current_value"),
        )
        return {
            "assets": aggregate["count"] or 0,
            "purchase_cost": str(aggregate["purchase_cost"] or Decimal("0.00")),
            "current_value": str(aggregate["current_value"] or Decimal("0.00")),
        }


class DepreciationReport(BaseReport):
    """What each asset has lost in value, and what is left to write down."""

    key = "depreciation"
    title = "Depreciation Report"
    description = "Cost, accumulated depreciation and remaining book value per asset."

    date_field = "purchase_date"
    department_field = "department_id"
    location_field = "location_id"
    category_field = "category_id"

    @staticmethod
    def _annual_charge(asset):
        from apps.assets.services.depreciation import annual_depreciation

        return annual_depreciation(
            asset.purchase_cost, asset.salvage_value, asset.useful_life_years
        )

    @staticmethod
    def _remaining_life(asset):
        """Years left before the asset is fully written down."""
        if not asset.purchase_date or not asset.useful_life_years:
            return ""
        elapsed = (date.today() - asset.purchase_date).days / 365.25
        return max(0, round(asset.useful_life_years - elapsed, 1))

    columns = [
        Column("asset_tag", "Asset Tag", lambda a: a.asset_tag),
        Column("name", "Name", lambda a: a.name),
        Column("category", "Category", lambda a: a.category.name if a.category_id else ""),
        Column("purchase_date", "Purchase Date", lambda a: a.purchase_date, "date"),
        Column("purchase_cost", "Purchase Cost", lambda a: _money(a.purchase_cost), "money"),
        Column("salvage_value", "Salvage Value", lambda a: _money(a.salvage_value), "money"),
        Column("useful_life_years", "Useful Life (yrs)",
               lambda a: a.useful_life_years, "number"),
        Column("method", "Method", lambda a: a.get_depreciation_method_display()),
        Column("annual_depreciation", "Annual Charge",
               lambda a: DepreciationReport._annual_charge(a), "money"),
        Column("accumulated_depreciation", "Accumulated",
               lambda a: _money(a.purchase_cost) - _money(a.current_value), "money"),
        Column("current_value", "Book Value", lambda a: _money(a.current_value), "money"),
        Column("remaining_life", "Life Remaining (yrs)",
               lambda a: DepreciationReport._remaining_life(a), "number"),
    ]

    def base_queryset(self):
        # Assets with no cost have nothing to depreciate, so they are noise here.
        return (
            Asset.objects
            .filter(purchase_cost__gt=0)
            .select_related("category", "department", "location")
            .order_by("-purchase_cost", "asset_tag")
        )

    def totals(self, queryset=None):
        from django.db.models import Count, Sum

        queryset = self.queryset() if queryset is None else queryset
        aggregate = queryset.aggregate(
            count=Count("id"),
            purchase_cost=Sum("purchase_cost"),
            current_value=Sum("current_value"),
        )
        cost = aggregate["purchase_cost"] or Decimal("0.00")
        value = aggregate["current_value"] or Decimal("0.00")
        return {
            "assets": aggregate["count"] or 0,
            "purchase_cost": str(cost),
            "current_value": str(value),
            "accumulated_depreciation": str(cost - value),
        }


class MaintenanceCostReport(BaseReport):
    """What maintenance has cost, and how it compared with the estimate."""

    key = "maintenance-cost"
    title = "Maintenance Cost Report"
    description = "Spend per maintenance job, with estimate against actual."

    date_field = "scheduled_date"
    department_field = "asset__department_id"
    location_field = "asset__location_id"
    category_field = "asset__category_id"

    columns = [
        Column("asset_tag", "Asset Tag", lambda m: m.asset.asset_tag),
        Column("asset_name", "Asset", lambda m: m.asset.name),
        Column("category", "Category",
               lambda m: m.asset.category.name if m.asset.category_id else ""),
        Column("type", "Type", lambda m: m.get_type_display()),
        Column("status", "Status", lambda m: m.get_status_display()),
        Column("scheduled_date", "Scheduled", lambda m: m.scheduled_date, "date"),
        Column("completed_date", "Completed", lambda m: m.completed_date, "date"),
        Column("technician", "Technician", lambda m: m.technician),
        Column("vendor", "Vendor", lambda m: m.vendor.name if m.vendor_id else ""),
        Column("cost_estimate", "Estimated", lambda m: _money(m.cost_estimate), "money"),
        Column("actual_cost", "Actual",
               lambda m: _money(m.actual_cost) if m.actual_cost is not None else "", "money"),
        Column("variance", "Variance",
               lambda m: (_money(m.actual_cost) - _money(m.cost_estimate))
               if m.actual_cost is not None else "", "money"),
    ]

    def base_queryset(self):
        return (
            MaintenanceRecord.objects
            .select_related("asset", "asset__category", "asset__department",
                            "asset__location", "vendor")
            .order_by("-scheduled_date")
        )

    def totals(self, queryset=None):
        from django.db.models import Count, Sum

        queryset = self.queryset() if queryset is None else queryset
        aggregate = queryset.aggregate(
            count=Count("id"),
            estimated=Sum("cost_estimate"),
            actual=Sum("actual_cost"),
            completed=Count("id", filter=Q(status=MaintenanceStatus.COMPLETED)),
        )
        estimated = aggregate["estimated"] or Decimal("0.00")
        actual = aggregate["actual"] or Decimal("0.00")
        return {
            "jobs": aggregate["count"] or 0,
            "completed": aggregate["completed"] or 0,
            "estimated_cost": str(estimated),
            "actual_cost": str(actual),
            "variance": str(actual - estimated),
        }


class AssignmentReport(BaseReport):
    """Who has held what, and for how long."""

    key = "assignment"
    title = "Assignment Report"
    description = "Every check-out and check-in, with who authorised it."

    date_field = "created_at__date"
    department_field = "user__department_id"
    location_field = "asset__location_id"
    category_field = "asset__category_id"

    columns = [
        Column("date", "Date", lambda r: r.created_at.date(), "date"),
        Column("action", "Action", lambda r: r.get_action_display()),
        Column("asset_tag", "Asset Tag", lambda r: r.asset.asset_tag),
        Column("asset_name", "Asset", lambda r: r.asset.name),
        Column("category", "Category",
               lambda r: r.asset.category.name if r.asset.category_id else ""),
        Column("user", "Person", lambda r: r.user.full_name),
        Column("department", "Department",
               lambda r: r.user.department.name if r.user.department_id else ""),
        Column("assigned_by", "Actioned By",
               lambda r: r.assigned_by.full_name if r.assigned_by_id else ""),
        Column("days_held", "Days Held",
               lambda r: r.days_held if r.days_held is not None else "", "number"),
        Column("notes", "Notes", lambda r: r.notes),
    ]

    def base_queryset(self):
        return (
            AssetAssignment.objects
            .select_related("asset", "asset__category", "asset__location",
                            "user", "user__department", "assigned_by")
            .order_by("-created_at")
        )

    def totals(self, queryset=None):
        from django.db.models import Avg, Count

        from apps.assets.constants import AssignmentAction

        queryset = self.queryset() if queryset is None else queryset
        aggregate = queryset.aggregate(
            movements=Count("id"),
            checkouts=Count("id", filter=Q(action=AssignmentAction.CHECKOUT)),
            checkins=Count("id", filter=Q(action=AssignmentAction.CHECKIN)),
            average_days_held=Avg("days_held"),
        )
        average = aggregate["average_days_held"]
        return {
            "movements": aggregate["movements"] or 0,
            "checkouts": aggregate["checkouts"] or 0,
            "checkins": aggregate["checkins"] or 0,
            "average_days_held": round(average, 1) if average is not None else None,
        }


#: Everything the report endpoints can serve.
REPORTS = {
    report.key: report
    for report in (
        AssetRegisterReport,
        DepreciationReport,
        MaintenanceCostReport,
        AssignmentReport,
    )
}
