"""
Upload and field validation — SEC-8, plus the hex-colour guard.

File upload is a security boundary: it is how untrusted bytes enter the system.
It had no test behind it, which is the worst combination of important and
unverified.
"""
from io import BytesIO

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from common.validators import (
    FileValidator,
    validate_document_upload,
    validate_hex_color,
    validate_image_upload,
)

from .base import TrassetAPITestCase


def upload(name, content=b"x", content_type="application/pdf", size=None):
    """A file object shaped like a real upload."""
    uploaded = SimpleUploadedFile(name, content, content_type=content_type)
    if size is not None:
        # SimpleUploadedFile derives size from content; override for size tests
        # without allocating megabytes of memory.
        uploaded.size = size
    return uploaded


class DocumentUploadTests(TrassetAPITestCase):
    """SEC-8 — type and size are both enforced."""

    def test_allowed_extensions_pass(self):
        for name in ("invoice.pdf", "warranty.PDF", "data.csv", "sheet.xlsx"):
            with self.subTest(name=name):
                validate_document_upload(upload(name))

    def test_executable_is_rejected(self):
        """The case that actually matters."""
        for name in ("payload.exe", "script.sh", "shell.bat", "lib.dll"):
            with self.subTest(name=name):
                with self.assertRaises(ValidationError) as caught:
                    validate_document_upload(upload(name))
                self.assertIn("not an allowed file type", str(caught.exception))

    def test_a_file_with_no_extension_is_rejected(self):
        with self.assertRaises(ValidationError):
            validate_document_upload(upload("README"))

    def test_double_extension_is_judged_on_the_last_one(self):
        """`invoice.pdf.exe` is an executable, whatever it looks like."""
        with self.assertRaises(ValidationError):
            validate_document_upload(upload("invoice.pdf.exe"))

    def test_extension_check_is_case_insensitive(self):
        validate_document_upload(upload("Invoice.PdF"))
        with self.assertRaises(ValidationError):
            validate_document_upload(upload("Payload.EXE"))

    def test_oversized_file_is_rejected(self):
        oversized = upload("big.pdf", size=(settings.MAX_UPLOAD_SIZE_MB + 1) * 1024 * 1024)
        with self.assertRaises(ValidationError) as caught:
            validate_document_upload(oversized)
        self.assertIn("the limit is", str(caught.exception))

    def test_a_file_at_exactly_the_limit_is_allowed(self):
        at_limit = upload("exact.pdf", size=settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
        validate_document_upload(at_limit)

    def test_empty_file_is_allowed(self):
        """Zero bytes is odd but not dangerous; the type check still applies."""
        validate_document_upload(upload("empty.pdf", content=b""))


class ImageUploadTests(TrassetAPITestCase):
    def test_allowed_image_types_pass(self):
        for name, content_type in (
            ("photo.png", "image/png"),
            ("photo.jpg", "image/jpeg"),
            ("photo.webp", "image/webp"),
        ):
            with self.subTest(name=name):
                validate_image_upload(upload(name, content_type=content_type))

    def test_a_pdf_is_not_an_image(self):
        with self.assertRaises(ValidationError):
            validate_image_upload(upload("invoice.pdf"))

    def test_svg_is_rejected(self):
        """SVG can carry script, so it stays out of the image allowlist."""
        with self.assertRaises(ValidationError):
            validate_image_upload(upload("logo.svg", content_type="image/svg+xml"))

    def test_content_type_is_checked_as_well_as_extension(self):
        """A .png claiming to be something else is refused."""
        with self.assertRaises(ValidationError) as caught:
            validate_image_upload(upload("photo.png", content_type="application/x-msdownload"))
        self.assertIn("not an allowed content type", str(caught.exception))

    def test_images_have_a_tighter_size_limit_than_documents(self):
        six_mb = 6 * 1024 * 1024
        # Fine as a document (10 MB limit)...
        validate_document_upload(upload("scan.pdf", size=six_mb))
        # ...but too big as an image (5 MB limit).
        with self.assertRaises(ValidationError):
            validate_image_upload(upload("photo.png", content_type="image/png", size=six_mb))


class FileValidatorConfigTests(TrassetAPITestCase):
    def test_custom_allowlist_is_respected(self):
        validator = FileValidator(allowed_extensions={".txt"}, max_mb=1)
        validator(upload("notes.txt", content_type="text/plain"))
        with self.assertRaises(ValidationError):
            validator(upload("notes.pdf"))

    def test_validators_compare_equal_for_migrations(self):
        """Django serialises validators into migrations, so __eq__ must work."""
        first = FileValidator(allowed_extensions={".pdf"}, max_mb=5)
        second = FileValidator(allowed_extensions={".pdf"}, max_mb=5)
        third = FileValidator(allowed_extensions={".pdf"}, max_mb=10)

        self.assertEqual(first, second)
        self.assertNotEqual(first, third)

    def test_missing_content_type_does_not_crash(self):
        """Some clients omit it; the extension check still applies."""
        uploaded = SimpleUploadedFile("invoice.pdf", b"x")
        uploaded.content_type = None
        validate_document_upload(uploaded)


class AttachmentApiUploadTests(TrassetAPITestCase):
    """The validators wired into a real endpoint, not just called directly."""

    def setUp(self):
        from apps.assets.models import Asset
        from apps.audit.services import suspend
        from apps.masters.models import Category

        with suspend():
            self.asset = Asset.objects.create(
                name="Laptop", category=Category.objects.create(name="Laptops")
            )

    def post_file(self, name, content_type="application/pdf"):
        return self.client.post(
            "/api/v1/attachments/",
            {"asset": self.asset.id,
             "file": SimpleUploadedFile(name, b"pretend file bytes",
                                        content_type=content_type)},
            format="multipart",
        )

    def test_manager_can_upload_a_pdf(self):
        self.login(self.manager)
        response = self.post_file("invoice.pdf")
        self.assertEqual(response.status_code, 201, response.content[:300])
        self.assertEqual(response.json()["data"]["filename"], "invoice.pdf")

    def test_executable_upload_is_refused_by_the_api(self):
        self.login(self.manager)
        response = self.post_file("payload.exe", content_type="application/x-msdownload")

        self.assertEqual(response.status_code, 400)
        body = self.assertEnvelope(response, success=False)
        self.assertIn("file", body["errors"])

    def test_employees_cannot_upload(self):
        self.login(self.employee)
        self.assertEqual(self.post_file("invoice.pdf").status_code, 403)

    def test_auditors_cannot_upload(self):
        self.login(self.auditor)
        self.assertEqual(self.post_file("invoice.pdf").status_code, 403)

    def test_size_is_recorded_on_upload(self):
        self.login(self.manager)
        data = self.post_file("invoice.pdf").json()["data"]
        self.assertGreater(data["size_bytes"], 0)
        self.assertTrue(data["size_display"].endswith("B"))


class HexColourTests(TrassetAPITestCase):
    def test_valid_colours_pass(self):
        for value in ("#3BB77E", "#FDC040", "#253d4e", "#000000"):
            with self.subTest(value=value):
                validate_hex_color(value)

    def test_blank_is_allowed(self):
        validate_hex_color("")
        validate_hex_color(None)

    def test_named_colours_are_rejected(self):
        with self.assertRaises(ValidationError):
            validate_hex_color("green")

    def test_shorthand_is_rejected(self):
        """#3BE would render, but the UI assumes six digits everywhere."""
        with self.assertRaises(ValidationError):
            validate_hex_color("#3BE")

    def test_missing_hash_is_rejected(self):
        with self.assertRaises(ValidationError):
            validate_hex_color("3BB77E")

    def test_non_hex_characters_are_rejected(self):
        with self.assertRaises(ValidationError):
            validate_hex_color("#GGGGGG")
