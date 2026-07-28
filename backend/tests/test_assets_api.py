"""Asset CRUD API — FR-3.1 to FR-3.8, plus SRS §11.4 acceptance criteria."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.masters.models import Category, Department, Location, Vendor

from .base import TrassetAPITestCase


class AssetApiTestCase(TrassetAPITestCase):
    """Shared fixtures for the asset endpoints."""

    url = "/api/v1/assets/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.laptops = Category.objects.create(name="Laptops", color="#3BB77E")
        cls.vehicles = Category.objects.create(
            name="Vehicles",
            custom_fields=[
                {"key": "registration_no", "label": "Registration no.",
                 "type": "text", "required": True, "options": []},
            ],
        )
        cls.office = Location.objects.create(name="Head Office", city="Mumbai")
        cls.it = Department.objects.create(name="IT", code="IT")
        cls.dell = Vendor.objects.create(name="Dell India")

    def make_asset(self, **kwargs):
        defaults = {
            "name": "Test Laptop",
            "category": self.laptops,
            "location": self.office,
            "purchase_date": date.today() - timedelta(days=365),
            "purchase_cost": Decimal("80000.00"),
            "salvage_value": Decimal("8000.00"),
            "useful_life_years": 4,
        }
        return Asset.objects.create(**{**defaults, **kwargs})


class AssetCreateTests(AssetApiTestCase):
    def payload(self, **overrides):
        data = {
            "name": "Dell Latitude 5440",
            "category_id": self.laptops.id,
            "serial_number": "SN-DL5440-0091",
            "location_id": self.office.id,
            "department_id": self.it.id,
            "vendor_id": self.dell.id,
            "purchase_date": "2026-01-15",
            "purchase_cost": "78000.00",
            "salvage_value": "8000.00",
            "useful_life_years": 4,
            "depreciation_method": "straight_line",
            "warranty_expiry": "2029-01-15",
            "custom_data": {"ram_gb": 16, "cpu": "i7"},
        }
        data.update(overrides)
        return data

    def test_manager_can_create_and_tag_is_generated(self):
        """SRS §11.4 — creating without a tag auto-generates TRA-YYYY-000001."""
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["asset_tag"], "TRA-2026-000001")
        self.assertEqual(body["data"]["status"], AssetStatus.AVAILABLE)
        self.assertEqual(body["message"], "Asset created successfully")

    def test_current_value_is_computed_on_create(self):
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertNotEqual(response.json()["data"]["current_value"], "78000.00")

    def test_nested_objects_are_returned(self):
        self.login(self.manager)
        data = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertEqual(data["category"]["name"], "Laptops")
        self.assertEqual(data["location"]["name"], "Head Office")
        self.assertEqual(data["vendor"]["name"], "Dell India")

    def test_created_by_is_recorded(self):
        self.login(self.manager)
        data = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertEqual(data["created_by"]["id"], self.manager.id)

    def test_supplied_tag_is_kept(self):
        self.login(self.manager)
        data = self.client.post(
            self.url, self.payload(asset_tag="LEGACY-001"), format="json"
        ).json()["data"]
        self.assertEqual(data["asset_tag"], "LEGACY-001")

    def test_duplicate_tag_is_rejected(self):
        self.make_asset(asset_tag="LEGACY-001")
        self.login(self.manager)
        response = self.client.post(
            self.url, self.payload(asset_tag="LEGACY-001"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("asset_tag", response.json()["errors"])

    def test_duplicate_serial_is_rejected(self):
        self.make_asset(serial_number="SN-DL5440-0091")
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("serial_number", response.json()["errors"])

    def test_salvage_above_cost_is_rejected(self):
        self.login(self.manager)
        response = self.client.post(
            self.url, self.payload(salvage_value="90000.00"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("salvage_value", response.json()["errors"])

    def test_warranty_before_purchase_is_rejected(self):
        self.login(self.manager)
        response = self.client.post(
            self.url, self.payload(warranty_expiry="2025-01-01"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("warranty_expiry", response.json()["errors"])

    def test_required_custom_field_is_enforced(self):
        """FR-3.8 — a category's required custom fields must be supplied."""
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(category_id=self.vehicles.id, serial_number="", custom_data={}),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("custom_data", response.json()["errors"])

    def test_required_custom_field_satisfied_passes(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(
                category_id=self.vehicles.id,
                serial_number="",
                custom_data={"registration_no": "MH01AB1234"},
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_cannot_create_directly_as_assigned(self):
        self.login(self.manager)
        response = self.client.post(
            self.url, self.payload(status=AssetStatus.ASSIGNED), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.json()["errors"])

    def test_non_managers_cannot_create(self):
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(self.url, self.payload(), format="json")
                self.assertEqual(response.status_code, 403)


class AssetListTests(AssetApiTestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for index in range(5):
            Asset.objects.create(
                name=f"Laptop {index}", category=cls.laptops, location=cls.office,
                purchase_cost=Decimal("50000.00"), useful_life_years=4,
                purchase_date=date.today() - timedelta(days=100),
            )
        Asset.objects.create(
            name="Van", category=cls.vehicles, status=AssetStatus.UNDER_MAINTENANCE,
            purchase_cost=Decimal("600000.00"), useful_life_years=8,
            serial_number="VAN-9911",
            purchase_date=date.today() - timedelta(days=500),
        )
        Asset.objects.create(
            name="Expiring laptop", category=cls.laptops,
            warranty_expiry=date.today() + timedelta(days=12),
            purchase_cost=Decimal("40000.00"), useful_life_years=4,
        )

    def test_all_roles_can_list(self):
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_pagination_defaults_to_25(self):
        self.login(self.employee)
        data = self.client.get(self.url).json()["data"]
        self.assertEqual(data["count"], 7)
        self.assertEqual(data["page_size"], 25)

    def test_filter_by_status(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?status=under_maintenance").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_filter_by_category(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?category={self.vehicles.id}").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_filter_by_warranty_expiring(self):
        """FR-7.3 — the 30-day window."""
        self.login(self.employee)
        data = self.client.get(f"{self.url}?warranty=expiring").json()["data"]
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["name"], "Expiring laptop")

    def test_filter_active_only_excludes_terminal(self):
        Asset.objects.create(name="Dead", category=self.laptops,
                             status=AssetStatus.RETIRED)
        self.login(self.employee)
        data = self.client.get(f"{self.url}?active_only=true").json()["data"]
        self.assertEqual(data["count"], 7)

    def test_filter_by_value_band(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?min_value=100000").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_search_by_serial(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?search=VAN-9911").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_search_by_tag(self):
        tag = Asset.objects.first().asset_tag
        self.login(self.employee)
        data = self.client.get(f"{self.url}?search={tag}").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_ordering(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?ordering=-purchase_cost").json()["data"]
        self.assertEqual(data["results"][0]["name"], "Van")

    def test_soft_deleted_assets_are_hidden(self):
        Asset.objects.first().delete()
        self.login(self.employee)
        self.assertEqual(self.client.get(self.url).json()["data"]["count"], 6)

    def test_stats_endpoint_respects_filters(self):
        self.login(self.manager)
        everything = self.client.get(f"{self.url}stats/").json()["data"]
        self.assertEqual(everything["total"], 7)

        filtered = self.client.get(
            f"{self.url}stats/?category={self.vehicles.id}"
        ).json()["data"]
        self.assertEqual(filtered["total"], 1)
        self.assertEqual(filtered["under_maintenance"], 1)

    def test_list_query_count_is_flat(self):
        """NFR-1 — nested masters must not cause a query per row."""
        self.login(self.employee)
        with self.assertNumQueries(4):
            # 1 session/user, 1 count, 1 page, 1 for the auth token check.
            self.client.get(self.url)


class AssetUpdateDeleteTests(AssetApiTestCase):
    def test_manager_can_patch(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.patch(
            f"{self.url}{asset.id}/", {"name": "Renamed"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["name"], "Renamed")

    def test_patching_cost_recomputes_value(self):
        asset = self.make_asset()
        original = asset.current_value
        self.login(self.manager)
        self.client.patch(
            f"{self.url}{asset.id}/", {"purchase_cost": "160000.00"}, format="json"
        )
        asset.refresh_from_db()
        self.assertGreater(asset.current_value, original)

    def test_status_cannot_be_forced_to_assigned(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.patch(
            f"{self.url}{asset.id}/", {"status": AssetStatus.ASSIGNED}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("status", response.json()["errors"])

    def test_status_cannot_be_forced_to_retired(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.patch(
            f"{self.url}{asset.id}/", {"status": AssetStatus.RETIRED}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_only_super_admin_may_delete(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.assertEqual(self.client.delete(f"{self.url}{asset.id}/").status_code, 403)

        self.login(self.admin)
        self.assertEqual(self.client.delete(f"{self.url}{asset.id}/").status_code, 200)

    def test_delete_is_soft(self):
        asset = self.make_asset()
        self.login(self.admin)
        self.client.delete(f"{self.url}{asset.id}/")

        self.assertFalse(Asset.objects.filter(pk=asset.pk).exists())
        self.assertTrue(Asset.all_objects.filter(pk=asset.pk).exists())

    def test_cannot_delete_an_assigned_asset(self):
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        self.login(self.admin)
        response = self.client.delete(f"{self.url}{asset.id}/")
        self.assertEqual(response.status_code, 409)


class AssetExtrasTests(AssetApiTestCase):
    def test_depreciation_schedule(self):
        """FR-8.3 — schedule ends exactly at salvage value."""
        asset = self.make_asset(
            purchase_date=date(2026, 1, 1),
            purchase_cost=Decimal("78000.00"),
            salvage_value=Decimal("8000.00"),
            useful_life_years=4,
        )
        self.login(self.employee)
        data = self.client.get(f"{self.url}{asset.id}/depreciation/").json()["data"]

        self.assertEqual(len(data["schedule"]), 4)
        self.assertEqual(data["schedule"][0]["depreciation"], "17500.00")
        self.assertEqual(data["schedule"][-1]["closing_value"], "8000.00")

    def test_qr_returns_a_png(self):
        """FR-9.1 — the QR endpoint returns an image, not the envelope."""
        asset = self.make_asset()
        self.login(self.employee)
        response = self.client.get(f"{self.url}{asset.id}/qr/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertTrue(response.content.startswith(b"\x89PNG"))

    def test_history_is_empty_for_a_new_asset(self):
        asset = self.make_asset()
        self.login(self.employee)
        data = self.client.get(f"{self.url}{asset.id}/history/").json()["data"]
        self.assertEqual(data, [])
