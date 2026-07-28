from django.contrib import admin
from django.utils.html import format_html

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only in the admin too — the trail is not editable anywhere."""

    list_display = ("created_at", "action_pill", "entity_type", "entity_label",
                    "user_display", "ip_address")
    list_filter = ("action", "entity_type", "created_at")
    search_fields = ("entity_label", "entity_id", "user_display", "request_path")
    date_hierarchy = "created_at"
    readonly_fields = tuple(
        field.name for field in AuditLog._meta.fields
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Action")
    def action_pill(self, obj):
        return format_html(
            '<span style="background:{}1f;color:{};padding:2px 10px;'
            'border-radius:999px;font-size:12px">{}</span>',
            obj.action_color, obj.action_color, obj.get_action_display(),
        )
