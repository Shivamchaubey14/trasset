"""RBAC matrix — FR-1.3, SEC-3, SRS §2.3 and §11.4."""
from apps.masters.models import Category

from .base import TrassetAPITestCase


class UserAdministrationPermissionTests(TrassetAPITestCase):
    """FR-2.1 — user management is Super Admin only."""

    url = "/api/v1/users/"

    def test_super_admin_can_list_users(self):
        self.login(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_every_other_role_is_forbidden(self):
        for user in (self.manager, self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, 403)
                self.assertEnvelope(response, success=False)

    def test_super_admin_can_create_a_user(self):
        self.login(self.admin)
        response = self.client.post(
            self.url,
            {
                "full_name": "New Joiner",
                "email": "new.joiner@test.local",
                "password": "Joiner@2026",
                "role_id": self.roles["employee"].id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()["data"]["email"], "new.joiner@test.local")

    def test_creating_a_duplicate_email_is_rejected(self):
        self.login(self.admin)
        response = self.client.post(
            self.url,
            {
                "full_name": "Clone",
                "email": self.employee.email,
                "password": "Clone@2026",
                "role_id": self.roles["employee"].id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["errors"])

    def test_admin_cannot_deactivate_their_own_account(self):
        self.login(self.admin)
        response = self.client.delete(f"{self.url}{self.admin.id}/")
        self.assertEqual(response.status_code, 422)

    def test_delete_deactivates_rather_than_removes(self):
        self.login(self.admin)
        response = self.client.delete(f"{self.url}{self.employee.id}/")
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)


class MasterDataPermissionTests(TrassetAPITestCase):
    """FR-5.x — everyone reads masters, only managers write."""

    url = "/api/v1/categories/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops", color="#3BB77E")

    def test_all_roles_can_read(self):
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_managers_can_create(self):
        for user in (self.admin, self.manager):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(
                    self.url, {"name": f"Cat by {user.role_name}"}, format="json"
                )
                self.assertEqual(response.status_code, 201, response.data)

    def test_non_managers_cannot_create(self):
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(self.url, {"name": "Nope"}, format="json")
                self.assertEqual(response.status_code, 403)

    def test_auditor_is_read_only_everywhere(self):
        """The auditor guard must hold even on endpoints managers may write."""
        self.login(self.auditor)
        detail = f"{self.url}{self.category.id}/"
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(self.client.patch(detail, {"name": "Edited"},
                                           format="json").status_code, 403)
        self.assertEqual(self.client.delete(detail).status_code, 403)

    def test_only_super_admin_may_delete_a_master_record(self):
        detail = f"{self.url}{self.category.id}/"

        self.login(self.manager)
        self.assertEqual(self.client.delete(detail).status_code, 403)

        self.login(self.admin)
        self.assertEqual(self.client.delete(detail).status_code, 200)


class AnonymousAccessTests(TrassetAPITestCase):
    def test_health_is_public(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEnvelope(response)

    def test_api_endpoints_require_a_token(self):
        for url in ("/api/v1/categories/", "/api/v1/users/", "/api/v1/auth/me/"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 401)
