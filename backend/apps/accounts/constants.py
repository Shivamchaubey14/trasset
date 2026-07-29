"""Account vocabulary shared by models, serializers and the admin."""
from django.db import models


class DevicePlatform(models.TextChoices):
    """What a registered device runs (SRS §12.2)."""

    IOS = "ios", "iOS"
    ANDROID = "android", "Android"
    WEB = "web", "Web"
