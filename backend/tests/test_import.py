"""Bulk asset import — FR-10.1."""
import io
from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.assets.models import Asset
from apps.assets.services import importing
from apps.audit.services import suspend
from apps.masters.models import Category, Department, Location, Vendor

from .base import TrassetAPITestCase

HEADERS = (
    "Name,Category,Asset Tag,Serial Number,Manufacturer,Model Number,"
    "Location,Department,Vendor,Purchase Date,Purchase Cost,Salvage Value,"
    "Useful Life Years,Depreciation Method,Warranty Expiry,Description,Notes"
)


def csv_upload(body: str, name="assets.csv"):
    return SimpleUploadedFile(name, body.encode("utf-8"), content_type="text/csv")


class ImportTestCase(TrassetAPITestCase):
    url = "/api/v1/assets/import/"

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.laptops = Category.objects.create(name="Laptops")
        cls.office = Location.objects.create(name="Head Office")
        cls.it = Department.objects.create(name="Information Technology")
        cls.vendor = Vendor.objects.create(name="Dell Technologies India")

    def row(self, name="Dell Latitude 5440", category="Laptops", tag="", serial="",
            cost="78000.00", purchased="2026-01-15", life="4"):
        return (
            f"{name},{category},{tag},{serial},Dell,Latitude 5440,"
            f"Head Office,Information Technology,Dell Technologies India,"
            f"{purchased},{cost},8000.00,{life},straight_line,2029-01-15,,"
        )

    def upload(self, body, user=None, **options):
        self.login(user or self.manager)
        return self.client.post(
            self.url,
            {"file": csv_upload(body), **options},
            format="multipart",
        )


class TemplateTests(ImportTestCase):
    def test_template_downloads_as_csv(self):
        self.login(self.manager)
        response = self.client.get("/api/v1/assets/import/template/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        self.assertIn("attachment;", response["Content-Disposition"])

    def test_template_headers_match_what_the_importer_accepts(self):
        """A template the importer rejects would be worse than none."""
        self.login(self.manager)
        content = self.client.get("/api/v1/assets/import/template/").content.decode()

        header_line = content.splitlines()[0]
        for spec in importing.COLUMNS:
            self.assertIn(spec.header, header_line)

    def test_the_template_example_row_actually_imports(self):
        """The worked example must be valid, or it teaches the wrong thing."""
        self.login(self.manager)
        template = self.client.get("/api/v1/assets/import/template/").content.decode()

        response = self.upload(template)
        self.assertEqual(response.status_code, 200, response.content[:400])
        self.assertEqual(response.json()["data"]["created"], 1)

    def test_column_reference_is_exposed(self):
        self.login(self.manager)
        response = self.client.get("/api/v1/assets/import/columns/")
        self.assertEqual(response.status_code, 200)

        columns = response.json()["data"]
        required = [c["header"] for c in columns if c["required"]]
        self.assertIn("Name", required)
        self.assertIn("Category", required)


class ImportHappyPathTests(ImportTestCase):
    def test_a_clean_file_imports(self):
        body = "\n".join([HEADERS, self.row(), self.row(name="Dell XPS 15")])
        response = self.upload(body)

        self.assertEqual(response.status_code, 200, response.content[:400])
        data = self.assertEnvelope(response)["data"]

        self.assertEqual(data["total_rows"], 2)
        self.assertEqual(data["valid_rows"], 2)
        self.assertEqual(data["created"], 2)
        self.assertTrue(data["committed"])

    def test_imported_assets_get_generated_tags(self):
        body = "\n".join([HEADERS, self.row()])
        data = self.upload(body).json()["data"]

        self.assertTrue(data["rows"][0]["asset_tag"].startswith("TRA-"))

    def test_masters_are_matched_by_name(self):
        """Nobody types database ids into a spreadsheet."""
        body = "\n".join([HEADERS, self.row()])
        self.upload(body)

        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertEqual(asset.category, self.laptops)
        self.assertEqual(asset.location, self.office)
        self.assertEqual(asset.department, self.it)
        self.assertEqual(asset.vendor, self.vendor)

    def test_name_matching_is_case_insensitive(self):
        body = "\n".join([HEADERS, self.row(category="laptops")])
        response = self.upload(body)
        self.assertEqual(response.json()["data"]["created"], 1)

    def test_values_are_coerced(self):
        body = "\n".join([HEADERS, self.row()])
        self.upload(body)

        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertEqual(asset.purchase_date, date(2026, 1, 15))
        self.assertEqual(str(asset.purchase_cost), "78000.00")
        self.assertEqual(asset.useful_life_years, 4)

    def test_currency_symbols_and_separators_are_tolerated(self):
        """Spreadsheets are full of ₹ and thousands separators."""
        body = "\n".join([HEADERS, self.row(cost='"₹1,78,000.00"')])
        response = self.upload(body)

        self.assertEqual(response.json()["data"]["created"], 1, response.content[:300])
        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertEqual(str(asset.purchase_cost), "178000.00")

    def test_alternative_date_formats_are_accepted(self):
        body = "\n".join([HEADERS, self.row(purchased="15/01/2026")])
        self.upload(body)

        asset = Asset.objects.filter(name="Dell Latitude 5440").first()
        self.assertEqual(asset.purchase_date, date(2026, 1, 15))

    def test_blank_optional_columns_are_fine(self):
        body = "\n".join([HEADERS, "Just A Name,Laptops,,,,,,,,,,,,,,,"])
        response = self.upload(body)
        self.assertEqual(response.json()["data"]["created"], 1, response.content[:300])

    def test_unknown_columns_are_ignored_not_fatal(self):
        body = "\n".join([
            HEADERS + ",Colour,Internal Ref",
            self.row() + ",Blue,XYZ-1",
        ])
        response = self.upload(body)
        self.assertEqual(response.json()["data"]["created"], 1, response.content[:300])


class ImportValidationTests(ImportTestCase):
    def test_a_missing_required_column_is_a_row_error(self):
        body = "\n".join([HEADERS, self.row(name="")])
        response = self.upload(body)

        self.assertEqual(response.status_code, 422)
        row = response.json()["data"]["rows"][0]
        self.assertFalse(row["ok"])
        self.assertIn("Name", row["errors"])

    def test_an_unknown_category_names_what_was_not_found(self):
        body = "\n".join([HEADERS, self.row(category="Spaceships")])
        response = self.upload(body)

        row = response.json()["data"]["rows"][0]
        self.assertIn("Category", row["errors"])
        self.assertIn("Spaceships", str(row["errors"]["Category"]))

    def test_a_bad_number_is_reported_with_the_value(self):
        body = "\n".join([HEADERS, self.row(cost="not-a-number")])
        response = self.upload(body)

        row = response.json()["data"]["rows"][0]
        self.assertIn("Purchase Cost", row["errors"])

    def test_a_bad_date_is_reported(self):
        body = "\n".join([HEADERS, self.row(purchased="the fifth of never")])
        response = self.upload(body)

        row = response.json()["data"]["rows"][0]
        self.assertIn("Purchase Date", row["errors"])

    def test_serializer_rules_apply_to_imports_too(self):
        """Salvage above cost is rejected by the API, so it must be here too."""
        body = "\n".join([
            HEADERS,
            "Cheap Thing,Laptops,,,,,,,,2026-01-15,100.00,9000.00,4,straight_line,,,",
        ])
        response = self.upload(body)

        row = response.json()["data"]["rows"][0]
        self.assertFalse(row["ok"])
        self.assertIn("Salvage Value", row["errors"])

    def test_duplicate_tag_within_the_file_is_caught(self):
        """The serializer only checks the database, not the rest of the upload."""
        body = "\n".join([
            HEADERS,
            self.row(tag="DUP-001"),
            self.row(name="Another", tag="DUP-001"),
        ])
        response = self.upload(body)

        rows = response.json()["data"]["rows"]
        self.assertTrue(rows[0]["ok"])
        self.assertIn("Asset Tag", rows[1]["errors"])

    def test_duplicate_serial_within_the_file_is_caught(self):
        body = "\n".join([
            HEADERS,
            self.row(serial="SN-1"),
            self.row(name="Another", serial="SN-1"),
        ])
        response = self.upload(body)
        self.assertIn("Serial Number", response.json()["data"]["rows"][1]["errors"])

    def test_a_tag_already_in_the_database_is_caught(self):
        with suspend():
            Asset.objects.create(name="Existing", category=self.laptops,
                                 asset_tag="TAKEN-01")

        body = "\n".join([HEADERS, self.row(tag="TAKEN-01")])
        response = self.upload(body)
        self.assertIn("Asset Tag", response.json()["data"]["rows"][0]["errors"])

    def test_row_numbers_match_the_spreadsheet(self):
        """Row 1 is the header, so the first data row must be reported as 2."""
        body = "\n".join([HEADERS, self.row(), self.row(name="")])
        response = self.upload(body)

        rows = response.json()["data"]["rows"]
        self.assertEqual(rows[0]["row"], 2)
        self.assertEqual(rows[1]["row"], 3)


class ImportAtomicityTests(ImportTestCase):
    def test_one_bad_row_aborts_the_whole_file_by_default(self):
        before = Asset.objects.count()
        body = "\n".join([HEADERS, self.row(), self.row(name=""), self.row(name="Third")])

        response = self.upload(body)

        self.assertEqual(response.status_code, 422)
        data = response.json()["data"]
        self.assertFalse(data["committed"])
        self.assertEqual(data["created"], 0)
        self.assertEqual(Asset.objects.count(), before)

    def test_the_message_says_how_to_proceed(self):
        body = "\n".join([HEADERS, self.row(name="")])
        response = self.upload(body)
        self.assertIn("partial import", response.json()["message"])

    def test_partial_imports_the_good_rows(self):
        before = Asset.objects.count()
        body = "\n".join([HEADERS, self.row(), self.row(name=""), self.row(name="Third")])

        response = self.upload(body, partial=True)

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertTrue(data["committed"])
        self.assertEqual(data["created"], 2)
        self.assertEqual(data["invalid_rows"], 1)
        self.assertEqual(Asset.objects.count(), before + 2)

    def test_dry_run_writes_nothing(self):
        before = Asset.objects.count()
        body = "\n".join([HEADERS, self.row(), self.row(name="Second")])

        response = self.upload(body, dry_run=True)

        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertFalse(data["committed"])
        self.assertEqual(data["valid_rows"], 2)
        self.assertEqual(data["created"], 0)
        self.assertEqual(Asset.objects.count(), before)

    def test_dry_run_reports_problems_without_failing(self):
        body = "\n".join([HEADERS, self.row(name="")])
        response = self.upload(body, dry_run=True)

        self.assertEqual(response.status_code, 200)
        self.assertIn("with problems", response.json()["message"])

    def test_dry_run_then_real_run_produces_the_same_verdict(self):
        body = "\n".join([HEADERS, self.row(), self.row(name="Second")])

        dry = self.upload(body, dry_run=True).json()["data"]
        real = self.upload(body).json()["data"]

        self.assertEqual(dry["valid_rows"], real["valid_rows"])
        self.assertEqual(dry["invalid_rows"], real["invalid_rows"])


class ImportFileTests(ImportTestCase):
    def test_a_non_spreadsheet_is_refused(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("notes.txt", b"hello",
                                        content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.json()["errors"])

    def test_an_executable_is_refused(self):
        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("payload.exe", b"MZ",
                                        content_type="application/x-msdownload")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    def test_a_file_with_no_data_rows_is_refused(self):
        response = self.upload(HEADERS)
        self.assertEqual(response.status_code, 422)
        self.assertIn("no data rows", response.json()["message"])

    def test_a_bom_prefixed_csv_still_matches_headers(self):
        """Excel writes a BOM; it would otherwise corrupt the first header."""
        body = "﻿" + "\n".join([HEADERS, self.row()])
        response = self.upload(body)
        self.assertEqual(response.json()["data"]["created"], 1, response.content[:300])

    def test_xlsx_uploads_are_accepted(self):
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(HEADERS.split(","))
        sheet.append([
            "Excel Laptop", "Laptops", "", "", "Dell", "Latitude",
            "Head Office", "Information Technology", "Dell Technologies India",
            "2026-01-15", 78000, 8000, 4, "straight_line", "2029-01-15", "", "",
        ])
        buffer = io.BytesIO()
        workbook.save(buffer)
        buffer.seek(0)

        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile(
                "assets.xlsx", buffer.read(),
                content_type="application/vnd.openxmlformats-officedocument."
                             "spreadsheetml.sheet")},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200, response.content[:400])
        self.assertEqual(response.json()["data"]["created"], 1)
        self.assertTrue(Asset.objects.filter(name="Excel Laptop").exists())

    def test_blank_spacer_rows_in_xlsx_are_skipped(self):
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(HEADERS.split(","))
        sheet.append([None] * 17)
        sheet.append(["Spacer Test", "Laptops"] + [""] * 15)
        buffer = io.BytesIO()
        workbook.save(buffer)
        buffer.seek(0)

        self.login(self.manager)
        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("assets.xlsx", buffer.read())},
            format="multipart",
        )
        self.assertEqual(response.json()["data"]["total_rows"], 1,
                         response.content[:300])

    def test_too_many_rows_is_refused(self):
        rows = [HEADERS] + [self.row(name=f"Asset {i}")
                            for i in range(importing.MAX_ROWS + 1)]
        response = self.upload("\n".join(rows))

        self.assertEqual(response.status_code, 422)
        self.assertIn("limit is", response.json()["message"])


class ImportPermissionTests(ImportTestCase):
    def test_only_managers_can_import(self):
        body = "\n".join([HEADERS, self.row()])
        for user in (self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                response = self.upload(body, user=user)
                self.assertEqual(response.status_code, 403)

    def test_managers_and_admins_can_import(self):
        for user in (self.manager, self.admin):
            with self.subTest(role=user.role_name):
                body = "\n".join([HEADERS, self.row(name=f"For {user.role_name}")])
                response = self.upload(body, user=user)
                self.assertEqual(response.status_code, 200, response.content[:300])

    def test_import_requires_authentication(self):
        response = self.client.post(
            self.url, {"file": csv_upload(HEADERS)}, format="multipart"
        )
        self.assertEqual(response.status_code, 401)

    def test_everyone_can_read_the_template(self):
        for user in self.users.values():
            with self.subTest(role=user.role_name):
                self.login(user)
                response = self.client.get("/api/v1/assets/import/template/")
                self.assertEqual(response.status_code, 200)


class ImportEfficiencyTests(ImportTestCase):
    def measure(self, body, **options):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        self.login(self.manager)
        with CaptureQueriesContext(connection) as captured:
            self.client.post(self.url, {"file": csv_upload(body), **options},
                             format="multipart")
        return len(captured.captured_queries)

    def test_per_row_cost_stays_bounded(self):
        """
        Each row costs roughly one query per foreign key the serializer
        resolves — the price of validating imports with the API's serializer.
        This guards against that quietly becoming much worse.
        """
        small = "\n".join([HEADERS, self.row(name="One")])
        many = "\n".join([HEADERS] + [self.row(name=f"Row {i}") for i in range(50)])

        growth_per_row = (self.measure(many, dry_run=True) -
                          self.measure(small, dry_run=True)) / 49
        self.assertLess(
            growth_per_row, 6,
            f"{growth_per_row:.1f} queries per row — something is now querying "
            f"more than the four foreign keys per row."
        )

    def test_master_lookups_are_cached_across_rows(self):
        """
        The four master models are read once, not once per row. Without the
        cache a 50-row file would cost 200 extra name lookups on top of the
        serializer's own work.
        """
        many = "\n".join([HEADERS] + [self.row(name=f"Row {i}") for i in range(50)])
        total = self.measure(many, dry_run=True)

        # 50 rows x 4 FKs = 200 serializer lookups, plus a handful of fixed
        # queries. Uncached name resolution would roughly double that.
        self.assertLess(
            total, 260,
            f"{total} queries for 50 rows — master name lookups are probably "
            f"not being cached."
        )

    def test_committed_row_cost_stays_bounded(self):
        """
        Writing a row costs more than checking one, and legitimately so: four
        foreign-key checks, three for tag generation, the insert itself, and
        two for the audit record. That lands around ten queries per row.

        This pins the order of magnitude so a regression is visible. MAX_ROWS
        bounds the total; imports much larger than that belong in a background
        job rather than a request.
        """
        small = "\n".join([HEADERS, self.row(name="One")])
        many = "\n".join([HEADERS] + [self.row(name=f"Row {i}") for i in range(30)])

        growth_per_row = (self.measure(many) - self.measure(small)) / 29
        self.assertLess(
            growth_per_row, 15,
            f"{growth_per_row:.1f} queries per imported row — writing a row got "
            f"more expensive than tag generation, insert and audit account for."
        )
