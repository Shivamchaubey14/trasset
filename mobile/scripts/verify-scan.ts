/**
 * Day 40 verification — the scan pipeline against the real API.
 *
 * The camera itself needs a handset, but everything downstream of it does not:
 * what a scanned string parses to, what it resolves to, and how long the
 * round trip takes against MNFR-2's two-second budget.
 *
 *   cd mobile && npx tsx scripts/verify-scan.ts
 */
import { api, configureApi, configureTokenStore, login } from "../src/api";
import type { Page } from "../src/api";
import { parseScan } from "../src/scan/parse";
import { resolveScan } from "../src/scan/resolve";

const BASE = "http://127.0.0.1:8000/api/v1";
const FRONTEND = "http://127.0.0.1:5500";

const memoryStore = (() => {
  const values = new Map<string, string>();
  return {
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
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

async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);
  await login("admin@trasset.local", "Trasset@2026");

  const page = await api.get<Page<{ id: number; asset_tag: string; serial_number: string | null }>>(
    "/assets/",
    { page_size: 25 },
  );
  const asset = page.results[0];
  const withSerial = page.results.find((row) => (row.serial_number ?? "").trim().length > 3);

  console.log(`\nUsing ${asset.asset_tag}${withSerial ? ` and serial ${withSerial.serial_number}` : ""}`);

  console.log("\n1. Parsing what the camera can produce");
  const qrPayload = `${FRONTEND}/asset-detail.html?tag=${asset.asset_tag}`;
  check("the printed QR (a detail URL) yields the tag",
    parseScan(qrPayload).kind === "tag" && parseScan(qrPayload).value === asset.asset_tag,
    qrPayload);
  check("a bare tag is a tag", parseScan(asset.asset_tag).kind === "tag");
  check("a lowercased tag is normalised",
    parseScan(asset.asset_tag.toLowerCase()).value === asset.asset_tag);
  check("whitespace is trimmed", parseScan(`  ${asset.asset_tag}  `).value === asset.asset_tag);
  check("a manufacturer barcode is treated as a serial",
    parseScan("SN-DL5440-0091").kind === "serial");
  check("an unrelated URL is not mistaken for a tag",
    parseScan("https://example.com/thing").kind === "serial");

  console.log("\n2. Resolving a scanned label (the happy path)");
  const started = Date.now();
  const found = await resolveScan(qrPayload);
  const elapsed = Date.now() - started;

  check("the QR resolves to an asset", found.status === "found");
  if (found.status === "found") {
    check("it is the right asset", found.asset.asset_tag === asset.asset_tag);
    check("the detail shape came back, not a list row",
      "category" in found.asset && "current_value" in found.asset);
  }
  check(`within MNFR-2's 2s budget (network only)`, elapsed < 2000, `${elapsed} ms`);

  console.log("\n3. Resolving a manufacturer barcode");
  if (withSerial?.serial_number) {
    const bySerial = await resolveScan(withSerial.serial_number);
    check("an exact serial resolves", bySerial.status === "found");
    if (bySerial.status === "found") {
      check("it is the right asset", bySerial.asset.id === withSerial.id);
    }
    const partial = withSerial.serial_number.slice(0, 4);
    const loose = await resolveScan(partial);
    check("a partial serial does NOT open an asset",
      loose.status !== "found",
      `"${partial}" → ${loose.status}`);
  } else {
    console.log("  (skipped — no seeded asset has a serial number)");
  }

  console.log("\n4. Things that should not resolve");
  const unknownTag = await resolveScan("TRA-2026-999999");
  check("an unknown tag is notFound, not an error", unknownTag.status === "notFound");

  const junk = await resolveScan("just some text on a box");
  check("junk is notFound", junk.status === "notFound");

  const boardingPass = await resolveScan("M1DOE/JOHN EABC123 LHRJFK");
  check("an unrelated barcode is notFound", boardingPass.status === "notFound");

  console.log("\n5. A deleted asset cannot be scanned back into view");
  const probe = await api.post<{ id: number; asset_tag: string }>("/assets/", {
    name: "Scan Probe",
    category_id: (await api.get<Page<{ id: number }>>("/categories/", { page_size: 1 })).results[0].id,
    location_id: (await api.get<Page<{ id: number }>>("/locations/", { page_size: 1 })).results[0].id,
    purchase_cost: "1000.00",
  });
  check("a fresh asset scans", (await resolveScan(probe.asset_tag)).status === "found");
  await api.delete(`/assets/${probe.id}/`);
  check("once deleted it does not", (await resolveScan(probe.asset_tag)).status === "notFound");

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
