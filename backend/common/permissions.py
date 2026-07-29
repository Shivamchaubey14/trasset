"""
Role-based access control, enforced server-side on every endpoint (SEC-3).

Views declare who may read and who may write::

    class AssetViewSet(BaseModelViewSet):
        permission_classes = [HasRolePermission]
        read_roles = Roles.ALL
        write_roles = Roles.MANAGERS

``HasRolePermission`` reads those attributes, so the permission matrix lives
next to the endpoint it protects instead of in one giant table.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from common.roles import Roles


def role_of(user) -> str | None:
    """Slug of the user's role, or ``None`` for anonymous/role-less users."""
    if not user or not user.is_authenticated:
        return None
    role = getattr(user, "role", None)
    return getattr(role, "name", None)


def is_manager(user) -> bool:
    return role_of(user) in Roles.MANAGERS


def is_super_admin(user) -> bool:
    return role_of(user) == Roles.SUPER_ADMIN


class HasRolePermission(BasePermission):
    """
    Generic matrix check driven by ``read_roles`` / ``write_roles`` on the view.

    Defaults are deliberately strict: everyone authenticated can read, only
    Super Admin can write, unless the view says otherwise.
    """

    message = "You do not have permission to perform this action."

    default_read_roles = Roles.ALL
    default_write_roles = (Roles.SUPER_ADMIN,)

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False

        # An auditor is read-only everywhere, no matter what a view declares.
        if role in Roles.READ_ONLY and request.method not in SAFE_METHODS:
            self.message = "Auditors have read-only access."
            return False

        if request.method in SAFE_METHODS:
            allowed = getattr(view, "read_roles", self.default_read_roles)
        else:
            allowed = getattr(view, "write_roles", self.default_write_roles)

        # A per-action override wins when present, e.g.
        #   action_roles = {"assign": Roles.MANAGERS}
        action = getattr(view, "action", None)
        action_roles = getattr(view, "action_roles", None) or {}
        if action and action in action_roles:
            allowed = action_roles[action]

        return role in allowed


class IsSuperAdmin(BasePermission):
    message = "Only a Super Admin may perform this action."

    def has_permission(self, request, view):
        return is_super_admin(request.user)


class IsAdminOrAuditor(BasePermission):
    """Audit log visibility (FR-13.2)."""

    message = "Only Super Admins and Auditors may view audit records."

    def has_permission(self, request, view):
        return role_of(request.user) in (Roles.SUPER_ADMIN, Roles.AUDITOR)


# ---------------------------------------------------------------------------
# A note on per-owner access
#
# There is deliberately no "IsOwnerOrManager" class here. Restricting someone
# to their own records is done by narrowing the queryset in ``get_queryset``
# (see AssetRequestViewSet), not by an object-level permission. Object-level
# checks only run on detail routes, so a permission class alone would leave the
# list endpoint returning everyone's rows — the filtering has to happen in the
# query for the restriction to mean anything.
# ---------------------------------------------------------------------------
