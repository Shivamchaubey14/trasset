"""
Trasset — test settings.

Selected automatically by ``manage.py test`` (see manage.py). Throttling is
disabled here: the rate limits are a production concern (SEC-7) and would
otherwise reject the many logins a test run performs. Throttle behaviour
itself is asserted in its own test with explicit overrides.
"""
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
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = (
    "rest_framework.throttling.ScopedRateThrottle",
)
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "auth": None,
    "write": None,
    "export": None,
    "user": None,
    "anon": None,
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Keep uploads out of the real media directory during tests.
MEDIA_ROOT = BASE_DIR / "tests" / "_media"  # noqa: F405

LOGGING["root"]["level"] = "CRITICAL"  # noqa: F405
# Negative-path tests deliberately trigger 400/401/403 responses; don't log them.
LOGGING["loggers"]["django.request"] = {  # noqa: F405
    "handlers": [],
    "level": "CRITICAL",
    "propagate": False,
}
