from django.contrib import admin
from django.utils.html import format_html

from .models import Category, Department, Location, Vendor


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "swatch", "icon", "custom_field_count", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")

    @admin.display(description="Colour")
    def swatch(self, obj):
        return format_html(
            '<span style="display:inline-block;width:16px;height:16px;'
            'border-radius:4px;background:{};vertical-align:middle"></span> {}',
            obj.color, obj.color,
        )

    @admin.display(description="Custom fields")
    def custom_field_count(self, obj):
        return len(obj.custom_fields or [])


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("name", "city", "country", "is_active")
    list_filter = ("is_active", "country", "city")
    search_fields = ("name", "address", "city")


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "head_user", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "code")
    autocomplete_fields = ("head_user",)


@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ("name", "contact_person", "email", "phone", "city", "is_active")
    list_filter = ("is_active", "city")
    search_fields = ("name", "contact_person", "email", "phone")
