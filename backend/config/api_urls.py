"""
Trasset API v1 — endpoint catalogue (SRS §5.2).

App URL modules are mounted here as each one is built, so this file is the
single place to see the whole public surface.
"""
from django.urls import include, path
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny

from common.responses import ok


@extend_schema(
    tags=["Health"],
    summary="Service health check",
    description="Unauthenticated liveness probe used by the load balancer.",
    responses={200: dict},
    auth=[],
)
@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    return ok({"status": "ok", "service": "trasset", "version": "1.0.0"},
              message="Service is healthy")


urlpatterns = [
    path("health/", health, name="health"),

    path("", include("apps.accounts.urls")),
    path("", include("apps.masters.urls")),
    path("", include("apps.assets.urls")),
    path("", include("apps.maintenance.urls")),
    path("", include("apps.procurement.urls")),
    path("", include("apps.reports.urls")),
    # path("", include("apps.notifications.urls")),
    path("", include("apps.audit.urls")),
]
