from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "user", "type", "title", "is_read", "emailed_at")
    list_filter = ("type", "is_read", "created_at")
    search_fields = ("title", "message", "user__full_name", "user__email")
    date_hierarchy = "created_at"
    readonly_fields = ("emailed_at", "read_at", "created_at", "updated_at")

    def has_add_permission(self, request):
        # Notifications come from events, never from someone typing one in.
        return False
