/**
 * Push registration (BE-2, FR-14.22).
 *
 * Two things make this more than "ask, then POST the token".
 *
 * **Priming.** iOS gives an app exactly one chance to ask: once denied, the
 * dialog never reappears and the user has to go to Settings. So the app asks
 * only when it can explain why, and treats an existing grant as the common
 * path. `registerForPush` therefore never *requests* unless told it may —
 * `{ prompt: false }` checks and registers with an existing grant and is what
 * runs at launch, while the explicit ask happens behind a screen the user
 * chose. FR-14.22 is satisfied either way.
 *
 * **Every outcome is a value, not an exception.** A token cannot be obtained on
 * a simulator, in Expo Go (remote push was removed from it in SDK 53), or
 * without an EAS project id — none of which is a fault to throw about, and each
 * of which needs a different sentence on screen. A caller that cannot tell
 * "you declined" from "this build cannot do push" will show the wrong one.
 *
 * A token is not a secret (MNFR-5): it identifies a delivery target, and the
 * server checks ownership on every send. It is still registered against the
 * signed-in user only, so signing out deregisters it — see `logout`, which
 * passes `push_token` so the handset stops receiving immediately.
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "@/api";
import type { Device as DeviceRecord } from "@/api";

/**
 * Why registration did not produce a token — each needs its own explanation.
 *
 * `blocked` is separate from `denied` on purpose: denied is "not now", blocked
 * is "and I cannot ask again", which is the difference between a button and a
 * link to Settings.
 */
export type PushOutcome =
  | { status: "registered"; token: string; device: DeviceRecord }
  | { status: "denied" }
  | { status: "blocked" }
  | { status: "not-a-device" }
  | { status: "expo-go" }
  | { status: "no-project" }
  | { status: "error"; message: string };

/**
 * The token this session registered, if any.
 *
 * Held in module scope so signing out can deregister the handset in the same
 * call (`/auth/logout/` takes `push_token`). Re-deriving it at sign-out would
 * mean another round trip through the OS at the worst moment — and would fail
 * outright on a build that cannot mint one, which is exactly when there is
 * nothing to deregister anyway.
 *
 * Not persisted: a token that survives a reinstall is not this app's token.
 */
let lastToken: string | null = null;

export function currentPushToken(): string | null {
  return lastToken;
}

/** Forget the cached token — the handset has been deregistered server-side. */
export function clearPushToken(): void {
  lastToken = null;
}

/** `PlatformEnum` on the server — ios | android | web. */
function platformSlug(): "ios" | "android" | "web" {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return "web";
}

/**
 * The EAS project id `getExpoPushTokenAsync` needs since SDK 49.
 *
 * Absent until the project is linked to an Expo account, which is one of the
 * two things still outstanding from the user. Without it there is no token to
 * get, so this is checked up front rather than left to throw an opaque error.
 */
function projectId(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return fromExtra ?? fromEas ?? null;
}

/**
 * True in Expo Go, where remote push no longer works (SDK 53 onward).
 *
 * Worth detecting rather than letting the token call fail: "use a development
 * build" is actionable, and an error about a missing native module is not.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Android shows notifications silently without a channel; this makes them heard. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Trasset",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#3BB77E",
  });
}

/**
 * Register this handset for push.
 *
 * @param prompt whether the OS permission dialog may be shown. Left false at
 *   launch so the one iOS ask is not spent unprompted; set true from a screen
 *   that has explained what it is for.
 */
export async function registerForPush(
  { prompt = false }: { prompt?: boolean } = {},
): Promise<PushOutcome> {
  // A simulator has no APNs/FCM registration to hand out.
  if (!Device.isDevice) return { status: "not-a-device" };
  if (isExpoGo()) return { status: "expo-go" };

  const id = projectId();
  if (!id) return { status: "no-project" };

  try {
    await ensureAndroidChannel();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    if (!granted) {
      // `canAskAgain` false means the dialog will not appear — asking would be
      // a no-op the user reads as a broken button.
      if (!prompt) return { status: "denied" };
      if (!existing.canAskAgain) return { status: "blocked" };

      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
      if (!granted) return { status: asked.canAskAgain ? "denied" : "blocked" };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });

    // An upsert (BE-2), so calling this on every launch does not accumulate
    // rows — two rows for one handset means two pushes for one event.
    const device = await api.post<DeviceRecord>("/auth/devices/", {
      platform: platformSlug(),
      push_token: token,
      device_name: Device.deviceName ?? Device.modelName ?? "Unknown device",
      app_version: Constants.expoConfig?.version ?? "",
    });

    // Cached only after the server has it. Remembering a token the registration
    // failed on would have sign-out ask the server to deregister something it
    // never knew about.
    lastToken = token;

    return { status: "registered", token, device };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not register for push.",
    };
  }
}

/** Drop this handset's registration — used when push is switched off. */
export async function deregisterDevice(deviceId: number): Promise<void> {
  await api.delete(`/auth/devices/${deviceId}/`);
}

/**
 * One sentence explaining an outcome, for a settings screen to show.
 *
 * Kept next to the outcomes rather than in a screen so the two cannot drift,
 * and so a new outcome is a compile error here instead of an empty string
 * somewhere in the UI.
 */
export function explainOutcome(outcome: PushOutcome): string {
  switch (outcome.status) {
    case "registered":
      return "This device will receive Trasset notifications.";
    case "denied":
      return "Notifications are off. Turn them on to hear about assets assigned to you.";
    case "blocked":
      return "Notifications are blocked for Trasset. Open Settings to allow them.";
    case "not-a-device":
      return "Push needs a real phone — a simulator cannot receive it.";
    case "expo-go":
      return "Expo Go cannot receive push notifications. A development build can.";
    case "no-project":
      return "This build is not linked to an Expo project, so it cannot receive push yet.";
    case "error":
      return outcome.message;
  }
}
