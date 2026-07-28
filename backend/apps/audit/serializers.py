"""Audit serializers (FR-13.2)."""
from rest_framework import serializers

from .models import AuditLog


class AuditActorSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    initials = serializers.CharField(read_only=True)


class AuditLogSerializer(serializers.ModelSerializer):
    """
    One row of the trail.

    ``user`` may be null once an account is removed, which is why
    ``user_display`` is stored alongside it — the row still says who acted.
    """

    user = AuditActorSerializer(read_only=True)
    action_label = serializers.CharField(source="get_action_display", read_only=True)
    action_color = serializers.CharField(read_only=True)
    changed_fields = serializers.ListField(read_only=True)

    class Meta:
        model = AuditLog
        fields = (
            "id", "action", "action_label", "action_color",
            "user", "user_display",
            "entity_type", "entity_id", "entity_label",
            "changes", "changed_fields",
            "ip_address", "request_path",
            "created_at",
        )
        read_only_fields = fields


class AuditSummarySerializer(serializers.Serializer):
    """Counts for the cards above the audit table."""

    total = serializers.IntegerField()
    today = serializers.IntegerField()
    actors = serializers.IntegerField()
    by_action = serializers.ListField()
