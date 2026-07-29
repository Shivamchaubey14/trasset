from django.apps import AppConfig


class StockTakeConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stocktake"
    label = "stocktake"
    verbose_name = "Stock take"
