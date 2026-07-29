"""
Mobile sessions and the device registry — SRS §12.4, BE-1 and BE-2 (Day 31).

Two things are proved here:

* a phone gets a 30-day refresh where a browser gets 7, and *keeps* it across
  rotation — the failure mode being a mobile session that silently decays back
  to the web lifetime the first time it refreshes;
* a push token maps to exactly one device row, however many times it is
  registered and whoever registers it.
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.utils import aware_utcnow, datetime_from_epoch

from apps.accounts.models import Device

from .base import PASSWORD, TrassetAPITestCase

LOGIN_URL = "/api/v1/auth/login/"
REFRESH_URL = "/api/v1/auth/refresh/"
LOGOUT_URL = "/api/v1/auth/logout/"
DEVICES_URL = "/api/v1/auth/devices/"


def payload_of(raw_token: str) -> dict:
    """Decode without verifying — a rotated token is blacklisted, and reading
    its claims should not depend on it still being usable."""
    return token_backend.decode(raw_token, verify=False)


def lifetime_of(raw_token: str) -> timedelta:
    """How long from now until this token expires."""
    return datetime_from_epoch(payload_of(raw_token)["exp"]) - aware_utcnow()


class ClientAwareSessionTests(TrassetAPITestCase):
    """BE-1 — the refresh lifetime follows the client that asked for it."""

    def sign_in(self, user, client=None):
        headers = {"HTTP_X_CLIENT": client} if client else {}
        response = self.client.post(
            LOGIN_URL, {"email": user.email, "password": PASSWORD},
            format="json", **headers,
        )
        self.assertEqual(response.status_code, 200, response.data)
        return response.json()["data"]

    def assertLifetimeCloseTo(self, raw_token, expected: timedelta):
        """Within a minute — the clock moves between issue and assertion."""
        actual = lifetime_of(raw_token)
        self.assertAlmostEqual(
            actual.total_seconds(), expected.total_seconds(), delta=60,
            msg=f"expected a {expected} refresh, got {actual}",
        )

    # -- issue -------------------------------------------------------------
    def test_web_login_gets_the_standard_refresh_lifetime(self):
        data = self.sign_in(self.employee)
        self.assertLifetimeCloseTo(data["refresh"], api_settings.REFRESH_TOKEN_LIFETIME)

    def test_mobile_login_gets_the_longer_refresh_lifetime(self):
        data = self.sign_in(self.employee, client="mobile")
        self.assertLifetimeCloseTo(data["refresh"], settings.JWT_MOBILE_REFRESH_LIFETIME)

    def test_the_two_lifetimes_actually_differ(self):
        """Guards against both settings collapsing to the same value."""
        web = lifetime_of(self.sign_in(self.employee)["refresh"])
        mobile = lifetime_of(self.sign_in(self.employee, client="mobile")["refresh"])
        self.assertGreater(mobile, web)

    def test_client_is_recorded_as_a_claim_on_both_tokens(self):
        data = self.sign_in(self.employee, client="mobile")
        self.assertEqual(payload_of(data["refresh"])["client"], "mobile")
        # The access token carries it too, which is what BE-8 will throttle on.
        self.assertEqual(payload_of(data["access"])["client"], "mobile")

    def test_header_is_case_insensitive(self):
        data = self.sign_in(self.employee, client="Mobile")
        self.assertEqual(payload_of(data["refresh"])["client"], "mobile")

    def test_unknown_client_falls_back_to_web(self):
        """A guessed or mistyped value must not buy the longer session."""
        data = self.sign_in(self.employee, client="mobile-app")
        self.assertEqual(payload_of(data["refresh"])["client"], "web")
        self.assertLifetimeCloseTo(data["refresh"], api_settings.REFRESH_TOKEN_LIFETIME)

    def test_access_token_lifetime_is_the_same_for_both_clients(self):
        """Only the refresh is client-aware. A long-lived access token would
        widen the window an intercepted one is useful for."""
        web = lifetime_of(self.sign_in(self.employee)["access"])
        mobile = lifetime_of(self.sign_in(self.employee, client="mobile")["access"])
        self.assertAlmostEqual(web.total_seconds(), mobile.total_seconds(), delta=60)
        self.assertAlmostEqual(
            mobile.total_seconds(),
            api_settings.ACCESS_TOKEN_LIFETIME.total_seconds(), delta=60,
        )

    # -- rotation ----------------------------------------------------------
    def test_rotation_keeps_the_mobile_lifetime_without_the_header(self):
        """The claim travels in the token, so a proxy dropping X-Client on the
        refresh call cannot demote a phone to a weekly logout."""
        data = self.sign_in(self.employee, client="mobile")

        response = self.client.post(REFRESH_URL, {"refresh": data["refresh"]},
                                    format="json")
        self.assertEqual(response.status_code, 200, response.data)
        rotated = response.json()["data"]["refresh"]

        self.assertEqual(payload_of(rotated)["client"], "mobile")
        self.assertLifetimeCloseTo(rotated, settings.JWT_MOBILE_REFRESH_LIFETIME)

    def test_rotation_keeps_a_web_session_at_the_web_lifetime(self):
        """The mirror image: a web client cannot be talked into a long session
        by sending the header only on the refresh call."""
        data = self.sign_in(self.employee)

        response = self.client.post(
            REFRESH_URL, {"refresh": data["refresh"]},
            format="json", HTTP_X_CLIENT="mobile",
        )
        rotated = response.json()["data"]["refresh"]

        self.assertEqual(payload_of(rotated)["client"], "web")
        self.assertLifetimeCloseTo(rotated, api_settings.REFRESH_TOKEN_LIFETIME)

    def test_rotation_still_blacklists_the_old_token(self):
        """SEC-2 must survive the lifetime change."""
        data = self.sign_in(self.employee, client="mobile")
        self.client.post(REFRESH_URL, {"refresh": data["refresh"]}, format="json")

        replay = self.client.post(REFRESH_URL, {"refresh": data["refresh"]},
                                  format="json")
        self.assertEqual(replay.status_code, 401)

    def test_mobile_session_survives_repeated_rotation(self):
        """Rotating several times must not whittle the expiry down."""
        token = self.sign_in(self.employee, client="mobile")["refresh"]
        for _ in range(3):
            response = self.client.post(REFRESH_URL, {"refresh": token},
                                        format="json")
            self.assertEqual(response.status_code, 200, response.data)
            token = response.json()["data"]["refresh"]

        self.assertLifetimeCloseTo(token, settings.JWT_MOBILE_REFRESH_LIFETIME)


class DeviceRegistrationTests(TrassetAPITestCase):
    """BE-2 — one row per handset, owned by whoever last registered it."""

    def register(self, **overrides):
        body = {
            "platform": "android",
            "push_token": "tok-aaa",
            "device_name": "Pixel 8",
            "app_version": "1.0.0",
        }
        body.update(overrides)
        return self.client.post(DEVICES_URL, body, format="json")

    def test_registering_creates_a_device_against_the_user(self):
        self.login(self.employee)
        response = self.register()

        self.assertEqual(response.status_code, 201, response.data)
        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["platform"], "android")
        self.assertEqual(body["data"]["platform_label"], "Android")

        device = Device.objects.get(push_token="tok-aaa")
        self.assertEqual(device.user, self.employee)
        self.assertEqual(device.device_name, "Pixel 8")

    def test_re_registering_the_same_token_updates_rather_than_duplicates(self):
        """An app registers on every launch. Two rows means two pushes."""
        self.login(self.employee)
        self.register()
        Device.objects.filter(push_token="tok-aaa").update(
            last_seen_at=timezone.now() - timedelta(days=3)
        )

        response = self.register(app_version="1.4.0", device_name="Pixel 8 Pro")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Device.objects.filter(push_token="tok-aaa").count(), 1)

        device = Device.objects.get(push_token="tok-aaa")
        self.assertEqual(device.app_version, "1.4.0")
        self.assertEqual(device.device_name, "Pixel 8 Pro")
        self.assertGreater(device.last_seen_at, timezone.now() - timedelta(minutes=1))

    def test_a_handset_that_changes_hands_moves_to_the_new_owner(self):
        """Otherwise the previous owner keeps receiving somebody else's
        notifications on a phone they no longer have."""
        self.login(self.employee)
        self.register()

        self.login(self.manager)
        response = self.register()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Device.objects.filter(push_token="tok-aaa").count(), 1)
        self.assertEqual(Device.objects.get(push_token="tok-aaa").user, self.manager)
        self.assertFalse(self.employee.devices.exists())

    def test_one_user_can_register_several_devices(self):
        self.login(self.employee)
        self.register(push_token="tok-phone", platform="ios")
        self.register(push_token="tok-tablet", platform="android")

        self.assertEqual(self.employee.devices.count(), 2)

    def test_list_shows_only_your_own_devices(self):
        self.login(self.employee)
        self.register(push_token="tok-mine")
        self.login(self.manager)
        self.register(push_token="tok-theirs")

        response = self.client.get(DEVICES_URL)
        body = self.assertEnvelope(response)

        tokens = [row["push_token"] for row in body["data"]]
        self.assertEqual(tokens, ["tok-theirs"])

    def test_an_unknown_platform_is_rejected(self):
        self.login(self.employee)
        response = self.register(platform="blackberry")

        self.assertEqual(response.status_code, 400)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("platform", body["errors"])

    def test_push_token_is_required(self):
        self.login(self.employee)
        response = self.client.post(DEVICES_URL, {"platform": "ios"}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("push_token", self.assertEnvelope(response, success=False)["errors"])

    def test_anonymous_callers_cannot_register(self):
        self.assertEqual(self.register().status_code, 401)

    def test_an_auditor_may_register_a_device(self):
        """Auditors are read-only on business data, but they still carry a
        phone. The read-only guard must not reach this endpoint."""
        self.login(self.auditor)
        self.assertEqual(self.register().status_code, 201)

    def test_every_role_may_register_a_device(self):
        for slug, user in self.users.items():
            with self.subTest(role=slug):
                self.login(user)
                response = self.register(push_token=f"tok-{slug}")
                self.assertEqual(response.status_code, 201, response.data)


class DeviceRemovalTests(TrassetAPITestCase):
    def setUp(self):
        super().setUp()
        self.device = Device.objects.create(
            user=self.employee, platform="ios", push_token="tok-mine",
        )
        self.other = Device.objects.create(
            user=self.manager, platform="android", push_token="tok-theirs",
        )

    def test_deregistering_removes_the_row(self):
        self.login(self.employee)
        response = self.client.delete(f"{DEVICES_URL}{self.device.pk}/")

        self.assertEqual(response.status_code, 200)
        self.assertEnvelope(response)
        self.assertFalse(Device.objects.filter(pk=self.device.pk).exists())

    def test_you_cannot_deregister_somebody_elses_device(self):
        """404 rather than 403 — the queryset is scoped, so another user's
        device does not exist as far as this caller is concerned."""
        self.login(self.employee)
        response = self.client.delete(f"{DEVICES_URL}{self.other.pk}/")

        self.assertEqual(response.status_code, 404)
        self.assertTrue(Device.objects.filter(pk=self.other.pk).exists())

    def test_signing_out_deregisters_the_device(self):
        """The DoD for BE-2: registered on sign-in, gone on sign-out."""
        login = self.client.post(
            LOGIN_URL, {"email": self.employee.email, "password": PASSWORD},
            format="json", HTTP_X_CLIENT="mobile",
        )
        data = login.json()["data"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")

        response = self.client.post(
            LOGOUT_URL, {"refresh": data["refresh"], "push_token": "tok-mine"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(Device.objects.filter(pk=self.device.pk).exists())

    def test_signing_out_cannot_deregister_another_users_device(self):
        login = self.client.post(
            LOGIN_URL, {"email": self.employee.email, "password": PASSWORD},
            format="json",
        )
        data = login.json()["data"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")

        response = self.client.post(
            LOGOUT_URL, {"refresh": data["refresh"], "push_token": "tok-theirs"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Device.objects.filter(pk=self.other.pk).exists())

    def test_signing_out_without_a_push_token_still_works(self):
        """Web clients have no device to hand back."""
        login = self.client.post(
            LOGIN_URL, {"email": self.employee.email, "password": PASSWORD},
            format="json",
        )
        data = login.json()["data"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data['access']}")

        response = self.client.post(LOGOUT_URL, {"refresh": data["refresh"]},
                                    format="json")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(Device.objects.filter(pk=self.device.pk).exists())

    def test_deleting_a_user_takes_their_devices_with_them(self):
        self.assertTrue(Device.objects.filter(pk=self.device.pk).exists())
        self.employee.delete()
        self.assertFalse(Device.objects.filter(pk=self.device.pk).exists())
