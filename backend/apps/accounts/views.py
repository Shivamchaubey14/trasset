"""Authentication, profile and user-administration endpoints (SRS §5.2)."""
import logging

from django.conf import settings
from django.core.mail import send_mail
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import GenericAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.audit.constants import AuditAction
from apps.audit.services import record as audit_record
from common.exceptions import UnprocessableEntity
from common.permissions import HasRolePermission, IsSuperAdmin
from common.responses import created, ok
from common.roles import Roles
from common.viewsets import BaseModelViewSet, BaseReadOnlyViewSet, ScopedThrottleMixin

from .models import Device, Role, User
from .serializers import (
    DeviceSerializer,
    LogoutSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    ProfileUpdateSerializer,
    RoleSerializer,
    TrassetTokenObtainPairSerializer,
    TrassetTokenRefreshSerializer,
    UserSerializer,
    UserWriteSerializer,
)
from .tokens import ClientAwareRefreshToken

logger = logging.getLogger("trasset")


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------
@extend_schema(
    tags=["Auth"],
    summary="Log in",
    description="Exchange email + password for an access/refresh token pair (FR-1.1).",
)
class LoginView(TokenObtainPairView):
    serializer_class = TrassetTokenObtainPairSerializer
    permission_classes = [AllowAny]
    throttle_scope = "auth"          # SEC-7
    resource_name = "Session"

    def post(self, request, *args, **kwargs):
        email = (request.data.get("email") or "").strip().lower()
        try:
            response = super().post(request, *args, **kwargs)
        except Exception:
            # Failed sign-ins matter as much as successful ones (SEC-9). The
            # actor is unknown, so record the attempted address instead.
            audit_record(
                AuditAction.LOGIN_FAILED,
                entity_type="User",
                label=email,
                changes={"_context": {"email": email}},
            )
            raise

        user = User.objects.filter(email=email).first()
        audit_record(AuditAction.LOGIN, instance=user, user=user,
                     entity_type="User", label=email)
        response.envelope_message = "Logged in successfully"
        return response


@extend_schema(
    tags=["Auth"],
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access token (FR-1.2).",
)
class RefreshView(TokenRefreshView):
    serializer_class = TrassetTokenRefreshSerializer
    permission_classes = [AllowAny]
    throttle_scope = "auth"
    resource_name = "Token"

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        response.envelope_message = "Token refreshed successfully"
        return response


@extend_schema(
    tags=["Auth"],
    summary="Log out",
    description="Blacklist the supplied refresh token (FR-1.6).",
    responses={200: OpenApiResponse(description="Logged out")},
)
class LogoutView(GenericAPIView):
    serializer_class = LogoutSerializer
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            ClientAwareRefreshToken(serializer.validated_data["refresh"]).blacklist()
        except TokenError as exc:
            raise UnprocessableEntity(
                detail="That refresh token is invalid or already expired."
            ) from exc

        # Signing out is also where a device stops being a push target (BE-2).
        # Scoped to the caller, so a token nobody owns simply matches nothing.
        push_token = serializer.validated_data.get("push_token")
        if push_token:
            Device.objects.filter(user=request.user, push_token=push_token).delete()

        audit_record(AuditAction.LOGOUT, instance=request.user, entity_type="User")
        return ok(None, "Logged out successfully")


@extend_schema(tags=["Auth"], summary="Current user profile")
class MeView(APIView):
    """``GET`` the signed-in profile, ``PATCH`` to update it."""

    permission_classes = [IsAuthenticated]
    resource_name = "Profile"

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        serializer = UserSerializer(request.user, context={"request": request})
        return ok(serializer.data, "Profile retrieved successfully")

    @extend_schema(request=ProfileUpdateSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = ProfileUpdateSerializer(
            request.user, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ok(serializer.data, "Profile updated successfully")


@extend_schema(
    tags=["Auth"],
    summary="Change password",
    responses={200: OpenApiResponse(description="Password changed")},
)
class PasswordChangeView(GenericAPIView):
    serializer_class = PasswordChangeSerializer
    permission_classes = [IsAuthenticated]
    throttle_scope = "auth"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # The password itself is never logged — only that it changed (SEC-1).
        audit_record(AuditAction.PASSWORD_CHANGE, instance=request.user,
                     entity_type="User")
        return ok(None, "Password changed successfully")


@extend_schema(
    tags=["Auth"],
    summary="Request a password reset link",
    responses={200: OpenApiResponse(description="Reset email queued")},
)
class PasswordResetRequestView(GenericAPIView):
    serializer_class = PasswordResetRequestSerializer
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.get_user()

        if user:
            uid, token = serializer.build_token(user)
            reset_url = f"{settings.FRONTEND_URL}/reset-password.html?uid={uid}&token={token}"
            try:
                send_mail(
                    subject="Reset your Trasset password",
                    message=(
                        f"Hello {user.full_name},\n\n"
                        f"Use the link below to choose a new password. "
                        f"It expires shortly and can be used once.\n\n{reset_url}\n\n"
                        f"If you didn't request this, you can safely ignore this email.\n\n"
                        f"— Trasset"
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            except Exception:  # noqa: BLE001 - never leak SMTP failures to the client
                logger.exception("Failed to send password reset email to %s", user.email)

        # Always the same answer, so the endpoint can't be used to enumerate accounts.
        return ok(
            None,
            "If an account exists for that email, a reset link has been sent.",
        )


@extend_schema(
    tags=["Auth"],
    summary="Confirm a password reset",
    responses={200: OpenApiResponse(description="Password reset")},
)
class PasswordResetConfirmView(GenericAPIView):
    serializer_class = PasswordResetConfirmSerializer
    permission_classes = [AllowAny]
    throttle_scope = "auth"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        audit_record(AuditAction.PASSWORD_RESET, instance=user, user=user,
                     entity_type="User")
        return ok(None, "Password reset successfully. You can now log in.")


# ---------------------------------------------------------------------------
# Devices (SRS §12.4, BE-2)
# ---------------------------------------------------------------------------
@extend_schema(tags=["Auth"])
class DeviceViewSet(ScopedThrottleMixin,
                    mixins.CreateModelMixin,
                    mixins.ListModelMixin,
                    mixins.DestroyModelMixin,
                    viewsets.GenericViewSet):
    """
    Push targets belonging to the signed-in user (BE-2).

    Registering is an upsert, so an app can call it on every launch without
    accumulating rows. Signing out deletes the row, either here or by passing
    ``push_token`` to ``/auth/logout/``.

    Note the plain ``IsAuthenticated`` rather than the usual role matrix: this
    is not a business resource. Registering a phone is something *every* role
    does, auditors included — the read-only guard in ``HasRolePermission``
    would otherwise stop an auditor from ever receiving a notification.
    Ownership is enforced by scoping the queryset, so nobody can see or
    deregister somebody else's handset.
    """

    queryset = Device.objects.all()          # narrowed per-user in get_queryset
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]
    resource_name = "Device"
    pagination_class = None

    def get_queryset(self):
        return Device.objects.filter(user=self.request.user)

    @extend_schema(
        summary="Register a device for push",
        description=(
            "Registers this device against the signed-in user. Sending a push "
            "token that is already on file updates that row and returns 200; a "
            "new one returns 201."
        ),
        responses={200: DeviceSerializer, 201: DeviceSerializer},
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        fields = dict(serializer.validated_data)
        device, was_created = Device.objects.register(
            request.user, push_token=fields.pop("push_token"), **fields
        )

        body = self.get_serializer(device).data
        if was_created:
            return created(body, "Device registered successfully")
        return ok(body, "Device registration updated successfully")

    @extend_schema(summary="List your registered devices")
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @extend_schema(
        summary="Deregister a device",
        responses={200: OpenApiResponse(description="Device removed")},
    )
    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return ok(None, "Device removed successfully")


# ---------------------------------------------------------------------------
# Users & roles
# ---------------------------------------------------------------------------
@extend_schema(tags=["Users"])
class UserViewSet(BaseModelViewSet):
    """User administration — Super Admin only (FR-2.1)."""

    queryset = User.objects.select_related("role", "department").all()
    permission_classes = [IsAuthenticated, IsSuperAdmin]
    resource_name = "User"

    filterset_fields = ("role", "department", "is_active")
    search_fields = ("full_name", "email", "phone")
    ordering_fields = ("full_name", "email", "created_at", "last_login")
    ordering = ("full_name",)

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UserWriteSerializer
        return UserSerializer

    def perform_destroy(self, instance):
        """Deactivate rather than delete, so assignment history stays intact."""
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.pk == request.user.pk:
            raise UnprocessableEntity(detail="You cannot deactivate your own account.")
        self.perform_destroy(instance)
        return ok(None, "User deactivated successfully")

    @extend_schema(summary="Reactivate a user", responses=UserSerializer)
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        user = self.get_object()
        user.is_active = True
        user.reset_failed_logins()
        user.save(update_fields=["is_active", "updated_at"])
        return ok(UserSerializer(user, context={"request": request}).data,
                  "User activated successfully")

    @extend_schema(summary="Clear a login lockout", responses=UserSerializer)
    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock(self, request, pk=None):
        user = self.get_object()
        user.reset_failed_logins()
        return ok(UserSerializer(user, context={"request": request}).data,
                  "Account unlocked successfully")


@extend_schema(tags=["Users"], summary="List roles")
class RoleViewSet(BaseReadOnlyViewSet):
    """The five fixed roles (SRS §2.3) — read-only for every signed-in user."""

    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, HasRolePermission]
    read_roles = Roles.ALL
    resource_name = "Role"
    pagination_class = None
