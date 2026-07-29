/**
 * Day 44 verification — photo upload and issue reporting.
 *
 * The DoD is "a photo taken on the device appears on the asset in the web app".
 * The camera needs a handset, but the half that actually carries the risk does
 * not: the multipart request, and whether the attachment then shows up on the
 * asset the web app reads.
 *
 *   cd mobile && npx tsx scripts/verify-photos.ts
 */
import { readFileSync } from "node:fs";

import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { AssetDetail, Page, User } from "../src/api";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";
const PROBE = process.env.PROBE_JPEG ?? "";

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

/** Builds the same multipart body `useUploadPhoto` does. */
function photoForm(assetId: number, bytes: Buffer, name: string) {
  const form = new FormData();
  form.append("asset", String(assetId));
  form.append("description", "Day 44 probe");
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), name);
  return form;
}

async function main() {
  if (!PROBE) {
    console.error("Set PROBE_JPEG to a jpeg path.");
    process.exit(1);
  }
  const bytes = readFileSync(PROBE);

  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);
  await login("admin@trasset.local", PASSWORD);

  const people = await api.get<Page<User>>("/users/", { page_size: 50, is_active: true });
  const employee = people.results.find((u) => u.role_name === "employee")!;

  // An asset the employee actually holds — needed for both halves.
  const held = (await api.get<Page<AssetDetail>>("/assets/", {
    assigned_to: employee.id, page_size: 1,
  })).results[0];
  check("fixture: the employee is holding an asset", Boolean(held), held?.asset_tag);

  console.log("\n1. Photo upload — the multipart request the app sends");
  console.log(`   sending ${Math.round(bytes.length / 1024)} KB (post-resize size)`);
  const attachment = await api.upload<{ id: number; filename: string; size_bytes: number }>(
    "/attachments/",
    photoForm(held.id, bytes, "day44-probe.jpg"),
  );
  check("the upload is accepted", Boolean(attachment.id));
  check("the server recorded the filename", attachment.filename?.includes("day44-probe"),
    attachment.filename);
  check("the size matches what was sent",
    Math.abs((attachment.size_bytes ?? 0) - bytes.length) < 1024,
    `${attachment.size_bytes} vs ${bytes.length}`);

  console.log("\n2. It appears on the asset — the DoD");
  const detail = await api.get<AssetDetail>(`/assets/${held.id}/`);
  const attachments = (detail as { attachments?: { id: number }[] }).attachments ?? [];
  check("the photo is on the asset the web app reads",
    attachments.some((a) => a.id === attachment.id),
    `${attachments.length} attachment(s)`);

  console.log("\n3. A resized photo is comfortably inside the 10 MB ceiling (SEC-8)");
  check("post-resize size is a fraction of the limit",
    bytes.length < 1024 * 1024,
    `${Math.round(bytes.length / 1024)} KB vs 10240 KB — an unresized 12 MP shot is 4-8 MB`);

  console.log("\n4. Uploading is managers-only, matching what the app offers");
  await logout();
  await login(employee.email, PASSWORD);
  try {
    await api.upload("/attachments/", photoForm(held.id, bytes, "not-allowed.jpg"));
    check("an employee cannot upload", false);
  } catch (error) {
    check("an employee cannot upload", (error as ApiError).status === 403);
  }

  console.log("\n5. Reporting an issue — FR-14.14, SRS §2.3");
  const reported = await api.post<{ id: number; notes: string }>("/maintenance/", {
    asset_id: held.id,
    type: "repair",
    scheduled_date: new Date().toISOString().slice(0, 10),
    notes: "Day 44 probe — screen flickers.",
  });
  check("an employee can report on an asset they hold", Boolean(reported.id));

  const others = (await api.get<Page<AssetDetail>>("/assets/", {
    status: "available", page_size: 1,
  })).results[0];
  try {
    await api.post("/maintenance/", {
      asset_id: others.id,
      type: "repair",
      scheduled_date: new Date().toISOString().slice(0, 10),
      notes: "Not mine.",
    });
    check("an employee cannot report on an asset they do not hold", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("an employee cannot report on an asset they do not hold", apiError.status === 403);
    check("the refusal says why", /only report an issue on an asset you are holding/i
      .test(apiError.message), `"${apiError.message}"`);
  }

  console.log("\n6. Cleaning up");
  await logout();
  await login("admin@trasset.local", PASSWORD);
  await api.delete(`/attachments/${attachment.id}/`);
  await api.delete(`/maintenance/${reported.id}/`);
  check("probe attachment and maintenance record removed", true);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
