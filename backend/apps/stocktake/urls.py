"""Stock take routes."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StockTakeViewSet

router = DefaultRouter()
router.register("stock-takes", StockTakeViewSet, basename="stock-take")

urlpatterns = [path("", include(router.urls))]
