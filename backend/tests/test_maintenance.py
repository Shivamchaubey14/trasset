"""Maintenance management — FR-6.1 to FR-6.3, SRS §11.2."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.audit.services import suspend
from apps.maintenance.constants import MaintenanceStatus, MaintenanceType
from apps.maintenance.models import MaintenanceRecord
from apps.masters.models import Category, Vendor

from .base import TrassetAPITestCase


class MaintenanceTestCase(TrassetAPITestCase):
    url = "/api/v1/maintenance/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.vendor = Vendor.objects.create(name="TechServe")

    def make_asset(self, **kwargs):
        defaults = {
            "name": "Laptop",
            "category": self.category,
            "purchase_cost": Decimal("80000.00"),
            "useful_life_years": 4,
            "purchase_date": date.today() - timedelta(days=200),
        }
        with suspend():
            return Asset.objects.create(**{**defaults, **kwargs})

    def make_record(self, asset=None, **kwargs):
        defaults = {
            "asset": asset or self.make_asset(),
            "type": MaintenanceType.REPAIR,
            "scheduled_date": date.today(),
            "cost_estimate": Decimal("2000.00"),
        }
        with suspend():
            return MaintenanceRecord.objects.create(**{**defaults, **kwargs})

    def payload(self, asset, **overrides):
        data = {
            "asset_id": asset.id,
            "type": MaintenanceType.REPAIR,
            "scheduled_date": date.today().isoformat(),
            "technician": "Farhan Q.",
            "cost_estimate": "2500.00",
            "notes": "Screen flickering.",
        }
        data.update(overrides)
        return data


class SchedulingTests(MaintenanceTestCase):
    def test_manager_can_schedule(self):
        """FR-6.1"""
        asset = self.make_asset()
        self.login(self.manager)

        response = self.client.post(self.url, self.payload(asset), format="json")
        self.assertEqual(response.status_code, 201, response.data)

        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["status"], MaintenanceStatus.SCHEDULED)
        self.assertEqual(body["data"]["asset"]["asset_tag"], asset.asset_tag)

    def test_scheduling_alone_leaves_the_asset_usable(self):
        """An asset booked for next week is still in service today."""
        asset = self.make_asset()
        self.login(self.manager)
        self.client.post(
            self.url,
            self.payload(asset,
                         scheduled_date=(date.today() + timedelta(days=7)).isoformat()),
            format="json",
        )

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)

    def test_start_now_takes_the_asset_out_of_service(self):
        """FR-6.2"""
        asset = self.make_asset()
        self.login(self.manager)

        response = self.client.post(
            self.url, self.payload(asset, start_now=True), format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()["data"]["status"], MaintenanceStatus.IN_PROGRESS)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.UNDER_MAINTENANCE)

    def test_cannot_schedule_against_a_retired_asset(self):
        asset = self.make_asset(status=AssetStatus.RETIRED)
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(asset), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("asset_id", response.json()["errors"])

    def test_cannot_double_book_an_asset(self):
        """Two open records means nobody knows which one holds the asset."""
        asset = self.make_asset()
        self.make_record(asset)
        self.login(self.manager)

        response = self.client.post(self.url, self.payload(asset), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("already", str(response.json()["errors"]))

    def test_can_book_again_once_the_previous_record_is_closed(self):
        asset = self.make_asset()
        self.make_record(asset, status=MaintenanceStatus.COMPLETED)
        self.login(self.manager)

        response = self.client.post(self.url, self.payload(asset), format="json")
        self.assertEqual(response.status_code, 201, response.data)

    def test_negative_cost_estimate_is_rejected(self):
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(
            self.url, self.payload(asset, cost_estimate="-500.00"), format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_status_is_not_directly_writable(self):
        """The lifecycle runs through the actions so the asset stays in step."""
        asset = self.make_asset()
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(asset, status=MaintenanceStatus.COMPLETED),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["data"]["status"], MaintenanceStatus.SCHEDULED)


class StartTests(MaintenanceTestCase):
    def test_starting_moves_the_asset_out_of_service(self):
        record = self.make_record()
        self.login(self.manager)

        response = self.client.post(f"{self.url}{record.id}/start/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

        record.refresh_from_db()
        record.asset.refresh_from_db()
        self.assertEqual(record.status, MaintenanceStatus.IN_PROGRESS)
        self.assertEqual(record.asset.status, AssetStatus.UNDER_MAINTENANCE)
        self.assertIsNotNone(record.started_at)

    def test_starting_remembers_where_the_asset_was(self):
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        record = self.make_record(asset)
        self.login(self.manager)

        self.client.post(f"{self.url}{record.id}/start/", {}, format="json")

        record.refresh_from_db()
        self.assertEqual(record.asset_status_before, AssetStatus.ASSIGNED)

    def test_starting_twice_is_409(self):
        record = self.make_record()
        self.login(self.manager)
        self.client.post(f"{self.url}{record.id}/start/", {}, format="json")

        response = self.client.post(f"{self.url}{record.id}/start/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_cannot_start_against_a_retired_asset(self):
        asset = self.make_asset()
        record = self.make_record(asset)

        # Asset retired after the booking was made.
        Asset.objects.filter(pk=asset.pk).update(status=AssetStatus.RETIRED)

        self.login(self.manager)
        response = self.client.post(f"{self.url}{record.id}/start/", {}, format="json")
        self.assertEqual(response.status_code, 409)


class CompletionTests(MaintenanceTestCase):
    """FR-6.3 — the asset goes back where it came from."""

    def start_record(self, asset=None):
        record = self.make_record(asset)
        self.login(self.manager)
        self.client.post(f"{self.url}{record.id}/start/", {}, format="json")
        record.refresh_from_db()
        return record

    def test_completing_captures_cost_and_date(self):
        record = self.start_record()

        response = self.client.post(
            f"{self.url}{record.id}/complete/",
            {"actual_cost": "3200.50", "notes": "Screen replaced."},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

        record.refresh_from_db()
        self.assertEqual(record.status, MaintenanceStatus.COMPLETED)
        self.assertEqual(record.actual_cost, Decimal("3200.50"))
        self.assertEqual(record.completed_date, date.today())
        self.assertEqual(record.completed_by, self.manager)

    def test_an_available_asset_returns_to_available(self):
        record = self.start_record()
        self.client.post(f"{self.url}{record.id}/complete/", {}, format="json")

        record.asset.refresh_from_db()
        self.assertEqual(record.asset.status, AssetStatus.AVAILABLE)

    def test_an_assigned_asset_returns_to_its_holder(self):
        """
        The case a naive implementation gets wrong: a laptop that was Assigned
        when it went in for repair belongs back with its holder, not dropped
        into the Available pool.
        """
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        record = self.start_record(asset)

        self.client.post(f"{self.url}{record.id}/complete/", {}, format="json")

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(asset.assigned_to, self.employee)

    def test_falls_back_to_available_if_the_holder_went_away(self):
        """Restoring to Assigned with nobody holding it would be inconsistent."""
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        record = self.start_record(asset)

        Asset.objects.filter(pk=asset.pk).update(assigned_to=None)

        self.client.post(f"{self.url}{record.id}/complete/", {}, format="json")

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)

    def test_cost_variance_is_reported(self):
        record = self.start_record()
        self.client.post(f"{self.url}{record.id}/complete/",
                         {"actual_cost": "3000.00"}, format="json")

        row = self.client.get(f"{self.url}{record.id}/").json()["data"]
        # Estimate was 2000, actual 3000.
        self.assertEqual(Decimal(row["cost_variance"]), Decimal("1000.00"))

    def test_cannot_complete_a_record_that_never_started(self):
        record = self.make_record()
        self.login(self.manager)
        response = self.client.post(f"{self.url}{record.id}/complete/", {},
                                    format="json")
        self.assertEqual(response.status_code, 409)
        self.assertIn("hasn't started", response.json()["message"])

    def test_completing_twice_is_409(self):
        record = self.start_record()
        self.client.post(f"{self.url}{record.id}/complete/", {}, format="json")

        response = self.client.post(f"{self.url}{record.id}/complete/", {},
                                    format="json")
        self.assertEqual(response.status_code, 409)

    def test_a_future_completion_date_is_rejected(self):
        record = self.start_record()
        response = self.client.post(
            f"{self.url}{record.id}/complete/",
            {"completed_date": (date.today() + timedelta(days=3)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_negative_actual_cost_is_rejected(self):
        record = self.start_record()
        response = self.client.post(f"{self.url}{record.id}/complete/",
                                    {"actual_cost": "-100.00"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_completion_leaves_an_asset_someone_else_moved_alone(self):
        """
        If the asset was retired while it sat in the workshop, completing the
        record must not resurrect it.
        """
        record = self.start_record()
        Asset.objects.filter(pk=record.asset_id).update(status=AssetStatus.RETIRED)

        self.client.post(f"{self.url}{record.id}/complete/", {}, format="json")

        record.asset.refresh_from_db()
        self.assertEqual(record.asset.status, AssetStatus.RETIRED)


class CancellationTests(MaintenanceTestCase):
    def test_cancelling_a_scheduled_record_leaves_the_asset_alone(self):
        record = self.make_record()
        self.login(self.manager)

        self.client.post(f"{self.url}{record.id}/cancel/", {}, format="json")

        record.refresh_from_db()
        record.asset.refresh_from_db()
        self.assertEqual(record.status, MaintenanceStatus.CANCELLED)
        self.assertEqual(record.asset.status, AssetStatus.AVAILABLE)

    def test_cancelling_in_progress_work_puts_the_asset_back(self):
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.employee)
        record = self.make_record(asset)
        self.login(self.manager)
        self.client.post(f"{self.url}{record.id}/start/", {}, format="json")

        self.client.post(f"{self.url}{record.id}/cancel/",
                         {"notes": "Parts unavailable."}, format="json")

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)

    def test_cancelling_twice_is_409(self):
        record = self.make_record()
        self.login(self.manager)
        self.client.post(f"{self.url}{record.id}/cancel/", {}, format="json")

        response = self.client.post(f"{self.url}{record.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 409)


class MaintenancePermissionTests(MaintenanceTestCase):
    def test_everyone_can_see_what_is_booked(self):
        """An employee holding a laptop should see it is going in on Tuesday."""
        self.make_record()
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_only_managers_can_schedule(self):
        asset = self.make_asset()
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(self.url, self.payload(asset), format="json")
                self.assertEqual(response.status_code, 403)

    def test_only_managers_can_complete(self):
        record = self.make_record()
        self.login(self.manager)
        self.client.post(f"{self.url}{record.id}/start/", {}, format="json")

        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(f"{self.url}{record.id}/complete/", {},
                                            format="json")
                self.assertEqual(response.status_code, 403)

    def test_only_super_admin_can_delete(self):
        record = self.make_record()
        self.login(self.manager)
        self.assertEqual(self.client.delete(f"{self.url}{record.id}/").status_code, 403)

        self.login(self.admin)
        self.assertEqual(self.client.delete(f"{self.url}{record.id}/").status_code, 200)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)


class MaintenanceQueryTests(MaintenanceTestCase):
    def test_overdue_filter(self):
        """FR-6.5 groundwork — scheduled and past its date."""
        self.make_record(scheduled_date=date.today() - timedelta(days=5))
        self.make_record(scheduled_date=date.today() + timedelta(days=5))

        self.login(self.manager)
        data = self.client.get(f"{self.url}?overdue=true").json()["data"]
        self.assertEqual(data["count"], 1)
        self.assertTrue(data["results"][0]["is_overdue"])

    def test_open_only_filter(self):
        self.make_record()
        self.make_record(status=MaintenanceStatus.COMPLETED)

        self.login(self.manager)
        data = self.client.get(f"{self.url}?open_only=true").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_filter_by_status_and_type(self):
        self.make_record(type=MaintenanceType.PREVENTIVE)
        self.make_record(type=MaintenanceType.REPAIR)

        self.login(self.manager)
        data = self.client.get(f"{self.url}?type=preventive").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_search_by_asset_tag(self):
        record = self.make_record()
        self.login(self.manager)
        data = self.client.get(f"{self.url}?search={record.asset.asset_tag}").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_stats(self):
        self.make_record(scheduled_date=date.today() - timedelta(days=3))
        self.make_record(status=MaintenanceStatus.COMPLETED,
                         actual_cost=Decimal("5000.00"))

        self.login(self.manager)
        data = self.client.get(f"{self.url}stats/").json()["data"]

        self.assertEqual(data["total"], 2)
        self.assertEqual(data["overdue"], 1)
        self.assertEqual(data["completed"], 1)
        self.assertEqual(Decimal(data["total_actual_cost"]), Decimal("5000.00"))

    def test_list_query_count_does_not_grow_with_rows(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.make_record()
        self.login(self.manager)

        with CaptureQueriesContext(connection) as first:
            self.client.get(self.url, {"page_size": 1})

        for _ in range(15):
            self.make_record()

        with CaptureQueriesContext(connection) as second:
            self.client.get(self.url, {"page_size": 50})

        self.assertLessEqual(len(second.captured_queries),
                             len(first.captured_queries))
