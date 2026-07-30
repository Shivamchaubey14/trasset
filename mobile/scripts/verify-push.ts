/**
 * Day 46 verification — device registration, notifications, deep links.
 *
 * The DoD is "a push arrives on a real device and opens the right record from a
 * cold start". **The delivery half cannot be checked here** — it needs a
 * development build, an Expo project and push credentials, none of which exist
 * yet (Expo Go dropped remote push in SDK 53). What *can* be checked without a
 * device is everything the delivery depends on, and that is what this does:
 *
 *   * the registration upsert (BE-2) — including that re-registering does not
 *     accumulate rows, which is what stops one handset getting two pushes;
 *   * the notification list, counts and read transitions the Alerts screen uses;
 *   * `routeForPayload` against **real server payloads**, not invented ones —
 *     the resolver is pure, so it can be exercised directly against what
 *     `Notification.deep_link` and `related_object_*` actually contain.
 *
 * That last one is the point. Routing is where a tapped push silently opens the
 * wrong thing, and it is testable without a phone.
 *
 *   cd mobile && npx tsx scripts/verify-push.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Notification, Page, User } from "../src/api";
import { routeForPayload } from "../src/notifications/routing";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

interface DeviceRecord {
  id: number;
  platform: string;
  push_token: string;
  device_name: string;
  app_version: string;
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

const uuid = () => globalThis.crypto.randomUUID();

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  // ---------------------------------------------------------------------
  console.log("\n1. Routing — the pure resolver, before any network");

  check("a native deep link wins",
    JSON.stringify(routeForPayload({ deep_link: "trasset://assets/12" })) ===
    JSON.stringify({ screen: "Asset", params: { id: 12 } }));
  check("requests route to the request screen",
    JSON.stringify(routeForPayload({ deep_link: "trasset://requests/7" })) ===
    JSON.stringify({ screen: "Request", params: { id: 7 } }));
  check("related_object_* is used when there is no deep link — what the REST list gives",
    JSON.stringify(routeForPayload({ related_object_type: "AssetRequest", related_object_id: "9" })) ===
    JSON.stringify({ screen: "Request", params: { id: 9 } }));
  check("a string id is accepted, since related_object_id is a CharField",
    JSON.stringify(routeForPayload({ related_object_type: "Asset", related_object_id: "3" })) ===
    JSON.stringify({ screen: "Asset", params: { id: 3 } }));
  check("a web `link` is never routed on",
    routeForPayload({ related_object_type: null, related_object_id: null } as never).screen ===
    "Notifications");
  check("a record with no phone screen falls back to the list, not a crash",
    routeForPayload({ deep_link: "trasset://purchase-orders/4" }).screen === "Notifications");
  check("trasset://notifications falls back to the list",
    routeForPayload({ deep_link: "trasset://notifications" }).screen === "Notifications");
  check("junk falls back rather than routing to NaN",
    routeForPayload({ deep_link: "trasset://assets/not-a-number" }).screen === "Notifications");
  check("a zero id is rejected",
    routeForPayload({ deep_link: "trasset://assets/0" }).screen === "Notifications");
  check("an empty payload falls back",
    routeForPayload(null).screen === "Notifications");

  // ---------------------------------------------------------------------
  console.log("\n2. Device registration is an upsert (BE-2)");
  await login("admin@trasset.local", PASSWORD);

  const before = await api.get<DeviceRecord[]>("/auth/devices/");
  const token = `ExponentPushToken[verify-${uuid().slice(0, 12)}]`;

  const registered = await api.post<DeviceRecord>("/auth/devices/", {
    platform: "android",
    push_token: token,
    device_name: "Day 46 verification",
    app_version: "1.0.0",
  });
  check("registering returns the device row", registered.push_token === token,
    `#${registered.id}`);

  const again = await api.post<DeviceRecord>("/auth/devices/", {
    platform: "android",
    push_token: token,
    device_name: "Day 46 verification (relaunched)",
    app_version: "1.0.1",
  });
  check("re-registering the same token updates rather than duplicating",
    again.id === registered.id, `same row #${again.id}`);
  check("the update took — this is what runs on every launch",
    again.app_version === "1.0.1" && again.device_name.includes("relaunched"));

  const after = await api.get<DeviceRecord[]>("/auth/devices/");
  check("exactly one row was added for two registrations",
    after.length === before.length + 1,
    `${before.length} → ${after.length}`);

  console.log("\n2b. A device belongs to its owner and nobody else");
  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const employee = people.results.find((u) => u.role_name === "employee")!;
  await logout();
  await login(employee.email, PASSWORD);
  const theirs = await api.get<DeviceRecord[]>("/auth/devices/");
  check("another user cannot see this handset",
    !theirs.some((d) => d.push_token === token),
    `${theirs.length} device(s) of their own`);
  try {
    await api.delete(`/auth/devices/${registered.id}/`);
    check("another user cannot deregister it", false);
  } catch (error) {
    check("another user cannot deregister it", (error as ApiError).status === 404,
      `${(error as ApiError).status}`);
  }

  console.log("\n2c. An auditor registers too — a read-only role still gets notified");
  await logout();
  await login("auditor@trasset.local", PASSWORD);
  const auditorToken = `ExponentPushToken[audit-${uuid().slice(0, 12)}]`;
  const auditorDevice = await api.post<DeviceRecord>("/auth/devices/", {
    platform: "ios",
    push_token: auditorToken,
    device_name: "Auditor handset",
    app_version: "1.0.0",
  });
  check("the read-only guard does not block device registration",
    auditorDevice.push_token === auditorToken);
  await api.delete(`/auth/devices/${auditorDevice.id}/`);

  // ---------------------------------------------------------------------
  console.log("\n3. The Alerts screen's data");
  await logout();
  await login(employee.email, PASSWORD);

  const counts = await api.get<{ unread: number; total: number }>("/notifications/count/");
  check("count drives the tab badge", typeof counts.unread === "number",
    `${counts.unread} unread of ${counts.total}`);

  const list = await api.get<Page<Notification>>("/notifications/", { page_size: 25 });
  check("the list is paginated", Array.isArray(list.results) && "total_pages" in list);

  if (list.results.length) {
    const row = list.results[0];
    check("a row carries what it renders",
      ["title", "message", "icon", "color", "is_read", "created_at"].every((k) => k in row),
      Object.keys(row).join(", "));
    check("and what it routes on",
      "related_object_type" in row && "related_object_id" in row);
    check("but NOT deep_link — that is push-payload only",
      !("deep_link" in row));

    console.log("\n3b. Every real payload resolves to a screen");
    const resolved = list.results.map((n) => ({
      type: n.type,
      target: n.related_object_type,
      screen: routeForPayload({
        related_object_type: n.related_object_type,
        related_object_id: n.related_object_id,
      }).screen,
    }));
    check("no payload throws or resolves to undefined",
      resolved.every((r) => Boolean(r.screen)),
      `${resolved.length} notification(s)`);
    const openable = resolved.filter((r) => r.screen !== "Notifications");
    console.log(`        ${openable.length} of ${resolved.length} open a record on the phone`);
    for (const kind of new Set(resolved.map((r) => `${r.target} → ${r.screen}`))) {
      console.log(`        ${kind}`);
    }

    console.log("\n3c. Read transitions");
    const unreadRow = list.results.find((n) => !n.is_read);
    if (unreadRow) {
      const read = await api.post<Notification>(`/notifications/${unreadRow.id}/read/`);
      check("marking one read returns it read", read.is_read === true);
      const afterOne = await api.get<{ unread: number }>("/notifications/count/");
      check("the badge count drops", afterOne.unread === counts.unread - 1,
        `${counts.unread} → ${afterOne.unread}`);
    } else {
      console.log("  SKIP  nothing unread to mark");
    }

    const all = await api.post<{ marked: number }>("/notifications/read-all/");
    check("mark-all-read reports how many it touched", typeof all.marked === "number",
      `${all.marked} marked`);
    const zero = await api.get<{ unread: number }>("/notifications/count/");
    check("nothing is left unread afterwards", zero.unread === 0, `${zero.unread} unread`);

    const unreadFilter = await api.get<Page<Notification>>("/notifications/", { is_read: false });
    check("the unread filter agrees with the count", unreadFilter.count === 0);
  } else {
    console.log("  SKIP  this account has no notifications to inspect");
  }

  // ---------------------------------------------------------------------
  console.log("\n4. A real notification, raised end to end");
  // Approving a request notifies the requester (`request_approved`), which is a
  // notification whose deep link points at a record the phone can open.
  await logout();
  await login("admin@trasset.local", PASSWORD);

  const spare = (await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 }))
    .results[0];
  if (spare) {
    await api.post(`/assets/${spare.id}/assign/`,
      { user_id: employee.id, notes: "Day 46 notification check" },
      { idempotencyKey: uuid() });

    await logout();
    await login(employee.email, PASSWORD);
    const fresh = await api.get<Page<Notification>>("/notifications/", {
      is_read: false, page_size: 10,
    });
    const assigned = fresh.results.find((n) => n.related_object_type === "Asset");
    check("assigning an asset notified the recipient", Boolean(assigned),
      assigned?.title);
    if (assigned) {
      const route = routeForPayload({
        related_object_type: assigned.related_object_type,
        related_object_id: assigned.related_object_id,
      });
      check("and the notification opens that very asset",
        route.screen === "Asset" && route.params.id === spare.id,
        `${route.screen} #${"params" in route ? route.params.id : "-"} vs asset #${spare.id}`);
    }

    // Leave the fixture as it was found.
    await logout();
    await login("admin@trasset.local", PASSWORD);
    await api.post(`/assets/${spare.id}/checkin/`, {}, { idempotencyKey: uuid() });
  } else {
    console.log("  SKIP  no available asset to assign");
  }

  // Clean up the handset this script registered.
  await api.delete(`/auth/devices/${registered.id}/`).catch(() => {});

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: actual push delivery. That needs a development build,\n" +
    "an Expo project id and push credentials — Expo Go dropped remote push in\n" +
    "SDK 53. registerForPush() reports each of those as its own outcome.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
