"""
Push dispatch — SRS §12.4 BE-3, FR-14.22, FR-14.23 (Day 34).

The DoD for the day is one assertion in three parts: an assignment produces an
in-app record, an email, and a push to every registered device. The rest of
these guard the ways push could quietly go wrong — silently dropping, going to
a handset that no longer exists, or breaking the action it was reporting on.
"""
from unittest import mock

from django.core import mail
from django.test import override_settings

from apps.accounts.models import Device
from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.masters.models import Category, Location
from apps.notifications.constants import NotificationType
from apps.notifications.models import Notification
from apps.notifications.push import (
    ExpoPushBackend,
    LocMemPushBackend,
    PushMessage,
    get_push_backend,
)
from apps.notifications.services import asset_assigned, deliver_push, notify

from .base import TrassetAPITestCase


class PushTestCase(TrassetAPITestCase):
    def setUp(self):
        super().setUp()
        LocMemPushBackend.clear()
        self.addCleanup(LocMemPushBackend.clear)
        self.category = Category.objects.create(name="Laptops", color="#3BB77E")
        self.location = Location.objects.create(name="Head Office")
        self.asset = Asset.objects.create(
            name="Dell Latitude 5440", category=self.category,
            location=self.location, status=AssetStatus.AVAILABLE,
            purchase_cost="78000.00",
        )

    def register(self, user, token="tok-phone", platform="android"):
        return Device.objects.create(user=user, push_token=token, platform=platform)

    @property
    def sent(self):
        return LocMemPushBackend.sent

    def flush(self, call):
        """
        Run ``call`` and then its on-commit callbacks.

        Push is queued with ``transaction.on_commit`` for the same reason email
        is — a rolled-back action must not push about something that never
        happened — and a ``TestCase`` transaction never commits.
        """
        with self.captureOnCommitCallbacks(execute=True):
            return call()


class DispatchTests(PushTestCase):
    def test_an_assignment_produces_a_record_an_email_and_a_push(self):
        """The Day 34 definition of done, in one test."""
        self.register(self.employee)
        mail.outbox = []

        notification = self.flush(
            lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertIsNotNone(notification)
        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(len(self.sent), 1)
        self.assertIn(self.asset.name, self.sent[0].title)

    def test_every_registered_device_gets_it(self):
        self.register(self.employee, "tok-phone")
        self.register(self.employee, "tok-tablet", platform="ios")

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(
            sorted(message.token for message in self.sent),
            ["tok-phone", "tok-tablet"],
        )

    def test_only_the_recipients_devices_get_it(self):
        self.register(self.employee, "tok-mine")
        self.register(self.head, "tok-theirs")

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual([message.token for message in self.sent], ["tok-mine"])

    def test_a_user_with_no_devices_is_not_an_error(self):
        """Most people are on the web only. This has to stay quiet."""
        notification = self.flush(
            lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertIsNotNone(notification)
        self.assertEqual(self.sent, [])

    def test_nobody_is_pushed_about_their_own_action(self):
        """The existing rule has to hold for the new channel too."""
        self.register(self.manager)

        self.flush(lambda: asset_assigned(self.asset, self.manager, actor=self.manager))

        self.assertEqual(self.sent, [])

    def test_push_goes_out_for_types_that_do_not_email(self):
        """Push and email are deliberately different sets — a check-in is worth
        a push but not an email."""
        self.register(self.employee)
        mail.outbox = []

        self.flush(lambda: notify(
            self.employee, NotificationType.ASSET_CHECKED_IN,
            title="Checked in", message="Returned", actor=self.manager))

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(len(self.sent), 1)

    def test_the_dispatch_is_recorded_on_the_notification(self):
        self.register(self.employee)

        notification = self.flush(
            lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        notification.refresh_from_db()
        self.assertIsNotNone(notification.pushed_at)


class PreferenceTests(PushTestCase):
    def test_a_user_who_muted_push_gets_none(self):
        self.employee.push_notifications = False
        self.employee.save(update_fields=["push_notifications"])
        self.register(self.employee)

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(self.sent, [])

    def test_muting_push_leaves_email_alone(self):
        """The two are separate consents: someone who mutes desk email should
        not lose the alerts the app exists to deliver, and vice versa."""
        self.employee.push_notifications = False
        self.employee.save(update_fields=["push_notifications"])
        self.register(self.employee)
        mail.outbox = []

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(self.sent, [])

    def test_muting_email_leaves_push_alone(self):
        self.employee.email_notifications = False
        self.employee.save(update_fields=["email_notifications"])
        self.register(self.employee)
        mail.outbox = []

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(len(self.sent), 1)

    def test_the_in_app_record_is_written_whatever_the_preferences(self):
        """Preferences govern delivery channels, not the record itself."""
        self.employee.push_notifications = False
        self.employee.email_notifications = False
        self.employee.save()

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(Notification.objects.filter(user=self.employee).count(), 1)

    def test_the_preference_is_readable_and_writable_over_the_api(self):
        self.login(self.employee)

        response = self.client.patch(
            "/api/v1/auth/me/", {"push_notifications": False}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.json()["data"]["push_notifications"])
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.push_notifications)


class DeepLinkTests(PushTestCase):
    """FR-14.23 — tapping a notification opens the relevant record."""

    def test_the_payload_carries_a_deep_link_to_the_asset(self):
        self.register(self.employee)

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        data = self.sent[0].data
        self.assertEqual(data["deep_link"], f"trasset://assets/{self.asset.pk}")
        self.assertEqual(data["related_object_type"], "Asset")
        self.assertEqual(data["related_object_id"], str(self.asset.pk))

    def test_the_web_link_travels_too(self):
        """So a web view opened from the app lands in the same place."""
        self.register(self.employee)

        self.flush(lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(self.sent[0].data["link"],
                         f"asset-detail.html?id={self.asset.pk}")

    def test_a_notification_about_nothing_in_particular_lands_on_the_list(self):
        """A missing target must not produce a link that goes nowhere."""
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED,
            title="No target",
        )

        self.assertEqual(notification.deep_link, "trasset://notifications")

    def test_an_unmapped_object_type_falls_back_rather_than_guessing(self):
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED,
            title="Odd", related_object_type="Sprocket", related_object_id="7",
        )

        self.assertEqual(notification.deep_link, "trasset://notifications")


class DeadTokenTests(PushTestCase):
    """A token the provider rejects as unregistered is pruned, not retried."""

    def dead(self, *args, **kwargs):
        from apps.notifications.push import PushResult

        return PushResult(ok=False, detail="not registered", token_is_dead=True)

    def test_a_dead_token_is_pruned(self):
        device = self.register(self.employee)
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED, title="Hello",
        )

        with mock.patch.object(LocMemPushBackend, "send", self.dead):
            sent = deliver_push(notification.pk, device.pk)

        self.assertFalse(sent)
        self.assertFalse(Device.objects.filter(pk=device.pk).exists())

    def test_pruning_one_device_leaves_the_others(self):
        dead = self.register(self.employee, "tok-dead")
        alive = self.register(self.employee, "tok-alive", platform="ios")
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED, title="Hello",
        )

        with mock.patch.object(LocMemPushBackend, "send", self.dead):
            deliver_push(notification.pk, dead.pk)

        self.assertFalse(Device.objects.filter(pk=dead.pk).exists())
        self.assertTrue(Device.objects.filter(pk=alive.pk).exists())

    def test_an_ordinary_failure_raises_so_the_task_retries(self):
        """A provider outage is temporary; dropping the notification silently
        would be worse than trying again."""
        from apps.notifications.push import PushResult
        from apps.notifications.services import PushDeliveryError

        device = self.register(self.employee)
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED, title="Hello",
        )

        with mock.patch.object(LocMemPushBackend, "send",
                               lambda *a, **k: PushResult(ok=False, detail="503")):
            with self.assertRaises(PushDeliveryError):
                deliver_push(notification.pk, device.pk)

        self.assertTrue(Device.objects.filter(pk=device.pk).exists())

    def test_a_device_deregistered_mid_flight_is_not_an_error(self):
        device = self.register(self.employee)
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED, title="Hello",
        )
        device_id = device.pk
        device.delete()

        self.assertFalse(deliver_push(notification.pk, device_id))

    def test_you_cannot_push_a_notification_to_somebody_elses_device(self):
        theirs = self.register(self.head, "tok-theirs")
        notification = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED, title="Hello",
        )

        self.assertFalse(deliver_push(notification.pk, theirs.pk))
        self.assertEqual(self.sent, [])


class ResilienceTests(PushTestCase):
    def assign_over_the_api(self):
        self.login(self.manager)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f"/api/v1/assets/{self.asset.pk}/assign/",
                {"user_id": self.employee.pk}, format="json",
            )

    def test_a_push_failure_does_not_break_the_action(self):
        """The standing rule from Day 18: notifying never breaks the thing
        being notified about. Nobody should fail to issue a laptop because a
        push provider is down.

        This matters more for push than for email, because the queueing runs
        from ``on_commit`` — which fires while the check-out is still
        completing, so anything escaping it would fail the check-out itself."""
        self.register(self.employee)

        with mock.patch("apps.notifications.push.get_push_backend",
                        side_effect=RuntimeError("provider on fire")):
            response = self.assign_over_the_api()

        self.assertEqual(response.status_code, 200, response.data)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(self.asset.assigned_to, self.employee)

    def test_the_in_app_record_survives_a_push_failure(self):
        """A dead provider must not cost the user the notification itself."""
        self.register(self.employee)

        with mock.patch("apps.notifications.push.get_push_backend",
                        side_effect=RuntimeError("provider on fire")):
            self.assign_over_the_api()

        self.assertTrue(
            Notification.objects.filter(
                user=self.employee, type=NotificationType.ASSET_ASSIGNED
            ).exists()
        )

    def test_a_broker_failure_falls_back_to_sending_inline(self):
        """Celery being unreachable should degrade to a slower push, not to
        no push — the same fallback the email path already has."""
        self.register(self.employee)

        with mock.patch("apps.notifications.tasks.send_notification_push.delay",
                        side_effect=RuntimeError("broker unreachable")):
            self.flush(
                lambda: asset_assigned(self.asset, self.employee, actor=self.manager))

        self.assertEqual(len(self.sent), 1)

    def test_nothing_is_pushed_if_the_action_rolls_back(self):
        """The reason for on_commit: a push about an assignment that did not
        happen is worse than no push at all."""
        self.register(self.employee)

        with self.captureOnCommitCallbacks(execute=False):
            asset_assigned(self.asset, self.employee, actor=self.manager)

        self.assertEqual(self.sent, [])


class BackendTests(PushTestCase):
    def test_the_configured_backend_is_used(self):
        self.assertIsInstance(get_push_backend(), LocMemPushBackend)

    @override_settings(PUSH_BACKEND="apps.notifications.push.ConsolePushBackend")
    def test_the_backend_is_swappable_by_setting(self):
        from apps.notifications.push import ConsolePushBackend

        self.assertIsInstance(get_push_backend(), ConsolePushBackend)

    def test_the_console_backend_reports_success_without_sending(self):
        """The development default. It has to succeed, or every dev machine
        would see push failures on every action."""
        from apps.notifications.push import ConsolePushBackend

        result = ConsolePushBackend().send(
            PushMessage(token="tok-dev", title="Hello", body="World")
        )

        self.assertTrue(result.ok)

    def test_the_expo_payload_has_the_shape_expo_expects(self):
        payload = PushMessage(
            token="ExponentPushToken[xxx]", title="Hello", body="World",
            data={"deep_link": "trasset://assets/1"},
        ).as_expo_payload()

        self.assertEqual(payload["to"], "ExponentPushToken[xxx]")
        self.assertEqual(payload["title"], "Hello")
        self.assertEqual(payload["body"], "World")
        self.assertEqual(payload["data"]["deep_link"], "trasset://assets/1")

    def test_an_ok_ticket_reads_as_success(self):
        result = ExpoPushBackend._read_ticket({"data": [{"status": "ok", "id": "abc"}]})

        self.assertTrue(result.ok)
        self.assertFalse(result.token_is_dead)

    def test_a_device_not_registered_ticket_reads_as_a_dead_token(self):
        result = ExpoPushBackend._read_ticket({"data": [{
            "status": "error",
            "message": "…is not a registered push notification recipient",
            "details": {"error": "DeviceNotRegistered"},
        }]})

        self.assertFalse(result.ok)
        self.assertTrue(result.token_is_dead)

    def test_other_errors_are_retryable_rather_than_fatal(self):
        result = ExpoPushBackend._read_ticket({"data": [{
            "status": "error", "message": "Too many requests",
            "details": {"error": "MessageRateExceeded"},
        }]})

        self.assertFalse(result.ok)
        self.assertFalse(result.token_is_dead)

    def test_an_empty_reply_is_a_failure_not_a_silent_success(self):
        result = ExpoPushBackend._read_ticket({})

        self.assertFalse(result.ok)
        self.assertFalse(result.token_is_dead)
