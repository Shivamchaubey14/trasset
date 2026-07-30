/**
 * Where a tapped notification should open (FR-14.23).
 *
 * The server sends three things that could answer this, and they are not
 * interchangeable (`Notification.push_payload`):
 *
 * * `deep_link` — `trasset://requests/7`. Built for native, and the field to
 *   prefer.
 * * `related_object_type` + `related_object_id` — `("AssetRequest", "7")`. What
 *   both clients have in common, and the field the REST list actually exposes;
 *   `deep_link` is push-payload-only, so an in-app row has to use this.
 * * `link` — `asset-detail.html?id=12`. A *web* path. Meaningless to route on
 *   here, and the reason `deep_link` exists at all.
 *
 * So both of the first two are supported and the third is never consulted.
 *
 * Anything unrecognised falls back to the Notifications tab rather than being
 * dropped. A push that opens the app to nothing looks broken; opening the list
 * at least shows the message that was tapped, and a new `related_object_type`
 * added on the server should degrade to that rather than crash.
 */
import { Roles } from "@/auth/roles";

export interface PushPayload {
  deep_link?: string | null;
  related_object_type?: string | null;
  /** A CharField on the model, not an FK — so a string, even though it is digits. */
  related_object_id?: string | number | null;
  notification_id?: string | null;
  type?: string | null;
}

export type Route =
  | { screen: "Asset"; params: { id: number } }
  | { screen: "Request"; params: { id: number } }
  | { screen: "Notifications" };

/**
 * `DEEP_LINK_TARGETS` in `apps/notifications/constants.py`, inverted.
 *
 * Maintenance records and purchase orders have deep links on the server but no
 * screen on the phone yet — desk work, deliberately (§12.8). They resolve to
 * the notification list, which is honest: the message is there to read even
 * though the record cannot be opened here.
 */
const PATH_TO_SCREEN: Record<string, "Asset" | "Request"> = {
  assets: "Asset",
  requests: "Request",
};

const TYPE_TO_SCREEN: Record<string, "Asset" | "Request"> = {
  Asset: "Asset",
  AssetRequest: "Request",
};

/** Parses `trasset://requests/7` into its path segments. */
function segmentsOf(deepLink: string): string[] {
  // Not `new URL()`: React Native's URL polyfill handles custom schemes
  // inconsistently, and this only needs the two segments after the scheme.
  const withoutScheme = deepLink.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  return withoutScheme.split(/[/?#]/).filter(Boolean);
}

export function routeForPayload(payload: PushPayload | null | undefined): Route {
  if (!payload) return { screen: "Notifications" };

  // 1. The native deep link, when there is one.
  if (payload.deep_link) {
    const [path, rawId] = segmentsOf(String(payload.deep_link));
    const screen = PATH_TO_SCREEN[path ?? ""];
    const id = Number(rawId);
    if (screen && Number.isInteger(id) && id > 0) {
      return { screen, params: { id } };
    }
  }

  // 2. The related object, which is what the REST list gives an in-app row.
  const screen = TYPE_TO_SCREEN[String(payload.related_object_type ?? "")];
  const id = Number(payload.related_object_id);
  if (screen && Number.isInteger(id) && id > 0) {
    return { screen, params: { id } };
  }

  // 3. Something we do not have a screen for. Show the message itself.
  return { screen: "Notifications" };
}

/**
 * Whether this role can open the record a notification points at.
 *
 * An auditor is read-only but *can* read, so every target here is fine for
 * them. The check exists for the case that actually bites: the notification
 * list is per-user, so a target is always something the recipient may see —
 * which is worth stating, because it is the reason no permission gate is
 * applied to the route. If that ever stops being true, this is where it goes.
 */
export function mayOpen(_roleName?: string | null): boolean {
  return true;
}

/** Every role, including the read-only one, registers for push. */
export const PUSH_ROLES: string[] = Object.values(Roles);
