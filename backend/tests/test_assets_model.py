"""Asset model behaviour — FR-3.2, FR-3.3, FR-3.4, FR-8.1."""
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.assets.constants import AssetStatus, DepreciationMethod
from apps.assets.models import Asset
from apps.assets.services.tagging import format_tag, next_asset_tag
from apps.masters.models import Category


class AssetTagTests(TestCase):
    """FR-3.2 — sequential TRA-YYYY-000001 tags."""

    def setUp(self):
        self.category = Category.objects.create(name="Laptops")

    def _asset(self, **kwargs):
        defaults = {"name": "Test Asset", "category": self.category}
        return Asset.objects.create(**{**defaults, **kwargs})

    def test_tag_is_generated_when_not_supplied(self):
        asset = self._asset(purchase_date=date(2026, 3, 1))
        self.assertEqual(asset.asset_tag, "TRA-2026-000001")

    def test_tags_increment_within_a_year(self):
        tags = [self._asset(purchase_date=date(2026, 3, 1)).asset_tag for _ in range(3)]
        self.assertEqual(tags, ["TRA-2026-000001", "TRA-2026-000002", "TRA-2026-000003"])

    def test_sequence_restarts_each_year(self):
        first = self._asset(purchase_date=date(2026, 5, 1))
        second = self._asset(purchase_date=date(2027, 5, 1))
        self.assertEqual(first.asset_tag, "TRA-2026-000001")
        self.assertEqual(second.asset_tag, "TRA-2027-000001")

    def test_supplied_tag_is_respected(self):
        asset = self._asset(asset_tag="LEGACY-0007")
        self.assertEqual(asset.asset_tag, "LEGACY-0007")

    def test_tags_are_unique(self):
        tags = {next_asset_tag(2026) for _ in range(25)}
        self.assertEqual(len(tags), 25)

    def test_tag_format_is_zero_padded_to_six(self):
        self.assertEqual(format_tag(2026, 42, "TRA"), "TRA-2026-000042")


class AssetValuationTests(TestCase):
    """FR-8.1 — current_value is recomputed on save."""

    def setUp(self):
        self.category = Category.objects.create(name="Laptops")

    def test_current_value_is_computed_on_create(self):
        asset = Asset.objects.create(
            name="Dell Latitude 5440",
            category=self.category,
            purchase_date=date.today() - timedelta(days=365),
            purchase_cost=Decimal("100000.00"),
            salvage_value=Decimal("20000.00"),
            useful_life_years=4,
            depreciation_method=DepreciationMethod.STRAIGHT_LINE,
        )
        self.assertAlmostEqual(asset.current_value, Decimal("80000"), delta=Decimal("50"))

    def test_current_value_updates_when_cost_changes(self):
        asset = Asset.objects.create(
            name="Monitor", category=self.category,
            purchase_date=date.today(), purchase_cost=Decimal("10000.00"),
            useful_life_years=5,
        )
        asset.purchase_cost = Decimal("20000.00")
        asset.save()
        self.assertEqual(asset.current_value, Decimal("20000.00"))

    def test_accumulated_depreciation_matches_cost_minus_value(self):
        asset = Asset.objects.create(
            name="Van", category=self.category,
            purchase_date=date.today() - timedelta(days=730),
            purchase_cost=Decimal("500000.00"), salvage_value=Decimal("50000.00"),
            useful_life_years=10,
        )
        self.assertEqual(
            asset.accumulated_depreciation, asset.purchase_cost - asset.current_value
        )

    def test_schedule_is_exposed_per_asset(self):
        asset = Asset.objects.create(
            name="Laptop", category=self.category,
            purchase_date=date(2026, 1, 1), purchase_cost=Decimal("80000.00"),
            salvage_value=Decimal("8000.00"), useful_life_years=4,
        )
        schedule = asset.depreciation_schedule()
        self.assertEqual(len(schedule), 4)
        self.assertEqual(schedule[0]["year"], 2026)


class AssetStateTests(TestCase):
    """FR-3.3, FR-4.5 — status guards from the state machine (SRS §11.2)."""

    def setUp(self):
        self.category = Category.objects.create(name="Laptops")
        self.asset = Asset.objects.create(name="Laptop", category=self.category)

    def test_default_status_is_available(self):
        self.assertEqual(self.asset.status, AssetStatus.AVAILABLE)
        self.assertTrue(self.asset.can_be_assigned)

    def test_assigned_asset_cannot_be_assigned_again(self):
        self.asset.status = AssetStatus.ASSIGNED
        self.assertFalse(self.asset.can_be_assigned)

    def test_terminal_statuses_block_assignment_and_maintenance(self):
        for status in (AssetStatus.RETIRED, AssetStatus.LOST, AssetStatus.DISPOSED):
            with self.subTest(status=status):
                self.asset.status = status
                self.assertTrue(self.asset.is_terminal)
                self.assertFalse(self.asset.can_be_assigned)
                self.assertFalse(self.asset.can_be_maintained)

    def test_assigned_asset_can_still_go_to_maintenance(self):
        self.asset.status = AssetStatus.ASSIGNED
        self.assertTrue(self.asset.can_be_maintained)

    def test_status_colour_matches_the_brand_palette(self):
        self.assertEqual(self.asset.status_color, "#3BB77E")
        self.asset.status = AssetStatus.UNDER_MAINTENANCE
        self.assertEqual(self.asset.status_color, "#FDC040")


class AssetSoftDeleteTests(TestCase):
    """FR-3.4 — deleting keeps the row so history survives."""

    def setUp(self):
        self.category = Category.objects.create(name="Laptops")
        self.asset = Asset.objects.create(name="Laptop", category=self.category)

    def test_delete_marks_the_row_instead_of_removing_it(self):
        self.asset.delete()
        self.assertFalse(Asset.objects.filter(pk=self.asset.pk).exists())
        self.assertTrue(Asset.all_objects.filter(pk=self.asset.pk).exists())

        self.asset.refresh_from_db()
        self.assertTrue(self.asset.is_deleted)
        self.assertIsNotNone(self.asset.deleted_at)

    def test_restore_brings_it_back(self):
        self.asset.delete()
        self.asset.restore()
        self.assertTrue(Asset.objects.filter(pk=self.asset.pk).exists())

    def test_hard_delete_really_removes_it(self):
        pk = self.asset.pk
        self.asset.hard_delete()
        self.assertFalse(Asset.all_objects.filter(pk=pk).exists())


class WarrantyTests(TestCase):
    """FR-7.3 — flag warranties expiring within 30 days."""

    def setUp(self):
        self.category = Category.objects.create(name="Laptops")

    def _asset_expiring_in(self, days):
        return Asset.objects.create(
            name="Laptop", category=self.category,
            warranty_expiry=timezone.now().date() + timedelta(days=days),
        )

    def test_expiring_within_thirty_days_is_flagged(self):
        self.assertTrue(self._asset_expiring_in(15).warranty_expiring_soon)

    def test_expiring_beyond_thirty_days_is_not_flagged(self):
        self.assertFalse(self._asset_expiring_in(60).warranty_expiring_soon)

    def test_already_expired_is_reported_separately(self):
        asset = self._asset_expiring_in(-5)
        self.assertTrue(asset.warranty_expired)
        self.assertFalse(asset.warranty_expiring_soon)

    def test_no_warranty_date_means_no_flags(self):
        asset = Asset.objects.create(name="Chair", category=self.category)
        self.assertIsNone(asset.warranty_days_remaining)
        self.assertFalse(asset.warranty_expiring_soon)
        self.assertFalse(asset.warranty_expired)
