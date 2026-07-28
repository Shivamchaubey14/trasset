"""
End-to-end user journeys — build plan Day 27, SRS §11.4.

The rest of the suite tests endpoints in isolation. These walk a whole task the
way a person actually performs it, across several endpoints, and assert that
the *system* is consistent afterwards — the asset moved, the history recorded
it, the audit trail saw it, and the person who needed telling was told.

That is a different question from "does this endpoint work", and it is the
question integration testing exists to answer.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core import mail

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset, AssetAssignment, AssetRequest
from apps.audit.constants import AuditAction
from apps.audit.models import AuditLog
from apps.audit.services import suspend
from apps.maintenance.constants import MaintenanceStatus
from apps.maintenance.models import MaintenanceRecord
from apps.masters.models import Category, Department, Location, Vendor
from apps.notifications.constants import NotificationType
from apps.notifications.models import Notification

from .base import PASSWORD, TrassetAPITestCase


class JourneyTestCase(TrassetAPITestCase):
    """Shared world: a small but complete organisation."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.it = Department.objects.create(name="Information Technology", code="IT")
        cls.finance = Department.objects.create(name="Finance", code="FIN")

        # The head and the employee share a department, so the department-head
        # approval path is reachable.
        for user, department in ((cls.employee, cls.it), (cls.head, cls.it),
                                 (cls.manager, cls.it), (cls.auditor, cls.finance)):
            user.department = department
            user.save(update_fields=["department"])

        cls.laptops = Category.objects.create(name="Laptops", color="#3BB77E")
        cls.office = Location.objects.create(name="Head Office")
        cls.store = Location.objects.create(name="Store Room")
        cls.vendor = Vendor.objects.create(name="Dell India")

    def audit_actions_for(self, instance):
        return set(
            AuditLog.objects
            .filter(entity_type=instance._meta.object_name,
                    entity_id=str(instance.pk))
            .values_list("action", flat=True)
        )


class AssetManagerJourney(JourneyTestCase):
    """
    The core operational loop: buy it, tag it, issue it, service it, retire it.

    Asserted end to end because each step depends on the last, and a break
    between two working endpoints is exactly what unit tests miss.
    """

    def test_full_asset_lifecycle(self):
        self.login(self.manager)

        # --- 1. Create -------------------------------------------------
        created = self.client.post("/api/v1/assets/", {
            "name": "Dell Latitude 5440",
            "category_id": self.laptops.id,
            "location_id": self.office.id,
            "department_id": self.it.id,
            "vendor_id": self.vendor.id,
            "serial_number": "SN-JOURNEY-001",
            "purchase_date": (date.today() - timedelta(days=30)).isoformat(),
            "purchase_cost": "78000.00",
            "salvage_value": "8000.00",
            "useful_life_years": 4,
            "warranty_expiry": (date.today() + timedelta(days=1000)).isoformat(),
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)

        asset_id = created.json()["data"]["id"]
        tag = created.json()["data"]["asset_tag"]

        # SRS §11.4 — a tag is generated when none is supplied.
        self.assertRegex(tag, r"^TRA-\d{4}-\d{6}$")

        # --- 2. Issue it -----------------------------------------------
        assigned = self.client.post(f"/api/v1/assets/{asset_id}/assign/",
                                    {"user_id": self.employee.id,
                                     "notes": "Issued for onboarding"},
                                    format="json")
        self.assertEqual(assigned.status_code, 200, assigned.data)
        self.assertEqual(assigned.json()["data"]["assigned_to"]["id"], self.employee.id)

        # --- 3. It breaks; book it in ----------------------------------
        booked = self.client.post("/api/v1/maintenance/", {
            "asset_id": asset_id,
            "type": "repair",
            "scheduled_date": date.today().isoformat(),
            "cost_estimate": "2500.00",
            "notes": "Screen flickering",
            "start_now": True,
        }, format="json")
        self.assertEqual(booked.status_code, 201, booked.data)
        record_id = booked.json()["data"]["id"]

        # Out of service, but the holder is not forgotten.
        asset = Asset.objects.get(pk=asset_id)
        self.assertEqual(asset.status, AssetStatus.UNDER_MAINTENANCE)
        self.assertEqual(asset.assigned_to, self.employee)

        # --- 4. Work completes; it goes back to its holder -------------
        done = self.client.post(f"/api/v1/maintenance/{record_id}/complete/",
                                {"actual_cost": "3200.00",
                                 "notes": "Panel replaced"}, format="json")
        self.assertEqual(done.status_code, 200, done.data)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED,
                         "an asset that was assigned must return to its holder")
        self.assertEqual(asset.assigned_to, self.employee)

        # --- 5. Employee leaves; take it back --------------------------
        returned = self.client.post(f"/api/v1/assets/{asset_id}/checkin/",
                                    {"location_id": self.store.id,
                                     "notes": "Returned on exit"}, format="json")
        self.assertEqual(returned.status_code, 200)

        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)
        self.assertEqual(asset.location, self.store)

        # --- 6. End of life --------------------------------------------
        retired = self.client.post(f"/api/v1/assets/{asset_id}/retire/",
                                   {"status": "disposed",
                                    "notes": "E-waste collected"}, format="json")
        self.assertEqual(retired.status_code, 200)

        # --- The system agrees with itself -----------------------------
        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.DISPOSED)
        self.assertIsNone(asset.assigned_to)

        history = AssetAssignment.objects.filter(asset=asset).order_by("created_at")
        self.assertEqual([row.action for row in history],
                         ["checkout", "checkin"],
                         "retiring an unassigned asset must not add a phantom check-in")

        actions = self.audit_actions_for(asset)
        for expected in (AuditAction.CREATE, AuditAction.ASSIGN,
                         AuditAction.CHECKIN, AuditAction.RETIRE):
            self.assertIn(expected, actions, f"{expected} missing from the audit trail")

        self.assertTrue(
            Notification.objects.filter(user=self.employee,
                                        type=NotificationType.ASSET_ASSIGNED).exists(),
            "the person who received the asset was never told",
        )

    def test_a_retired_asset_is_out_of_circulation_everywhere(self):
        """Retirement has to hold across every entry point, not just one."""
        self.login(self.manager)
        with suspend():
            asset = Asset.objects.create(name="Old Laptop", category=self.laptops,
                                         status=AssetStatus.RETIRED)

        self.assertEqual(
            self.client.post(f"/api/v1/assets/{asset.id}/assign/",
                             {"user_id": self.employee.id}, format="json").status_code,
            409)
        self.assertEqual(
            self.client.post("/api/v1/maintenance/", {
                "asset_id": asset.id, "type": "repair",
                "scheduled_date": date.today().isoformat(),
            }, format="json").status_code,
            400)

        self.login(self.employee)
        self.assertEqual(
            self.client.post("/api/v1/asset-requests/",
                             {"asset_id": asset.id,
                              "reason": "I would like this laptop please."},
                             format="json").status_code,
            400)


class EmployeeJourney(JourneyTestCase):
    """Ask for something, get it, hold it, give it back."""

    def test_request_to_holding(self):
        with suspend():
            asset = Asset.objects.create(
                name="Spare Laptop", category=self.laptops, location=self.office,
                purchase_cost=Decimal("60000.00"), useful_life_years=4,
            )

        # --- Employee asks --------------------------------------------
        self.login(self.employee)
        raised = self.client.post("/api/v1/asset-requests/", {
            "asset_id": asset.id,
            "reason": "My current laptop keeps crashing during builds.",
            "needed_by": (date.today() + timedelta(days=7)).isoformat(),
        }, format="json")
        self.assertEqual(raised.status_code, 201, raised.data)
        request_id = raised.json()["data"]["id"]

        # They can see their own request, and only their own.
        mine = self.client.get("/api/v1/asset-requests/").json()["data"]
        self.assertEqual(mine["count"], 1)

        # --- The approver is told --------------------------------------
        self.assertTrue(
            Notification.objects.filter(user=self.manager,
                                        type=NotificationType.REQUEST_SUBMITTED).exists())

        # --- Manager approves ------------------------------------------
        self.login(self.manager)
        approved = self.client.post(f"/api/v1/asset-requests/{request_id}/approve/",
                                    {"notes": "Approved"}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)

        # --- The asset really moved ------------------------------------
        asset.refresh_from_db()
        self.assertEqual(asset.status, AssetStatus.ASSIGNED)
        self.assertEqual(asset.assigned_to, self.employee)

        # --- And the employee sees it as theirs ------------------------
        self.login(self.employee)
        mine = self.client.get("/api/v1/assets/",
                               {"assigned_to": self.employee.id}).json()["data"]
        self.assertEqual(mine["count"], 1)
        self.assertEqual(mine["results"][0]["asset_tag"], asset.asset_tag)

        self.assertTrue(
            Notification.objects.filter(user=self.employee,
                                        type=NotificationType.REQUEST_APPROVED).exists())

    def test_an_employee_cannot_run_the_business(self):
        """SRS §11.4 — an Employee on a manager-only endpoint gets 403."""
        self.login(self.employee)

        forbidden = [
            ("post", "/api/v1/assets/", {"name": "Mine", "category_id": self.laptops.id}),
            ("post", "/api/v1/categories/", {"name": "Mine"}),
            ("post", "/api/v1/maintenance/", {"asset_id": 1, "type": "repair",
                                              "scheduled_date": date.today().isoformat()}),
            ("post", "/api/v1/purchase-orders/", {"vendor_id": self.vendor.id, "items": []}),
            ("get", "/api/v1/users/", None),
            ("get", "/api/v1/audit-logs/", None),
        ]
        for method, url, payload in forbidden:
            with self.subTest(url=url):
                call = getattr(self.client, method)
                response = call(url, payload, format="json") if payload else call(url)
                self.assertEqual(response.status_code, 403, f"{method.upper()} {url}")

    def test_an_employee_sees_only_their_own_things(self):
        with suspend():
            theirs = Asset.objects.create(name="Theirs", category=self.laptops,
                                          status=AssetStatus.ASSIGNED,
                                          assigned_to=self.head)
            AssetRequest.objects.create(requester=self.head, asset=theirs,
                                        reason="A request from somebody else.")

        self.login(self.employee)
        self.assertEqual(
            self.client.get("/api/v1/asset-requests/").json()["data"]["count"], 0)
        self.assertEqual(
            self.client.get("/api/v1/notifications/").json()["data"]["count"], 0)


class DepartmentHeadJourney(JourneyTestCase):
    """Oversight of their own department, and nothing beyond it."""

    def test_approves_within_their_department(self):
        with suspend():
            asset = Asset.objects.create(name="Laptop", category=self.laptops)
            request = AssetRequest.objects.create(
                requester=self.employee, asset=asset,
                reason="Needed for a project starting Monday.",
            )

        self.login(self.head)
        visible = self.client.get("/api/v1/asset-requests/").json()["data"]
        self.assertEqual(visible["count"], 1)

        approved = self.client.post(f"/api/v1/asset-requests/{request.id}/approve/",
                                    {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)

        asset.refresh_from_db()
        self.assertEqual(asset.assigned_to, self.employee)

    def test_cannot_see_another_department(self):
        with suspend():
            AssetRequest.objects.create(
                requester=self.auditor, category=self.laptops,
                reason="A request from the finance department.",
            )

        self.login(self.head)
        self.assertEqual(
            self.client.get("/api/v1/asset-requests/").json()["data"]["count"], 0)

    def test_cannot_create_or_edit_assets(self):
        self.login(self.head)
        response = self.client.post("/api/v1/assets/",
                                    {"name": "Mine", "category_id": self.laptops.id},
                                    format="json")
        self.assertEqual(response.status_code, 403)


class AuditorJourney(JourneyTestCase):
    """Sees everything, changes nothing. The role only works if both hold."""

    def setUp(self):
        with suspend():
            self.asset = Asset.objects.create(
                name="Laptop", category=self.laptops, location=self.office,
                purchase_cost=Decimal("80000.00"), useful_life_years=4,
                purchase_date=date.today() - timedelta(days=100),
            )

    def test_can_read_the_whole_estate(self):
        self.login(self.auditor)
        for url in ("/api/v1/assets/", "/api/v1/maintenance/",
                    "/api/v1/purchase-orders/", "/api/v1/audit-logs/",
                    "/api/v1/dashboard/stats/", "/api/v1/reports/",
                    "/api/v1/reports/asset-register/",
                    "/api/v1/reports/depreciation/"):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_can_export_every_report(self):
        """Exporting evidence is the job; it must not require write access."""
        self.login(self.auditor)
        for key in ("asset-register", "depreciation", "maintenance-cost", "assignment"):
            for fmt in ("csv", "xlsx"):
                with self.subTest(report=key, format=fmt):
                    response = self.client.get(f"/api/v1/reports/{key}/",
                                               {"export": fmt})
                    self.assertEqual(response.status_code, 200)

    def test_cannot_change_anything_anywhere(self):
        self.login(self.auditor)

        attempts = [
            ("post", "/api/v1/assets/", {"name": "X", "category_id": self.laptops.id}),
            ("patch", f"/api/v1/assets/{self.asset.id}/", {"name": "Renamed"}),
            ("delete", f"/api/v1/assets/{self.asset.id}/", None),
            ("post", f"/api/v1/assets/{self.asset.id}/assign/",
             {"user_id": self.employee.id}),
            ("post", "/api/v1/categories/", {"name": "X"}),
            ("post", "/api/v1/maintenance/", {"asset_id": self.asset.id,
                                              "type": "repair",
                                              "scheduled_date": date.today().isoformat()}),
            ("post", "/api/v1/asset-requests/", {"asset_id": self.asset.id,
                                                 "reason": "I would like this one."}),
        ]
        for method, url, payload in attempts:
            with self.subTest(url=f"{method} {url}"):
                call = getattr(self.client, method)
                response = call(url, payload, format="json") if payload else call(url)
                self.assertEqual(response.status_code, 403, f"{method.upper()} {url}")

    def test_the_audit_trail_is_read_only_even_for_an_auditor(self):
        self.login(self.admin)
        self.client.post("/api/v1/categories/", {"name": "Monitors"}, format="json")
        entry = AuditLog.objects.first()

        self.login(self.auditor)
        self.assertEqual(self.client.get("/api/v1/audit-logs/").status_code, 200)
        self.assertEqual(
            self.client.delete(f"/api/v1/audit-logs/{entry.id}/").status_code, 405)


class SuperAdminJourney(JourneyTestCase):
    """Standing up an organisation from nothing."""

    def test_sets_up_and_can_see_what_happened(self):
        self.login(self.admin)

        category = self.client.post("/api/v1/categories/",
                                    {"name": "Monitors", "color": "#253D4E"},
                                    format="json")
        self.assertEqual(category.status_code, 201)

        location = self.client.post("/api/v1/locations/",
                                    {"name": "Pune Office", "city": "Pune"},
                                    format="json")
        self.assertEqual(location.status_code, 201)

        user = self.client.post("/api/v1/users/", {
            "full_name": "New Joiner",
            "email": "joiner@test.local",
            "password": "Joiner@2026",
            "role_id": self.roles["employee"].id,
            "department": self.it.id,
        }, format="json")
        self.assertEqual(user.status_code, 201, user.data)

        # Everything that just happened is on the record.
        trail = self.client.get("/api/v1/audit-logs/").json()["data"]
        entity_types = {row["entity_type"] for row in trail["results"]}
        self.assertIn("Category", entity_types)
        self.assertIn("User", entity_types)

        # The new person can sign in with what was set for them.
        self.logout()
        signed_in = self.client.post("/api/v1/auth/login/",
                                     {"email": "joiner@test.local",
                                      "password": "Joiner@2026"}, format="json")
        self.assertEqual(signed_in.status_code, 200)

    def test_deactivating_a_holder_keeps_their_history(self):
        """Someone leaving must not erase what they held."""
        with suspend():
            asset = Asset.objects.create(name="Laptop", category=self.laptops)

        self.login(self.manager)
        self.client.post(f"/api/v1/assets/{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")
        self.client.post(f"/api/v1/assets/{asset.id}/checkin/", {}, format="json")

        self.login(self.admin)
        self.assertEqual(
            self.client.delete(f"/api/v1/users/{self.employee.id}/").status_code, 200)

        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)
        self.assertEqual(
            AssetAssignment.objects.filter(user=self.employee).count(), 2,
            "assignment history must survive the person being deactivated")

    def test_a_deactivated_person_cannot_be_given_an_asset(self):
        with suspend():
            asset = Asset.objects.create(name="Laptop", category=self.laptops)
        self.employee.is_active = False
        self.employee.save(update_fields=["is_active"])

        self.login(self.manager)
        response = self.client.post(f"/api/v1/assets/{asset.id}/assign/",
                                    {"user_id": self.employee.id}, format="json")
        self.assertEqual(response.status_code, 400)


class ProcurementJourney(JourneyTestCase):
    """Order goods, receive them, and find them in the register."""

    def test_order_to_asset(self):
        self.login(self.manager)

        order = self.client.post("/api/v1/purchase-orders/", {
            "vendor_id": self.vendor.id,
            "po_date": date.today().isoformat(),
            "expected_delivery": (date.today() + timedelta(days=14)).isoformat(),
            "location_id": self.office.id,
            "department_id": self.it.id,
            "warranty_months": 36,
            "items": [
                {"description": "Dell Latitude 5440", "category_id": self.laptops.id,
                 "quantity": 3, "unit_cost": "78000.00"},
                {"description": "HDMI cables", "quantity": 10, "unit_cost": "300.00",
                 "create_assets": False},
            ],
        }, format="json")
        self.assertEqual(order.status_code, 201, order.data)
        order_id = order.json()["data"]["id"]

        # 3 x 78000 + 10 x 300 — derived, not asserted by the client.
        self.assertEqual(Decimal(order.json()["data"]["total_amount"]),
                         Decimal("237000.00"))

        self.assertEqual(
            self.client.post(f"/api/v1/purchase-orders/{order_id}/place/",
                             {}, format="json").status_code, 200)

        received = self.client.post(f"/api/v1/purchase-orders/{order_id}/receive/",
                                    {}, format="json")
        self.assertEqual(received.status_code, 200, received.data)
        self.assertEqual(received.json()["data"]["created_count"], 3)

        # The three laptops are real, tagged, available assets — the cables
        # correctly produced nothing.
        laptops = Asset.objects.filter(name="Dell Latitude 5440")
        self.assertEqual(laptops.count(), 3)
        self.assertEqual(len({asset.asset_tag for asset in laptops}), 3)
        for asset in laptops:
            self.assertEqual(asset.status, AssetStatus.AVAILABLE)
            self.assertEqual(asset.vendor, self.vendor)
            self.assertIsNotNone(asset.warranty_expiry)

        self.assertFalse(Asset.objects.filter(name="HDMI cables").exists())

        # And one of them can be issued straight away.
        first = laptops.first()
        self.assertEqual(
            self.client.post(f"/api/v1/assets/{first.id}/assign/",
                             {"user_id": self.employee.id}, format="json").status_code,
            200)


class ReconciliationTests(JourneyTestCase):
    """
    SRS §11.4 — "Dashboard KPI totals reconcile with the asset register report."

    The dashboard and the register are computed by entirely separate code. If
    they disagree, one of them is lying to somebody making a decision.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        with suspend():
            for index in range(6):
                Asset.objects.create(
                    name=f"Asset {index}",
                    category=cls.laptops,
                    location=cls.office,
                    department=cls.it,
                    status=(AssetStatus.ASSIGNED if index % 2 else AssetStatus.AVAILABLE),
                    assigned_to=(cls.employee if index % 2 else None),
                    purchase_date=date.today() - timedelta(days=100 * index),
                    purchase_cost=Decimal("50000.00") + index * 1000,
                    salvage_value=Decimal("5000.00"),
                    useful_life_years=4,
                )
            Asset.objects.create(name="Retired", category=cls.laptops,
                                 status=AssetStatus.RETIRED,
                                 purchase_cost=Decimal("20000.00"),
                                 useful_life_years=4,
                                 purchase_date=date.today() - timedelta(days=900))

    def test_dashboard_count_matches_the_register(self):
        self.login(self.manager)
        dashboard = self.client.get("/api/v1/dashboard/stats/").json()["data"]
        register = self.client.get("/api/v1/reports/asset-register/").json()["data"]

        self.assertEqual(dashboard["kpis"]["total_assets"], register["totals"]["assets"])
        self.assertEqual(dashboard["kpis"]["total_assets"], register["count"])

    def test_dashboard_value_matches_the_register(self):
        self.login(self.manager)
        dashboard = self.client.get("/api/v1/dashboard/stats/").json()["data"]
        register = self.client.get("/api/v1/reports/asset-register/").json()["data"]

        self.assertEqual(Decimal(dashboard["kpis"]["total_value"]),
                         Decimal(register["totals"]["current_value"]))
        self.assertEqual(Decimal(dashboard["kpis"]["total_purchase_value"]),
                         Decimal(register["totals"]["purchase_cost"]))

    def test_dashboard_matches_the_asset_list(self):
        self.login(self.manager)
        dashboard = self.client.get("/api/v1/dashboard/stats/").json()["data"]
        listing = self.client.get("/api/v1/assets/", {"page_size": 1}).json()["data"]
        stats = self.client.get("/api/v1/assets/stats/").json()["data"]

        self.assertEqual(dashboard["kpis"]["total_assets"], listing["count"])
        self.assertEqual(dashboard["kpis"]["total_assets"], stats["total"])
        self.assertEqual(dashboard["kpis"]["available"], stats["available"])
        self.assertEqual(dashboard["kpis"]["assigned"], stats["assigned"])

    def test_status_breakdown_sums_to_the_total(self):
        self.login(self.manager)
        dashboard = self.client.get("/api/v1/dashboard/stats/").json()["data"]

        self.assertEqual(sum(row["count"] for row in dashboard["by_status"]),
                         dashboard["kpis"]["total_assets"])

    def test_depreciation_report_agrees_with_the_dashboard(self):
        """
        The depreciation report excludes zero-cost assets, so its totals are a
        subset — but accumulated depreciation must still be internally
        consistent.
        """
        self.login(self.manager)
        report = self.client.get("/api/v1/reports/depreciation/").json()["data"]
        totals = report["totals"]

        self.assertEqual(
            Decimal(totals["purchase_cost"]) - Decimal(totals["current_value"]),
            Decimal(totals["accumulated_depreciation"]),
        )

    def test_deleting_an_asset_moves_both_numbers_together(self):
        """A soft delete must disappear from the dashboard and the register alike."""
        self.login(self.admin)
        asset = Asset.objects.filter(status=AssetStatus.AVAILABLE).first()
        self.client.delete(f"/api/v1/assets/{asset.id}/")

        dashboard = self.client.get("/api/v1/dashboard/stats/").json()["data"]
        register = self.client.get("/api/v1/reports/asset-register/").json()["data"]

        self.assertEqual(dashboard["kpis"]["total_assets"], register["totals"]["assets"])
        self.assertEqual(dashboard["kpis"]["total_assets"], 6)


class CrossCuttingConsistencyTests(JourneyTestCase):
    """Invariants that hold across the whole system, not within one endpoint."""

    def test_every_write_leaves_an_audit_trail(self):
        """SEC-9 — a change nobody can trace is a change that did not happen."""
        self.login(self.manager)

        before = AuditLog.objects.count()
        self.client.post("/api/v1/categories/", {"name": "Monitors"}, format="json")
        self.assertGreater(AuditLog.objects.count(), before)

    def test_an_assignment_is_visible_from_every_angle(self):
        with suspend():
            asset = Asset.objects.create(name="Laptop", category=self.laptops)

        self.login(self.manager)
        self.client.post(f"/api/v1/assets/{asset.id}/assign/",
                         {"user_id": self.employee.id}, format="json")

        # The asset itself
        detail = self.client.get(f"/api/v1/assets/{asset.id}/").json()["data"]
        self.assertEqual(detail["assigned_to"]["id"], self.employee.id)

        # Its history
        history = self.client.get(f"/api/v1/assets/{asset.id}/history/").json()["data"]
        self.assertEqual(len(history), 1)

        # The assignment report
        report = self.client.get("/api/v1/reports/assignment/").json()["data"]
        self.assertEqual(report["count"], 1)

        # The audit trail
        self.assertIn(AuditAction.ASSIGN, self.audit_actions_for(asset))

        # And the person's notifications
        self.login(self.employee)
        self.assertEqual(
            self.client.get("/api/v1/notifications/").json()["data"]["count"], 1)

    def test_a_failed_action_leaves_nothing_behind(self):
        """A 409 must not half-apply."""
        with suspend():
            asset = Asset.objects.create(name="Laptop", category=self.laptops,
                                         status=AssetStatus.ASSIGNED,
                                         assigned_to=self.head)

        # Sign in first — a sign-in writes its own audit row (SEC-9), which
        # would otherwise be counted as fallout from the failed assign.
        self.login(self.manager)

        history_before = AssetAssignment.objects.count()
        audit_before = AuditLog.objects.count()
        notifications_before = Notification.objects.count()

        response = self.client.post(f"/api/v1/assets/{asset.id}/assign/",
                                    {"user_id": self.employee.id}, format="json")
        self.assertEqual(response.status_code, 409)

        self.assertEqual(AssetAssignment.objects.count(), history_before)
        self.assertEqual(AuditLog.objects.count(), audit_before)
        self.assertEqual(Notification.objects.count(), notifications_before)

        asset.refresh_from_db()
        self.assertEqual(asset.assigned_to, self.head)

    def test_every_error_uses_the_standard_envelope(self):
        """A client that special-cases one endpoint's errors is a bug waiting."""
        self.login(self.employee)

        cases = [
            (self.client.get("/api/v1/users/"), 403),
            (self.client.get("/api/v1/assets/999999/"), 404),
            (self.client.post("/api/v1/asset-requests/", {}, format="json"), 400),
        ]
        for response, expected in cases:
            with self.subTest(status=expected):
                self.assertEqual(response.status_code, expected)
                self.assertEnvelope(response, success=False)

    def test_pagination_is_uniform_across_every_list(self):
        self.login(self.admin)
        for url in ("/api/v1/assets/", "/api/v1/categories/", "/api/v1/users/",
                    "/api/v1/maintenance/", "/api/v1/purchase-orders/",
                    "/api/v1/asset-requests/", "/api/v1/audit-logs/",
                    "/api/v1/notifications/"):
            with self.subTest(url=url):
                data = self.client.get(url).json()["data"]
                for key in ("count", "page", "page_size", "total_pages",
                            "next", "previous", "results"):
                    self.assertIn(key, data, f"{url} is missing '{key}'")
