/**
 * Named types pulled out of the generated schema.
 *
 * `schema.d.ts` is generated from `/api/schema/` by `npm run gen:api` — never
 * edited. Hand-written client types drift from the API silently, which is the
 * whole reason SRS §12.2 says to generate them.
 *
 * These aliases exist so screens import `Asset` rather than
 * `components["schemas"]["AssetList"]`, and so a rename on the server surfaces
 * here as one compile error instead of thirty.
 */
import type { components } from "./schema";

export type Schemas = components["schemas"];

// --- Accounts ---------------------------------------------------------------
export type User = Schemas["User"];
export type Role = Schemas["Role"];
export type Device = Schemas["Device"];

// --- Assets -----------------------------------------------------------------
export type Asset = Schemas["AssetList"];
export type AssetDetail = Schemas["AssetDetail"];
export type AssetStatus = Schemas["AssetStatusEnum"];
export type AssetAssignment = Schemas["AssetAssignment"];
export type AssetStats = Schemas["AssetStats"];
export type Attachment = Schemas["Attachment"];

// --- Requests ---------------------------------------------------------------
export type AssetRequest = Schemas["AssetRequest"];
export type RequestStatus = Schemas["RequestStatusEnum"];
/**
 * The body `POST /asset-requests/` accepts — asset **or** category, never both.
 *
 * The *response* is a full `AssetRequest`, not this: the create serializer's
 * `to_representation` returns the read shape, so raising a request hands back
 * the complete record. The schema said otherwise until the write responses were
 * annotated (`common/schema.write_responses`).
 */
export type AssetRequestCreate = Schemas["AssetRequestCreateRequest"];

// --- Masters ----------------------------------------------------------------
export type Category = Schemas["Category"];
export type Location = Schemas["Location"];
export type Department = Schemas["Department"];
export type Vendor = Schemas["Vendor"];

// --- Notifications ----------------------------------------------------------
export type Notification = Schemas["Notification"];

/**
 * Paginated list shape (SRS §5.1). The generated schemas describe each
 * endpoint's own paginated wrapper, so this mirrors the shared contract for
 * code that is generic over lists.
 */
export interface Page<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
