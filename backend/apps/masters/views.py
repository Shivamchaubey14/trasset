"""Master-data CRUD endpoints (SRS §5.2 — Masters)."""
from django.db.models import Count, Q
from drf_spectacular.utils import extend_schema

from common.roles import Roles
from common.viewsets import BaseModelViewSet

from .models import Category, Department, Location, Vendor
from .serializers import (
    CategorySerializer,
    DepartmentSerializer,
    LocationSerializer,
    VendorSerializer,
)

#: Only live assets should count towards the "in use" badges in the UI.
LIVE_ASSETS = Q(assets__is_deleted=False)


class MasterViewSet(BaseModelViewSet):
    """Shared behaviour: everyone reads, managers write, Super Admin deletes."""

    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS
    action_roles = {"destroy": (Roles.SUPER_ADMIN,)}
    ordering = ("name",)


@extend_schema(tags=["Masters"])
class CategoryViewSet(MasterViewSet):
    """Asset categories with icon, colour and custom-field definitions (FR-5.1)."""

    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    resource_name = "Category"
    resource_name_plural = "Categories"

    filterset_fields = ("is_active",)
    search_fields = ("name", "description")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return Category.objects.annotate(asset_count=Count("assets", filter=LIVE_ASSETS))


@extend_schema(tags=["Masters"])
class LocationViewSet(MasterViewSet):
    """Sites and rooms (FR-5.2)."""

    serializer_class = LocationSerializer
    queryset = Location.objects.all()
    resource_name = "Location"

    filterset_fields = ("is_active", "city", "country")
    search_fields = ("name", "address", "city", "state", "country", "postal_code")
    ordering_fields = ("name", "city", "created_at")

    def get_queryset(self):
        return Location.objects.annotate(asset_count=Count("assets", filter=LIVE_ASSETS))


@extend_schema(tags=["Masters"])
class DepartmentViewSet(MasterViewSet):
    """Organisational units (FR-5.3)."""

    serializer_class = DepartmentSerializer
    queryset = Department.objects.all()
    resource_name = "Department"

    filterset_fields = ("is_active", "head_user")
    search_fields = ("name", "code", "description")
    ordering_fields = ("name", "code", "created_at")

    def get_queryset(self):
        return (
            Department.objects
            .select_related("head_user")
            .annotate(
                asset_count=Count("assets", filter=LIVE_ASSETS, distinct=True),
                member_count=Count("members", filter=Q(members__is_active=True), distinct=True),
            )
        )


@extend_schema(tags=["Masters"])
class VendorViewSet(MasterViewSet):
    """Suppliers and service providers (FR-5.4)."""

    serializer_class = VendorSerializer
    queryset = Vendor.objects.all()
    resource_name = "Vendor"

    filterset_fields = ("is_active", "city")
    search_fields = ("name", "contact_person", "email", "phone", "city", "tax_number")
    ordering_fields = ("name", "created_at")

    def get_queryset(self):
        return Vendor.objects.annotate(asset_count=Count("assets", filter=LIVE_ASSETS))
