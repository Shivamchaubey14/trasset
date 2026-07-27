"""Upload validation (SEC-8) and small shared field validators."""
import os

from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils.deconstruct import deconstructible

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
IMAGE_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}

DOCUMENT_CONTENT_TYPES = {
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@deconstructible
class FileValidator:
    """Reject uploads by extension, declared content type, or size."""

    def __init__(self, allowed_extensions=None, allowed_content_types=None, max_mb=None):
        self.allowed_extensions = {e.lower() for e in (
            allowed_extensions or settings.ALLOWED_UPLOAD_EXTENSIONS
        )}
        self.allowed_content_types = allowed_content_types
        self.max_mb = max_mb or settings.MAX_UPLOAD_SIZE_MB

    def __call__(self, value):
        extension = os.path.splitext(value.name)[1].lower()
        if extension not in self.allowed_extensions:
            raise ValidationError(
                f"'{extension or value.name}' is not an allowed file type. "
                f"Allowed: {', '.join(sorted(self.allowed_extensions))}."
            )

        content_type = getattr(value, "content_type", None)
        if self.allowed_content_types and content_type and \
                content_type not in self.allowed_content_types:
            raise ValidationError(f"'{content_type}' is not an allowed content type.")

        max_bytes = self.max_mb * 1024 * 1024
        if value.size > max_bytes:
            raise ValidationError(
                f"File is {value.size / 1024 / 1024:.1f} MB — the limit is {self.max_mb} MB."
            )

    def __eq__(self, other):
        return (
            isinstance(other, FileValidator)
            and self.allowed_extensions == other.allowed_extensions
            and self.allowed_content_types == other.allowed_content_types
            and self.max_mb == other.max_mb
        )


validate_image_upload = FileValidator(
    allowed_extensions=IMAGE_EXTENSIONS,
    allowed_content_types=IMAGE_CONTENT_TYPES,
    max_mb=5,
)

validate_document_upload = FileValidator(max_mb=10)


def validate_hex_color(value: str):
    """Category/status colours must be 6-digit hex so the UI can trust them."""
    if not value:
        return
    if not value.startswith("#") or len(value) != 7:
        raise ValidationError("Colour must be a 6-digit hex value such as #3BB77E.")
    try:
        int(value[1:], 16)
    except ValueError as exc:
        raise ValidationError("Colour must be a valid hex value such as #3BB77E.") from exc
