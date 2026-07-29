"""User manager — email is the login identifier, not a username."""
from django.contrib.auth.models import BaseUserManager
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        # Give the account the Super Admin role so API RBAC matches Django admin.
        if not extra_fields.get("role_id") and not extra_fields.get("role"):
            from common.roles import Roles

            role = self.model._meta.get_field("role").related_model.objects.filter(
                name=Roles.SUPER_ADMIN
            ).first()
            if role:
                extra_fields["role"] = role

        return self._create_user(email, password, **extra_fields)


class DeviceManager(models.Manager):
    """Registration is an upsert, because a device registers more than once."""

    def register(self, user, push_token: str, **fields):
        """
        Record ``push_token`` against ``user``, returning ``(device, created)``.

        A push token identifies one physical handset, so re-registering — which
        happens on every app launch and on token rotation — updates the row
        rather than adding another. Two rows for one phone means two pushes for
        one event.

        The row is also *moved* to ``user`` if it was registered by somebody
        else. That is a handset changing hands, and leaving it pointed at the
        previous owner would send them notifications about someone else's
        assets.

        ``update_or_create`` is used rather than a get-then-save because it
        recovers from the unique-constraint race two simultaneous launches can
        provoke.
        """
        fields["user"] = user
        fields["last_seen_at"] = timezone.now()
        return self.update_or_create(push_token=push_token, defaults=fields)
