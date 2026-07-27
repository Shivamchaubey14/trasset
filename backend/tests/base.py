"""Shared test helpers."""
from rest_framework.test import APITestCase

from apps.accounts.models import Role, User
from common.roles import Roles

PASSWORD = "TrassetTest@2026"


class TrassetAPITestCase(APITestCase):
    """Base case with one user per role and envelope-aware helpers."""

    @classmethod
    def setUpTestData(cls):
        cls.roles = {role.name: role for role in Role.objects.all()}
        cls.users = {
            slug: User.objects.create_user(
                email=f"{slug}@test.local",
                password=PASSWORD,
                full_name=slug.replace("_", " ").title(),
                role=cls.roles[slug],
                is_active=True,
            )
            for slug in Roles.ALL
        }
        cls.admin = cls.users[Roles.SUPER_ADMIN]
        cls.manager = cls.users[Roles.ASSET_MANAGER]
        cls.head = cls.users[Roles.DEPARTMENT_HEAD]
        cls.employee = cls.users[Roles.EMPLOYEE]
        cls.auditor = cls.users[Roles.AUDITOR]

    # -- helpers -----------------------------------------------------------
    def login(self, user):
        """Authenticate subsequent requests as ``user``."""
        response = self.client.post(
            "/api/v1/auth/login/",
            {"email": user.email, "password": PASSWORD},
            format="json",
        )
        # .json() renders through EnvelopeJSONRenderer; .data is the pre-envelope payload.
        self.assertEqual(response.status_code, 200, response.data)
        token = response.json()["data"]["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return token

    def logout(self):
        self.client.credentials()

    def assertEnvelope(self, response, success=True):
        """Every response must carry the four envelope keys (SRS §5.1)."""
        body = response.json()
        for key in ("success", "message", "data", "errors"):
            self.assertIn(key, body, f"'{key}' missing from response envelope")
        self.assertIs(body["success"], success)
        if success:
            self.assertIsNone(body["errors"])
        else:
            self.assertIsNone(body["data"])
            self.assertIsNotNone(body["errors"])
        return body
