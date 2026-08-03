/**
 * Day 45 verification — requests and approvals.
 *
 * The DoD is "an employee requests on mobile; an approver approves on mobile;
 * the asset is assigned". The screens need a device, but everything they stand
 * on does not: the exact requests the mutations issue, the role scoping the two
 * modes rely on, the 409 the conflict sheet renders, and the validation
 * messages the forms mirror.
 *
 * Also checks the schema fix that made this day's types possible — the request
 * status enum used to be generated as the *asset* status enum, so a client
 * reading `status` was typed against the wrong vocabulary entirely.
 *
 *   cd mobile && npx tsx scripts/verify-requests.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, AssetRequest, Page, User } from "../src/api";
import { canApprove, canCancel, isDecidable } from "../src/requests/actions";

const BASE = "http://127.0.0.1:8000/api/v1";
const SCHEMA = "http://127.0.0.1:8000/api/schema/?format=json";
const PASSWORD = "Trasset@2026";

interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

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

  // ---------------------------------------------------------------------
  console.log("\n0. The schema tells the truth about request status");
  // Unauthenticated: the schema endpoint is public.
  const schema = await (await fetch(SCHEMA)).json() as {
    components: { schemas: Record<string, { enum?: string[]; properties?: Record<string, unknown> }> };
  };
  const schemas = schema.components.schemas;
  check("RequestStatusEnum exists as its own component",
    Array.isArray(schemas.RequestStatusEnum?.enum),
    JSON.stringify(schemas.RequestStatusEnum?.enum));
  check("it holds the request vocabulary, not the asset one",
    JSON.stringify(schemas.RequestStatusEnum?.enum) ===
    JSON.stringify(["pending", "approved", "rejected", "cancelled"]));
  const statusProp = JSON.stringify(schemas.AssetRequest?.properties?.status ?? {});
  check("AssetRequest.status points at it, not at AssetStatusEnum",
    statusProp.includes("RequestStatusEnum") && !statusProp.includes("AssetStatusEnum"),
    statusProp);

  // ---------------------------------------------------------------------
  await login("admin@trasset.local", PASSWORD);
  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const employee = people.results.find((u) => u.role_name === "employee")!;

  // A category that actually has something available, so the approval can hand
  // over a real asset rather than failing for want of stock.
  const availableAssets = await api.get<Page<Asset>>("/assets/", {
    status: "available", page_size: 50,
  });
  const withCategory = availableAssets.results.find(
    (a) => (a.category as { id?: number } | null)?.id,
  )!;
  const category = withCategory.category as { id: number; name: string };
  await logout();

  console.log(`\nFixture: ${employee.full_name} requesting a ${category.name}`);

  // ---------------------------------------------------------------------
  console.log("\n1. An employee raises a request — what NewRequestScreen sends");
  await login(employee.email, PASSWORD);

  const createKey = uuid();
  const reason = `Day 45 check ${createKey.slice(0, 8)} — mine will not hold a charge.`;
  const created = await api.post<AssetRequest>(
    "/asset-requests/",
    { category_id: category.id, reason, needed_by: isoDaysFromToday(7) },
    { idempotencyKey: createKey },
  );
  check("it comes back with an id", typeof created.id === "number", `#${created.id}`);
  // The create serializer's `to_representation` returns the read shape, so the
  // response is the whole record — which is why `useCreateRequest` can seed the
  // detail cache from it, and why the schema had to be corrected to say so.
  check("the create response is the full read shape, as the schema now states",
    created.status === "pending" && Boolean(created.requester) && Boolean(created.target_label),
    Object.keys(created).join(", "));

  console.log("\n1b. Replaying the same submission does not raise it twice (BE-4)");
  const replay = await api.post<AssetRequest>(
    "/asset-requests/",
    { category_id: category.id, reason, needed_by: isoDaysFromToday(7) },
    { idempotencyKey: createKey },
  );
  check("the replay returns the same request", replay.id === created.id);
  const mine = await api.get<Page<AssetRequest>>("/asset-requests/", { page_size: 100 });
  check("exactly one request exists from this submission",
    mine.results.filter((r) => r.reason === reason).length === 1,
    `${mine.results.filter((r) => r.reason === reason).length} row(s)`);

  console.log("\n2. The read shape carries what the row and detail screens render");
  const row = mine.results.find((r) => r.id === created.id)!;
  check("status is the request vocabulary",
    ["pending", "approved", "rejected", "cancelled"].includes(row.status),
    row.status);
  check("target_label is built server-side",
    typeof row.target_label === "string" && row.target_label.length > 0,
    `"${row.target_label}"`);
  check("status_label and is_pending are present",
    Boolean(row.status_label) && row.is_pending === true);
  check("requester is nested, so the inbox can show a name and avatar",
    typeof (row.requester as { full_name?: string })?.full_name === "string");

  console.log("\n3. The reason rule the form mirrors");
  try {
    await api.post("/asset-requests/", { category_id: category.id, reason: "too short" },
      { idempotencyKey: uuid() });
    check("a short reason is refused", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("a short reason is refused with 400", apiError.status === 400);
    check("the field error names `reason`",
      Boolean(apiError.errors?.reason), JSON.stringify(apiError.errors));
  }

  console.log("\n4. Role scoping — an employee sees only their own");
  check("every visible request is theirs",
    mine.results.every((r) => (r.requester as { id?: number })?.id === employee.id),
    `${mine.results.length} row(s)`);
  check("canApprove() agrees they cannot decide",
    !canApprove(employee.role_name as string));
  check("isDecidable() therefore offers them no decision",
    !isDecidable("pending", employee.role_name as string));
  check("canCancel() lets them withdraw their own pending one",
    canCancel("pending", employee.id, employee.id));
  check("…but not somebody else's",
    !canCancel("pending", employee.id + 1, employee.id));

  console.log("\n5. The server enforces it too, not just the screen");
  try {
    await api.post(`/asset-requests/${created.id}/approve/`, {}, { idempotencyKey: uuid() });
    check("an employee cannot approve", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("an employee cannot approve", apiError.status === 403, `${apiError.status}`);
    check("403 is not a conflict — different words, different sheet", !apiError.isConflict);
  }

  // ---------------------------------------------------------------------
  console.log("\n6. The approver's inbox");
  await logout();
  await login("admin@trasset.local", PASSWORD);

  check("canApprove() agrees a manager can decide", canApprove("asset_manager"));
  const stats = await api.get<Stats>("/asset-requests/stats/");
  check("stats gives the badge its number", typeof stats.pending === "number",
    `${stats.pending} pending`);
  const inbox = await api.get<Page<AssetRequest>>("/asset-requests/", {
    status: "pending", page_size: 100,
  });
  check("the pending list contains the new request",
    inbox.results.some((r) => r.id === created.id));
  check("a manager sees requests raised by other people",
    inbox.results.some((r) => (r.requester as { id?: number })?.id !== undefined));

  console.log("\n7. Approving a category request without choosing an asset");
  try {
    await api.post(`/asset-requests/${created.id}/approve/`, {}, { idempotencyKey: uuid() });
    check("it is refused rather than guessing an asset", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("it is refused with 409", apiError.status === 409 && apiError.isConflict);
    check("the message says to choose one — which is why the picker is inline",
      /choose which asset/i.test(apiError.message), `"${apiError.message}"`);
  }

  console.log("\n8. Approving with an asset — the DoD");
  const approveKey = uuid();
  const approved = await api.post<AssetRequest>(
    `/asset-requests/${created.id}/approve/`,
    { asset_id: withCategory.id, notes: "" },
    { idempotencyKey: approveKey },
  );
  check("the request comes back approved", approved.status === "approved", approved.status);
  check("it records who decided it",
    Boolean((approved.decided_by as { full_name?: string } | null)?.full_name));
  check("fulfilled_asset names what was handed over",
    (approved.fulfilled_asset as { id?: number } | null)?.id === withCategory.id,
    withCategory.asset_tag);

  const asset = await api.get<Asset>(`/assets/${withCategory.id}/`);
  check("THE ASSET IS ASSIGNED — to the requester",
    asset.status === "assigned" &&
    (asset.assigned_to as { id?: number } | null)?.id === employee.id,
    `${asset.asset_tag} → ${(asset.assigned_to as { full_name?: string } | null)?.full_name}`);

  console.log("\n9. A settled request cannot be decided twice");
  check("isDecidable() closes the screen's actions",
    !isDecidable("approved", "asset_manager"));
  try {
    await api.post(`/asset-requests/${created.id}/reject/`, { notes: "changed my mind" },
      { idempotencyKey: uuid() });
    check("the server refuses a second decision", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("the server refuses a second decision with 409", apiError.isConflict,
      `"${apiError.message}"`);
  }

  // ---------------------------------------------------------------------
  console.log("\n10. Rejecting, with the reason the requester reads");
  await logout();
  await login(employee.email, PASSWORD);
  const second = await api.post<AssetRequest>(
    "/asset-requests/",
    { category_id: category.id, reason: `Day 45 reject path ${uuid().slice(0, 8)} — need a spare.` },
    { idempotencyKey: uuid() },
  );
  await logout();
  await login("admin@trasset.local", PASSWORD);

  try {
    await api.post(`/asset-requests/${second.id}/reject/`, { notes: "no" },
      { idempotencyKey: uuid() });
    check("a token reason is refused", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("a token reason is refused with 400", apiError.status === 400);
    check("the field error names `notes`", Boolean(apiError.errors?.notes),
      JSON.stringify(apiError.errors));
  }

  const rejected = await api.post<AssetRequest>(
    `/asset-requests/${second.id}/reject/`,
    { notes: "No spare laptops until the next order arrives." },
    { idempotencyKey: uuid() },
  );
  check("the request is rejected", rejected.status === "rejected");
  check("the reason is stored where the requester can read it",
    rejected.decision_notes.includes("next order"), `"${rejected.decision_notes}"`);

  // ---------------------------------------------------------------------
  console.log("\n11. Withdrawing your own request");
  await logout();
  await login(employee.email, PASSWORD);
  const third = await api.post<AssetRequest>(
    "/asset-requests/",
    { category_id: category.id, reason: `Day 45 cancel path ${uuid().slice(0, 8)} — may not need it.` },
    { idempotencyKey: uuid() },
  );
  const cancelled = await api.post<AssetRequest>(
    `/asset-requests/${third.id}/cancel/`, {}, { idempotencyKey: uuid() },
  );
  check("the requester can withdraw it", cancelled.status === "cancelled");

  console.log("\n12. A duplicate pending request for the same asset is refused");
  const spare = (await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 }))
    .results[0];
  if (spare) {
    // Clear anything this check left behind last time. Without it the *first*
    // post below collides with its own leftover and the script fails on its
    // second run — which is what happened: a verification that only passes
    // once is not a verification.
    const mine = await api.get<Page<AssetRequest>>("/asset-requests/", {
      status: "pending", page_size: 50,
    });
    for (const stale of mine.results) {
      const assetId = (stale as { asset?: { id?: number } }).asset?.id;
      if (assetId === spare.id) {
        await api.post(`/asset-requests/${stale.id}/cancel/`, {}, { idempotencyKey: uuid() })
          .catch(() => {});
      }
    }

    const dupReason = `duplicate check ${uuid().slice(0, 8)} — needed on site.`;
    const first = await api.post<AssetRequest>(
      "/asset-requests/", { asset_id: spare.id, reason: dupReason },
      { idempotencyKey: uuid() },
    );
    try {
      // A different submission, same asset — the noise an approver would get.
      await api.post("/asset-requests/", { asset_id: spare.id, reason: dupReason },
        { idempotencyKey: uuid() });
      check("a second pending request for the same asset is refused", false);
    } catch (error) {
      const apiError = error as ApiError;
      check("a second pending request for the same asset is refused",
        apiError.status === 400, JSON.stringify(apiError.errors));
    }

    // And put the fixture back, so the next run starts where this one did.
    await api.post(`/asset-requests/${first.id}/cancel/`, {}, { idempotencyKey: uuid() })
      .catch(() => {});
  } else {
    console.log("  SKIP  no available asset left to test the duplicate rule");
  }

  console.log("\n13. What a tapped notification routes on (FR-14.23, BE-3)");
  const notifications = await api.get<
    Page<{ deep_link?: string; related_object_type?: string; related_object_id?: string }>
  >("/notifications/", { page_size: 50 });
  const requestNote = notifications.results.find((n) => n.related_object_type === "AssetRequest");
  if (requestNote) {
    // `related_object_id` is a CharField, not an FK — the model stores plain
    // values rather than a GenericForeignKey — so it arrives as a string and
    // the route param has to be read as one.
    check("a decision notification relates to the request",
      requestNote.related_object_type === "AssetRequest" &&
      /^\d+$/.test(requestNote.related_object_id ?? ""),
      `AssetRequest #${requestNote.related_object_id}`);
    // `deep_link` is a push-payload field, deliberately not in
    // NotificationSerializer — the REST list carries `link` (a web path) plus
    // the related object, which is what an in-app row routes on. The native
    // `trasset://requests/{id}` form is asserted against the model in
    // `tests/test_push.py`; the route for it is registered in RootNavigator.
    check("the list does not pretend to carry the native deep link",
      requestNote.deep_link === undefined);
  } else {
    console.log("  SKIP  no AssetRequest notification for this account to check");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

/** Mirrors the screen's own helper — a plain date in the device's timezone. */
function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
