"""Asset routes (SRS §5.2)."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AssetRequestViewSet, AssetViewSet, AttachmentViewSet

router = DefaultRouter()
router.register("assets", AssetViewSet, basename="asset")
router.register("asset-requests", AssetRequestViewSet, basename="asset-request")
router.register("attachments", AttachmentViewSet, basename="attachment")

urlpatterns = [path("", include(router.urls))]
