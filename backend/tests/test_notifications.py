"""Notifications and scheduled jobs — FR-12.1, FR-12.2, FR-6.5, FR-7.3, FR-8.4."""
from datetime import date, timedelta
from decimal import Decimal

from django.core import mail
from django.test import override_settings

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset, AssetRequest
from apps.assets.services import assignment as assignment_service
from apps.assets.tasks import recalculate_all_depreciation
from apps.audit.services import suspend
from apps.maintenance.constants import MaintenanceStatus, MaintenanceType
from apps.maintenance.models import MaintenanceRecord
from apps.masters.models import Category, Department, Location
from apps.notifications import services as notifications
from apps.notifications.constants import NotificationType
from apps.notifications.models import Notification
from apps.notifications.tasks import (
    purge_read_notifications,
    scan_due_maintenance,
    scan_expiring_warranties,
)

from .base import TrassetAPITestCase


class NotificationTestCase(TrassetAPITestCase):
    url = "/api/v1/notifications/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.office = Location.objects.create(name="Head Office")
        cls.it = Department.objects.create(name="IT")

    def make_asset(self, **kwargs):
        defaults = {
            "name": "Dell Latitude",
            "category": self.category,
            "location": self.office,
            "purchase_cost": Decimal("80000.00"),
            "useful_life_years": 4,
            "purchase_date": date.today() - timedelta(days=200),
        }
        with suspend():
            return Asset.objects.create(**{**defaults, **kwargs})

    def unread_for(self, user, notification_type=None):
        queryset = Notification.objects.filter(user=user, is_read=False)
        if notification_type:
            queryset = queryset.filter(type=notification_type)
        return queryset


class AssignmentNotificationTests(NotificationTestCase):
    def test_being_assigned_an_asset_notifies_the_holder(self):
        """FR-12.1"""
        asset = self.make_asset()
        assignment_service.assign(asset, user=self.employee, actor=self.manager)

        notification = self.unread_for(
            self.employee, NotificationType.ASSET_ASSIGNED
        ).first()

        self.assertIsNotNone(notification)
        self.assertIn("Dell Latitude", notification.title)
        self.assertIn(f"id={asset.pk}", notification.link)

    def test_check_in_notifies_the_person_who_held_it(self):
        asset = self.make_asset()
        assignment_service.assign(asset, user=self.employee, actor=self.manager)
        assignment_service.checkin(asset, actor=self.manager)

        self.assertTrue(
            self.unread_for(self.employee, NotificationType.ASSET_CHECKED_IN).exists()
        )

    def test_nobody_is_told_about_their_own_action(self):
        """A manager assigning to themselves does not need telling."""
        asset = self.make_asset()
        assignment_service.assign(asset, user=self.manager, actor=self.manager)

        self.assertFalse(
            Notification.objects.filter(user=self.manager,
                                        type=NotificationType.ASSET_ASSIGNED).exists()
        )

    def test_a_deactivated_user_is_not_notified(self):
        self.employee.is_active = False
        self.employee.save(update_fields=["is_active"])

        result = notifications.notify(
            self.employee, NotificationType.ASSET_ASSIGNED, title="Anything"
        )
        self.assertIsNone(result)

    def test_notification_failure_does_not_break_the_assignment(self):
        """Nobody should fail to issue a laptop because notifying broke."""
        from unittest.mock import patch

        asset = self.make_asset()
        with patch("apps.notifications.models.Notification.objects.create",
                   side_effect=RuntimeError("boom")):
            assignment_service.assign(asset, user=self.employee, actor=self.manager)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(asset.assigned_to, self.employee)


class RequestNotificationTests(NotificationTestCase):
    url = "/api/v1/asset-requests/"

    def test_raising_a_request_notifies_the_approvers(self):
        asset = self.make_asset()
        self.login(self.employee)
        self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "My laptop keeps crashing on builds."},
            format="json",
        )

        self.assertTrue(
            self.unread_for(self.manager, NotificationType.REQUEST_SUBMITTED).exists()
        )
        self.assertTrue(
            self.unread_for(self.admin, NotificationType.REQUEST_SUBMITTED).exists()
        )

    def test_the_requester_is_not_notified_of_their_own_request(self):
        asset = self.make_asset()
        self.login(self.employee)
        self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "My laptop keeps crashing on builds."},
            format="json",
        )

        self.assertFalse(
            Notification.objects.filter(
                user=self.employee, type=NotificationType.REQUEST_SUBMITTED
            ).exists()
        )

    def test_a_department_head_hears_about_their_own_department(self):
        self.employee.department = self.it
        self.employee.save(update_fields=["department"])
        self.head.department = self.it
        self.head.save(update_fields=["department"])

        asset = self.make_asset()
        self.login(self.employee)
        self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "Replacement needed for daily work."},
            format="json",
        )

        self.assertTrue(
            self.unread_for(self.head, NotificationType.REQUEST_SUBMITTED).exists()
        )

    def test_a_department_head_elsewhere_is_not_bothered(self):
        other = Department.objects.create(name="Finance")
        self.employee.department = self.it
        self.employee.save(update_fields=["department"])
        self.head.department = other
        self.head.save(update_fields=["department"])

        asset = self.make_asset()
        self.login(self.employee)
        self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "Replacement needed for daily work."},
            format="json",
        )

        self.assertFalse(
            Notification.objects.filter(
                user=self.head, type=NotificationType.REQUEST_SUBMITTED
            ).exists()
        )

    def test_approval_notifies_the_requester(self):
        asset = self.make_asset()
        with suspend():
            request = AssetRequest.objects.create(
                requester=self.employee, asset=asset,
                reason="Needed for a new project starting Monday.",
            )

        self.login(self.manager)
        self.client.post(f"{self.url}{request.id}/approve/", {}, format="json")

        self.assertTrue(
            self.unread_for(self.employee, NotificationType.REQUEST_APPROVED).exists()
        )

    def test_rejection_carries_the_reason(self):
        with suspend():
            request = AssetRequest.objects.create(
                requester=self.employee, category=self.category,
                reason="Would like a spare laptop for travel.",
            )

        self.login(self.manager)
        self.client.post(f"{self.url}{request.id}/reject/",
                         {"notes": "No spare stock until next quarter."},
                         format="json")

        notification = self.unread_for(
            self.employee, NotificationType.REQUEST_REJECTED
        ).first()
        self.assertIsNotNone(notification)
        self.assertIn("next quarter", notification.message)


class MaintenanceNotificationTests(NotificationTestCase):
    def test_starting_work_tells_whoever_holds_the_asset(self):
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        with suspend():
            record = MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.REPAIR,
                scheduled_date=date.today(),
            )

        self.login(self.manager)
        self.client.post(f"/api/v1/maintenance/{record.id}/start/", {}, format="json")

        self.assertTrue(
            self.unread_for(self.employee,
                            NotificationType.MAINTENANCE_SCHEDULED).exists()
        )

    def test_completion_tells_them_it_is_back(self):
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        with suspend():
            record = MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.REPAIR,
                scheduled_date=date.today(),
            )

        self.login(self.manager)
        self.client.post(f"/api/v1/maintenance/{record.id}/start/", {}, format="json")
        self.client.post(f"/api/v1/maintenance/{record.id}/complete/", {}, format="json")

        self.assertTrue(
            self.unread_for(self.employee,
                            NotificationType.MAINTENANCE_COMPLETED).exists()
        )

    def test_an_unassigned_asset_notifies_nobody(self):
        asset = self.make_asset()
        with suspend():
            record = MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.REPAIR,
                scheduled_date=date.today(),
            )

        before = Notification.objects.count()
        self.login(self.manager)
        self.client.post(f"/api/v1/maintenance/{record.id}/start/", {}, format="json")

        self.assertEqual(Notification.objects.count(), before)


class NotificationApiTests(NotificationTestCase):
    def setUp(self):
        self.mine = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED,
            title="Yours", message="A laptop is yours.",
        )
        self.theirs = Notification.objects.create(
            user=self.manager, type=NotificationType.ASSET_ASSIGNED,
            title="Theirs", message="Not for you.",
        )

    def test_you_only_see_your_own(self):
        self.login(self.employee)
        data = self.client.get(self.url).json()["data"]

        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["title"], "Yours")

    def test_you_cannot_read_someone_elses_by_id(self):
        self.login(self.employee)
        response = self.client.get(f"{self.url}{self.theirs.id}/")
        self.assertEqual(response.status_code, 404)

    def test_there_is_no_create_route(self):
        """Notifications come from events, never from a client."""
        self.login(self.employee)
        response = self.client.post(self.url, {"title": "Made up"}, format="json")
        self.assertEqual(response.status_code, 405)

    def test_marking_one_read(self):
        self.login(self.employee)
        response = self.client.post(f"{self.url}{self.mine.id}/read/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.mine.refresh_from_db()
        self.assertTrue(self.mine.is_read)
        self.assertIsNotNone(self.mine.read_at)

    def test_marking_all_read_leaves_other_people_alone(self):
        Notification.objects.create(user=self.employee,
                                    type=NotificationType.ASSET_CHECKED_IN,
                                    title="Second")

        self.login(self.employee)
        response = self.client.post(f"{self.url}read-all/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["marked"], 2)
        self.assertFalse(
            Notification.objects.filter(user=self.employee, is_read=False).exists()
        )
        self.theirs.refresh_from_db()
        self.assertFalse(self.theirs.is_read)

    def test_unread_count(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}count/").json()["data"]

        self.assertEqual(data["unread"], 1)
        self.assertEqual(data["total"], 1)

    def test_filter_by_unread(self):
        self.mine.mark_read()
        Notification.objects.create(user=self.employee,
                                    type=NotificationType.ASSET_CHECKED_IN,
                                    title="Still unread")

        self.login(self.employee)
        data = self.client.get(f"{self.url}?is_read=false").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_dismissing_one(self):
        self.login(self.employee)
        response = self.client.delete(f"{self.url}{self.mine.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Notification.objects.filter(pk=self.mine.pk).exists())

    def test_rows_carry_an_icon_and_colour(self):
        self.login(self.employee)
        row = self.client.get(self.url).json()["data"]["results"][0]

        self.assertEqual(row["icon"], "box")
        self.assertEqual(row["color"], "#3BB77E")

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailTests(NotificationTestCase):
    """
    FR-12.2 — email for the events that warrant it, and only those.

    Emails are queued with ``transaction.on_commit`` so a rolled-back action
    cannot leave someone holding mail about something that never happened. A
    ``TestCase`` wraps each test in a transaction that never commits, so these
    tests use ``captureOnCommitCallbacks`` to run them deliberately.
    """

    def setUp(self):
        mail.outbox = []

    def assign_and_flush(self, asset, user=None, actor=None):
        with self.captureOnCommitCallbacks(execute=True):
            assignment_service.assign(asset, user=user or self.employee,
                                      actor=actor or self.manager)

    def test_an_assignment_sends_an_email(self):
        self.assign_and_flush(self.make_asset())

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Trasset", mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, [self.employee.email])

    def test_opting_out_stops_the_email_but_not_the_notification(self):
        self.employee.email_notifications = False
        self.employee.save(update_fields=["email_notifications"])

        self.assign_and_flush(self.make_asset())

        self.assertEqual(len(mail.outbox), 0)
        self.assertTrue(
            self.unread_for(self.employee, NotificationType.ASSET_ASSIGNED).exists()
        )

    def test_low_value_events_do_not_email(self):
        """An email per check-in would train people to ignore Trasset's mail."""
        asset = self.make_asset()
        self.assign_and_flush(asset)
        mail.outbox = []

        with self.captureOnCommitCallbacks(execute=True):
            assignment_service.checkin(asset, actor=self.manager)

        self.assertEqual(len(mail.outbox), 0)

    def test_the_email_links_back_to_the_thing(self):
        asset = self.make_asset()
        self.assign_and_flush(asset)

        body = mail.outbox[0].body
        self.assertIn(f"asset-detail.html?id={asset.pk}", body)
        self.assertIn("turn these emails off", body)

    def test_nothing_is_sent_if_the_action_rolls_back(self):
        """
        The reason for on_commit: an email about an assignment that did not
        happen is worse than no email at all.
        """
        asset = self.make_asset()
        with self.captureOnCommitCallbacks(execute=False):
            assignment_service.assign(asset, user=self.employee, actor=self.manager)

        self.assertEqual(len(mail.outbox), 0)

    def test_sending_is_idempotent(self):
        """A retried task must not send the same email twice."""
        self.assign_and_flush(self.make_asset())
        self.assertEqual(len(mail.outbox), 1)

        notification = self.unread_for(
            self.employee, NotificationType.ASSET_ASSIGNED
        ).first()
        notifications.deliver_email(notification.pk)

        self.assertEqual(len(mail.outbox), 1)

    def test_email_is_recorded_on_the_notification(self):
        self.assign_and_flush(self.make_asset())

        notification = self.unread_for(
            self.employee, NotificationType.ASSET_ASSIGNED
        ).first()
        self.assertIsNotNone(notification.emailed_at)


class ScheduledJobTests(NotificationTestCase):
    """The three tasks named by the beat schedule in config/celery.py."""

    def test_warranty_scan_notifies_managers(self):
        """FR-7.3"""
        self.make_asset(warranty_expiry=date.today() + timedelta(days=10))

        result = scan_expiring_warranties()

        self.assertEqual(result["assets"], 1)
        self.assertTrue(
            self.unread_for(self.manager, NotificationType.WARRANTY_EXPIRING).exists()
        )

    def test_warranty_scan_ignores_retired_assets(self):
        """Chasing a warranty on a disposed asset wastes attention."""
        self.make_asset(warranty_expiry=date.today() + timedelta(days=10),
                        status=AssetStatus.DISPOSED)

        result = scan_expiring_warranties()
        self.assertEqual(result["assets"], 0)

    def test_warranty_scan_ignores_distant_expiry(self):
        self.make_asset(warranty_expiry=date.today() + timedelta(days=300))
        self.assertEqual(scan_expiring_warranties()["assets"], 0)

    def test_running_the_warranty_scan_twice_does_not_double_notify(self):
        """Beat can fire twice; a person should not be told twice."""
        self.make_asset(warranty_expiry=date.today() + timedelta(days=10))

        first = scan_expiring_warranties()
        second = scan_expiring_warranties()

        self.assertGreater(first["notifications"], 0)
        self.assertEqual(second["notifications"], 0)

    def test_maintenance_scan_flags_due_and_overdue(self):
        """FR-6.5"""
        asset = self.make_asset()
        with suspend():
            MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.PREVENTIVE,
                status=MaintenanceStatus.SCHEDULED,
                scheduled_date=date.today() - timedelta(days=3),
            )

        result = scan_due_maintenance()

        self.assertEqual(result["records"], 1)
        notification = self.unread_for(
            self.manager, NotificationType.MAINTENANCE_DUE
        ).first()
        self.assertIn("overdue", notification.title)

    def test_maintenance_scan_ignores_completed_work(self):
        asset = self.make_asset()
        with suspend():
            MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.REPAIR,
                status=MaintenanceStatus.COMPLETED,
                scheduled_date=date.today() - timedelta(days=3),
            )

        self.assertEqual(scan_due_maintenance()["records"], 0)

    def test_maintenance_scan_ignores_work_far_in_the_future(self):
        asset = self.make_asset()
        with suspend():
            MaintenanceRecord.objects.create(
                asset=asset, type=MaintenanceType.PREVENTIVE,
                status=MaintenanceStatus.SCHEDULED,
                scheduled_date=date.today() + timedelta(days=60),
            )

        self.assertEqual(scan_due_maintenance()["records"], 0)

    def test_depreciation_recalculation_updates_stale_values(self):
        """FR-8.4"""
        asset = self.make_asset()
        # Force a wrong stored value, as time passing would.
        Asset.objects.filter(pk=asset.pk).update(current_value=Decimal("99999.00"))

        result = recalculate_all_depreciation()

        asset.refresh_from_db()
        self.assertEqual(result["updated"], 1)
        self.assertNotEqual(asset.current_value, Decimal("99999.00"))

    def test_depreciation_recalculation_skips_rows_that_have_not_moved(self):
        """A monthly job must not rewrite the whole table for nothing."""
        self.make_asset()
        recalculate_all_depreciation()

        second = recalculate_all_depreciation()
        self.assertEqual(second["updated"], 0)
        self.assertGreater(second["examined"], 0)

    def test_depreciation_recalculation_does_not_flood_the_audit_trail(self):
        from apps.audit.models import AuditLog

        asset = self.make_asset()
        Asset.objects.filter(pk=asset.pk).update(current_value=Decimal("1.00"))

        before = AuditLog.objects.count()
        recalculate_all_depreciation()

        self.assertEqual(AuditLog.objects.count(), before)

    def test_purge_removes_old_read_notifications_only(self):
        from django.utils import timezone

        old_read = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED,
            title="Old and read", is_read=True,
        )
        old_unread = Notification.objects.create(
            user=self.employee, type=NotificationType.ASSET_ASSIGNED,
            title="Old but unread",
        )
        ancient = timezone.now() - timedelta(days=200)
        Notification.objects.filter(
            pk__in=[old_read.pk, old_unread.pk]
        ).update(created_at=ancient)

        result = purge_read_notifications(days=90)

        self.assertEqual(result["deleted"], 1)
        self.assertFalse(Notification.objects.filter(pk=old_read.pk).exists())
        self.assertTrue(Notification.objects.filter(pk=old_unread.pk).exists())
