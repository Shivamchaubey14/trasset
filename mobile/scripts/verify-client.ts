/**
 * Day 37 verification — runs the *real* client against the *real* API.
 *
 * The definition of done is "a typed call returns unwrapped data; a 401
 * refreshes and replays once", and neither half is provable by a type check.
 * This exercises both, plus the single-flight guarantee, without a device.
 *
 *   cd mobile && npx tsx scripts/verify-client.ts
 *
 * Requires the Django server on 127.0.0.1:8000 with demo data.
 */
import { api, login, logout, restoreSession } from "../src/api/client";
import { configureApi } from "../src/api/config";
import { ApiError } from "../src/api/errors";
import { configureTokenStore, tokens } from "../src/api/tokens";
import type { Page, User } from "../src/api/types";

const BASE = "http://127.0.0.1:8000/api/v1";
const EMAIL = "admin@trasset.local";
const PASSWORD = "Trasset@2026";

/** Stands in for the Keychain. The real store is injected in App.tsx. */
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

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
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

  console.log("\n1. Sign in");
  const session = await login(EMAIL, PASSWORD);
  check("login returns unwrapped data, not the envelope",
    Boolean(session.access) && !("success" in (session as object)));
  check("refresh token reached the store",
    (await tokens.getRefresh()) !== null);

  console.log("\n2. A typed call returns unwrapped data");
  const me = await api.get<User>("/auth/me/");
  check("GET /auth/me/ unwraps to the object itself",
    me.email === EMAIL, `email=${me.email}`);
  check("no envelope keys leak through",
    !("data" in (me as object)) && !("success" in (me as object)));

  const assets = await api.get<Page<{ asset_tag: string }>>("/assets/", { page_size: 3 });
  check("a paginated list unwraps to the page",
    Array.isArray(assets.results) && typeof assets.count === "number",
    `count=${assets.count}, page has ${assets.results.length}`);

  console.log("\n3. A 401 refreshes and replays once");
  const goodAccess = tokens.getAccess();
  // Simulate an aged-out access token: keep the refresh token, break the access
  // one. This is exactly the state a phone wakes up in.
  await tokens.set("not-a-valid-access-token");
  check("access token is now invalid", tokens.getAccess() !== goodAccess);

  const afterRefresh = await api.get<User>("/auth/me/");
  check("the call still succeeds", afterRefresh.email === EMAIL);
  check("a new access token was obtained",
    tokens.getAccess() !== "not-a-valid-access-token" && tokens.getAccess() !== null);

  console.log("\n4. Parallel 401s cause one refresh, not four");
  const beforeRefreshToken = await tokens.getRefresh();
  await tokens.set("not-a-valid-access-token");

  const results = await Promise.all([
    api.get<User>("/auth/me/"),
    api.get<Page<unknown>>("/assets/", { page_size: 1 }),
    api.get<Page<unknown>>("/categories/", { page_size: 1 }),
    api.get<Page<unknown>>("/notifications/", { page_size: 1 }),
  ]);
  check("all four parallel calls succeeded", results.length === 4 && results.every(Boolean));
  // Rotation is on (SEC-2): a second refresh would have presented the already
  // blacklisted token and failed, so surviving this proves single-flight.
  check("the refresh token rotated exactly once",
    (await tokens.getRefresh()) !== beforeRefreshToken);

  console.log("\n5. Errors are typed and keep field detail");
  try {
    await api.post("/categories/", { name: "", color: "not-a-colour" });
    check("a bad payload raises", false);
  } catch (error) {
    const apiError = error as ApiError;
    check("a bad payload raises ApiError", apiError instanceof ApiError);
    check("status is 400", apiError.status === 400, `status=${apiError.status}`);
    const first = apiError.firstFieldError();
    check("field-level detail survives", first !== null,
      first ? `${first.field}: ${first.message}` : "none");
  }

  try {
    await api.get("/assets/999999999/");
    check("a missing record raises", false);
  } catch (error) {
    check("404 is reported as such", (error as ApiError).status === 404);
  }

  console.log("\n6. Session restore and sign-out");
  await tokens.set(null); // cold start: access token gone, refresh survives
  check("restoreSession trades the refresh token in", await restoreSession());

  await logout();
  check("sign-out clears the refresh token", (await tokens.getRefresh()) === null);
  check("sign-out clears the access token", tokens.getAccess() === null);

  try {
    await api.get("/auth/me/");
    check("a signed-out call fails", false);
  } catch (error) {
    check("a signed-out call is 401", (error as ApiError).status === 401);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
