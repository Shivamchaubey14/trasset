"""
Security checklist — SRS §9, build plan Day 28.

Individual controls are tested elsewhere. This asserts the *configuration* they
depend on, because a control that is implemented but switched off in production
is worse than one that was never written: it looks handled.

Production settings are exercised by loading them directly, so a regression in
`prod.py` fails here rather than during a deploy.
"""
import os

from django.conf import settings
from django.test import SimpleTestCase, override_settings

from .base import TrassetAPITestCase


def production_settings():
    """Load config.settings.prod in isolation, with the env it expects."""
    import importlib

    previous = {
        key: os.environ.get(key)
        for key in ("ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS", "DEBUG",
                    "DJANGO_SECRET_KEY")
    }
    os.environ.update({
        "ALLOWED_HOSTS": "app.trasset.com",
        "CORS_ALLOWED_ORIGINS": "https://app.trasset.com",
        "DEBUG": "False",
        "DJANGO_SECRET_KEY": previous.get("DJANGO_SECRET_KEY") or "test-only-key",
    })
    try:
        module = importlib.import_module("config.settings.prod")
        return importlib.reload(module)
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


class ProductionSettingsTests(SimpleTestCase):
    """SEC-4, SEC-6, SEC-10 — the settings a deploy depends on."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.prod = production_settings()

    def test_debug_is_off(self):
        """SEC-10 — DEBUG on in production leaks settings and stack traces."""
        self.assertFalse(self.prod.DEBUG)

    def test_https_is_enforced(self):
        """SEC-4"""
        self.assertTrue(self.prod.SECURE_SSL_REDIRECT)
        self.assertGreaterEqual(self.prod.SECURE_HSTS_SECONDS, 31536000)
        self.assertTrue(self.prod.SECURE_HSTS_INCLUDE_SUBDOMAINS)

    def test_cookies_are_secure_and_http_only(self):
        self.assertTrue(self.prod.SESSION_COOKIE_SECURE)
        self.assertTrue(self.prod.CSRF_COOKIE_SECURE)
        self.assertTrue(self.prod.SESSION_COOKIE_HTTPONLY)

    def test_browser_protections_are_on(self):
        self.assertTrue(self.prod.SECURE_CONTENT_TYPE_NOSNIFF)
        self.assertEqual(self.prod.X_FRAME_OPTIONS, "DENY")

    def test_cors_is_not_open(self):
        """SEC-6 — a wildcard origin in production defeats the point."""
        self.assertFalse(getattr(self.prod, "CORS_ALLOW_ALL_ORIGINS", False))
        self.assertTrue(self.prod.CORS_ALLOWED_ORIGINS)

    def test_allowed_hosts_is_not_a_wildcard(self):
        self.assertNotIn("*", self.prod.ALLOWED_HOSTS)

    def test_the_log_directory_is_created(self):
        """Logging is configured during setup; a missing path kills the boot."""
        self.assertTrue(self.prod.LOG_DIR.exists())


class SecretsTests(SimpleTestCase):
    """SEC-10 — secrets come from the environment, never from the repository."""

    def test_the_secret_key_is_read_from_the_environment(self):
        import inspect

        from config.settings import base

        source = inspect.getsource(base)
        self.assertIn('env("DJANGO_SECRET_KEY")', source)

    def test_no_hard_coded_secret_key_default(self):
        """A default would silently ship a known key if the env var were missed."""
        import inspect

        from config.settings import base

        for line in inspect.getsource(base).splitlines():
            if "SECRET_KEY" in line and "=" in line:
                self.assertNotIn("default=", line, line.strip())

    def test_the_env_file_is_not_tracked(self):
        from pathlib import Path

        gitignore = Path(settings.BASE_DIR).parent / ".gitignore"
        self.assertTrue(gitignore.exists())
        self.assertIn(".env", gitignore.read_text(encoding="utf-8"))


class PasswordPolicyTests(SimpleTestCase):
    """SEC-1"""

    def test_argon2_is_the_default_hasher(self):
        """
        Asserted against the base settings, not the active ones: the test
        settings swap in MD5 so the suite runs quickly, which would make this
        check pass or fail for the wrong reason.
        """
        from config.settings import base

        self.assertIn("Argon2", base.PASSWORD_HASHERS[0])
        self.assertIn("PBKDF2", base.PASSWORD_HASHERS[1],
                      "keep a fallback so existing hashes still verify")

    def test_validators_are_configured(self):
        names = " ".join(v["NAME"] for v in settings.AUTH_PASSWORD_VALIDATORS)
        for expected in ("MinimumLength", "CommonPassword",
                         "NumericPassword", "UserAttributeSimilarity"):
            self.assertIn(expected, names)

    def test_minimum_length_is_at_least_eight(self):
        for validator in settings.AUTH_PASSWORD_VALIDATORS:
            if "MinimumLength" in validator["NAME"]:
                self.assertGreaterEqual(validator["OPTIONS"]["min_length"], 8)


class TokenPolicyTests(SimpleTestCase):
    """SEC-2"""

    def test_access_tokens_are_short_lived(self):
        self.assertLessEqual(
            settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(), 15 * 60)

    def test_refresh_tokens_rotate_and_blacklist(self):
        self.assertTrue(settings.SIMPLE_JWT["ROTATE_REFRESH_TOKENS"])
        self.assertTrue(settings.SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"])

    def test_the_blacklist_app_is_installed(self):
        self.assertIn("rest_framework_simplejwt.token_blacklist",
                      settings.INSTALLED_APPS)


class UploadPolicyTests(SimpleTestCase):
    """SEC-8"""

    def test_a_size_ceiling_exists(self):
        self.assertGreater(settings.MAX_UPLOAD_SIZE_MB, 0)
        self.assertLessEqual(settings.MAX_UPLOAD_SIZE_MB, 25)

    def test_the_extension_allowlist_excludes_executables(self):
        allowed = {e.lower() for e in settings.ALLOWED_UPLOAD_EXTENSIONS}
        for dangerous in (".exe", ".sh", ".bat", ".dll", ".js", ".html", ".svg"):
            self.assertNotIn(dangerous, allowed)

    def test_media_is_not_served_from_the_static_root(self):
        self.assertNotEqual(settings.MEDIA_ROOT, settings.STATIC_ROOT)


class ApiPolicyTests(SimpleTestCase):
    """SEC-3, SEC-7 — the defaults every endpoint inherits."""

    def test_authentication_is_required_by_default(self):
        """A view that forgets permission_classes must fail closed."""
        self.assertIn("rest_framework.permissions.IsAuthenticated",
                      settings.REST_FRAMEWORK["DEFAULT_PERMISSION_CLASSES"])

    def test_jwt_is_the_authentication_scheme(self):
        self.assertIn("rest_framework_simplejwt.authentication.JWTAuthentication",
                      settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"])

    def test_throttling_is_configured(self):
        self.assertTrue(settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"])

    def test_pagination_is_bounded(self):
        """An unbounded list is a denial-of-service waiting to be found."""
        from common.pagination import StandardPagination

        self.assertLessEqual(StandardPagination.max_page_size, 500)


class LockoutPolicyTests(SimpleTestCase):
    """FR-1.5"""

    def test_lockout_is_configured(self):
        self.assertGreater(settings.LOGIN_MAX_ATTEMPTS, 0)
        self.assertLessEqual(settings.LOGIN_MAX_ATTEMPTS, 10)
        self.assertGreaterEqual(settings.LOGIN_LOCKOUT_MINUTES, 5)


class BypassTests(TrassetAPITestCase):
    """
    Day 28 asks explicitly whether soft-delete and RBAC can be bypassed.
    These are the shapes an attacker would actually try.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        from apps.assets.models import Asset
        from apps.audit.services import suspend
        from apps.masters.models import Category

        with suspend():
            cls.category = Category.objects.create(name="Laptops")
            cls.deleted = Asset.objects.create(name="Deleted", category=cls.category,
                                               is_deleted=True)

    def test_a_soft_deleted_asset_cannot_be_read_back(self):
        self.login(self.admin)
        self.assertEqual(
            self.client.get(f"/api/v1/assets/{self.deleted.id}/").status_code, 404)

    def test_a_soft_deleted_asset_is_absent_from_every_view(self):
        self.login(self.manager)
        for url in ("/api/v1/assets/", "/api/v1/reports/asset-register/"):
            with self.subTest(url=url):
                data = self.client.get(url).json()["data"]
                identifiers = [row["id"] for row in data["results"]] \
                    if "results" in data else []
                self.assertNotIn(self.deleted.id, identifiers)

    def test_a_soft_deleted_asset_cannot_be_acted_on(self):
        self.login(self.manager)
        self.assertEqual(
            self.client.post(f"/api/v1/assets/{self.deleted.id}/assign/",
                             {"user_id": self.employee.id}, format="json").status_code,
            404)

    def test_role_cannot_be_escalated_through_the_profile_endpoint(self):
        """The obvious attempt: patch your own role to super_admin."""
        self.login(self.employee)
        self.client.patch("/api/v1/auth/me/",
                          {"role": self.roles["super_admin"].id,
                           "is_active": True}, format="json")

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role_name, "employee")

    def test_a_filter_cannot_widen_a_scoped_queryset(self):
        from apps.assets.models import AssetRequest
        from apps.audit.services import suspend

        with suspend():
            AssetRequest.objects.create(requester=self.head, category=self.category,
                                        reason="Somebody else's request entirely.")

        self.login(self.employee)
        for query in ("", "?requester=" + str(self.head.id), "?requester="):
            with self.subTest(query=query):
                data = self.client.get(f"/api/v1/asset-requests/{query}").json()["data"]
                self.assertEqual(data["count"], 0)

    def test_an_expired_or_forged_token_is_refused(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not.a.real.token")
        self.assertEqual(self.client.get("/api/v1/assets/").status_code, 401)

    def test_a_blacklisted_refresh_token_cannot_be_reused(self):
        """SEC-2 — signing out has to actually end the session."""
        login = self.client.post("/api/v1/auth/login/",
                                 {"email": self.employee.email,
                                  "password": "TrassetTest@2026"}, format="json")
        body = login.json()["data"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")

        self.client.post("/api/v1/auth/logout/", {"refresh": body["refresh"]},
                         format="json")
        reuse = self.client.post("/api/v1/auth/refresh/",
                                 {"refresh": body["refresh"]}, format="json")
        self.assertEqual(reuse.status_code, 401)

    @override_settings(DEBUG=False)
    def test_server_errors_do_not_leak_internals(self):
        """NFR-8 — a stack trace in a response is a map of the application."""
        from unittest.mock import patch

        self.login(self.manager)
        with patch("apps.reports.views.DashboardStatsView.get",
                   side_effect=RuntimeError("database password is hunter2")):
            response = self.client.get("/api/v1/dashboard/stats/")

        self.assertEqual(response.status_code, 500)
        body = response.json()
        self.assertNotIn("hunter2", str(body))
        self.assertNotIn("Traceback", str(body))
        self.assertEqual(body["message"], "An unexpected error occurred")
