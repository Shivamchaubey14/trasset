/**
 * Theme preference — the pure half.
 *
 * Three states, not two. A plain light/dark switch has to be set once and then
 * *stays* set, so a user who follows the OS — which is most of them, and all of
 * them at dusk if the OS schedules it — has no way back to that behaviour once
 * they have touched the control. "System" is therefore a real option, it is the
 * default, and an unset preference reads as it.
 *
 * This lives on the device rather than the account. Theme is a property of the
 * screen you are looking at, not of who you are: the same person can reasonably
 * want dark on a phone in a dim stock room and light on a tablet at a desk.
 * The server has no theme field for that reason — `email_notifications` and
 * `push_notifications` are account-wide and *do* go to `PATCH /auth/me/`.
 *
 * Nothing here imports from the platform, for the same reason
 * `notifications/routing.ts` does not: the decision is the part worth checking,
 * and keeping it free of React and of storage is what lets it be checked
 * without a device. Persistence lives next door in `preferenceStore.ts`.
 */

export type ThemePreference = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

/** Source of truth for the control's options and for validating stored input. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (THEME_PREFERENCES as readonly unknown[]).includes(value);
}

/**
 * The preference, plus what the OS currently reports, resolved to a scheme.
 *
 * `system` is null on Android when the OS setting is unavailable, and briefly
 * during a cold start on both platforms. Light is the documented fallback:
 * SRS §7.1's palette is the light one, so an unknown OS state renders the
 * theme every colour in `tokens.ts` was measured against first.
 */
export function resolveScheme(
  preference: ThemePreference,
  system: Scheme | null | undefined,
): Scheme {
  if (preference === "light" || preference === "dark") return preference;
  return system === "dark" ? "dark" : "light";
}
