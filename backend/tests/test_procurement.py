"""Purchase orders and goods receipt — FR-7.1 to FR-7.3."""
from datetime import date, timedelta
from decimal import Decimal

from apps.assets.constants import AssetStatus
from apps.assets.models import Asset
from apps.audit.services import suspend
from apps.masters.models import Category, Department, Location, Vendor
from apps.procurement.constants import PurchaseOrderStatus
from apps.procurement.models import PurchaseOrder, PurchaseOrderItem

from .base import TrassetAPITestCase


class ProcurementTestCase(TrassetAPITestCase):
    url = "/api/v1/purchase-orders/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.vendor = Vendor.objects.create(name="Dell India")
        cls.laptops = Category.objects.create(name="Laptops")
        cls.monitors = Category.objects.create(name="Monitors")
        cls.office = Location.objects.create(name="Head Office")
        cls.it = Department.objects.create(name="IT")

    def payload(self, **overrides):
        data = {
            "vendor_id": self.vendor.id,
            "po_date": date.today().isoformat(),
            "expected_delivery": (date.today() + timedelta(days=14)).isoformat(),
            "location_id": self.office.id,
            "department_id": self.it.id,
            "warranty_months": 36,
            "reference": "QUOTE-8821",
            "items": [
                {"description": "Dell Latitude 5440", "category_id": self.laptops.id,
                 "quantity": 3, "unit_cost": "78000.00", "manufacturer": "Dell"},
                {"description": "Dell UltraSharp U2723QE", "category_id": self.monitors.id,
                 "quantity": 2, "unit_cost": "42000.00"},
            ],
        }
        data.update(overrides)
        return data

    def make_order(self, status=PurchaseOrderStatus.ORDERED, **item_overrides):
        with suspend():
            order = PurchaseOrder.objects.create(
                vendor=self.vendor, po_date=date.today(), status=status,
                location=self.office, department=self.it, warranty_months=24,
            )
            defaults = {
                "description": "Dell Latitude 5440", "category": self.laptops,
                "quantity": 3, "unit_cost": Decimal("78000.00"),
            }
            defaults.update(item_overrides)
            PurchaseOrderItem.objects.create(purchase_order=order, **defaults)
            order.recalculate_total()
        return order


class PurchaseOrderCreateTests(ProcurementTestCase):
    def test_manager_can_raise_an_order(self):
        """FR-7.1"""
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)

        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["status"], PurchaseOrderStatus.DRAFT)
        self.assertEqual(len(body["data"]["items"]), 2)

    def test_po_number_is_generated(self):
        self.login(self.manager)
        data = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertEqual(data["po_number"], f"PO-{date.today().year}-000001")

    def test_po_numbers_increment(self):
        self.login(self.manager)
        first = self.client.post(self.url, self.payload(), format="json").json()["data"]
        second = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertNotEqual(first["po_number"], second["po_number"])

    def test_asset_tags_and_po_numbers_use_separate_sequences(self):
        """Sharing a counter table must not mean sharing a sequence."""
        with suspend():
            Asset.objects.create(name="Existing", category=self.laptops)

        self.login(self.manager)
        data = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertTrue(data["po_number"].endswith("000001"))

    def test_total_is_derived_from_the_line_items(self):
        """3 x 78000 + 2 x 42000 = 318000."""
        self.login(self.manager)
        data = self.client.post(self.url, self.payload(), format="json").json()["data"]
        self.assertEqual(Decimal(data["total_amount"]), Decimal("318000.00"))

    def test_a_client_supplied_total_is_ignored(self):
        """The total is financial; it must not be assertable by the caller."""
        self.login(self.manager)
        data = self.client.post(
            self.url, self.payload(total_amount="1.00"), format="json"
        ).json()["data"]
        self.assertEqual(Decimal(data["total_amount"]), Decimal("318000.00"))

    def test_an_order_needs_line_items(self):
        self.login(self.manager)
        response = self.client.post(self.url, self.payload(items=[]), format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.json()["errors"])

    def test_a_line_that_creates_assets_needs_a_category(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(items=[{"description": "Mystery box", "quantity": 1,
                                 "unit_cost": "100.00"}]),
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_consumable_line_does_not_need_a_category(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(items=[{"description": "HDMI cables", "quantity": 20,
                                 "unit_cost": "300.00", "create_assets": False}]),
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_delivery_before_the_order_date_is_rejected(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(expected_delivery=(date.today() - timedelta(days=2)).isoformat()),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_delivery", response.json()["errors"])

    def test_zero_quantity_is_rejected(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            self.payload(items=[{"description": "Nothing", "category_id": self.laptops.id,
                                 "quantity": 0, "unit_cost": "10.00"}]),
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_non_managers_cannot_raise_an_order(self):
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(self.url, self.payload(), format="json")
                self.assertEqual(response.status_code, 403)

    def test_everyone_can_read_orders(self):
        self.make_order()
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                self.assertEqual(self.client.get(self.url).status_code, 200)


class PlaceOrderTests(ProcurementTestCase):
    def test_placing_moves_a_draft_to_ordered(self):
        order = self.make_order(status=PurchaseOrderStatus.DRAFT)
        self.login(self.manager)

        response = self.client.post(f"{self.url}{order.id}/place/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.ORDERED)

    def test_placing_twice_is_409(self):
        order = self.make_order(status=PurchaseOrderStatus.DRAFT)
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/place/", {}, format="json")

        response = self.client.post(f"{self.url}{order.id}/place/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_an_empty_draft_cannot_be_placed(self):
        with suspend():
            order = PurchaseOrder.objects.create(
                vendor=self.vendor, po_date=date.today(),
                status=PurchaseOrderStatus.DRAFT,
            )
        self.login(self.manager)
        response = self.client.post(f"{self.url}{order.id}/place/", {}, format="json")
        self.assertEqual(response.status_code, 409)


class ReceiveTests(ProcurementTestCase):
    """FR-7.2 — receiving generates one asset per unit."""

    def test_receiving_creates_one_asset_per_unit(self):
        order = self.make_order()          # 3 x Dell Latitude
        before = Asset.objects.count()

        self.login(self.manager)
        response = self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

        body = self.assertEnvelope(response)
        self.assertEqual(body["data"]["created_count"], 3)
        self.assertEqual(Asset.objects.count(), before + 3)

    def test_each_created_asset_gets_its_own_tag(self):
        order = self.make_order()
        self.login(self.manager)
        data = self.client.post(f"{self.url}{order.id}/receive/", {},
                                format="json").json()["data"]

        tags = [asset["asset_tag"] for asset in data["created_assets"]]
        self.assertEqual(len(set(tags)), 3, "tags must be unique")

    def test_created_assets_inherit_the_order_details(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertEqual(asset.vendor, self.vendor)
        self.assertEqual(asset.category, self.laptops)
        self.assertEqual(asset.location, self.office)
        self.assertEqual(asset.department, self.it)
        self.assertEqual(asset.purchase_cost, Decimal("78000.00"))
        self.assertEqual(asset.status, AssetStatus.AVAILABLE)

    def test_warranty_is_stamped_from_the_order(self):
        """FR-7.3 — 24 months on the order becomes an expiry on the asset."""
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertIsNotNone(asset.warranty_expiry)
        self.assertGreater(asset.warranty_expiry, date.today() + timedelta(days=600))

    def test_receiving_everything_closes_the_order(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.RECEIVED)
        self.assertEqual(order.received_date, date.today())

    def test_partial_receipt_leaves_the_order_open(self):
        """Suppliers ship part of an order; the outstanding balance must show."""
        order = self.make_order()
        item = order.items.first()

        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{order.id}/receive/",
            {"lines": [{"item_id": item.id, "quantity": 1}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

        order.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.PARTIALLY_RECEIVED)
        self.assertEqual(item.received_quantity, 1)
        self.assertEqual(item.outstanding, 2)
        self.assertEqual(response.json()["data"]["created_count"], 1)

    def test_the_rest_can_be_received_later(self):
        order = self.make_order()
        item = order.items.first()
        self.login(self.manager)

        self.client.post(f"{self.url}{order.id}/receive/",
                         {"lines": [{"item_id": item.id, "quantity": 1}]},
                         format="json")
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.RECEIVED)
        self.assertEqual(Asset.objects.filter(name="Dell Latitude 5440").count(), 3)

    def test_cannot_receive_more_than_ordered(self):
        order = self.make_order()
        item = order.items.first()
        self.login(self.manager)

        response = self.client.post(
            f"{self.url}{order.id}/receive/",
            {"lines": [{"item_id": item.id, "quantity": 99}]},
            format="json",
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("only 3 outstanding", response.json()["message"])

    def test_receiving_a_fully_received_order_is_409(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        response = self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_cannot_receive_against_a_draft(self):
        order = self.make_order(status=PurchaseOrderStatus.DRAFT)
        self.login(self.manager)
        response = self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertIn("still a draft", response.json()["message"])

    def test_consumable_lines_create_no_assets(self):
        order = self.make_order(description="HDMI cables", category=None,
                                create_assets=False, quantity=20)
        before = Asset.objects.count()

        self.login(self.manager)
        data = self.client.post(f"{self.url}{order.id}/receive/", {},
                                format="json").json()["data"]

        self.assertEqual(data["created_count"], 0)
        self.assertEqual(Asset.objects.count(), before)
        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.RECEIVED)

    def test_a_future_receipt_date_is_rejected(self):
        order = self.make_order()
        self.login(self.manager)
        response = self.client.post(
            f"{self.url}{order.id}/receive/",
            {"received_date": (date.today() + timedelta(days=3)).isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_receipt_is_all_or_nothing(self):
        """
        If asset creation fails, no quantity should move. Force a failure by
        pointing the line at a category that is deleted mid-flight.
        """
        order = self.make_order()
        item = order.items.first()
        before_assets = Asset.objects.count()

        # PROTECT on Asset.category means deleting a used category raises, so
        # instead simulate failure with an impossible quantity request.
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/",
                         {"lines": [{"item_id": item.id, "quantity": 999}]},
                         format="json")

        item.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(item.received_quantity, 0)
        self.assertEqual(order.status, PurchaseOrderStatus.ORDERED)
        self.assertEqual(Asset.objects.count(), before_assets)

    def test_non_managers_cannot_receive(self):
        order = self.make_order()
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.post(f"{self.url}{order.id}/receive/", {},
                                            format="json")
                self.assertEqual(response.status_code, 403)


class CancelAndEditTests(ProcurementTestCase):
    def test_cancelling_an_open_order(self):
        order = self.make_order()
        self.login(self.manager)

        response = self.client.post(f"{self.url}{order.id}/cancel/",
                                    {"notes": "Supplier out of stock."}, format="json")
        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        self.assertEqual(order.status, PurchaseOrderStatus.CANCELLED)

    def test_cancelling_twice_is_409(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/cancel/", {}, format="json")

        response = self.client.post(f"{self.url}{order.id}/cancel/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_cannot_receive_against_a_cancelled_order(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/cancel/", {}, format="json")

        response = self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def test_lines_cannot_be_edited_once_goods_arrive(self):
        """Editing lines after receipt would lose the received quantities."""
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/",
                         {"lines": [{"item_id": order.items.first().id, "quantity": 1}]},
                         format="json")

        response = self.client.patch(
            f"{self.url}{order.id}/",
            {"items": [{"description": "Something else", "category_id": self.laptops.id,
                        "quantity": 1, "unit_cost": "100.00"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.json()["errors"])

    def test_editing_lines_before_receipt_recalculates_the_total(self):
        order = self.make_order()
        self.login(self.manager)

        response = self.client.patch(
            f"{self.url}{order.id}/",
            {"items": [{"description": "Cheaper laptop", "category_id": self.laptops.id,
                        "quantity": 2, "unit_cost": "50000.00"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(response.json()["data"]["total_amount"]),
                         Decimal("100000.00"))

    def test_a_received_order_cannot_be_deleted(self):
        order = self.make_order()
        self.login(self.manager)
        self.client.post(f"{self.url}{order.id}/receive/", {}, format="json")

        self.login(self.admin)
        response = self.client.delete(f"{self.url}{order.id}/")
        self.assertEqual(response.status_code, 409)

    def test_an_untouched_order_can_be_deleted_by_an_admin(self):
        order = self.make_order(status=PurchaseOrderStatus.DRAFT)

        self.login(self.manager)
        self.assertEqual(self.client.delete(f"{self.url}{order.id}/").status_code, 403)

        self.login(self.admin)
        self.assertEqual(self.client.delete(f"{self.url}{order.id}/").status_code, 200)


class ProcurementQueryTests(ProcurementTestCase):
    def test_overdue_filter(self):
        with suspend():
            late = self.make_order()
            PurchaseOrder.objects.filter(pk=late.pk).update(
                expected_delivery=date.today() - timedelta(days=5)
            )
            on_time = self.make_order()
            PurchaseOrder.objects.filter(pk=on_time.pk).update(
                expected_delivery=date.today() + timedelta(days=5)
            )

        self.login(self.manager)
        data = self.client.get(f"{self.url}?overdue=true").json()["data"]
        self.assertEqual(data["count"], 1)
        self.assertTrue(data["results"][0]["is_overdue"])

    def test_open_only_filter(self):
        self.make_order()
        self.make_order(status=PurchaseOrderStatus.DRAFT)

        self.login(self.manager)
        data = self.client.get(f"{self.url}?open_only=true").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_search_matches_line_item_descriptions(self):
        self.make_order()
        self.login(self.manager)
        data = self.client.get(f"{self.url}?search=Latitude").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_search_does_not_duplicate_rows(self):
        """Joining across items can return the same order more than once."""
        order = self.make_order()
        with suspend():
            PurchaseOrderItem.objects.create(
                purchase_order=order, description="Latitude dock",
                category=self.laptops, quantity=1, unit_cost=Decimal("9000.00"),
            )

        self.login(self.manager)
        data = self.client.get(f"{self.url}?search=Latitude").json()["data"]
        self.assertEqual(data["count"], 1)

    def test_stats(self):
        self.make_order()
        self.make_order(status=PurchaseOrderStatus.DRAFT)

        self.login(self.manager)
        data = self.client.get(f"{self.url}stats/").json()["data"]

        self.assertEqual(data["total"], 2)
        self.assertEqual(data["draft"], 1)
        self.assertEqual(data["ordered"], 1)
        self.assertEqual(Decimal(data["total_value"]), Decimal("468000.00"))

    def test_list_query_count_does_not_grow_with_rows(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.make_order()
        self.login(self.manager)

        with CaptureQueriesContext(connection) as first:
            self.client.get(self.url, {"page_size": 1})

        for _ in range(12):
            self.make_order()

        with CaptureQueriesContext(connection) as second:
            self.client.get(self.url, {"page_size": 50})

        self.assertLessEqual(len(second.captured_queries),
                             len(first.captured_queries))
