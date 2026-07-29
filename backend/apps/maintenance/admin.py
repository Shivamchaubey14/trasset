from django.contrib import admin
from django.utils.html import format_html

from .models import MaintenanceRecord


@admin.register(MaintenanceRecord)
class MaintenanceRecordAdmin(admin.ModelAdmin):
    list_display = ("scheduled_date", "asset", "type", "status_pill",
                    "technician", "vendor", "actual_cost")
    list_filter = ("status", "type", "scheduled_date", "vendor")
    search_fields = ("asset__asset_tag", "asset__name", "technician", "notes")
    autocomplete_fields = ("created_by", "completed_by")
    date_hierarchy = "scheduled_date"
    readonly_fields = ("started_at", "asset_status_before", "created_at", "updated_at")

    fieldsets = (
        ("Work", {"fields": ("asset", "type", "status", "notes")}),
        ("Schedule", {"fields": ("scheduled_date", "started_at",
                                 "completed_date", "completion_notes")}),
        ("Who", {"fields": ("technician", "vendor", "created_by", "completed_by")}),
        ("Cost", {"fields": ("cost_estimate", "actual_cost")}),
        ("Record", {"fields": ("asset_status_before", "created_at", "updated_at")}),
    )

    @admin.display(description="Status")
    def status_pill(self, obj):
        return format_html(
            '<span style="background:{}1f;color:{};padding:2px 10px;'
            'border-radius:999px;font-size:12px">{}</span>',
            obj.status_color, obj.status_color, obj.get_status_display(),
        )
