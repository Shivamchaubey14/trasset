"""Master-data serializers (FR-5.1 – FR-5.4)."""
from rest_framework import serializers

from .models import Category, Department, Location, Vendor

VALID_FIELD_TYPES = set(Category.FIELD_TYPES)


class CategorySerializer(serializers.ModelSerializer):
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = (
            "id", "name", "description", "icon", "color",
            "custom_fields", "is_active", "asset_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "asset_count", "created_at", "updated_at")

    def validate_custom_fields(self, value):
        """
        ``custom_fields`` drives the dynamic asset form (FR-3.8), so it has to
        be a well-formed list of field definitions or the UI breaks.
        """
        if value in (None, ""):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("Custom fields must be a list of definitions.")

        seen_keys = set()
        cleaned = []
        for index, field in enumerate(value):
            position = f"Field {index + 1}"
            if not isinstance(field, dict):
                raise serializers.ValidationError(f"{position} must be an object.")

            key = (field.get("key") or "").strip()
            if not key:
                raise serializers.ValidationError(f"{position} is missing a 'key'.")
            if not key.replace("_", "").isalnum():
                raise serializers.ValidationError(
                    f"{position}: key '{key}' may only contain letters, numbers and underscores."
                )
            if key in seen_keys:
                raise serializers.ValidationError(f"Duplicate custom field key '{key}'.")
            seen_keys.add(key)

            field_type = (field.get("type") or "text").strip()
            if field_type not in VALID_FIELD_TYPES:
                raise serializers.ValidationError(
                    f"{position}: type '{field_type}' is not supported. "
                    f"Use one of: {', '.join(sorted(VALID_FIELD_TYPES))}."
                )

            options = field.get("options") or []
            if field_type == "select" and not options:
                raise serializers.ValidationError(
                    f"{position}: a 'select' field needs at least one option."
                )

            cleaned.append({
                "key": key,
                "label": (field.get("label") or key.replace("_", " ").title()).strip(),
                "type": field_type,
                "required": bool(field.get("required", False)),
                "options": list(options),
            })
        return cleaned


class LocationSerializer(serializers.ModelSerializer):
    full_address = serializers.CharField(read_only=True)
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Location
        fields = (
            "id", "name", "address", "city", "state", "country", "postal_code",
            "latitude", "longitude", "full_address", "is_active", "asset_count",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "full_address", "asset_count", "created_at", "updated_at")


class DepartmentSerializer(serializers.ModelSerializer):
    head_user_name = serializers.CharField(
        source="head_user.full_name", read_only=True, default=None
    )
    member_count = serializers.IntegerField(read_only=True)
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Department
        fields = (
            "id", "name", "code", "description",
            "head_user", "head_user_name", "member_count", "asset_count",
            "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "head_user_name", "member_count", "asset_count",
                            "created_at", "updated_at")


class VendorSerializer(serializers.ModelSerializer):
    asset_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Vendor
        fields = (
            "id", "name", "contact_person", "email", "phone",
            "address", "city", "website", "tax_number", "notes",
            "is_active", "asset_count", "created_at", "updated_at",
        )
        read_only_fields = ("id", "asset_count", "created_at", "updated_at")


class SimpleRefSerializer(serializers.Serializer):
    """Lightweight {id, name} shape used inside nested asset payloads."""

    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
