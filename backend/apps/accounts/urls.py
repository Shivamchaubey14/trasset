"""Auth, user and role routes (SRS §5.2)."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DeviceViewSet,
    LoginView,
    LogoutView,
    MeView,
    PasswordChangeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    RoleViewSet,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("roles", RoleViewSet, basename="role")

# Devices sit under /auth/ — they are part of a session, not a business
# resource (SRS §12.4, BE-2).
device_router = DefaultRouter()
device_router.register("devices", DeviceViewSet, basename="device")

auth_patterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("password/change/", PasswordChangeView.as_view(), name="auth-password-change"),
    path("password/reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password/reset/confirm/", PasswordResetConfirmView.as_view(),
         name="auth-password-reset-confirm"),
    path("", include(device_router.urls)),
]

urlpatterns = [
    path("auth/", include(auth_patterns)),
    path("", include(router.urls)),
]
