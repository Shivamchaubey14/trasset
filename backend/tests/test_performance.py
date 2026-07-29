"""
Query-count guards — NFR-1, build plan Day 12.

The invariant these tests protect is simple: **the number of queries a list
endpoint runs must not depend on how many rows it returns.** That is what
separates a join from an N+1, and it is the thing that silently regresses when
someone adds a nested field to a serializer without touching the queryset.

Asserting an exact number would break on unrelated changes (an extra auth
lookup, a Django upgrade). Asserting "same count for 1 row as for 20" stays
true regardless, and fails loudly for the case that actually matters.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext

from apps.assets.models import Asset, AssetRequest
from apps.audit.services import suspend
from apps.masters.models import Category, Department, Location, Vendor

from .base import TrassetAPITestCase


class QueryCountTestCase(TrassetAPITestCase):
    """Helper for measuring a list endpoint at two different row counts."""

    def count_queries(self, url, page_size):
        with CaptureQueriesContext(connection) as captured:
            response = self.client.get(url, {"page_size": page_size})
        self.assertEqual(response.status_code, 200, response.content[:400])
        return len(captured.captured_queries)

    def assertFlat(self, url, seed_more, label):
        """
        Measure with a single row, add more rows, measure again.

        ``seed_more`` is a callable that creates additional rows.
        """
        first = self.count_queries(url, page_size=1)
        seed_more()
        second = self.count_queries(url, page_size=50)

        self.assertLessEqual(
            second, first,
            f"{label}: query count grew from {first} (1 row) to {second} "
            f"(many rows) — something in the serializer is not joined. "
            f"Check select_related/prefetch_related on the viewset queryset."
        )


class AssetListQueryTests(QueryCountTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.location = Location.objects.create(name="Head Office")
        cls.department = Department.objects.create(name="IT")
        cls.vendor = Vendor.objects.create(name="Dell India")

    def make_assets(self, count, prefix="Asset"):
        with suspend():
            for index in range(count):
                Asset.objects.create(
                    name=f"{prefix} {index}",
                    category=self.category,
                    location=self.location,
                    department=self.department,
                    vendor=self.vendor,
                    assigned_to=self.employee if index % 2 else None,
                    purchase_cost=Decimal("50000.00"),
                    useful_life_years=4,
                    purchase_date=date.today() - timedelta(days=100),
                )

    def test_asset_list_does_not_grow_with_rows(self):
        self.make_assets(1)
        self.login(self.manager)
        self.assertFlat(
            "/api/v1/assets/",
            lambda: self.make_assets(20, prefix="Extra"),
            "GET /assets/",
        )

    def test_asset_list_joins_every_nested_relation(self):
        """Each nested object the serializer renders must come from the join."""
        self.make_assets(5)
        self.login(self.manager)

        response = self.client.get("/api/v1/assets/", {"page_size": 50})
        row = response.json()["data"]["results"][0]

        # If any of these were lazily loaded the count test above would fail,
        # so this asserts they are actually present rather than silently null.
        self.assertIsNotNone(row["category"]["name"])
        self.assertIsNotNone(row["location"]["name"])
        self.assertIsNotNone(row["department"]["name"])


class AssetRequestListQueryTests(QueryCountTestCase):
    """
    Regression guard for a real N+1.

    ``AssetRequestSerializer`` nests a full ``AssetListSerializer`` for both
    ``asset`` and ``fulfilled_asset``, each of which reaches category, location,
    department and assignee. With only some of those joined the endpoint went
    from 6 queries to 15 as rows grew.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.location = Location.objects.create(name="Head Office")
        cls.department = Department.objects.create(name="IT")

    def make_requests(self, count, prefix="req"):
        with suspend():
            for index in range(count):
                asset = Asset.objects.create(
                    name=f"{prefix} asset {index}",
                    category=self.category,
                    location=self.location,
                    department=self.department,
                    purchase_cost=Decimal("50000.00"),
                    useful_life_years=4,
                )
                AssetRequest.objects.create(
                    requester=self.employee,
                    asset=asset,
                    reason=f"Reason number {index} for wanting this asset.",
                )

    def test_request_list_does_not_grow_with_rows(self):
        self.make_requests(1)
        self.login(self.manager)
        self.assertFlat(
            "/api/v1/asset-requests/",
            lambda: self.make_requests(20, prefix="extra"),
            "GET /asset-requests/",
        )

    def test_nested_asset_is_fully_populated(self):
        self.make_requests(3)
        self.login(self.manager)

        row = self.client.get("/api/v1/asset-requests/",
                              {"page_size": 50}).json()["data"]["results"][0]
        self.assertIsNotNone(row["asset"]["category"]["name"])
        self.assertIsNotNone(row["asset"]["location"]["name"])


class AuditLogListQueryTests(QueryCountTestCase):
    def make_entries(self, count, prefix="Cat"):
        # Real API calls, so the audit rows are written the way they are in life.
        for index in range(count):
            self.client.post("/api/v1/categories/",
                             {"name": f"{prefix} {index}"}, format="json")

    def test_audit_list_does_not_grow_with_rows(self):
        self.login(self.admin)
        self.make_entries(1)

        # The audit endpoint is Admin/Auditor only; measure as the auditor.
        self.login(self.auditor)
        first = self.count_queries("/api/v1/audit-logs/", page_size=1)

        self.login(self.admin)
        self.make_entries(20, prefix="More")

        self.login(self.auditor)
        second = self.count_queries("/api/v1/audit-logs/", page_size=50)

        self.assertLessEqual(
            second, first,
            f"GET /audit-logs/: query count grew from {first} to {second}."
        )


class UserListQueryTests(QueryCountTestCase):
    def make_users(self, count, prefix="user"):
        from apps.accounts.models import User

        department = Department.objects.create(name=f"Dept {prefix}")
        with suspend():
            for index in range(count):
                User.objects.create_user(
                    email=f"{prefix}{index}@test.local",
                    password="Whatever@2026",
                    full_name=f"Person {prefix} {index}",
                    role=self.roles["employee"],
                    department=department,
                )

    def test_user_list_does_not_grow_with_rows(self):
        self.login(self.admin)
        self.assertFlat(
            "/api/v1/users/",
            lambda: self.make_users(20),
            "GET /users/",
        )


class MasterListQueryTests(QueryCountTestCase):
    """The master endpoints annotate counts, which is easy to get wrong."""

    def test_category_list_does_not_grow_with_rows(self):
        Category.objects.create(name="First")
        self.login(self.manager)
        self.assertFlat(
            "/api/v1/categories/",
            lambda: [Category.objects.create(name=f"Cat {i}") for i in range(20)],
            "GET /categories/",
        )

    def test_department_list_does_not_grow_with_rows(self):
        Department.objects.create(name="First")
        self.login(self.manager)
        self.assertFlat(
            "/api/v1/departments/",
            lambda: [Department.objects.create(name=f"Dept {i}") for i in range(20)],
            "GET /departments/",
        )

    def test_vendor_list_does_not_grow_with_rows(self):
        Vendor.objects.create(name="First")
        self.login(self.manager)
        self.assertFlat(
            "/api/v1/vendors/",
            lambda: [Vendor.objects.create(name=f"Vendor {i}") for i in range(20)],
            "GET /vendors/",
        )


class DashboardQueryTests(QueryCountTestCase):
    """NFR-1 — the dashboard is one call, so its cost must be bounded."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")

    def make_assets(self, count):
        with suspend():
            for index in range(count):
                Asset.objects.create(
                    name=f"Asset {index}",
                    category=self.category,
                    purchase_cost=Decimal("50000.00"),
                    useful_life_years=4,
                    purchase_date=date.today() - timedelta(days=30 * index),
                )

    def test_dashboard_cost_is_independent_of_register_size(self):
        self.make_assets(5)
        self.login(self.manager)

        with CaptureQueriesContext(connection) as first:
            self.client.get("/api/v1/dashboard/stats/")

        self.make_assets(40)

        with CaptureQueriesContext(connection) as second:
            self.client.get("/api/v1/dashboard/stats/")

        self.assertEqual(
            len(second.captured_queries), len(first.captured_queries),
            "Dashboard query count changed with the number of assets — it must "
            "be built from aggregates, not per-row work."
        )
