/**
 * Day 43 verification — assign, check in, and the 409.
 *
 * The DoD is "a manager assigns and checks in from the phone; a conflicting
 * assign explains what happened". The screens need a device, but the two
 * things they depend on do not: the requests the mutations issue, and the
 * exact shape of the conflict the ConflictSheet renders.
 *
 *   cd mobile && npx tsx scripts/verify-lifecycle.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { AssetDetail, Page, User } from "../src/api";

type HistoryRow = {
  id: number;
  action: string;
  action_label?: string;
  user?: { full_name?: string } | null;
  notes?: string | null;
  created_at: string;
};

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

const memoryStore = (() => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(k: string) { return values.get(k) ?? null; },
    async setItemAsync(k: string, v: string) { values.set(k, v); },
    async deleteItemAsync(k: string) { values.delete(k); },
  };
})();

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

/** Node has randomUUID; the app uses expo-crypto's, which is the same shape. */
const uuid = () => globalThis.crypto.randomUUID();

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);
  await login("admin@trasset.local", PASSWORD);

  const available = (await api.get<Page<AssetDetail>>("/assets/", {
    status: "available", page_size: 1,
  })).results[0];
  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const employee = people.results.find((u) => u.role_name === "employee")!;
  const head = people.results.find((u) => u.role_name === "department_head")!;

  console.log(`\nFixture: ${available.asset_tag}, assigning to ${employee.full_name}`);

  console.log("\n1. Assign — exactly what useAssignAsset sends");
  const assignKey = uuid();
  // Unique per run: this asset carries history from every previous run, so a
  // fixed marker would count rows this submission did not create.
  const marker = `Day 43 check ${assignKey.slice(0, 8)}`;
  const assigned = await api.post<AssetDetail>(
    `/assets/${available.id}/assign/`,
    { user_id: employee.id, notes: marker },
    { idempotencyKey: assignKey },
  );
  check("returns the updated asset, not just an ack",
    assigned.id === available.id && assigned.status === "assigned");
  check("the holder is who we sent",
    (assigned.assigned_to as { id?: number } | null)?.id === employee.id);
  check("the optimistic shape matches the real one",
    "status_label" in assigned && "assigned_at" in assigned,
    `status_label="${(assigned as { status_label?: string }).status_label}"`);

  console.log("\n2. The idempotency key does its job (BE-4)");
  const replay = await api.post<AssetDetail>(
    `/assets/${available.id}/assign/`,
    { user_id: employee.id, notes: marker },
    { idempotencyKey: assignKey },
  );
  check("replaying the same submission returns the same answer, not a 409",
    replay.id === assigned.id && replay.status === "assigned");
  const history = await api.get<HistoryRow[]>(`/assets/${available.id}/history/`);
  const mine = history.filter((r) => r.notes === marker);
  check("it checked out once, not twice", mine.length === 1,
    `${mine.length} row(s) from this submission`);

  console.log("\n2b. History rows are events, with the fields the timeline renders");
  const row = history[0];
  check("a row carries action, action_label, user and created_at",
    ["action", "action_label", "user", "created_at"].every((k) => k in row),
    Object.keys(row).join(", "));
  check("it does NOT carry assigned_at/returned_at",
    !("assigned_at" in row) && !("returned_at" in row));

  console.log("\n3. The conflict — what ConflictSheet renders");
  try {
    // A *different* submission: new key, different person. This is the real
    // scenario — somebody else got there while you were choosing.
    await api.post(
      `/assets/${available.id}/assign/`,
      { user_id: head.id },
      { idempotencyKey: uuid() },
    );
    check("assigning an already-assigned asset is refused", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("assigning an already-assigned asset is refused", apiError instanceof ApiError);
    check("it is a 409, so isConflict routes it to the sheet",
      apiError.status === 409 && apiError.isConflict);
    check("the message names who has it and what to do",
      apiError.message.includes(employee.full_name.split(" ")[0]) &&
      /check\s*it\s*in/i.test(apiError.message),
      `"${apiError.message}"`);
  }

  console.log("\n4. Check in — what useCheckinAsset sends");
  const locations = await api.get<Page<{ id: number; name: string }>>("/locations/", { page_size: 5 });
  const returnedTo = locations.results[0];
  const checkinKey = uuid();
  const checkedIn = await api.post<AssetDetail>(
    `/assets/${available.id}/checkin/`,
    { notes: "Slight scuff on the lid", location_id: returnedTo.id },
    { idempotencyKey: checkinKey },
  );
  check("the asset comes back Available", checkedIn.status === "available");
  check("nobody holds it", checkedIn.assigned_to === null);
  check("the optional location was recorded",
    (checkedIn.location as { id?: number } | null)?.id === returnedTo.id,
    returnedTo.name);

  console.log("\n5. Checking in twice is a conflict, not a silent no-op");
  try {
    await api.post(`/assets/${available.id}/checkin/`, {}, { idempotencyKey: uuid() });
    check("a second check-in is refused", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("a second check-in is refused with 409", apiError.isConflict, `"${apiError.message}"`);
  }

  console.log("\n6. A role without permission is refused before state is considered");
  await logout();
  await login(employee.email, PASSWORD);
  try {
    await api.post(`/assets/${available.id}/assign/`, { user_id: employee.id },
      { idempotencyKey: uuid() });
    check("an employee cannot assign", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("an employee cannot assign", apiError.status === 403);
    check("403 is NOT treated as a conflict — different sheet, different words",
      !apiError.isConflict);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
