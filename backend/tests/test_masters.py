"""Master-data CRUD — FR-5.1 to FR-5.4, plus envelope/pagination conventions."""
from apps.masters.models import Category, Department, Location, Vendor

from .base import TrassetAPITestCase


class CategoryTests(TrassetAPITestCase):
    url = "/api/v1/categories/"

    def test_create_read_update_delete(self):
        self.login(self.admin)

        create = self.client.post(
            self.url,
            {"name": "Laptops", "icon": "laptop", "color": "#3BB77E"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        category_id = create.json()["data"]["id"]

        detail = f"{self.url}{category_id}/"
        read = self.client.get(detail)
        self.assertEqual(read.json()["data"]["name"], "Laptops")

        update = self.client.patch(detail, {"name": "Notebooks"}, format="json")
        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.json()["data"]["name"], "Notebooks")

        delete = self.client.delete(detail)
        self.assertEqual(delete.status_code, 200)
        self.assertFalse(Category.objects.filter(pk=category_id).exists())

    def test_duplicate_name_is_rejected(self):
        Category.objects.create(name="Laptops")
        self.login(self.manager)
        response = self.client.post(self.url, {"name": "Laptops"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.json()["errors"])

    def test_colour_must_be_hex(self):
        self.login(self.manager)
        response = self.client.post(
            self.url, {"name": "Bad Colour", "color": "green"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("color", response.json()["errors"])

    def test_custom_fields_are_normalised(self):
        """FR-3.8 — definitions get labels and defaults filled in."""
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {
                "name": "Servers",
                "custom_fields": [{"key": "ram_gb", "type": "number"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        field = response.json()["data"]["custom_fields"][0]
        self.assertEqual(field["label"], "Ram Gb")
        self.assertFalse(field["required"])
        self.assertEqual(field["options"], [])

    def test_custom_fields_reject_duplicate_keys(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {
                "name": "Dupes",
                "custom_fields": [
                    {"key": "ram_gb", "type": "number"},
                    {"key": "ram_gb", "type": "text"},
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_custom_fields_reject_unknown_type(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"name": "Weird", "custom_fields": [{"key": "x", "type": "hologram"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_select_fields_need_options(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"name": "Picker", "custom_fields": [{"key": "size", "type": "select"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_search_and_filter(self):
        Category.objects.create(name="Laptops")
        Category.objects.create(name="Vehicles", is_active=False)
        self.login(self.employee)

        search = self.client.get(f"{self.url}?search=lap")
        self.assertEqual(search.json()["data"]["count"], 1)

        active = self.client.get(f"{self.url}?is_active=true")
        self.assertEqual(active.json()["data"]["count"], 1)


class PaginationAndEnvelopeTests(TrassetAPITestCase):
    """SRS §5.1 and FR-3.6 — one shape for every list endpoint."""

    url = "/api/v1/locations/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for index in range(30):
            Location.objects.create(name=f"Site {index:02d}", city="Mumbai")

    def test_default_page_size_is_25(self):
        self.login(self.employee)
        data = self.client.get(self.url).json()["data"]
        self.assertEqual(data["count"], 30)
        self.assertEqual(len(data["results"]), 25)
        self.assertEqual(data["total_pages"], 2)
        self.assertIsNotNone(data["next"])
        self.assertIsNone(data["previous"])

    def test_page_size_can_be_overridden(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?page_size=10").json()["data"]
        self.assertEqual(len(data["results"]), 10)
        self.assertEqual(data["total_pages"], 3)

    def test_page_size_is_capped(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?page_size=99999").json()["data"]
        self.assertLessEqual(len(data["results"]), 200)

    def test_list_message_is_pluralised(self):
        self.login(self.employee)
        self.assertEqual(
            self.client.get(self.url).json()["message"],
            "Locations retrieved successfully",
        )

    def test_detail_message_is_singular(self):
        self.login(self.employee)
        location = Location.objects.first()
        self.assertEqual(
            self.client.get(f"{self.url}{location.id}/").json()["message"],
            "Location retrieved successfully",
        )

    def test_ordering_is_applied(self):
        self.login(self.employee)
        data = self.client.get(f"{self.url}?ordering=-name").json()["data"]
        self.assertEqual(data["results"][0]["name"], "Site 29")


class DepartmentAndVendorTests(TrassetAPITestCase):
    def test_department_reports_member_count(self):
        department = Department.objects.create(name="IT", code="IT")
        self.employee.department = department
        self.employee.save(update_fields=["department"])

        self.login(self.manager)
        response = self.client.get(f"/api/v1/departments/{department.id}/")
        self.assertEqual(response.json()["data"]["member_count"], 1)

    def test_department_head_name_is_included(self):
        department = Department.objects.create(name="Finance", head_user=self.head)
        self.login(self.manager)
        response = self.client.get(f"/api/v1/departments/{department.id}/")
        self.assertEqual(response.json()["data"]["head_user_name"], self.head.full_name)

    def test_vendor_crud_and_search(self):
        self.login(self.manager)
        create = self.client.post(
            "/api/v1/vendors/",
            {"name": "Dell India", "contact_person": "Sanjay",
             "email": "sales@dell.example"},
            format="json",
        )
        self.assertEqual(create.status_code, 201)

        found = self.client.get("/api/v1/vendors/?search=sanjay")
        self.assertEqual(found.json()["data"]["count"], 1)

    def test_vendor_email_must_be_valid(self):
        self.login(self.manager)
        response = self.client.post(
            "/api/v1/vendors/", {"name": "Bad Vendor", "email": "not-an-email"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["errors"])

    def test_location_exposes_full_address(self):
        Location.objects.create(
            name="HQ", address="BKC", city="Mumbai", state="MH",
            postal_code="400051", country="India",
        )
        self.login(self.employee)
        response = self.client.get("/api/v1/locations/?search=HQ")
        result = response.json()["data"]["results"][0]
        self.assertEqual(result["full_address"], "BKC, Mumbai, MH, 400051, India")

    def test_vendor_names_are_unique(self):
        Vendor.objects.create(name="Dell India")
        self.login(self.manager)
        response = self.client.post("/api/v1/vendors/", {"name": "Dell India"},
                                    format="json")
        self.assertEqual(response.status_code, 400)
