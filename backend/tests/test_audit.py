"""Audit trail — FR-13.1, FR-13.2, SEC-9."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.audit.constants import AuditAction
from apps.audit.models import AuditLog
from apps.audit.services import suspend
from apps.masters.models import Category, Location

from .base import PASSWORD, TrassetAPITestCase


class AuditCaptureTests(TrassetAPITestCase):
    """FR-13.1 — every create/update/delete/assign leaves a record."""

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
            "purchase_date": date.today() - timedelta(days=100),
        }
        with suspend():
            return Asset.objects.create(**{**defaults, **kwargs})

    def logs_for(self, instance, action=None):
        queryset = AuditLog.objects.filter(
            entity_type=instance._meta.object_name, entity_id=str(instance.pk)
        )
        if action:
            queryset = queryset.filter(action=action)
        return queryset

    def test_creating_an_asset_is_recorded(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"name": "New Laptop", "category_id": self.category.id,
             "purchase_cost": "50000.00", "useful_life_years": 4},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

        asset_id = response.json()["data"]["id"]
        entry = AuditLog.objects.filter(
            entity_type="Asset", entity_id=str(asset_id), action=AuditAction.CREATE
        ).first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.user, self.manager)
        self.assertIn("name", entry.changes)

    def test_updating_records_a_field_diff(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.patch(f"{self.url}{asset.id}/", {"name": "Renamed"}, format="json")

        entry = self.logs_for(asset, AuditAction.UPDATE).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.changes["name"]["from"], "Laptop")
        self.assertEqual(entry.changes["name"]["to"], "Renamed")

    def test_foreign_keys_are_logged_by_name_not_id(self):
        """A trail that says '2 → 4' is useless to an auditor."""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.patch(
            f"{self.url}{asset.id}/", {"location_id": self.store.id}, format="json"
        )

        entry = self.logs_for(asset, AuditAction.UPDATE).first()
        self.assertEqual(entry.changes["location"]["from"], "Head Office")
        self.assertEqual(entry.changes["location"]["to"], "Store Room")

    def test_a_save_that_changes_nothing_writes_no_row(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.patch(f"{self.url}{asset.id}/", {"name": "Laptop"}, format="json")
        self.assertFalse(self.logs_for(asset, AuditAction.UPDATE).exists())

    def test_assign_is_logged_with_its_own_verb(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        entry = self.logs_for(asset, AuditAction.ASSIGN).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.changes["_context"]["assigned_to"], self.employee.full_name)
        # One row for the business action, not one plus a generic update.
        self.assertFalse(self.logs_for(asset, AuditAction.UPDATE).exists())

    def test_checkin_and_retire_are_logged_with_their_own_verbs(self):
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(f"{self.url}{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")
        self.client.post(f"{self.url}{asset.id}/checkin/", {}, format="json")
        self.client.post(f"{self.url}{asset.id}/retire/", {}, format="json")

        self.assertTrue(self.logs_for(asset, AuditAction.CHECKIN).exists())
        self.assertTrue(self.logs_for(asset, AuditAction.RETIRE).exists())

    def test_soft_delete_is_recorded_as_a_deletion(self):
        asset = self.make_asset()
        self.login(self.admin)
        self.client.delete(f"{self.url}{asset.id}/")

        entry = self.logs_for(asset, AuditAction.DELETE).first()
        self.assertIsNotNone(entry)
        self.assertTrue(entry.changes["_context"]["soft_delete"])

    def test_the_actor_and_ip_are_captured(self):
        """SEC-9 — who, and from where."""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.patch(f"{self.url}{asset.id}/", {"name": "Renamed"},
                          format="json", REMOTE_ADDR="203.0.113.9")

        entry = self.logs_for(asset, AuditAction.UPDATE).first()
        self.assertEqual(entry.user, self.manager)
        self.assertEqual(entry.user_display, str(self.manager))
        self.assertEqual(entry.ip_address, "203.0.113.9")
        self.assertIn("/api/v1/assets/", entry.request_path)

    def test_master_data_changes_are_tracked(self):
        self.login(self.admin)
        self.client.post("/api/v1/categories/", {"name": "Monitors"}, format="json")
        self.assertTrue(
            AuditLog.objects.filter(entity_type="Category",
                                    action=AuditAction.CREATE).exists()
        )

    def test_passwords_never_reach_the_trail(self):
        """SEC-1 — the hash must not be logged, even as a diff."""
        self.login(self.admin)
        self.client.post(
            "/api/v1/users/",
            {"full_name": "New Person", "email": "np@test.local",
             "password": "Secret@2026", "role_id": self.roles["employee"].id},
            format="json",
        )
        for entry in AuditLog.objects.filter(entity_type="User"):
            self.assertNotIn("password", entry.changes)
            self.assertNotIn("Secret@2026", str(entry.changes))


class AuditAuthEventTests(TrassetAPITestCase):
    """SEC-9 — sign-in and sign-out are sensitive actions."""

    def test_successful_login_is_recorded(self):
        self.client.post("/api/v1/auth/login/",
                         {"email": self.manager.email, "password": PASSWORD},
                         format="json")
        entry = AuditLog.objects.filter(action=AuditAction.LOGIN).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.user, self.manager)

    def test_failed_login_is_recorded_without_an_actor(self):
        self.client.post("/api/v1/auth/login/",
                         {"email": self.manager.email, "password": "wrong"},
                         format="json")
        entry = AuditLog.objects.filter(action=AuditAction.LOGIN_FAILED).first()
        self.assertIsNotNone(entry)
        self.assertIsNone(entry.user)
        self.assertEqual(entry.entity_label, self.manager.email)

    def test_failed_login_does_not_log_the_attempted_password(self):
        self.client.post("/api/v1/auth/login/",
                         {"email": self.manager.email, "password": "hunter2"},
                         format="json")
        entry = AuditLog.objects.filter(action=AuditAction.LOGIN_FAILED).first()
        self.assertNotIn("hunter2", str(entry.changes))

    def test_password_change_is_recorded(self):
        self.login(self.employee)
        self.client.post(
            "/api/v1/auth/password/change/",
            {"current_password": PASSWORD, "new_password": "BrandNew@2026",
             "confirm_password": "BrandNew@2026"},
            format="json",
        )
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.PASSWORD_CHANGE).exists()
        )


class AuditImmutabilityTests(TrassetAPITestCase):
    """FR-13.2 — the trail cannot be rewritten."""

    def make_entry(self):
        self.login(self.admin)
        self.client.post("/api/v1/categories/", {"name": "Monitors"}, format="json")
        return AuditLog.objects.first()

    def test_editing_an_entry_raises(self):
        entry = self.make_entry()
        entry.action = AuditAction.CREATE
        with self.assertRaises(ValueError):
            entry.save()

    def test_deleting_an_entry_raises(self):
        entry = self.make_entry()
        with self.assertRaises(ValueError):
            entry.delete()


class AuditApiTests(TrassetAPITestCase):
    """FR-13.2 — visible to Admins and Auditors, read-only."""

    url = "/api/v1/audit-logs/"

    def seed(self):
        self.login(self.admin)
        self.client.post("/api/v1/categories/", {"name": "Monitors"}, format="json")
        self.client.post("/api/v1/categories/", {"name": "Printers"}, format="json")
        self.logout()

    def test_admin_and_auditor_can_read(self):
        self.seed()
        for user in (self.admin, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_managers_and_employees_are_forbidden(self):
        self.seed()
        for user in (self.manager, self.head, self.employee):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, 403)
                self.assertEnvelope(response, success=False)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_there_is_no_write_route(self):
        """Read-only viewset: POST/PATCH/DELETE must not be routable."""
        self.seed()
        self.login(self.admin)
        entry = AuditLog.objects.first()

        self.assertEqual(self.client.post(self.url, {}, format="json").status_code, 405)
        self.assertEqual(
            self.client.delete(f"{self.url}{entry.id}/").status_code, 405
        )
        self.assertEqual(
            self.client.patch(f"{self.url}{entry.id}/", {}, format="json").status_code, 405
        )

    def test_filter_by_entity(self):
        self.seed()
        self.login(self.auditor)
        data = self.client.get(f"{self.url}?entity_type=Category").json()["data"]
        self.assertGreaterEqual(data["count"], 2)

    def test_filter_by_action(self):
        self.seed()
        self.login(self.auditor)
        data = self.client.get(f"{self.url}?action=create").json()["data"]
        self.assertTrue(all(row["action"] == "create" for row in data["results"]))

    def test_search_by_entity_label(self):
        self.seed()
        self.login(self.auditor)
        data = self.client.get(f"{self.url}?search=Printers").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_summary_counts(self):
        self.seed()
        self.login(self.auditor)
        response = self.client.get(f"{self.url}summary/")
        self.assertEqual(response.status_code, 200)

        data = response.json()["data"]
        self.assertGreaterEqual(data["total"], 2)
        self.assertGreaterEqual(data["today"], 2)
        self.assertTrue(data["by_action"])

    def test_rows_carry_the_actor_and_a_readable_label(self):
        self.seed()
        self.login(self.auditor)
        row = self.client.get(f"{self.url}?search=Printers").json()["data"]["results"][0]

        self.assertEqual(row["user"]["full_name"], self.admin.full_name)
        self.assertEqual(row["entity_label"], "Printers")
        self.assertEqual(row["action_label"], "Created")
        self.assertEqual(row["action_color"], "#3BB77E")

    def test_newest_first(self):
        self.seed()
        self.login(self.auditor)
        rows = self.client.get(self.url).json()["data"]["results"]
        timestamps = [row["created_at"] for row in rows]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))


class AuditSuspendTests(TrassetAPITestCase):
    """Seeding and migrations must be able to opt out."""

    def test_suspend_writes_nothing(self):
        before = AuditLog.objects.count()
        with suspend():
            Category.objects.create(name="Quiet")
        self.assertEqual(AuditLog.objects.count(), before)

    def test_auditing_resumes_afterwards(self):
        with suspend():
            Category.objects.create(name="Quiet")
        Category.objects.create(name="Loud")
        self.assertTrue(
            AuditLog.objects.filter(entity_label="Loud").exists()
        )
