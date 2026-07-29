"""Notification endpoints (SRS §5.2, FR-12.1)."""
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated

from common.responses import ok
from common.sync import UPDATED_SINCE_PARAMETER, DeltaSyncMixin
from common.viewsets import ScopedThrottleMixin
from rest_framework import mixins, viewsets

from .constants import NotificationType
from .models import Notification
from .serializers import (
    MarkAllReadSerializer,
    NotificationCountSerializer,
    NotificationSerializer,
)


class NotificationFilter(filters.FilterSet):
    is_read = filters.BooleanFilter()
    type = filters.MultipleChoiceFilter(choices=NotificationType.choices)

    class Meta:
        model = Notification
        fields = ("is_read", "type")


@extend_schema(tags=["Notifications"])
@extend_schema_view(list=extend_schema(parameters=[UPDATED_SINCE_PARAMETER]))
class NotificationViewSet(DeltaSyncMixin,
                          ScopedThrottleMixin,
                          mixins.ListModelMixin,
                          mixins.RetrieveModelMixin,
                          mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    """
    Your notifications, and nobody else's.

    There is no create route: notifications are raised by the events that cause
    them, never by a client. The queryset is scoped to the requesting user, so
    role permissions are not the mechanism here — ownership is.
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    resource_name = "Notification"

    filterset_class = NotificationFilter
    ordering_fields = ("created_at", "is_read")
    ordering = ("-created_at",)

    def get_queryset(self):
        # drf-spectacular introspects the view without a real request.
        if getattr(self, "swagger_fake_view", False) or not self.request:
            return Notification.objects.none()
        return Notification.objects.filter(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        notification = self.get_object()
        notification.delete()
        return ok(None, "Notification dismissed")

    @extend_schema(
        summary="Mark one as read",
        request=None,
        responses={200: NotificationSerializer},
    )
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.mark_read()
        return ok(
            NotificationSerializer(notification, context=self.get_serializer_context()).data,
            "Notification marked as read",
        )

    @extend_schema(
        summary="Mark everything as read",
        request=None,
        responses={200: MarkAllReadSerializer},
    )
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        marked = self.get_queryset().mark_all_read()
        return ok(
            {"marked": marked},
            f"{marked} notification{'s' if marked != 1 else ''} marked as read"
            if marked else "Nothing left to mark",
        )

    @extend_schema(
        summary="Unread count",
        description="Drives the badge on the bell, so it is deliberately cheap.",
        responses={200: NotificationCountSerializer},
    )
    @action(detail=False, methods=["get"])
    def count(self, request):
        queryset = self.get_queryset()
        return ok(
            {
                "unread": queryset.filter(is_read=False).count(),
                "total": queryset.count(),
            },
            "Notification count retrieved successfully",
        )
