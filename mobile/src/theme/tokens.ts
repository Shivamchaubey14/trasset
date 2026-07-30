/**
 * Trasset design tokens — the one thing shared with the web app.
 *
 * Values come from `docs/Trasset_Design_Tokens.md`, where every pairing was
 * measured against WCAG (4.5:1 for text, 3:1 for fills) rather than judged by
 * eye. Do not add a colour here without doing the same.
 *
 * Nothing below this file is shared with the web: React Native has no DOM, so
 * the components are new code rather than a port. The tokens are deliberately
 * the only common surface.
 */

// ---------------------------------------------------------------------------
// Light — SRS §7.1, unchanged from the web app
// ---------------------------------------------------------------------------
export const lightColors = {
  primary: "#3BB77E", // Nest Green
  accent: "#FDC040", // Cream Yolk
  ink: "#253D4E", // Ink

  bg: "#E7EDF2", // Cloud
  surface: "#FFFFFF",
  surfaceElevated: "#F5F8FA", // Mist
  border: "#E4EAF0", // Column

  text: "#253D4E",
  textMuted: "#5C6877", // Slate Text — NOT the fill value, see below
  slate: "#7B8794", // Slate — fills only

  danger: "#E5484D", // Coral
  onPrimary: "#FFFFFF",
  onAccent: "#253D4E", // Cream Yolk needs Ink on top, never white
} as const;

// ---------------------------------------------------------------------------
// Dark — derived 2026-07-29. Not an inversion: two tokens change job.
// ---------------------------------------------------------------------------
export const darkColors = {
  // Nest Green and Cream Yolk clear 4.5:1 on every dark surface unchanged.
  primary: "#3BB77E",
  accent: "#FDC040",
  ink: "#8FB4C4", // Ink on dark is 1.14:1 — it IS the background now

  bg: "#16232E",
  surface: "#1B2B38",
  surfaceElevated: "#203442",
  border: "#33505F",

  // Mist rather than pure white: #FFFFFF on a dark surface halates and makes
  // long reading tiring.
  text: "#F5F8FA",
  textMuted: "#9AAAB8", // the light value (#5C6877) is 2.27:1 here — unusable
  slate: "#9AA6B2", // lifted; #7B8794 is fill-only on dark

  danger: "#FF8085", // lifted; #E5484D is 3.29:1 on dark — fill-only
  onPrimary: "#0C151B",
  onAccent: "#16232E",
} as const;

/** Both themes carry the same keys; only the values differ. */
export type Colors = Record<keyof typeof lightColors, string>;

// ---------------------------------------------------------------------------
// Status colours (SRS §7.1). Same meanings on both themes; two values differ
// so they stay visible on dark.
// ---------------------------------------------------------------------------
export const lightStatusColors = {
  available: "#3BB77E",
  assigned: "#253D4E",
  under_maintenance: "#FDC040",
  retired: "#7B8794",
  lost: "#E5484D",
  disposed: "#7B8794",
} as const;

export const darkStatusColors = {
  available: "#3BB77E",
  assigned: "#8FB4C4",
  under_maintenance: "#FDC040",
  retired: "#9AA6B2",
  lost: "#FF8085",
  disposed: "#9AA6B2",
} as const;

export type AssetStatus = keyof typeof lightStatusColors;

// ---------------------------------------------------------------------------
// Request statuses (FR-4.4). A separate vocabulary from the asset statuses
// above — a request is pending/approved/rejected/cancelled, an asset is
// available/assigned/… — so they are separate maps rather than one loose
// string map. Values mirror `apps/assets/constants.REQUEST_STATUS_COLORS`.
//
// The dark values are derived the same way the asset statuses were: Coral and
// Slate are fill-only on dark (3.29:1 and below), so they lift to the same
// replacements used there. Pending stays Cream Yolk because it needs to read as
// "waiting on you", which is the whole point of the inbox.
// ---------------------------------------------------------------------------
export const lightRequestStatusColors = {
  pending: "#FDC040", // Cream Yolk — needs attention
  approved: "#3BB77E", // Nest Green
  rejected: "#E5484D", // Coral
  cancelled: "#7B8794", // Slate
} as const;

export const darkRequestStatusColors = {
  pending: "#FDC040",
  approved: "#3BB77E",
  rejected: "#FF8085", // as `lost` — Coral is fill-only on dark
  cancelled: "#9AA6B2", // as `retired`
} as const;

export type RequestStatus = keyof typeof lightRequestStatusColors;

/**
 * Both vocabularies in one map.
 *
 * The key sets are disjoint, so a pill can colour either kind without the
 * caller telling it which it holds — and a status that belongs to neither is a
 * compile error rather than a silently grey dot.
 */
export type StatusColors = Record<AssetStatus, string> &
  Record<RequestStatus, string>;

// ---------------------------------------------------------------------------
// Category / chart series (SRS §7.1.1). Ordered so neighbours differ in hue
// *and* lightness — a legend is read by adjacency.
// ---------------------------------------------------------------------------
export const lightSeries = [
  "#3BB77E", "#253D4E", "#FDC040", "#6C6FD4", "#2F9BB5",
  "#E08A3C", "#5A7D8C", "#7B8794", "#5FC9A0", "#E5484D",
] as const;

// Three of the ten fall below 3:1 on dark and are swapped: Ink, Indigo, Steel.
export const darkSeries = [
  "#3BB77E", "#8FB4C4", "#FDC040", "#8A8DE0", "#2F9BB5",
  "#E08A3C", "#7FA6B6", "#7B8794", "#5FC9A0", "#E5484D",
] as const;

// ---------------------------------------------------------------------------
// Typography (SRS §7.2) — Quicksand for headings and numbers, Lexend for the
// rest. The scale is a base, not an absolute: §12.6 requires dynamic type, so
// sizes must scale with the OS setting.
// ---------------------------------------------------------------------------
export const fonts = {
  head: "Quicksand_700Bold",
  headSemi: "Quicksand_600SemiBold",
  body: "Lexend_400Regular",
  bodyMedium: "Lexend_500Medium",
  bodySemi: "Lexend_600SemiBold",
} as const;

export const fontSizes = {
  h1: 32,
  h2: 24,
  h3: 20,
  body: 15,
  small: 13,
} as const;

export const lineHeights = {
  body: 1.5,
} as const;

// ---------------------------------------------------------------------------
// Spacing, radius, elevation — the web's 8px scale (SRS §7.4)
// ---------------------------------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12, // cards, matching the web's 12px
  pill: 999,
} as const;

/** Minimum touch target (SRS §12.6). Nothing interactive goes below this. */
export const MIN_TARGET = 44;
