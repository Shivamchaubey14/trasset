from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils import timezone

from .models import Role, User


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("name", "description", "user_count")
    search_fields = ("name", "description")

    @admin.display(description="Users")
    def user_count(self, obj):
        return obj.users.count()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("full_name",)
    list_display = ("full_name", "email", "role", "department", "is_active", "locked")
    list_filter = ("role", "department", "is_active", "is_staff")
    search_fields = ("full_name", "email", "phone")
    readonly_fields = ("last_login", "created_at", "updated_at",
                       "failed_login_attempts", "locked_until")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("full_name", "phone", "avatar", "timezone_name")}),
        ("Access", {"fields": ("role", "department", "is_active", "is_staff",
                               "is_superuser", "groups", "user_permissions")}),
        ("Preferences", {"fields": ("email_notifications",)}),
        ("Security", {"fields": ("failed_login_attempts", "locked_until")}),
        ("Timestamps", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "full_name", "role", "password1", "password2"),
        }),
    )

    @admin.display(boolean=True, description="Locked")
    def locked(self, obj):
        return bool(obj.locked_until and obj.locked_until > timezone.now())
