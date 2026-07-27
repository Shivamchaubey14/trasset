"""
Canonical role slugs (SRS §2.3).

Kept in ``common`` so permission classes can import them without touching the
app registry — the ``Role`` table is seeded from this list in a data migration.
"""


class Roles:
    SUPER_ADMIN = "super_admin"
    ASSET_MANAGER = "asset_manager"
    DEPARTMENT_HEAD = "department_head"
    EMPLOYEE = "employee"
    AUDITOR = "auditor"

    CHOICES = (
        (SUPER_ADMIN, "Super Admin"),
        (ASSET_MANAGER, "Asset Manager"),
        (DEPARTMENT_HEAD, "Department Head"),
        (EMPLOYEE, "Employee"),
        (AUDITOR, "Auditor"),
    )

    ALL = (SUPER_ADMIN, ASSET_MANAGER, DEPARTMENT_HEAD, EMPLOYEE, AUDITOR)

    #: Roles that may change data anywhere in the system.
    MANAGERS = (SUPER_ADMIN, ASSET_MANAGER)

    #: Roles that may see everything but must never write.
    READ_ONLY = (AUDITOR,)

    #: Roles allowed to approve asset requests (FR-4.4).
    APPROVERS = (SUPER_ADMIN, ASSET_MANAGER, DEPARTMENT_HEAD)


ROLE_DESCRIPTIONS = {
    Roles.SUPER_ADMIN: "System owner — full access, manages users, roles and settings.",
    Roles.ASSET_MANAGER: "Manages inventory day to day — assets, assignments, maintenance, reports.",
    Roles.DEPARTMENT_HEAD: "Oversees a department's assets — views, requests and approves returns.",
    Roles.EMPLOYEE: "End user — views assigned assets, requests assets, reports issues.",
    Roles.AUDITOR: "Read-only compliance role — views everything, exports reports, cannot edit.",
}
