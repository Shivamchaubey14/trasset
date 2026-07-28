"""
Permission-layer internals — SEC-3.

The role matrix is exercised end-to-end in test_permissions.py. This covers the
edges that endpoint tests don't reach: anonymous and role-less users, the
per-action override, and the auditor guard that must hold regardless of what a
view declares.
"""
from django.contrib.auth.models import AnonymousUser
from rest_framework.test import APIRequestFactory

from common.permissions import (
    HasRolePermission,
    IsAdminOrAuditor,
    IsSuperAdmin,
    is_manager,
    is_super_admin,
    role_of,
)
from common.roles import Roles

from .base import TrassetAPITestCase


class FakeView:
    """Minimal stand-in for the attributes the permission class reads."""

    def __init__(self, **attrs):
        self.action = attrs.pop("action", None)
        for key, value in attrs.items():
            setattr(self, key, value)


class RoleHelperTests(TrassetAPITestCase):
    def test_role_of_returns_the_slug(self):
        self.assertEqual(role_of(self.manager), Roles.ASSET_MANAGER)

    def test_role_of_anonymous_is_none(self):
        self.assertIsNone(role_of(AnonymousUser()))

    def test_role_of_none_is_none(self):
        self.assertIsNone(role_of(None))

    def test_role_of_a_user_without_a_role_is_none(self):
        """Role is nullable, so this has to be handled rather than crash."""
        self.employee.role = None
        self.employee.save(update_fields=["role"])
        self.assertIsNone(role_of(self.employee))

    def test_is_manager(self):
        self.assertTrue(is_manager(self.admin))
        self.assertTrue(is_manager(self.manager))
        self.assertFalse(is_manager(self.head))
        self.assertFalse(is_manager(self.employee))
        self.assertFalse(is_manager(AnonymousUser()))

    def test_is_super_admin(self):
        self.assertTrue(is_super_admin(self.admin))
        self.assertFalse(is_super_admin(self.manager))


class HasRolePermissionTests(TrassetAPITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.permission = HasRolePermission()

    def check(self, user, method="GET", view=None, path="/api/v1/things/"):
        request = getattr(self.factory, method.lower())(path)
        request.user = user
        return self.permission.has_permission(request, view or FakeView())

    def test_anonymous_is_denied(self):
        self.assertFalse(self.check(AnonymousUser()))

    def test_a_user_without_a_role_is_denied(self):
        """Fail closed: no role means no access, not default access."""
        self.employee.role = None
        self.employee.save(update_fields=["role"])
        self.assertFalse(self.check(self.employee))

    def test_defaults_allow_read_for_everyone(self):
        self.assertTrue(self.check(self.employee))

    def test_defaults_restrict_writes_to_super_admin(self):
        """A view that forgets to declare write_roles must not be permissive."""
        self.assertTrue(self.check(self.admin, method="POST"))
        self.assertFalse(self.check(self.manager, method="POST"))

    def test_view_declared_write_roles_are_honoured(self):
        view = FakeView(write_roles=Roles.MANAGERS)
        self.assertTrue(self.check(self.manager, method="POST", view=view))
        self.assertFalse(self.check(self.employee, method="POST", view=view))

    def test_view_declared_read_roles_are_honoured(self):
        view = FakeView(read_roles=(Roles.SUPER_ADMIN,))
        self.assertTrue(self.check(self.admin, view=view))
        self.assertFalse(self.check(self.employee, view=view))

    def test_action_roles_override_the_method_defaults(self):
        view = FakeView(action="approve", write_roles=Roles.MANAGERS,
                        action_roles={"approve": (Roles.DEPARTMENT_HEAD,)})
        self.assertTrue(self.check(self.head, method="POST", view=view))
        self.assertFalse(self.check(self.manager, method="POST", view=view))

    def test_action_roles_are_ignored_for_other_actions(self):
        view = FakeView(action="create", write_roles=Roles.MANAGERS,
                        action_roles={"approve": (Roles.DEPARTMENT_HEAD,)})
        self.assertTrue(self.check(self.manager, method="POST", view=view))

    def test_auditor_is_read_only_even_when_a_view_grants_writes(self):
        """The guard must not be defeatable by a permissive view declaration."""
        view = FakeView(write_roles=Roles.ALL)
        self.assertTrue(self.check(self.auditor))
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            with self.subTest(method=method):
                self.assertFalse(self.check(self.auditor, method=method, view=view))

    def test_auditor_guard_beats_an_action_role_override(self):
        view = FakeView(action="approve", action_roles={"approve": Roles.ALL})
        self.assertFalse(self.check(self.auditor, method="POST", view=view))

    def test_options_is_treated_as_a_read(self):
        """CORS preflight must not be judged as a write."""
        view = FakeView(write_roles=(Roles.SUPER_ADMIN,))
        self.assertTrue(self.check(self.employee, method="OPTIONS", view=view))

    def test_message_explains_the_auditor_restriction(self):
        view = FakeView(write_roles=Roles.ALL)
        self.check(self.auditor, method="POST", view=view)
        self.assertIn("read-only", self.permission.message.lower())


class NamedPermissionTests(TrassetAPITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()

    def check(self, permission, user):
        request = self.factory.get("/api/v1/things/")
        request.user = user
        return permission.has_permission(request, FakeView())

    def test_is_super_admin(self):
        permission = IsSuperAdmin()
        self.assertTrue(self.check(permission, self.admin))
        for user in (self.manager, self.head, self.employee, self.auditor):
            with self.subTest(role=user.role_name):
                self.assertFalse(self.check(permission, user))

    def test_is_admin_or_auditor(self):
        permission = IsAdminOrAuditor()
        self.assertTrue(self.check(permission, self.admin))
        self.assertTrue(self.check(permission, self.auditor))
        for user in (self.manager, self.head, self.employee):
            with self.subTest(role=user.role_name):
                self.assertFalse(self.check(permission, user))

    def test_anonymous_is_denied_by_both(self):
        for permission in (IsSuperAdmin(), IsAdminOrAuditor()):
            with self.subTest(permission=type(permission).__name__):
                self.assertFalse(self.check(permission, AnonymousUser()))
