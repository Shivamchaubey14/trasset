"""Auth and user serializers (SRS §5.2 — Authentication, Users & Roles)."""
from django.contrib.auth import password_validation
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from common.clients import client_from_request
from common.roles import Roles

from .models import Device, Role, User
from .tokens import ClientAwareRefreshToken


class RoleSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)

    class Meta:
        model = Role
        fields = ("id", "name", "label", "description")
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    """Read representation — nested role and department for the UI."""

    role = RoleSerializer(read_only=True)
    role_name = serializers.CharField(read_only=True)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    initials = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "phone", "initials",
            "role", "role_name", "department", "department_name",
            "avatar", "timezone_name", "email_notifications", "push_notifications",
            "is_active", "last_login", "created_at", "updated_at",
        )
        read_only_fields = ("id", "last_login", "created_at", "updated_at")


class UserWriteSerializer(serializers.ModelSerializer):
    """Create/update payload — Super Admin only (FR-2.1)."""

    password = serializers.CharField(
        write_only=True, required=False, allow_blank=False, style={"input_type": "password"}
    )
    role_id = serializers.PrimaryKeyRelatedField(
        source="role", queryset=Role.objects.all(), required=True
    )

    class Meta:
        model = User
        fields = (
            "id", "full_name", "email", "phone", "password",
            "role_id", "department", "timezone_name",
            "email_notifications", "push_notifications", "is_active",
        )

    def validate_email(self, value):
        value = value.lower().strip()
        queryset = User.objects.filter(email=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def validate(self, attrs):
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError(
                {"password": ["A password is required when creating a user."]}
            )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        # Super Admins get Django admin access so the two systems stay aligned.
        user.is_staff = validated_data.get("role") and \
            validated_data["role"].name == Roles.SUPER_ADMIN
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        if instance.role_id:
            instance.is_staff = instance.role.name == Roles.SUPER_ADMIN
        instance.save()
        return instance

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class TrassetTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Login (FR-1.1) with lockout enforcement (FR-1.5).

    Returns the token pair *and* the user profile so the UI can render the
    shell immediately without a second round trip.
    """

    token_class = ClientAwareRefreshToken

    # Deliberately an instance method rather than the classmethod SimpleJWT
    # declares: the refresh lifetime depends on which client is asking (BE-1),
    # and the request only reaches us through the serializer context.
    def get_token(self, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["full_name"] = user.full_name
        token["role"] = user.role_name
        # The claim rides along to the access token too (SimpleJWT copies every
        # claim but exp/jti/iat), which is what BE-8 will throttle on.
        return token.stamp_client(client_from_request(self.context.get("request")))

    def validate(self, attrs):
        email = (attrs.get("email") or "").lower().strip()
        attrs["email"] = email
        user = User.objects.filter(email=email).first()

        if user and user.is_locked:
            minutes = max(1, round(user.lockout_seconds_remaining() / 60))
            raise AuthenticationFailed(
                f"This account is locked after too many failed attempts. "
                f"Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
                code="account_locked",
            )

        try:
            data = super().validate(attrs)
        except AuthenticationFailed:
            # Count the attempt only for real, active accounts so probing for
            # valid emails gains nothing.
            if user and user.is_active:
                user.register_failed_login()
            raise

        self.user.reset_failed_logins()
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data


class TrassetTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Rotation that keeps a mobile session mobile (BE-1).

    Only the token class changes. SimpleJWT's rotation calls ``set_exp()`` with
    no lifetime, and :class:`ClientAwareRefreshToken` answers that from the
    token's own ``client`` claim — so a phone does not silently drop back to
    the 7-day web lifetime the first time it refreshes, and no header is needed
    on the refresh call for it to stay mobile.
    """

    token_class = ClientAwareRefreshToken


class LogoutSerializer(serializers.Serializer):
    """Blacklist a refresh token (FR-1.6)."""

    refresh = serializers.CharField()

    #: Optional: sign-out is also where a phone stops being a push target, so
    #: it can hand its token back in the same call rather than needing a
    #: separate DELETE that may not survive the app closing.
    push_token = serializers.CharField(required=False, allow_blank=True, max_length=255)


class PasswordChangeSerializer(serializers.Serializer):
    """Change own password (FR-1.4)."""

    current_password = serializers.CharField(style={"input_type": "password"})
    new_password = serializers.CharField(style={"input_type": "password"})
    confirm_password = serializers.CharField(style={"input_type": "password"})

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": ["The two passwords do not match."]}
            )
        if attrs["new_password"] == attrs["current_password"]:
            raise serializers.ValidationError(
                {"new_password": ["The new password must differ from the current one."]}
            )
        password_validation.validate_password(attrs["new_password"],
                                              self.context["request"].user)
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    """Request a reset link (FR-1.4)."""

    email = serializers.EmailField()

    def get_user(self):
        email = self.validated_data["email"].lower().strip()
        return User.objects.filter(email=email, is_active=True).first()

    @staticmethod
    def build_token(user) -> tuple[str, str]:
        return (
            urlsafe_base64_encode(force_bytes(user.pk)),
            default_token_generator.make_token(user),
        )


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Confirm a reset with the emailed uid + token."""

    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(style={"input_type": "password"})
    confirm_password = serializers.CharField(style={"input_type": "password"})

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": ["The two passwords do not match."]}
            )

        try:
            uid = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=uid, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            raise serializers.ValidationError(
                {"uid": ["This password reset link is not valid."]}
            ) from None

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": ["This password reset link has expired or already been used."]}
            )

        password_validation.validate_password(attrs["new_password"], user)
        attrs["user"] = user
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        user.set_password(self.validated_data["new_password"])
        user.reset_failed_logins()
        user.save(update_fields=["password", "updated_at"])
        return user


class DeviceSerializer(serializers.ModelSerializer):
    """Register or list a push target (BE-2)."""

    platform_label = serializers.CharField(source="get_platform_display", read_only=True)

    # `push_token` is unique on the model, which would make ModelSerializer
    # attach a UniqueValidator and reject re-registration with a 400. Coming
    # back with the same token is the normal case, not an error — the view
    # upserts — so the validator is dropped deliberately.
    push_token = serializers.CharField(max_length=255, validators=[])

    class Meta:
        model = Device
        fields = (
            "id", "platform", "platform_label", "push_token",
            "device_name", "app_version", "last_seen_at", "created_at",
        )
        read_only_fields = ("id", "last_seen_at", "created_at")


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """What a user may change about themselves."""

    class Meta:
        model = User
        fields = ("full_name", "phone", "avatar", "timezone_name",
                  "email_notifications", "push_notifications")

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data
