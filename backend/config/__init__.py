"""
Trasset config package.

Two things happen at import time:

1. If the C-based ``mysqlclient`` driver is unavailable (common on Windows),
   fall back to the pure-Python ``PyMySQL`` driver so the same settings work
   everywhere. On Linux servers ``mysqlclient`` is installed and used directly.
2. Expose the Celery app so ``@shared_task`` works in every Django app.
"""

try:  # pragma: no cover - driver selection is environment-specific
    import MySQLdb  # noqa: F401
except ImportError:  # pragma: no cover
    import pymysql

    pymysql.version_info = (2, 2, 7, "final", 0)
    pymysql.install_as_MySQLdb()

from .celery import app as celery_app

__all__ = ("celery_app",)
