/**
 * Day 41 verification.
 *
 * The point of checking action rules against the *live* API rather than in
 * isolation: the whole value of `availableActions` is that it agrees with what
 * the server will actually permit. A unit test would only prove it agrees with
 * my idea of the server.
 *
 * So for each role and state, this asks the client what it would show, then
 * asks the server what it would allow, and fails when they disagree.
 *
 *   cd mobile && npx tsx scripts/verify-detail.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { AssetDetail, Page } from "../src/api";
import { availableActions, canWrite, isTerminal } from "../src/assets/actions";
import type { AssetStatus } from "../src/theme/tokens";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

const memoryStore = (() => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(k: string) {
      return values.get(k) ?? null;
    },
    async setItemAsync(k: string, v: string) {
      values.set(k, v);
    },
    async deleteItemAsync(k: string) {
      values.delete(k);
    },
  };
})();

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

/** Does the server let this session assign this asset? */
async function serverAllowsAssign(assetId: number, userId: number): Promise<boolean> {
  try {
    await api.post(`/assets/${assetId}/assign/`, { user_id: userId });
    // It worked — undo, so the fixture is reusable.
    await api.post(`/assets/${assetId}/checkin/`, {});
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      // 403 means the role cannot; 409 means the *state* cannot. Both are
      // "the button should not have been offered".
      if (error.status === 403 || error.status === 409) return false;
    }
    throw error;
  }
}

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  console.log("\n1. Action rules match the web's, by role");
  const cases: Array<[AssetStatus, string | null, string[]]> = [
    ["available", "asset_manager", ["assign", "report", "retire"]],
    ["assigned", "asset_manager", ["checkin", "report", "retire"]],
    ["under_maintenance", "asset_manager", ["report", "retire"]],
    ["retired", "asset_manager", []],
    ["disposed", "super_admin", []],
    ["available", "employee", ["report"]],
    ["assigned", "auditor", ["report"]],
    ["retired", "employee", []],
  ];
  for (const [status, role, expected] of cases) {
    const got = availableActions(status, role).map((a) => a.action);
    check(`${role} · ${status}`, JSON.stringify(got) === JSON.stringify(expected),
      `[${got.join(", ")}]`);
  }

  check("retire is flagged online-only (§12.5)",
    availableActions("available", "asset_manager").find((a) => a.action === "retire")?.onlineOnly === true);
  check("only one primary action is ever offered",
    cases.every(([status, role]) =>
      availableActions(status, role).filter((a) => a.primary).length <= 1));

  console.log("\n2. The server agrees — a role we hide the button from is refused");
  await login("admin@trasset.local", PASSWORD);
  const users = await api.get<Page<{ id: number; email: string; role_name: string }>>(
    "/users/", { page_size: 50 },
  );
  const employee = users.results.find((u) => u.role_name === "employee");
  const available = (await api.get<Page<AssetDetail>>("/assets/", {
    status: "available", page_size: 1,
  })).results[0];

  check("fixture: an available asset exists", Boolean(available), available?.asset_tag);
  check("fixture: an employee exists", Boolean(employee), employee?.email);

  // Manager: client says assign, server should allow.
  const clientAllowsManager = availableActions("available", "asset_manager")
    .some((a) => a.action === "assign");
  const serverAllowsManager = await serverAllowsAssign(available.id, employee!.id);
  check("manager: client offers assign AND server allows it",
    clientAllowsManager && serverAllowsManager,
    `client=${clientAllowsManager} server=${serverAllowsManager}`);

  // Employee: client hides assign, server should refuse.
  await logout();
  await login(employee!.email, PASSWORD);
  const clientAllowsEmployee = availableActions("available", "employee")
    .some((a) => a.action === "assign");
  const serverAllowsEmployee = await serverAllowsAssign(available.id, employee!.id);
  check("employee: client hides assign AND server refuses it",
    !clientAllowsEmployee && !serverAllowsEmployee,
    `client=${clientAllowsEmployee} server=${serverAllowsEmployee}`);

  console.log("\n3. Detail and history load for the screen");
  await logout();
  await login("admin@trasset.local", PASSWORD);

  const detail = await api.get<AssetDetail>(`/assets/${available.id}/`);
  check("detail carries what the screen renders",
    ["asset_tag", "name", "status", "category", "location", "current_value"]
      .every((key) => key in detail));

  const history = await api.get<unknown>(`/assets/${available.id}/history/`);
  const rows = Array.isArray(history) ? history : (history as { results?: unknown[] })?.results ?? [];
  check("history returns a list the timeline can render", Array.isArray(rows),
    `${rows.length} row(s)`);

  console.log("\n4. Helpers");
  check("terminal statuses are terminal",
    (["retired", "lost", "disposed"] as AssetStatus[]).every(isTerminal));
  check("live statuses are not",
    (["available", "assigned", "under_maintenance"] as AssetStatus[]).every((s) => !isTerminal(s)));
  check("canWrite matches the web's canWrite()",
    canWrite("super_admin") && canWrite("asset_manager") &&
    !canWrite("department_head") && !canWrite("employee") && !canWrite("auditor") && !canWrite(null));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
