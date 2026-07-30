/**
 * Verification — profile and settings.
 *
 * The DoD is "preferences persist and are honoured by the server", which is two
 * claims, and only one of them is a round trip:
 *
 *   * **Persist** — `PATCH /auth/me/` stores what the switches send, and a
 *     fresh `GET` reads it back. Checked directly.
 *   * **Honoured** — the flags gate *dispatch* and nothing else. That
 *     distinction is the one a settings screen gets wrong: turning push off
 *     must not stop the Alerts tab working, because the in-app record is how
 *     someone catches up on what they muted. So this assigns an asset to a user
 *     with **both flags off** and proves the notification still lands in their
 *     list (`apps/notifications/services.py` gates only `queue_email` and
 *     `queue_push`).
 *
 * Password change is exercised for real — changed, verified by signing in with
 * the new password, verified that the old one now fails — along with the four
 * refusals the serializer owes the user.
 *
 * **It runs against a throwaway account it creates and deletes**, never the
 * demo fixtures. That is not tidiness. `Trasset@2026` cannot be *set* through
 * this endpoint on a `@trasset.local` address at all — Django's
 * `UserAttributeSimilarityValidator` refuses it as too similar to the email —
 * so a script that changed a demo password could sign in afterwards but could
 * never put it back, and would leave every other verify script on this machine
 * locked out. The seeded accounts only hold that password because `bootstrap`
 * calls `set_password` directly, which runs no validators.
 *
 * The appearance override is device-local by design and touches no endpoint, so
 * its resolver is checked as pure logic at the top.
 *
 *   cd mobile && npx tsx scripts/verify-settings.ts
 */
import { ApiError, api, configureApi, configureTokenStore, login, logout } from "../src/api";
import type { Asset, Notification, Page, User } from "../src/api";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  THEME_PREFERENCE_LABELS,
  type Scheme,
  isThemePreference,
  resolveScheme,
} from "../src/theme/preference";
import { darkColors, lightColors } from "../src/theme/tokens";

const BASE = "http://127.0.0.1:8000/api/v1";
const PASSWORD = "Trasset@2026";

// The throwaway account. Its address is deliberately nothing like either
// password, so the similarity validator has no opinion about them.
const SUBJECT_EMAIL = "settings.check@example.net";
const SUBJECT_PASSWORD = "Kestrel-Harbour-41";
const SUBJECT_NEW_PASSWORD = "Otter-Lantern-73";

interface Role {
  id: number;
  name: string;
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

/** Runs a call expected to fail, and hands back the error for inspection. */
async function refusal(fn: () => Promise<unknown>): Promise<ApiError | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof ApiError ? error : null;
  }
}

// --------------------------------------------------------------------------
// WCAG 2.1 contrast, for the pairings the new control introduces.
// --------------------------------------------------------------------------
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const ratio = (n: number) => `${n.toFixed(2)}:1`;

// ==========================================================================
function checkAppearance() {
  console.log("\n1. Appearance — pure, device-local, no server involved");

  check("system + OS dark  → dark", resolveScheme("system", "dark") === "dark");
  check("system + OS light → light", resolveScheme("system", "light") === "light");
  check(
    "system + OS unknown → light, not a crash and not dark",
    resolveScheme("system", null) === "light" &&
      resolveScheme("system", undefined) === "light",
    "Android can report null; light is the palette everything was measured against",
  );
  check(
    "an explicit choice ignores the OS entirely",
    resolveScheme("light", "dark") === "light" && resolveScheme("dark", "light") === "dark",
    "which is the point of the override",
  );
  check(
    "every preference resolves to a real scheme under every OS state",
    THEME_PREFERENCES.every((p) =>
      ([null, undefined, "light", "dark"] as const).every((os) =>
        ["light", "dark"].includes(resolveScheme(p, os as Scheme | null)),
      ),
    ),
  );
  check(
    "the default is 'system' and is the first option shown",
    DEFAULT_THEME_PREFERENCE === "system" && THEME_PREFERENCES[0] === "system",
    "someone who never chose follows the OS, and 'back to System' stays reachable",
  );
  check(
    "every option has a label",
    THEME_PREFERENCES.every((p) => Boolean(THEME_PREFERENCE_LABELS[p])),
    THEME_PREFERENCES.map((p) => THEME_PREFERENCE_LABELS[p]).join(" · "),
  );
  check(
    "junk read back from storage is rejected",
    !isThemePreference("Dark") && !isThemePreference(null) && isThemePreference("dark"),
    "a stale or corrupted value falls back rather than throwing",
  );

  console.log("\n   Contrast of the new control (NFR-9):");
  for (const [name, c] of [["light", lightColors], ["dark", darkColors]] as const) {
    const unselected = contrast(c.textMuted, c.surfaceElevated);
    const selected = contrast(c.onPrimary, c.primary);
    check(
      `${name}: unselected label (textMuted on surfaceElevated) ≥ 4.5`,
      unselected >= 4.5,
      ratio(unselected),
    );
    // Measured, not asserted: this pairing predates this screen and is what
    // `Button`, `Chip` and `Avatar` already use. Ink on Nest Green is 4.45:1,
    // so no existing token clears 4.5 either — only changing the brand green
    // would, which is a design decision and not this change's to make.
    console.log(
      `     ${name}: selected label (onPrimary on primary)  ${ratio(selected)}` +
        `${selected < 4.5 ? "   ← inherited, below 4.5:1" : ""}`,
    );
  }
}

// ==========================================================================
async function main() {
  configureApi({ baseUrl: BASE, client: "mobile" });
  configureTokenStore(memoryStore);

  checkAppearance();

  await login("admin@trasset.local", PASSWORD);

  const roles = await api.get<Role[]>("/roles/");
  const employeeRole = roles.find((r) => r.name === "employee");
  if (!employeeRole) {
    console.log("\n  FAIL  no employee role to create a subject with");
    process.exit(1);
  }

  // The subject survives earlier runs, because deleting a user deactivates it
  // rather than removing the row — assignment history has to stay attributable.
  // So this reuses and reactivates rather than trying to create a duplicate,
  // which the unique email would refuse anyway.
  const existing = (
    await api.get<Page<User>>("/users/", { search: SUBJECT_EMAIL, page_size: 5 })
  ).results.find((u) => u.email === SUBJECT_EMAIL);

  const subject = existing
    ? await api.patch<User>(`/users/${existing.id}/`, {
        is_active: true,
        password: SUBJECT_PASSWORD,
        full_name: "Settings Check",
      })
    : await api.post<User>("/users/", {
        full_name: "Settings Check",
        email: SUBJECT_EMAIL,
        password: SUBJECT_PASSWORD,
        role_id: employeeRole.id,
      });

  try {
    // =====================================================================
    console.log("\n2. Notification preferences persist");

    await logout();
    await login(SUBJECT_EMAIL, SUBJECT_PASSWORD);

    await api.patch<User>("/auth/me/", { email_notifications: false });
    const afterEmail = await api.get<User>("/auth/me/");
    check(
      "email_notifications=false survives a fresh GET",
      afterEmail.email_notifications === false,
      `stored ${String(afterEmail.email_notifications)}`,
    );

    await api.patch<User>("/auth/me/", { push_notifications: false });
    const afterPush = await api.get<User>("/auth/me/");
    check(
      "push_notifications=false survives a fresh GET",
      afterPush.push_notifications === false,
      `stored ${String(afterPush.push_notifications)}`,
    );
    check(
      "the other flag was not disturbed",
      afterPush.email_notifications === false,
      "a PATCH of one preference leaves the rest alone",
    );

    await api.patch<User>("/auth/me/", { email_notifications: true });
    check(
      "and it can be turned back on",
      (await api.get<User>("/auth/me/")).email_notifications === true,
      "the switch is not one-way",
    );

    // =====================================================================
    console.log("\n3. The flags gate dispatch only — the Alerts tab keeps working");

    // Both off, so anything raised now must be in-app only.
    await api.patch<User>("/auth/me/", {
      email_notifications: false,
      push_notifications: false,
    });

    await logout();
    await login("admin@trasset.local", PASSWORD);
    const spare = (
      await api.get<Page<Asset>>("/assets/", { status: "available", page_size: 1 })
    ).results[0];

    if (spare) {
      await api.post(
        `/assets/${spare.id}/assign/`,
        { user_id: subject.id, notes: "settings preference check" },
        { idempotencyKey: uuid() },
      );

      await logout();
      await login(SUBJECT_EMAIL, SUBJECT_PASSWORD);
      const fresh = await api.get<Page<Notification>>("/notifications/", {
        is_read: false,
        page_size: 10,
      });
      const landed = fresh.results.find(
        (n) => n.related_object_type === "Asset" && n.related_object_id === String(spare.id),
      );
      check(
        "with push AND email off, the in-app notification is still created",
        Boolean(landed),
        landed ? landed.title : "nothing arrived — muting would hide the record too",
      );

      // Leave the asset as it was found.
      await logout();
      await login("admin@trasset.local", PASSWORD);
      await api.post(`/assets/${spare.id}/checkin/`, {}, { idempotencyKey: uuid() });
      await logout();
      await login(SUBJECT_EMAIL, SUBJECT_PASSWORD);
    } else {
      console.log("  SKIP  no available asset to assign");
    }

    // =====================================================================
    console.log("\n4. Password change — the refusals");

    const wrongCurrent = await refusal(() =>
      api.post("/auth/password/change/", {
        current_password: "not-my-password",
        new_password: SUBJECT_NEW_PASSWORD,
        confirm_password: SUBJECT_NEW_PASSWORD,
      }),
    );
    check(
      "a wrong current password is refused, on that field",
      wrongCurrent?.status === 400 && Boolean(wrongCurrent.errors?.current_password),
      wrongCurrent?.firstFieldError()?.message,
    );

    const mismatch = await refusal(() =>
      api.post("/auth/password/change/", {
        current_password: SUBJECT_PASSWORD,
        new_password: SUBJECT_NEW_PASSWORD,
        confirm_password: `${SUBJECT_NEW_PASSWORD}-different`,
      }),
    );
    check(
      "a mismatched confirmation is refused, on the confirm field",
      mismatch?.status === 400 && Boolean(mismatch.errors?.confirm_password),
      mismatch?.firstFieldError()?.message,
    );

    const unchanged = await refusal(() =>
      api.post("/auth/password/change/", {
        current_password: SUBJECT_PASSWORD,
        new_password: SUBJECT_PASSWORD,
        confirm_password: SUBJECT_PASSWORD,
      }),
    );
    check(
      "reusing the current password is refused",
      unchanged?.status === 400 && Boolean(unchanged.errors?.new_password),
      unchanged?.firstFieldError()?.message,
    );

    const weak = await refusal(() =>
      api.post("/auth/password/change/", {
        current_password: SUBJECT_PASSWORD,
        new_password: "password",
        confirm_password: "password",
      }),
    );
    check(
      "a weak password is refused with Django's own sentence",
      weak?.status === 400,
      weak?.firstFieldError()?.message,
    );

    // =====================================================================
    console.log("\n5. Password change — the real thing");

    await api.post("/auth/password/change/", {
      current_password: SUBJECT_PASSWORD,
      new_password: SUBJECT_NEW_PASSWORD,
      confirm_password: SUBJECT_NEW_PASSWORD,
    });
    check("the change is accepted", true);

    await logout();

    const oldFails = await refusal(() => login(SUBJECT_EMAIL, SUBJECT_PASSWORD));
    check(
      "the old password no longer signs in",
      oldFails !== null && oldFails.status === 401,
      `HTTP ${oldFails?.status ?? "—"}`,
    );

    await login(SUBJECT_EMAIL, SUBJECT_NEW_PASSWORD);
    check(
      "the new password does",
      (await api.get<User>("/auth/me/")).email === SUBJECT_EMAIL,
      SUBJECT_EMAIL,
    );
  } finally {
    // The subject is stood down, whatever happened above. Nothing seeded was
    // touched. `DELETE /users/{id}/` deactivates rather than removes — a user
    // who has held an asset must stay attributable in its history — so what is
    // asserted here is that it can no longer sign in, not that the row is gone.
    await logout().catch(() => {});
    await login("admin@trasset.local", PASSWORD);
    await api.delete(`/users/${subject.id}/`).catch(() => {});

    const after = (
      await api.get<Page<User>>("/users/", { search: SUBJECT_EMAIL, page_size: 5 })
    ).results.find((u) => u.email === SUBJECT_EMAIL);
    check(
      "the throwaway account is deactivated",
      after?.is_active === false,
      `is_active=${String(after?.is_active)}`,
    );

    await logout().catch(() => {});
    const lockedOut = await refusal(() => login(SUBJECT_EMAIL, SUBJECT_NEW_PASSWORD));
    check(
      "and can no longer sign in",
      lockedOut !== null && lockedOut.status === 401,
      `HTTP ${lockedOut?.status ?? "—"}`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nNot covered here: that SecureStore survives a cold start, and that the OS\n" +
    "permission dialog appears when push is switched on. Both need a device; the\n" +
    "decisions they feed are what is checked above.\n",
  );
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("\nVerification crashed:", error);
  process.exit(1);
});
