/**
 * Canonical role slugs — mirrors `common/roles.py`.
 *
 * One definition, because the interesting rules are *combinations* of roles and
 * they were starting to be spelled out per feature. `assets/actions.ts` knew
 * about managers, `requests/actions.ts` about approvers, and neither knew that
 * an auditor is refused every write regardless — which is how a Request button
 * ended up in front of the one role that can never use it.
 *
 * **`READ_ONLY` is not "a role with fewer permissions".** `HasRolePermission`
 * rejects every unsafe method for it *before* consulting the view's own
 * `write_roles`, so a view declaring `write_roles = Roles.ALL` still refuses an
 * auditor. Reading `write_roles` alone and concluding otherwise is the specific
 * mistake this module exists to prevent.
 */
export const Roles = {
  SUPER_ADMIN: "super_admin",
  ASSET_MANAGER: "asset_manager",
  DEPARTMENT_HEAD: "department_head",
  EMPLOYEE: "employee",
  AUDITOR: "auditor",
} as const;

export type RoleName = (typeof Roles)[keyof typeof Roles];

/** `Roles.MANAGERS` — may change data anywhere. */
export const MANAGER_ROLES: string[] = [Roles.SUPER_ADMIN, Roles.ASSET_MANAGER];

/** `Roles.APPROVERS` — may decide asset requests (FR-4.4). */
export const APPROVER_ROLES: string[] = [
  Roles.SUPER_ADMIN,
  Roles.ASSET_MANAGER,
  Roles.DEPARTMENT_HEAD,
];

/** `Roles.READ_ONLY` — may see everything and write nothing, anywhere. */
export const READ_ONLY_ROLES: string[] = [Roles.AUDITOR];

export function isManager(roleName?: string | null): boolean {
  return MANAGER_ROLES.includes(roleName ?? "");
}

export function isApprover(roleName?: string | null): boolean {
  return APPROVER_ROLES.includes(roleName ?? "");
}

/**
 * True when this role is refused every unsafe method, whatever a view declares.
 *
 * Any screen offering an action should check this first: a read-only role gets
 * no write buttons at all, not a shorter list of them.
 */
export function isReadOnly(roleName?: string | null): boolean {
  return READ_ONLY_ROLES.includes(roleName ?? "");
}
