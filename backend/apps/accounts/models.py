"""Users and roles (SRS §4.1)."""
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel
from common.roles import Roles

from .managers import UserManager


class Role(TimeStampedModel):
    """One of the five fixed roles from SRS §2.3, seeded by data migration."""

    name = models.CharField(max_length=50, unique=True, choices=Roles.CHOICES)
    description = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "roles"
        ordering = ("id",)
        verbose_name = "role"
        verbose_name_plural = "roles"

    def __str__(self):
        return self.get_name_display()

    @property
    def label(self) -> str:
        return self.get_name_display()


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """
    Trasset account. Email is the login identifier (FR-1.1) and each user
    holds exactly one role (FR-2.2).
    """

    full_name = models.CharField(max_length=150)
    email = models.EmailField(max_length=150, unique=True, db_index=True)
    phone = models.CharField(max_length=30, blank=True)

    role = models.ForeignKey(
        Role,
        on_delete=models.PROTECT,
        related_name="users",
        null=True,
        blank=True,
    )
    department = models.ForeignKey(
        "masters.Department",
        on_delete=models.SET_NULL,
        related_name="members",
        null=True,
        blank=True,
    )

    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    timezone_name = models.CharField(max_length=64, default="UTC")

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # Notification preferences (FR-12.2)
    email_notifications = models.BooleanField(default=True)

    # Brute-force lockout (FR-1.5)
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        db_table = "users"
        ordering = ("full_name",)
        indexes = [
            models.Index(fields=["role", "is_active"], name="idx_user_role_active"),
        ]

    def __str__(self):
        return f"{self.full_name} <{self.email}>"

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.lower().strip()
        super().save(*args, **kwargs)

    # -- convenience ------------------------------------------------------
    @property
    def role_name(self) -> str | None:
        return self.role.name if self.role_id else None

    @property
    def initials(self) -> str:
        parts = [p for p in self.full_name.split() if p]
        return "".join(p[0].upper() for p in parts[:2]) or self.email[:1].upper()

    def has_role(self, *roles) -> bool:
        return self.role_name in roles

    @property
    def is_manager(self) -> bool:
        return self.has_role(*Roles.MANAGERS)

    # -- lockout (FR-1.5) --------------------------------------------------
    @property
    def is_locked(self) -> bool:
        return bool(self.locked_until and self.locked_until > timezone.now())

    def lockout_seconds_remaining(self) -> int:
        if not self.is_locked:
            return 0
        return int((self.locked_until - timezone.now()).total_seconds())

    def register_failed_login(self):
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= settings.LOGIN_MAX_ATTEMPTS:
            self.locked_until = timezone.now() + timedelta(
                minutes=settings.LOGIN_LOCKOUT_MINUTES
            )
            self.failed_login_attempts = 0
        self.save(update_fields=["failed_login_attempts", "locked_until", "updated_at"])

    def reset_failed_logins(self):
        if self.failed_login_attempts or self.locked_until:
            self.failed_login_attempts = 0
            self.locked_until = None
            self.save(update_fields=["failed_login_attempts", "locked_until", "updated_at"])
