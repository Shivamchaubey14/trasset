from django.contrib import admin

from .models import StockTake, StockTakeEntry


class StockTakeEntryInline(admin.TabularInline):
    model = StockTakeEntry
    extra = 0
    fields = ("asset", "state", "scanned_at", "scanned_by", "expected_location")
    readonly_fields = fields
    can_delete = False


@admin.register(StockTake)
class StockTakeAdmin(admin.ModelAdmin):
    list_display = ("id", "location", "status", "started_by", "started_at", "submitted_at")
    list_filter = ("status", "location")
    search_fields = ("location__name", "started_by__full_name", "notes")
    readonly_fields = ("started_at", "submitted_at", "submitted_by",
                       "created_at", "updated_at")
    inlines = [StockTakeEntryInline]


@admin.register(StockTakeEntry)
class StockTakeEntryAdmin(admin.ModelAdmin):
    list_display = ("stock_take", "asset", "state", "scanned_at")
    list_filter = ("state",)
    search_fields = ("asset__asset_tag", "asset__name")
    readonly_fields = ("stock_take", "asset", "state", "scanned_at", "scanned_by",
                       "expected_location", "created_at", "updated_at")
