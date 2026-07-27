"""Trasset — Celery application (SRS §10.4)."""
import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

app = Celery("trasset")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    # FR-8.4 — recalculate book values on the 1st of each month at 01:00 UTC
    "recalculate-depreciation-monthly": {
        "task": "apps.assets.tasks.recalculate_all_depreciation",
        "schedule": crontab(hour=1, minute=0, day_of_month=1),
    },
    # FR-7.3 — daily warranty-expiry scan at 02:00 UTC
    "scan-expiring-warranties-daily": {
        "task": "apps.notifications.tasks.scan_expiring_warranties",
        "schedule": crontab(hour=2, minute=0),
    },
    # FR-6.5 — daily maintenance-due scan at 02:15 UTC
    "scan-due-maintenance-daily": {
        "task": "apps.notifications.tasks.scan_due_maintenance",
        "schedule": crontab(hour=2, minute=15),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):  # pragma: no cover
    print(f"Request: {self.request!r}")
