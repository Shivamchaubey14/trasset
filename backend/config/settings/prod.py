"""Trasset — production settings (SRS §9)."""
from .base import *  # noqa: F401,F403
from .base import env

DEBUG = False                                   # SEC-10
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# --- HTTPS / transport security (SEC-4) ---
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# --- Cookies / headers ---
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# --- CORS locked to the frontend origin (SEC-6) ---
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env("CORS_ALLOWED_ORIGINS")

# --- Email ---
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

# --- Celery runs on real workers in production ---
CELERY_TASK_ALWAYS_EAGER = False

# --- Never leak stack traces (NFR-8); log errors instead ---
LOGGING["handlers"]["file"] = {  # noqa: F405
    "class": "logging.handlers.RotatingFileHandler",
    "filename": str(BASE_DIR / "logs" / "trasset.log"),  # noqa: F405
    "maxBytes": 10 * 1024 * 1024,
    "backupCount": 10,
    "formatter": "verbose",
}
LOGGING["root"]["handlers"] = ["console", "file"]  # noqa: F405
