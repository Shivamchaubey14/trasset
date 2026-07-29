"""
Delta sync, tag lookup and per-device throttling — SRS §12.4 BE-5, BE-6, BE-8
(Day 33).

The shape of the problem: a phone that has been offline needs to catch up
without re-downloading the register, has to learn about rows that went away
while it was gone, and must be able to turn a scanned tag into one asset in one
request.
"""
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.utils import timezone
from rest_framework.throttling import SimpleRateThrottle

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset, AssetRequest
from apps.maintenance.models import MaintenanceRecord
from apps.masters.models import Category, Location
from apps.notifications.models import Notification

from .base import PASSWORD, TrassetAPITestCase

ASSETS_URL = "/api/v1/assets/"


class SyncTestCase(TrassetAPITestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name="Laptops", color="#3BB77E")
        self.location = Location.objects.create(name="Head Office")
        self.login(self.manager)

    def make_asset(self, name="Dell Latitude 5440", **kwargs):
        return Asset.objects.create(
            name=name, category=self.category, location=self.location,
            status=AssetStatus.AVAILABLE, purchase_cost="78000.00", **kwargs
        )

    def rows(self, response):
        return response.json()["data"]["results"]

    def tags(self, response):
        return [row["asset_tag"] for row in self.rows(response)]


class DeltaSyncTests(SyncTestCase):
    """BE-5 — ``?updated_since=`` returns only what changed."""

    def test_only_rows_changed_since_the_checkpoint_come_back(self):
        old = self.make_asset("Old Laptop")
        Asset.objects.filter(pk=old.pk).update(
            updated_at=timezone.now() - timedelta(days=2)
        )
        checkpoint = timezone.now() - timedelta(hours=1)
        fresh = self.make_asset("New Laptop")

        response = self.client.get(ASSETS_URL, {"updated_since": checkpoint.isoformat()})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.tags(response), [fresh.asset_tag])

    def test_an_unchanged_register_syncs_to_nothing(self):
        """The common case, and the one that has to be cheap: a phone that
        catches up and finds no news."""
        self.make_asset()
        response = self.client.get(
            ASSETS_URL, {"updated_since": (timezone.now() + timedelta(minutes=1)).isoformat()}
        )

        self.assertEqual(response.json()["data"]["count"], 0)

    def test_an_edited_row_reappears_in_the_next_delta(self):
        asset = self.make_asset()
        checkpoint = timezone.now()
        self.client.patch(f"{ASSETS_URL}{asset.pk}/", {"name": "Renamed"}, format="json")

        response = self.client.get(ASSETS_URL, {"updated_since": checkpoint.isoformat()})

        self.assertEqual(self.tags(response), [asset.asset_tag])
        self.assertEqual(self.rows(response)[0]["name"], "Renamed")

    def test_deleted_rows_are_included_so_a_client_can_drop_them(self):
        """Without this a disposed asset stays on the phone for ever — the
        client is never told it went away."""
        asset = self.make_asset()
        checkpoint = timezone.now()
        self.login(self.admin)
        self.assertEqual(
            self.client.delete(f"{ASSETS_URL}{asset.pk}/").status_code, 200
        )

        response = self.client.get(ASSETS_URL, {"updated_since": checkpoint.isoformat()})

        rows = self.rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["asset_tag"], asset.asset_tag)
        self.assertTrue(rows[0]["is_deleted"])

    def test_a_normal_list_still_hides_deleted_rows(self):
        asset = self.make_asset()
        self.login(self.admin)
        self.client.delete(f"{ASSETS_URL}{asset.pk}/")

        response = self.client.get(ASSETS_URL)

        self.assertEqual(response.json()["data"]["count"], 0)

    def test_a_deleted_asset_stays_unreachable_on_the_detail_route(self):
        """The parameter must not become a way round the Day 28 guarantee that
        a soft-deleted asset cannot be read."""
        asset = self.make_asset()
        self.login(self.admin)
        self.client.delete(f"{ASSETS_URL}{asset.pk}/")

        response = self.client.get(
            f"{ASSETS_URL}{asset.pk}/", {"updated_since": "2020-01-01"}
        )

        self.assertEqual(response.status_code, 404)

    def test_results_come_back_oldest_change_first(self):
        """The client checkpoints on the last row it saw, so the order has to
        be the one the checkpoint is taken from."""
        first = self.make_asset("First")
        second = self.make_asset("Second")
        Asset.objects.filter(pk=first.pk).update(
            updated_at=timezone.now() - timedelta(minutes=10)
        )
        Asset.objects.filter(pk=second.pk).update(
            updated_at=timezone.now() - timedelta(minutes=5)
        )

        response = self.client.get(ASSETS_URL, {"updated_since": "2020-01-01"})

        self.assertEqual(self.tags(response), [first.asset_tag, second.asset_tag])

    def test_the_ordering_overrides_a_client_supplied_sort(self):
        """A delta is not a browsable list; a stable checkpoint matters more
        than the caller's preferred column."""
        first = self.make_asset("Alpha")
        second = self.make_asset("Beta")
        Asset.objects.filter(pk=first.pk).update(
            updated_at=timezone.now() - timedelta(minutes=10)
        )

        response = self.client.get(
            ASSETS_URL, {"updated_since": "2020-01-01", "ordering": "-name"}
        )

        self.assertEqual(self.tags(response), [first.asset_tag, second.asset_tag])

    def test_the_comparison_is_inclusive(self):
        """`>=` repeats the boundary row, which a client applying changes by id
        absorbs harmlessly. `>` would silently drop a change written in the
        same microsecond as the checkpoint."""
        asset = self.make_asset()
        asset.refresh_from_db()

        response = self.client.get(
            ASSETS_URL, {"updated_since": asset.updated_at.isoformat()}
        )

        self.assertEqual(self.tags(response), [asset.asset_tag])

    def test_a_plain_date_is_accepted(self):
        self.make_asset()
        yesterday = (timezone.now() - timedelta(days=1)).date().isoformat()

        response = self.client.get(ASSETS_URL, {"updated_since": yesterday})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["count"], 1)

    def test_nonsense_is_rejected_with_a_usable_message(self):
        response = self.client.get(ASSETS_URL, {"updated_since": "last tuesday"})

        self.assertEqual(response.status_code, 400)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("updated_since", body["errors"])
        self.assertIn("ISO-8601", str(body["errors"]["updated_since"]))

    def test_an_empty_value_is_ignored_rather_than_rejected(self):
        self.make_asset()
        response = self.client.get(ASSETS_URL, {"updated_since": ""})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["count"], 1)

    def test_filters_still_apply_alongside_the_delta(self):
        available = self.make_asset("Available One")
        assigned = self.make_asset("Assigned One")
        Asset.objects.filter(pk=assigned.pk).update(status=AssetStatus.ASSIGNED)

        response = self.client.get(
            ASSETS_URL, {"updated_since": "2020-01-01", "status": "available"}
        )

        self.assertEqual(self.tags(response), [available.asset_tag])


class DeltaSyncOtherEndpointsTests(SyncTestCase):
    """BE-5 covers four lists, not just assets."""

    def test_requests_support_a_delta(self):
        self.login(self.employee)
        checkpoint = timezone.now()
        AssetRequest.objects.create(requester=self.employee, category=self.category,
                                    reason="Need a laptop")

        response = self.client.get("/api/v1/asset-requests/",
                                   {"updated_since": checkpoint.isoformat()})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json()["data"]["count"], 1)

    def test_maintenance_supports_a_delta(self):
        asset = self.make_asset()
        checkpoint = timezone.now()
        MaintenanceRecord.objects.create(
            asset=asset, type="repair", scheduled_date=timezone.now().date(),
        )

        response = self.client.get("/api/v1/maintenance/",
                                   {"updated_since": checkpoint.isoformat()})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.json()["data"]["count"], 1)

    def test_notifications_support_a_delta_and_expose_the_checkpoint(self):
        checkpoint = timezone.now()
        Notification.objects.create(
            user=self.manager, type="asset_assigned",
            title="Asset assigned", message="TRA-2026-000001 is yours",
        )

        response = self.client.get("/api/v1/notifications/",
                                   {"updated_since": checkpoint.isoformat()})

        self.assertEqual(response.status_code, 200, response.data)
        rows = response.json()["data"]["results"]
        self.assertEqual(len(rows), 1)
        self.assertIn("updated_at", rows[0])

    def test_a_delta_on_requests_stays_scoped_to_the_caller(self):
        """Visibility rules outrank the sync parameter."""
        AssetRequest.objects.create(requester=self.head, category=self.category,
                                    reason="Theirs")
        self.login(self.employee)

        response = self.client.get("/api/v1/asset-requests/",
                                   {"updated_since": "2020-01-01"})

        self.assertEqual(response.json()["data"]["count"], 0)


class TagLookupTests(SyncTestCase):
    """BE-6 — a scan resolves in one call."""

    def url(self, tag):
        return f"{ASSETS_URL}by-tag/{tag}/"

    def test_a_tag_resolves_to_one_asset(self):
        asset = self.make_asset()

        response = self.client.get(self.url(asset.asset_tag))

        self.assertEqual(response.status_code, 200, response.data)
        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["id"], asset.pk)
        self.assertEqual(body["data"]["asset_tag"], asset.asset_tag)

    def test_the_result_is_a_single_object_not_a_page(self):
        """The point of the endpoint: no results array to pick from."""
        asset = self.make_asset()

        data = self.client.get(self.url(asset.asset_tag)).json()["data"]

        self.assertNotIn("results", data)

    def test_the_lookup_is_case_insensitive(self):
        asset = self.make_asset()

        response = self.client.get(self.url(asset.asset_tag.lower()))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["asset_tag"], asset.asset_tag)

    def test_an_unknown_tag_is_404_and_says_so(self):
        response = self.client.get(self.url("TRA-2026-999999"))

        self.assertEqual(response.status_code, 404)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("TRA-2026-999999", str(body["errors"]))

    def test_a_deleted_asset_cannot_be_scanned_back_into_view(self):
        asset = self.make_asset()
        self.login(self.admin)
        self.client.delete(f"{ASSETS_URL}{asset.pk}/")

        response = self.client.get(self.url(asset.asset_tag))

        self.assertEqual(response.status_code, 404)

    def test_the_detail_shape_comes_back(self):
        """Scanning is how the app opens an asset, so it needs the same body
        the detail route serves."""
        asset = self.make_asset()

        data = self.client.get(self.url(asset.asset_tag)).json()["data"]

        for field in ("category", "location", "attachments", "current_value"):
            self.assertIn(field, data)

    def test_every_role_may_resolve_a_tag(self):
        asset = self.make_asset()
        for slug, user in self.users.items():
            with self.subTest(role=slug):
                self.login(user)
                self.assertEqual(
                    self.client.get(self.url(asset.asset_tag)).status_code, 200
                )

    def test_anonymous_callers_cannot(self):
        asset = self.make_asset()
        self.logout()

        self.assertEqual(self.client.get(self.url(asset.asset_tag)).status_code, 401)


class DeviceThrottleTests(TrassetAPITestCase):
    """
    BE-8 — one device's burst must not spend another's budget.

    Rates are patched rather than overridden in settings for the reason given
    at the top of ``test_throttling.py``: DRF binds them at import time.
    """

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        patcher = patch.dict(
            SimpleRateThrottle.THROTTLE_RATES,
            {"auth": None, "write": "2/min", "export": None, "user": None, "anon": None},
            clear=True,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def token_for(self, user, client=None):
        headers = {"HTTP_X_CLIENT": client} if client else {}
        response = self.client.post(
            "/api/v1/auth/login/", {"email": user.email, "password": PASSWORD},
            format="json", **headers,
        )
        return response.json()["data"]["access"]

    def create_category(self, token, name):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return self.client.post(
            "/api/v1/categories/", {"name": name, "color": "#3BB77E"}, format="json"
        )

    def test_one_device_still_gets_throttled(self):
        token = self.token_for(self.admin)

        self.assertEqual(self.create_category(token, "One").status_code, 201)
        self.assertEqual(self.create_category(token, "Two").status_code, 201)
        self.assertEqual(self.create_category(token, "Three").status_code, 429)

    def test_a_second_device_has_its_own_budget(self):
        """The phone draining its queue must not lock the same person out of
        the browser session they are sitting in front of."""
        phone = self.token_for(self.admin, client="mobile")
        browser = self.token_for(self.admin)

        self.create_category(phone, "One")
        self.create_category(phone, "Two")
        self.assertEqual(self.create_category(phone, "Three").status_code, 429)

        self.assertEqual(self.create_category(browser, "Four").status_code, 201)

    def test_the_sign_in_limit_is_not_split_per_device(self):
        """An anonymous caller has no device identity, so nothing it sends can
        buy it extra sign-in attempts (SEC-7)."""
        with patch.dict(SimpleRateThrottle.THROTTLE_RATES,
                        {"auth": "2/min", "write": None, "export": None,
                         "user": None, "anon": None}, clear=True):
            self.logout()
            attempts = [
                self.client.post(
                    "/api/v1/auth/login/",
                    {"email": self.employee.email, "password": "wrong"},
                    format="json", HTTP_X_CLIENT=f"device-{i}",
                ).status_code
                for i in range(3)
            ]

        self.assertEqual(attempts[-1], 429)
