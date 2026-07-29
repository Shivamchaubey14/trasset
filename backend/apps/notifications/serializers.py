"""Notification serializers (FR-12.1)."""
from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type_label = serializers.CharField(source="get_type_display", read_only=True)
    icon = serializers.CharField(read_only=True)
    color = serializers.CharField(read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id", "type", "type_label", "icon", "color",
            "title", "message", "link",
            "is_read", "read_at",
            "related_object_type", "related_object_id",
            # `updated_at` is what a delta-sync client checkpoints on (BE-5);
            # without it there is no way to ask for "everything since".
            "created_at", "updated_at",
        )
        read_only_fields = fields


class NotificationCountSerializer(serializers.Serializer):
    """Drives the badge on the bell."""

    unread = serializers.IntegerField()
    total = serializers.IntegerField()


class MarkAllReadSerializer(serializers.Serializer):
    marked = serializers.IntegerField()
