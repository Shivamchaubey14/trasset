from django.contrib import admin
from django.utils.html import format_html

from .models import PurchaseOrder, PurchaseOrderItem


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 1
    readonly_fields = ("received_quantity",)


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ("po_number", "vendor", "po_date", "status_pill",
                    "total_amount", "expected_delivery")
    list_filter = ("status", "vendor", "po_date")
    search_fields = ("po_number", "vendor__name", "reference")
    date_hierarchy = "po_date"
    inlines = [PurchaseOrderItemInline]
    readonly_fields = ("po_number", "total_amount", "received_date",
                       "created_at", "updated_at")

    @admin.display(description="Status")
    def status_pill(self, obj):
        return format_html(
            '<span style="background:{}1f;color:{};padding:2px 10px;'
            'border-radius:999px;font-size:12px">{}</span>',
            obj.status_color, obj.status_color, obj.get_status_display(),
        )

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        # Keep the stored total honest after editing lines in the admin.
        form.instance.recalculate_total()


@admin.register(PurchaseOrderItem)
class PurchaseOrderItemAdmin(admin.ModelAdmin):
    list_display = ("description", "purchase_order", "quantity",
                    "received_quantity", "unit_cost", "create_assets")
    list_filter = ("create_assets", "category")
    search_fields = ("description", "purchase_order__po_number")
