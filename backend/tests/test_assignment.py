"""Assignment state machine — FR-4.1 to FR-4.5, SRS §11.2 and §11.4."""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.assets.constants import AssetStatus, AssignmentAction
from apps.assets.models import Asset, AssetAssignment
from apps.assets.services import assignment as service
from apps.masters.models import Category, Location
from common.exceptions import Conflict

from .base import TrassetAPITestCase


class AssignmentApiTests(TrassetAPITestCase):
    url = "/api/v1/assets/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.office = Location.objects.create(name="Head Office")
        cls.store = Location.objects.create(name="Store Room")

    def make_asset(self, **kwargs):
        defaults = {
            "name": "Laptop",
            "category": self.category,
            "location": self.office,
            "purchase_cost": Decimal("80000.00"),
            "useful_life_years": 4,
            "purchase_date": date.today() - timedelta(days=200),
        }
        return Asset.objects.create(**{**defaults, **kwargs})

    # -- assign ------------------------------------------------------------
    def test_assign_sets_status_and_holder(self):
        """FR-4.1"""
        asset = self.make_asset()
        self.login(self.manager)

        response = self.client.post(
            f"{self.url}{asset.id}/assign/",
            {"user_id": self.employee.id, "notes": "Issued for onboarding"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

        data = response.json()["data"]
        self.assertEqual(data["status"], AssetStatus.ASSIGNED)
        self.assertEqual(data["assigned_to"]["id"], self.employee.id)
        self.assertIsNotNone(data["assigned_at"])

    def test_assign_writes_history(self):
        """FR-4.3 — actor, target, timestamp and notes are recorded."""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(
            f"{self.url}{asset.id}/assign/",
            {"user_id": self.employee.id, "notes": "Issued for onboarding"},
            format="json",
        )

        row = AssetAssignment.objects.get(asset=asset)
        self.assertEqual(row.action, AssignmentAction.CHECKOUT)
        self.assertEqual(row.user, self.employee)
        self.assertEqual(row.assigned_by, self.manager)
        self.assertEqual(row.notes, "Issued for onboarding")

    def test_assigning_an_assigned_asset_is_409(self):
        """SRS §11.4 — assigning an already-assigned asset returns 409 Conflict."""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        response = self.client.post(f"{self.url}{asset.id}/assign/",
                                    {"user_id": self.head.id}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEnvelope(response, success=False)
        self.assertIn("already assigned", response.json()["message"])

    def test_cannot_assign_an_asset_under_maintenance(self):
        """FR-4.5"""
        asset = self.make_asset(status=AssetStatus.UNDER_MAINTENANCE)
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/assign/",
                                    {"user_id": self.employee.id}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_cannot_assign_a_retired_asset(self):
        asset = self.make_asset(status=AssetStatus.RETIRED)
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/assign/",
                                    {"user_id": self.employee.id}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_cannot_assign_to_a_deactivated_user(self):
        self.employee.is_active = False
        self.employee.save(update_fields=["is_active"])

        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/assign/",
                                    {"user_id": self.employee.id}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unknown_user_is_rejected(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/assign/",
                                    {"user_id": 999999}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_employees_cannot_assign(self):
        asset = self.make_asset()
        for user in (self.employee, self.auditor, self.head):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(f"{self.url}{asset.id}/assign/",
                                            {"user_id": self.employee.id}, format="json")
                self.assertEqual(response.status_code, 403)

    # -- check-in ----------------------------------------------------------
    def test_checkin_returns_asset_to_pool(self):
        """FR-4.2"""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        response = self.client.post(f"{self.url}{asset.id}/checkin/",
                                    {"notes": "Returned"}, format="json")
        self.assertEqual(response.status_code, 200)

        data = response.json()["data"]
        self.assertEqual(data["status"], AssetStatus.AVAILABLE)
        self.assertIsNone(data["assigned_to"])
        self.assertIsNone(data["assigned_at"])

    def test_checkin_can_move_the_location(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        self.client.post(
            f"{self.url}{asset.id}/checkin/",
            {"location_id": self.store.id}, format="json",
        )
        asset.refresh_from_db()
        self.assertEqual(asset.location, self.store)

    def test_checkin_records_days_held(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        # Pretend the check-out happened a week ago.
        asset.refresh_from_db()
        Asset.objects.filter(pk=asset.pk).update(
            assigned_at=timezone.now() - timedelta(days=7)
        )

        self.client.post(f"{self.url}{asset.id}/checkin/", {}, format="json")
        row = AssetAssignment.objects.filter(
            asset=asset, action=AssignmentAction.CHECKIN
        ).first()
        self.assertEqual(row.days_held, 7)

    def test_checking_in_an_available_asset_is_409(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/checkin/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    # -- retire ------------------------------------------------------------
    def test_retire_moves_to_terminal_status(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{asset.id}/retire/",
            {"status": AssetStatus.DISPOSED, "notes": "E-waste collected"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], AssetStatus.DISPOSED)

    def test_retiring_an_assigned_asset_closes_the_assignment(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        self.client.post(f"{self.url}{asset.id}/retire/", {}, format="json")

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.RETIRED)
        self.assertIsNone(asset.assigned_to)
        self.assertTrue(
            AssetAssignment.objects.filter(
                asset=asset, action=AssignmentAction.CHECKIN
            ).exists()
        )

    def test_retiring_twice_is_409(self):
        asset = self.make_asset(status=AssetStatus.RETIRED)
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset.id}/retire/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_retire_rejects_a_non_terminal_status(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{asset.id}/retire/",
            {"status": AssetStatus.AVAILABLE}, format="json",
        )
        self.assertEqual(response.status_code, 400)

    # -- history -----------------------------------------------------------
    def test_history_is_newest_first(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")
        self.client.post(f"{self.url}{asset.id}/checkin/", {}, format="json")

        rows = self.client.get(f"{self.url}{asset.id}/history/").json()["data"]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["action"], AssignmentAction.CHECKIN)
        self.assertEqual(rows[1]["action"], AssignmentAction.CHECKOUT)

    def test_history_is_readable_by_every_role(self):
        asset = self.make_asset()
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(
                    self.client.get(f"{self.url}{asset.id}/history/").status_code, 200
                )


class AssignmentImmutabilityTests(TrassetAPITestCase):
    """FR-4.3 — history rows can never be edited or removed."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")

    def make_row(self):
        asset = Asset.objects.create(name="Laptop", category=self.category)
        service.assign(asset, user=self.employee, actor=self.manager)
        return AssetAssignment.objects.get(asset=asset)

    def test_editing_a_history_row_raises(self):
        row = self.make_row()
        row.notes = "tampered"
        with self.assertRaises(ValueError):
            row.save()

    def test_deleting_a_history_row_raises(self):
        row = self.make_row()
        with self.assertRaises(ValueError):
            row.delete()


class AssignmentServiceTests(TrassetAPITestCase):
    """Direct service-level checks for cases the API can't easily produce."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")

    def test_checkin_repairs_an_orphaned_assigned_status(self):
        """
        Status says Assigned but nobody holds it — the service resets the asset
        and reports the correction rather than leaving bad data in place.
        """
        asset = Asset.objects.create(
            name="Orphan", category=self.category, status=AssetStatus.ASSIGNED
        )
        with self.assertRaises(Conflict):
            service.checkin(asset, actor=self.manager)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)

    def test_assign_then_checkin_round_trip(self):
        asset = Asset.objects.create(name="Laptop", category=self.category)

        service.assign(asset, user=self.employee, actor=self.manager)
        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)

        service.checkin(asset, actor=self.manager)
        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)
        self.assertEqual(AssetAssignment.objects.filter(asset=asset).count(), 2)
