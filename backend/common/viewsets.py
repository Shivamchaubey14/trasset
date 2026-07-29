"""
Base viewsets so every resource behaves the same way (NFR-11).

Provides:
* role-driven permissions (``read_roles`` / ``write_roles``)
* the ``write`` throttle scope on unsafe methods (SEC-7)
* ``Idempotency-Key`` support on unsafe methods (BE-4)
* a 200-with-envelope delete instead of a bodyless 204, so the frontend can
  always read ``message`` from a response
"""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from common.idempotency import IdempotentWriteMixin
from common.permissions import HasRolePermission
from common.responses import ok
from common.roles import Roles


class ScopedThrottleMixin:
    """Auth-style scoping: reads use the default scope, writes use ``write``."""

    throttle_scope = None
    write_throttle_scope = "write"

    def get_throttles(self):
        if self.request and self.request.method not in ("GET", "HEAD", "OPTIONS"):
            self.throttle_scope = self.write_throttle_scope
        return super().get_throttles()


class BaseModelViewSet(IdempotentWriteMixin, ScopedThrottleMixin, viewsets.ModelViewSet):
    """
    Standard CRUD viewset for Trasset resources.

    Every write here honours ``Idempotency-Key`` (BE-4). It is applied at the
    base rather than per-endpoint because it costs nothing when the header is
    absent, and the set of actions a client might queue offline is not
    something this layer should be guessing at.
    """

    permission_classes = [IsAuthenticated, HasRolePermission]
    read_roles = Roles.ALL
    write_roles = Roles.MANAGERS

    #: Optional per-action override, e.g. {"destroy": (Roles.SUPER_ADMIN,)}
    action_roles: dict = {}

    def perform_destroy(self, instance):
        instance.delete()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        singular = getattr(self, "resource_name", None) or \
            str(instance._meta.verbose_name).capitalize()
        return ok(None, f"{singular} deleted successfully")


class BaseReadOnlyViewSet(ScopedThrottleMixin, viewsets.ReadOnlyModelViewSet):
    """List/retrieve only — audit logs, roles, reports."""

    permission_classes = [IsAuthenticated, HasRolePermission]
    read_roles = Roles.ALL
