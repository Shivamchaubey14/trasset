"""
Rate limiting — SEC-7.

A throttle nobody has watched return 429 is a configuration, not a control.
These tests apply real limits and prove it fires.

**Why the rates are patched rather than overridden via settings:** DRF reads
``DEFAULT_THROTTLE_CLASSES`` into ``APIView.throttle_classes`` and
``DEFAULT_THROTTLE_RATES`` into ``SimpleRateThrottle.THROTTLE_RATES`` at import
time. ``override_settings`` therefore has no effect on views that are already
imported — an easy way to write a throttle test that passes while testing
nothing. The test settings keep the throttle class wired with ``None`` rates
(DRF treats that as unlimited) and these tests patch the rate dictionary
directly.
"""
from unittest.mock import patch

from django.core.cache import cache
from rest_framework.throttling import SimpleRateThrottle

from apps.assets.models import Asset
from apps.audit.services import suspend
from apps.masters.models import Category

from .base import PASSWORD, TrassetAPITestCase


def rates(**overrides):
    """Rate map with everything unlimited except the scopes named."""
    base = {"auth": None, "write": None, "export": None, "user": None, "anon": None}
    base.update(overrides)
    return base


class ThrottleTestCase(TrassetAPITestCase):
    """Throttle counters live in the cache, so each test starts from clean."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def with_rates(self, **overrides):
        patcher = patch.dict(SimpleRateThrottle.THROTTLE_RATES, rates(**overrides),
                             clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)


class AuthThrottleTests(ThrottleTestCase):
    """The unauthenticated endpoints are the ones worth hardening first."""

    url = "/api/v1/auth/login/"

    def attempt(self, password="wrong"):
        return self.client.post(
            self.url, {"email": self.employee.email, "password": password}, format="json"
        )

    def test_repeated_failures_are_throttled(self):
        self.with_rates(auth="3/min")

        for index in range(3):
            self.assertEqual(self.attempt().status_code, 401,
                             f"attempt {index + 1} should still be allowed")

        self.assertEqual(self.attempt().status_code, 429)

    def test_throttled_response_uses_the_standard_envelope(self):
        self.with_rates(auth="2/min")
        self.attempt()
        self.attempt()

        blocked = self.attempt()
        self.assertEqual(blocked.status_code, 429)
        body = self.assertEnvelope(blocked, success=False)

        # The envelope surfaces DRF's own detail rather than a generic status
        # message, because it tells the caller when to retry.
        self.assertIn("throttled", body["message"].lower())
        self.assertIn("seconds", body["message"].lower())

    def test_a_correct_password_is_not_a_free_pass(self):
        """The scope is the endpoint, so valid logins count towards it too."""
        self.with_rates(auth="3/min")

        for _ in range(3):
            self.client.post(self.url,
                             {"email": self.employee.email, "password": PASSWORD},
                             format="json")

        blocked = self.client.post(
            self.url, {"email": self.employee.email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(blocked.status_code, 429)

    def test_password_reset_shares_the_auth_scope(self):
        self.with_rates(auth="2/min")

        for _ in range(2):
            self.client.post("/api/v1/auth/password/reset/",
                             {"email": self.employee.email}, format="json")

        blocked = self.client.post("/api/v1/auth/password/reset/",
                                   {"email": self.employee.email}, format="json")
        self.assertEqual(blocked.status_code, 429)

    def test_unlimited_when_no_rate_is_configured(self):
        """Sanity check on the harness itself — None really does mean off."""
        self.with_rates()
        for _ in range(8):
            self.assertEqual(self.attempt().status_code, 401)


class WriteThrottleTests(ThrottleTestCase):
    """Unsafe methods carry the `write` scope; reads must stay unlimited."""

    url = "/api/v1/categories/"

    def test_repeated_writes_are_throttled(self):
        self.with_rates(write="3/min")
        self.login(self.manager)

        for index in range(3):
            response = self.client.post(self.url, {"name": f"Category {index}"},
                                        format="json")
            self.assertEqual(response.status_code, 201,
                             f"write {index + 1} should still be allowed")

        blocked = self.client.post(self.url, {"name": "One too many"}, format="json")
        self.assertEqual(blocked.status_code, 429)

    def test_reads_are_not_throttled_by_the_write_scope(self):
        """A busy dashboard must not lock itself out just by reading."""
        self.with_rates(write="2/min")
        self.login(self.manager)

        for _ in range(10):
            self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_lifecycle_actions_count_as_writes(self):
        """assign/checkin/retire are POSTs, so the write scope must cover them."""
        category = Category.objects.create(name="Laptops")
        with suspend():
            assets = [
                Asset.objects.create(name=f"Laptop {index}", category=category)
                for index in range(5)
            ]

        self.with_rates(write="3/min")
        self.login(self.manager)

        for index in range(3):
            response = self.client.post(
                f"/api/v1/assets/{assets[index].id}/assign/",
                {"user_id": self.employee.id}, format="json",
            )
            self.assertEqual(response.status_code, 200,
                             f"assign {index + 1} should still be allowed")

        blocked = self.client.post(
            f"/api/v1/assets/{assets[3].id}/assign/",
            {"user_id": self.employee.id}, format="json",
        )
        self.assertEqual(blocked.status_code, 429)


class ThrottleScopeIsolationTests(ThrottleTestCase):
    """Exhausting one scope must not lock a user out of everything else."""

    def test_burning_the_auth_scope_leaves_the_api_usable(self):
        self.with_rates(auth="2/min")
        token = self.login(self.manager)

        for _ in range(4):
            self.client.post("/api/v1/auth/login/",
                             {"email": "nobody@test.local", "password": "x"},
                             format="json")

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.client.get("/api/v1/categories/").status_code, 200)

    def test_burning_the_write_scope_leaves_reads_working(self):
        self.with_rates(write="1/min")
        self.login(self.manager)

        self.client.post("/api/v1/categories/", {"name": "First"}, format="json")
        blocked = self.client.post("/api/v1/categories/", {"name": "Second"},
                                   format="json")
        self.assertEqual(blocked.status_code, 429)

        self.assertEqual(self.client.get("/api/v1/categories/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/assets/").status_code, 200)
