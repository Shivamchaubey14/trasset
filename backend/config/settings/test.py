"""
Trasset — test settings.

Selected automatically by ``manage.py test`` (see manage.py). Throttling is
disabled here: the rate limits are a production concern (SEC-7) and would
otherwise reject the many logins a test run performs. Throttle behaviour
itself is asserted in its own test with explicit overrides.
"""
import tempfile
from pathlib import Path

from .base import *  # noqa: F401,F403

DEBUG = False

# Fast, deterministic hashing — Argon2 is verified in production settings.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

REST_FRAMEWORK = {**REST_FRAMEWORK}  # noqa: F405

# Keep the throttle class wired up — DRF binds `throttle_classes` and
# `THROTTLE_RATES` at import time, so a test cannot switch it on later with
# override_settings. Instead every scope gets a rate of None, which DRF treats
# as "unlimited", so the suite runs freely. tests/test_throttling.py patches
# THROTTLE_RATES with real limits to prove the control actually fires.
# The same class production uses — a test that exercises a different throttle
# class from the deployed one proves nothing about the deployed one.
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = (
    "common.throttling.DeviceScopedRateThrottle",
)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "auth": None,
    "write": None,
    "export": None,
    "user": None,
    "anon": None,
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
# Same idea for push: collected in memory so a test can read what was sent.
PUSH_BACKEND = "apps.notifications.push.LocMemPushBackend"

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Uploads go to a throwaway temp directory rather than anywhere inside the
# repo — the upload tests write real files, and they must not accumulate in the
# working tree (or get committed).
MEDIA_ROOT = Path(tempfile.mkdtemp(prefix="trasset-test-media-"))

LOGGING["root"]["level"] = "CRITICAL"  # noqa: F405
# Negative-path tests deliberately trigger 400/401/403 responses; don't log them.
LOGGING["loggers"]["django.request"] = {  # noqa: F405
    "handlers": [],
    "level": "CRITICAL",
    "propagate": False,
}
