"""Dashboard statistics — FR-11.1, FR-11.2."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.masters.models import Category

from .base import TrassetAPITestCase


class DashboardStatsTests(TrassetAPITestCase):
    url = "/api/v1/dashboard/stats/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.laptops = Category.objects.create(name="Laptops", color="#3BB77E")
        cls.chairs = Category.objects.create(name="Furniture", color="#7B8794")

        today = date.today()

        # 3 available laptops, 2 assigned, 1 under maintenance, 1 retired.
        for index in range(3):
            Asset.objects.create(
                name=f"Laptop {index}", category=cls.laptops,
                status=AssetStatus.AVAILABLE,
                purchase_date=today - timedelta(days=200),
                purchase_cost=Decimal("100000.00"),
                salvage_value=Decimal("10000.00"),
                useful_life_years=5,
            )
        for index in range(2):
            Asset.objects.create(
                name=f"Assigned laptop {index}", category=cls.laptops,
                status=AssetStatus.ASSIGNED, assigned_to=cls.employee,
                purchase_date=today - timedelta(days=100),
                purchase_cost=Decimal("50000.00"),
                useful_life_years=5,
            )
        Asset.objects.create(
            name="Broken chair", category=cls.chairs,
            status=AssetStatus.UNDER_MAINTENANCE,
            purchase_date=today - timedelta(days=30),
            purchase_cost=Decimal("20000.00"), useful_life_years=5,
        )
        Asset.objects.create(
            name="Old chair", category=cls.chairs,
            status=AssetStatus.RETIRED,
            purchase_date=today - timedelta(days=1000),
            purchase_cost=Decimal("15000.00"), useful_life_years=5,
        )

        # Warranty inside the 30-day window, and one already expired.
        cls.expiring = Asset.objects.create(
            name="Expiring monitor", category=cls.laptops,
            status=AssetStatus.AVAILABLE,
            warranty_expiry=today + timedelta(days=10),
            purchase_cost=Decimal("30000.00"), useful_life_years=5,
            purchase_date=today - timedelta(days=400),
        )
        Asset.objects.create(
            name="Lapsed monitor", category=cls.laptops,
            status=AssetStatus.AVAILABLE,
            warranty_expiry=today - timedelta(days=10),
            purchase_cost=Decimal("30000.00"), useful_life_years=5,
            purchase_date=today - timedelta(days=500),
        )

    def get_stats(self, user):
        self.login(user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]

    # -- access ------------------------------------------------------------
    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_every_role_can_read_the_dashboard(self):
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    # -- KPIs --------------------------------------------------------------
    def test_kpi_counts(self):
        kpis = self.get_stats(self.manager)["kpis"]
        self.assertEqual(kpis["total_assets"], 9)
        self.assertEqual(kpis["available"], 5)   # 3 laptops + 2 monitors
        self.assertEqual(kpis["assigned"], 2)
        self.assertEqual(kpis["under_maintenance"], 1)
        self.assertEqual(kpis["retired"], 1)

    def test_status_counts_reconcile_with_the_total(self):
        """FR-11.1 / SRS §11.4 — the tiles must add up to the register."""
        data = self.get_stats(self.manager)
        total = sum(row["count"] for row in data["by_status"])
        self.assertEqual(total, data["kpis"]["total_assets"])

    def test_soft_deleted_assets_are_excluded(self):
        asset = Asset.objects.filter(status=AssetStatus.AVAILABLE).first()
        asset.delete()

        kpis = self.get_stats(self.manager)["kpis"]
        self.assertEqual(kpis["total_assets"], 8)
        self.assertEqual(kpis["available"], 4)

    def test_book_value_is_below_purchase_value(self):
        kpis = self.get_stats(self.manager)["kpis"]
        self.assertLess(Decimal(kpis["total_value"]), Decimal(kpis["total_purchase_value"]))
        self.assertEqual(
            Decimal(kpis["accumulated_depreciation"]),
            Decimal(kpis["total_purchase_value"]) - Decimal(kpis["total_value"]),
        )

    def test_warranty_windows(self):
        """FR-7.3 — expiring counts the next 30 days, expired is separate."""
        kpis = self.get_stats(self.manager)["kpis"]
        self.assertEqual(kpis["expiring_warranties"], 1)
        self.assertEqual(kpis["expired_warranties"], 1)

    def test_retired_assets_are_not_chased_for_warranty(self):
        Asset.objects.create(
            name="Retired but under warranty", category=self.chairs,
            status=AssetStatus.RETIRED,
            warranty_expiry=date.today() + timedelta(days=5),
            purchase_cost=Decimal("1000.00"), useful_life_years=5,
        )
        kpis = self.get_stats(self.manager)["kpis"]
        self.assertEqual(kpis["expiring_warranties"], 1)

    # -- chart datasets ----------------------------------------------------
    def test_by_status_lists_every_status_including_zeroes(self):
        rows = self.get_stats(self.manager)["by_status"]
        self.assertEqual(len(rows), len(AssetStatus.choices))
        disposed = next(r for r in rows if r["status"] == AssetStatus.DISPOSED)
        self.assertEqual(disposed["count"], 0)

    def test_by_status_carries_the_brand_colour(self):
        rows = self.get_stats(self.manager)["by_status"]
        available = next(r for r in rows if r["status"] == AssetStatus.AVAILABLE)
        self.assertEqual(available["color"], "#3BB77E")

    def test_by_category_skips_empty_categories_and_sorts_by_count(self):
        Category.objects.create(name="Unused")
        rows = self.get_stats(self.manager)["by_category"]
        names = [row["name"] for row in rows]
        self.assertNotIn("Unused", names)
        self.assertEqual(names[0], "Laptops")  # 7 assets vs 2

    def test_value_over_time_is_twelve_months_and_never_decreases(self):
        rows = self.get_stats(self.manager)["value_over_time"]
        self.assertEqual(len(rows), 12)
        values = [Decimal(row["value"]) for row in rows]
        for previous, current in zip(values, values[1:]):
            self.assertGreaterEqual(current, previous)

    def test_assets_added_is_twelve_months(self):
        rows = self.get_stats(self.manager)["assets_added"]
        self.assertEqual(len(rows), 12)
        self.assertTrue(all("label" in row and "count" in row for row in rows))

    def test_expiring_soon_lists_the_asset_with_days_remaining(self):
        rows = self.get_stats(self.manager)["expiring_soon"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["asset_tag"], self.expiring.asset_tag)
        self.assertEqual(rows[0]["days_remaining"], 10)

    def test_recent_assets_are_newest_first(self):
        rows = self.get_stats(self.manager)["recent_assets"]
        self.assertTrue(rows)
        timestamps = [row["created_at"] for row in rows]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

    def test_response_uses_the_standard_envelope(self):
        self.login(self.employee)
        response = self.client.get(self.url)
        body = self.assertEnvelope(response)
        self.assertEqual(body["message"], "Dashboard statistics retrieved successfully")
