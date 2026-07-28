from django.apps import AppConfig


class AuditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.audit"
    label = "audit"
    verbose_name = "Audit Trail"

    def ready(self):
        # Connect once the registry is populated, so tracked models in other
        # apps are importable.
        from . import signals

        signals.connect()
