from django.apps import AppConfig


class CommonConfig(AppConfig):
    """
    ``common`` holds cross-cutting infrastructure (SRS §10.2).

    It became an installed app when idempotency keys arrived (BE-4): the record
    of a replayed request belongs to no single domain — every write endpoint
    uses it — and a model has to live in an app.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "common"
    verbose_name = "Common"
