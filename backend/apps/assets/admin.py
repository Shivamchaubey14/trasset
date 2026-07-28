from django.contrib import admin
from django.utils.html import format_html

from .models import Asset, AssetAssignment, AssetTagCounter, Attachment


class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 0
    readonly_fields = ("filename", "size_bytes", "uploaded_by", "created_at")


class AssignmentInline(admin.TabularInline):
    model = AssetAssignment
    extra = 0
    can_delete = False
    readonly_fields = ("action", "user", "assigned_by", "notes", "days_held", "created_at")

    def has_add_permission(self, request, obj=None):
        # History is written by the assignment service, never by hand.
        return False


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("asset_tag", "name", "category", "status_pill",
                    "assigned_to", "current_value", "is_deleted")
    list_filter = ("status", "category", "location", "department",
                   "depreciation_method", "is_deleted")
    search_fields = ("asset_tag", "name", "serial_number", "manufacturer", "model_number")
    autocomplete_fields = ("assigned_to", "created_by")
    readonly_fields = ("asset_tag", "current_value", "created_at", "updated_at",
                       "assigned_at", "deleted_at")
    inlines = [AssignmentInline, AttachmentInline]
    date_hierarchy = "purchase_date"

    fieldsets = (
        ("Identity", {
            "fields": ("asset_tag", "name", "description", "serial_number",
                       "model_number", "manufacturer", "image")
        }),
        ("Classification", {
            "fields": ("category", "status", "location", "department", "vendor")
        }),
        ("Assignment", {"fields": ("assigned_to", "assigned_at")}),
        ("Financials", {
            "fields": ("purchase_date", "purchase_cost", "salvage_value",
                       "useful_life_years", "depreciation_method", "current_value",
                       "warranty_expiry")
        }),
        ("Extras", {"fields": ("custom_data", "notes", "created_by")}),
        ("Record", {"fields": ("is_deleted", "deleted_at", "created_at", "updated_at")}),
    )

    def get_queryset(self, request):
        # Admins should be able to see soft-deleted rows.
        return Asset.all_objects.select_related("category", "assigned_to")

    @admin.display(description="Status")
    def status_pill(self, obj):
        return format_html(
            '<span style="background:{}22;color:{};padding:2px 10px;'
            'border-radius:999px;font-size:12px">{}</span>',
            obj.status_color, obj.status_color, obj.get_status_display(),
        )


@admin.register(AssetAssignment)
class AssetAssignmentAdmin(admin.ModelAdmin):
    list_display = ("created_at", "asset", "action", "user", "assigned_by", "days_held")
    list_filter = ("action", "created_at")
    search_fields = ("asset__asset_tag", "asset__name", "user__full_name")
    readonly_fields = ("asset", "user", "assigned_by", "action", "notes",
                       "days_held", "created_at", "updated_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("filename", "asset", "size_bytes", "uploaded_by", "created_at")
    search_fields = ("filename", "asset__asset_tag")
    readonly_fields = ("size_bytes", "created_at")


@admin.register(AssetTagCounter)
class AssetTagCounterAdmin(admin.ModelAdmin):
    list_display = ("prefix", "year", "last_sequence")
    readonly_fields = ("prefix", "year", "last_sequence")

    def has_add_permission(self, request):
        return False
