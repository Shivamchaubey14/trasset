"""Asset requests & approvals — FR-4.4, SRS §11.4."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus, RequestStatus
from apps.assets.models import Asset, AssetAssignment, AssetRequest
from apps.audit.constants import AuditAction
from apps.audit.models import AuditLog
from apps.audit.services import suspend
from apps.masters.models import Category, Department, Location

from .base import TrassetAPITestCase


class RequestTestCase(TrassetAPITestCase):
    url = "/api/v1/asset-requests/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.category = Category.objects.create(name="Laptops")
        cls.office = Location.objects.create(name="Head Office")
        cls.it = Department.objects.create(name="IT", code="IT")

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

    def make_request(self, requester=None, **kwargs):
        defaults = {
            "requester": requester or self.employee,
            "reason": "Mine is failing and I need a replacement.",
        }
        with suspend():
            return AssetRequest.objects.create(**{**defaults, **kwargs})


class RequestCreateTests(RequestTestCase):
    def test_employee_can_request_a_specific_asset(self):
        asset = self.make_asset()
        self.login(self.employee)

        response = self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "My current laptop keeps crashing."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["status"], RequestStatus.PENDING)
        self.assertEqual(body["data"]["requester"]["id"], self.employee.id)

    def test_employee_can_request_a_category(self):
        """Someone asking for 'a laptop' shouldn't have to browse the register."""
        self.login(self.employee)
        response = self.client.post(
            self.url,
            {"category_id": self.category.id, "reason": "Starting on Monday, need a machine."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()["data"]["target_label"], "Any Laptops")

    def test_requester_is_taken_from_the_token_not_the_payload(self):
        """Nobody should be able to raise a request in someone else's name."""
        asset = self.make_asset()
        self.login(self.employee)
        response = self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "Need this for a project.",
             "requester": self.admin.id},
            format="json",
        )
        self.assertEqual(response.json()["data"]["requester"]["id"], self.employee.id)

    def test_asset_or_category_is_required(self):
        self.login(self.employee)
        response = self.client.post(
            self.url, {"reason": "I need something to work on."}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("asset_id", response.json()["errors"])

    def test_reason_must_be_meaningful(self):
        asset = self.make_asset()
        self.login(self.employee)
        response = self.client.post(
            self.url, {"asset_id": asset.id, "reason": "need"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("reason", response.json()["errors"])

    def test_cannot_request_a_retired_asset(self):
        asset = self.make_asset(status=AssetStatus.RETIRED)
        self.login(self.employee)
        response = self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "I would like this one please."},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_needed_by_cannot_be_in_the_past(self):
        asset = self.make_asset()
        self.login(self.employee)
        response = self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "Needed for onboarding next week.",
             "needed_by": (date.today() - timedelta(days=2)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("needed_by", response.json()["errors"])

    def test_duplicate_pending_request_is_rejected(self):
        asset = self.make_asset()
        self.make_request(asset=asset)
        self.login(self.employee)

        response = self.client.post(
            self.url,
            {"asset_id": asset.id, "reason": "Asking again for the same thing."},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_submission_is_audited_as_requested(self):
        asset = self.make_asset()
        self.login(self.employee)
        self.client.post(
            self.url, {"asset_id": asset.id, "reason": "My laptop keeps crashing."},
            format="json",
        )
        self.assertTrue(
            AuditLog.objects.filter(action=AuditAction.REQUEST,
                                    entity_type="AssetRequest").exists()
        )


class RequestVisibilityTests(RequestTestCase):
    """Scoping happens in get_queryset, so a query string can't widen it."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.employee.department = cls.it
        cls.employee.save(update_fields=["department"])
        cls.head.department = cls.it
        cls.head.save(update_fields=["department"])

    def setUp(self):
        self.employee_request = self.make_request(self.employee, category=self.category)
        self.auditor_request = self.make_request(self.auditor, category=self.category)

    def test_employee_sees_only_their_own(self):
        self.login(self.employee)
        data = self.client.get(self.url).json()["data"]
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["results"][0]["id"], self.employee_request.id)

    def test_employee_cannot_widen_the_scope_with_a_filter(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?requester={self.auditor.id}").json()["data"]
        self.assertEqual(data["count"], 0)

    def test_employee_cannot_read_another_persons_request(self):
        self.login(self.employee)
        response = self.client.get(f"{self.url}{self.auditor_request.id}/")
        self.assertEqual(response.status_code, 404)

    def test_department_head_sees_their_department(self):
        self.login(self.head)
        data = self.client.get(self.url).json()["data"]
        ids = [row["id"] for row in data["results"]]
        self.assertIn(self.employee_request.id, ids)
        self.assertNotIn(self.auditor_request.id, ids)

    def test_managers_see_everything(self):
        for user in (self.manager, self.admin):
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).json()["data"]["count"], 2)

    def test_stats_respect_the_same_scope(self):
        self.login(self.employee)
        self.assertEqual(self.client.get(f"{self.url}stats/").json()["data"]["total"], 1)

        self.login(self.manager)
        self.assertEqual(self.client.get(f"{self.url}stats/").json()["data"]["total"], 2)


class RequestApprovalTests(RequestTestCase):
    def test_approving_assigns_the_asset(self):
        """FR-4.4 — the full request → approve → auto-assign loop."""
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{asset_request.id}/approve/", {"notes": "Approved"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(asset.assigned_to, self.employee)

        asset_request.refresh_from_db()
        self.assertEqual(asset_request.status, RequestStatus.APPROVED)
        self.assertEqual(asset_request.decided_by, self.manager)
        self.assertEqual(asset_request.fulfilled_asset, asset)

    def test_approving_writes_assignment_history(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/approve/", {}, format="json")

        row = AssetAssignment.objects.filter(asset=asset).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.user, self.employee)
        self.assertIn("Approved request", row.notes)

    def test_category_request_requires_an_asset_choice(self):
        asset_request = self.make_request(category=self.category)
        self.login(self.manager)

        response = self.client.post(
            f"{self.url}{asset_request.id}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("Choose which asset", response.json()["message"])

    def test_category_request_approved_with_a_chosen_asset(self):
        asset = self.make_asset()
        asset_request = self.make_request(category=self.category)

        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{asset_request.id}/approve/",
            {"asset_id": asset.id}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

        asset.refresh_from_db()
        self.assertEqual(asset.assigned_to, self.employee)

    def test_approver_can_substitute_a_different_asset(self):
        wanted = self.make_asset(name="Wanted")
        given = self.make_asset(name="Given")
        asset_request = self.make_request(asset=wanted)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/approve/",
                         {"asset_id": given.id}, format="json")

        asset_request.refresh_from_db()
        self.assertEqual(asset_request.fulfilled_asset, given)
        wanted.refresh_from_db()
        self.assertEqual(wanted.status, AssetStatus.AVAILABLE)

    def test_approval_rolls_back_if_the_asset_was_taken(self):
        """
        The asset went to someone else between request and decision. The whole
        approval must roll back rather than marking it approved with nothing
        handed over.
        """
        asset = self.make_asset(status=AssetStatus.ASSIGNED, assigned_to=self.head)
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{asset_request.id}/approve/", {}, format="json"
        )
        self.assertEqual(response.status_code, 409)

        asset_request.refresh_from_db()
        self.assertEqual(asset_request.status, RequestStatus.PENDING)
        self.assertIsNone(asset_request.decided_at)

    def test_approving_twice_is_409(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/approve/", {}, format="json")
        response = self.client.post(f"{self.url}{asset_request.id}/approve/", {},
                                    format="json")

        self.assertEqual(response.status_code, 409)
        self.assertIn("already been approved", response.json()["message"])

    def test_approval_is_audited_with_its_own_verb(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/approve/", {}, format="json")

        entry = AuditLog.objects.filter(action=AuditAction.APPROVE).first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.changes["_context"]["asset"], asset.asset_tag)


class RequestRejectionTests(RequestTestCase):
    def test_rejecting_records_the_reason(self):
        asset_request = self.make_request(category=self.category)
        self.login(self.manager)

        response = self.client.post(
            f"{self.url}{asset_request.id}/reject/",
            {"notes": "No spare stock until next quarter."}, format="json",
        )
        self.assertEqual(response.status_code, 200)

        asset_request.refresh_from_db()
        self.assertEqual(asset_request.status, RequestStatus.REJECTED)
        self.assertEqual(asset_request.decision_notes, "No spare stock until next quarter.")

    def test_rejection_requires_a_reason(self):
        asset_request = self.make_request(category=self.category)
        self.login(self.manager)
        response = self.client.post(f"{self.url}{asset_request.id}/reject/", {},
                                    format="json")
        self.assertEqual(response.status_code, 400)

    def test_rejecting_assigns_nothing(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/reject/",
                         {"notes": "Not approved."}, format="json")

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)
        self.assertIsNone(asset.assigned_to)


class RequestPermissionTests(RequestTestCase):
    def test_employees_and_auditors_cannot_approve(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        for user in (self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(f"{self.url}{asset_request.id}/approve/", {},
                                            format="json")
                self.assertEqual(response.status_code, 403)

    def test_department_head_can_approve(self):
        self.employee.department = self.it
        self.employee.save(update_fields=["department"])
        self.head.department = self.it
        self.head.save(update_fields=["department"])

        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.head)
        response = self.client.post(f"{self.url}{asset_request.id}/approve/", {},
                                    format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_auditor_cannot_raise_a_request(self):
        """Auditors are read-only everywhere, including here."""
        asset = self.make_asset()
        self.login(self.auditor)
        response = self.client.post(
            self.url, {"asset_id": asset.id, "reason": "I would like this one."},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_requires_authentication(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)


class RequestCancelTests(RequestTestCase):
    def test_requester_can_cancel_while_pending(self):
        asset_request = self.make_request(category=self.category)
        self.login(self.employee)

        response = self.client.post(f"{self.url}{asset_request.id}/cancel/", {},
                                    format="json")
        self.assertEqual(response.status_code, 200)

        asset_request.refresh_from_db()
        self.assertEqual(asset_request.status, RequestStatus.CANCELLED)

    def test_someone_else_cannot_cancel_it(self):
        asset_request = self.make_request(category=self.category)
        self.login(self.manager)

        response = self.client.post(f"{self.url}{asset_request.id}/cancel/", {},
                                    format="json")
        self.assertEqual(response.status_code, 409)

    def test_a_decided_request_cannot_be_cancelled(self):
        asset = self.make_asset()
        asset_request = self.make_request(asset=asset)

        self.login(self.manager)
        self.client.post(f"{self.url}{asset_request.id}/approve/", {}, format="json")

        self.login(self.employee)
        response = self.client.post(f"{self.url}{asset_request.id}/cancel/", {},
                                    format="json")
        self.assertEqual(response.status_code, 409)
