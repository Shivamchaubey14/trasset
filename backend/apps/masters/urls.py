"""Master-data routes."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, DepartmentViewSet, LocationViewSet, VendorViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("locations", LocationViewSet, basename="location")
router.register("departments", DepartmentViewSet, basename="department")
router.register("vendors", VendorViewSet, basename="vendor")

urlpatterns = [path("", include(router.urls))]
