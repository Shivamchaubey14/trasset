"""Authentication tests — FR-1.1 to FR-1.6."""
from django.test import override_settings

from apps.accounts.models import User

from .base import PASSWORD, TrassetAPITestCase


class LoginTests(TrassetAPITestCase):
    url = "/api/v1/auth/login/"

    def test_login_returns_token_pair_and_profile(self):
        """FR-1.1 — email + password yields access/refresh plus the profile."""
        response = self.client.post(
            self.url, {"email": self.manager.email, "password": PASSWORD}, format="json"
        )
        body = self.assertEnvelope(response)
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", body["data"])
        self.assertIn("refresh", body["data"])
        self.assertEqual(body["data"]["user"]["email"], self.manager.email)
        self.assertEqual(body["data"]["user"]["role"]["name"], "asset_manager")

    def test_login_is_case_insensitive_on_email(self):
        response = self.client.post(
            self.url,
            {"email": self.manager.email.upper(), "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_wrong_password_is_401_with_error_envelope(self):
        response = self.client.post(
            self.url, {"email": self.manager.email, "password": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertEnvelope(response, success=False)

    def test_inactive_user_cannot_log_in(self):
        self.employee.is_active = False
        self.employee.save(update_fields=["is_active"])
        response = self.client.post(
            self.url, {"email": self.employee.email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 401)


class RefreshAndLogoutTests(TrassetAPITestCase):
    def test_refresh_issues_a_new_access_token(self):
        """FR-1.2"""
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.employee.email, "password": PASSWORD},
            format="json",
        )
        refresh = login.json()["data"]["refresh"]

        response = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh},
                                    format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json()["data"])

    def test_logout_blacklists_the_refresh_token(self):
        """FR-1.6 — a blacklisted refresh token can't be reused."""
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.employee.email, "password": PASSWORD},
            format="json",
        )
        body = login.json()["data"]
        refresh = body["refresh"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {body['access']}")

        logout = self.client.post("/api/v1/auth/logout/", {"refresh": refresh}, format="json")
        self.assertEqual(logout.status_code, 200)

        reuse = self.client.post("/api/v1/auth/refresh/", {"refresh": refresh}, format="json")
        self.assertEqual(reuse.status_code, 401)


class MeTests(TrassetAPITestCase):
    url = "/api/v1/auth/me/"

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_returns_current_profile(self):
        self.login(self.head)
        response = self.client.get(self.url)
        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["email"], self.head.email)
        self.assertEqual(body["data"]["role_name"], "department_head")

    def test_can_patch_own_profile(self):
        self.login(self.employee)
        response = self.client.patch(self.url, {"full_name": "Renamed Person"},
                                     format="json")
        self.assertEqual(response.status_code, 200)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.full_name, "Renamed Person")

    def test_cannot_escalate_own_role_via_profile(self):
        """ProfileUpdateSerializer must ignore role changes."""
        self.login(self.employee)
        self.client.patch(self.url, {"role": self.roles["super_admin"].id}, format="json")
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.role_name, "employee")


class PasswordTests(TrassetAPITestCase):
    def test_change_password_then_log_in_with_it(self):
        """FR-1.4"""
        self.login(self.employee)
        response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "current_password": PASSWORD,
                "new_password": "BrandNew@2026",
                "confirm_password": "BrandNew@2026",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.logout()
        login = self.client.post(
            "/api/v1/auth/login/",
            {"email": self.employee.email, "password": "BrandNew@2026"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_change_password_rejects_wrong_current_password(self):
        self.login(self.employee)
        response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "current_password": "not-it",
                "new_password": "BrandNew@2026",
                "confirm_password": "BrandNew@2026",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("current_password", body["errors"])

    def test_change_password_rejects_mismatched_confirmation(self):
        self.login(self.employee)
        response = self.client.post(
            "/api/v1/auth/password/change/",
            {
                "current_password": PASSWORD,
                "new_password": "BrandNew@2026",
                "confirm_password": "Different@2026",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_reset_request_does_not_leak_whether_an_account_exists(self):
        known = self.client.post("/api/v1/auth/password/reset/",
                                 {"email": self.employee.email}, format="json")
        unknown = self.client.post("/api/v1/auth/password/reset/",
                                   {"email": "nobody@test.local"}, format="json")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.json()["message"], unknown.json()["message"])


@override_settings(LOGIN_MAX_ATTEMPTS=3, LOGIN_LOCKOUT_MINUTES=15)
class LockoutTests(TrassetAPITestCase):
    """FR-1.5 — lock the account after N consecutive failures."""

    url = "/api/v1/auth/login/"

    def _fail_login(self):
        return self.client.post(
            self.url, {"email": self.employee.email, "password": "wrong"}, format="json"
        )

    def test_account_locks_after_max_attempts(self):
        for _ in range(3):
            self._fail_login()

        self.employee.refresh_from_db()
        self.assertTrue(self.employee.is_locked)

        # Even the correct password is refused while locked.
        response = self.client.post(
            self.url, {"email": self.employee.email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("locked", response.json()["message"].lower())

    def test_successful_login_resets_the_counter(self):
        self._fail_login()
        self._fail_login()

        response = self.client.post(
            self.url, {"email": self.employee.email, "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        self.employee.refresh_from_db()
        self.assertEqual(self.employee.failed_login_attempts, 0)
        self.assertIsNone(self.employee.locked_until)

    def test_unknown_email_does_not_create_a_user(self):
        before = User.objects.count()
        self.client.post(self.url, {"email": "ghost@test.local", "password": "x"},
                         format="json")
        self.assertEqual(User.objects.count(), before)
