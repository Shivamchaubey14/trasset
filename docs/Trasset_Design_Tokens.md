# Trasset — Design Tokens (Light & Dark)

> Reference for the web app (SRS §7.1) and the mobile app (SRS §12.6), which
> share one brand. Light is the existing palette, unchanged. Dark is derived
> here for the first time — mobile requires it from day one, and retrofitting
> it later is far more expensive.
>
> Every pairing below was measured, not judged by eye. Ratios are WCAG 2.1
> against the **4.5:1** body-text bar NFR-9 sets, and **3:1** for non-text UI
> (fills, icons, chart series).

**Last updated:** 2026-07-29

---

## 1. Light theme

Unchanged from SRS §7.1. Reproduced here so both themes sit side by side.

| Token | Name | Hex | Role |
|-------|------|-----|------|
| `primary` | Nest Green | `#3BB77E` | Primary actions, active nav, success, brand |
| `accent` | Cream Yolk | `#FDC040` | Highlights, warnings, secondary CTAs, badges |
| `ink` | Ink | `#253D4E` | Text, headings, sidebar background |
| `bg` | Cloud | `#E7EDF2` | App background |
| `surface` | White | `#FFFFFF` | Cards, panels |
| `surfaceSubtle` | Mist | `#F5F8FA` | Card headers and footers |
| `border` | Column | `#E4EAF0` | Table header row, dividers |
| `slate` | Slate | `#7B8794` | **Fills only** — status pills, chart series |
| `textMuted` | Slate Text | `#5C6877` | **Text only** — secondary copy |
| `danger` | Coral | `#E5484D` | Errors, destructive actions |

### Why Slate is two values

As a fill, Slate stays the brand `#7B8794`. As *text* it lands at 3.0–3.7:1
depending on the surface behind it, against the 4.5:1 NFR-9 requires — and it
carries every piece of secondary copy in the product. Secondary text therefore
uses `#5C6877`, the lightest tone clearing 4.5:1 on all five light surfaces
(worst case 4.68:1).

**This split must survive every port.** It is the single easiest distinction to
collapse back into one colour when rewriting in a new framework, and doing so
silently fails the accessibility requirement across the whole product.

---

## 2. Dark theme

Derived 2026-07-29. Dark is **not an inversion** — two tokens change job
entirely, which is why it needs deriving rather than computing.

### 2.1 Surfaces

An Ink-family ramp. Ink is no longer text; it becomes the background family.

| Token | Hex | Role |
|-------|-----|------|
| `bg` | `#16232E` | App background |
| `surface` | `#1B2B38` | Cards, sheets |
| `surfaceElevated` | `#203442` | Card headers, raised rows, modals |
| `border` | `#33505F` | Dividers — 1.5–1.9:1 against the ramp: visible, not loud |

Three surfaces rather than two because a dark UI loses the drop-shadow cue that
separates a card from the page in light mode; elevation has to be carried by
value instead.

### 2.2 Text

| Token | Hex | vs `bg` | vs `surface` | vs `surfaceElevated` |
|-------|-----|---------|--------------|----------------------|
| `text` | `#F5F8FA` | 14.98:1 | 13.59:1 | 12.07:1 |
| `textMuted` | `#9AAAB8` | 6.71:1 | 6.08:1 | 5.40:1 |

`text` reuses **Mist** from the light palette rather than pure white — `#FFFFFF`
on a dark surface produces the halation that makes dark modes tiring to read.

`textMuted` is a new value. The light one (`#5C6877`) reaches only 2.27:1 on
dark, so it cannot simply carry over.

### 2.3 Brand colours on dark

| Colour | Light | Dark | Worst ratio | Note |
|--------|-------|------|-------------|------|
| Nest Green | `#3BB77E` | `#3BB77E` | 5.06:1 | Unchanged — passes as text |
| Cream Yolk | `#FDC040` | `#FDC040` | 7.84:1 | Unchanged |
| Coral | `#E5484D` | `#FF8085` | 5.32:1 | **Lifted.** The light value reaches only 3.29:1 on dark — fine as a fill, fails as text. Keep `#E5484D` for fills, use `#FF8085` for text and icons |
| Ink | `#253D4E` | `#8FB4C4` | 5.82:1 | **Replaced.** Ink on dark is 1.14:1 — it *is* the background. Anywhere Ink meant "a colour" (the Assigned status) needs this instead |

### 2.4 Status colours

The status vocabulary is identical in meaning; two values change so they stay
visible.

| Status | Light | Dark |
|--------|-------|------|
| Available | Nest Green `#3BB77E` | `#3BB77E` |
| Assigned | Ink `#253D4E` | `#8FB4C4` |
| Under Maintenance | Cream Yolk `#FDC040` | `#FDC040` |
| Retired / Disposed | Slate `#7B8794` | `#9AA6B2` |
| Lost | Coral `#E5484D` | `#FF8085` |

Slate lifts to `#9AA6B2` for the same reason as Coral: `#7B8794` manages 3.52:1
on dark, enough for a pill fill but not for the label on it.

### 2.5 Chart series on dark

Charts stay on the web (SRS §12.8), but **category colours** appear on both, so
the ten-hue set needs a dark variant. Seven carry over; three do not.

| # | Name | Light | Dark | |
|---|------|-------|------|---|
| 1 | Nest Green | `#3BB77E` | `#3BB77E` | ok 5.06:1 |
| 2 | Ink | `#253D4E` | `#8FB4C4` | **swap** — 1.14:1 |
| 3 | Cream Yolk | `#FDC040` | `#FDC040` | ok 7.84:1 |
| 4 | Indigo | `#6C6FD4` | `#8A8DE0` | **swap** — 2.98:1 |
| 5 | Teal | `#2F9BB5` | `#2F9BB5` | ok 3.97:1 |
| 6 | Amber | `#E08A3C` | `#E08A3C` | ok 4.82:1 |
| 7 | Steel | `#5A7D8C` | `#7FA6B6` | **swap** — 2.91:1 |
| 8 | Slate | `#7B8794` | `#7B8794` | ok 3.52:1 |
| 9 | Mint | `#5FC9A0` | `#5FC9A0` | ok 6.34:1 |
| 10 | Coral | `#E5484D` | `#E5484D` | ok 3.29:1 as a fill |

Series need only the 3:1 non-text bar, since a chart mark is not text. The
ordering rule from §7.1.1 still holds: neighbours differ in hue *and* lightness,
because a legend is read by adjacency.

---

## 3. Typography

Identical on both platforms.

- **Quicksand** Bold 700 — wordmark, page titles, headings, KPI numbers
- **Lexend** 400 / 500 / 600 — body, labels, tables, forms, buttons
- Scale: H1 32 / H2 24 / H3 20 / Body 15 / Small 13 · line-height 1.5 for body

**One platform difference.** The web loads both from Google Fonts. A mobile app
cannot, so they are bundled into the binary and loaded with `expo-font` before
the splash screen hides — otherwise the first frame renders in the system font
and visibly reflows.

**Dynamic type.** SRS §12.6 requires accessibility parity, so the mobile scale
must be relative and honour the OS text-size setting; fixed pixel sizes fail
that. The numbers above are the *base* scale, not absolutes.

---

## 4. Using these

**Web:** `frontend/css/variables.css` holds the light theme today. Dark is not
yet implemented there — the values above are ready if it is ever wanted.

**Mobile:** `mobile/theme/tokens.ts` carries both themes. Nothing below the
token layer is shared between platforms — React Native has no DOM, so the
components are new code rather than a port. The tokens are the shared surface,
and deliberately the only one.

**Adding a colour.** Measure it against every surface it can appear on before
adding it, at 4.5:1 for text and 3:1 for fills. The two values in this document
that differ between themes (Coral, Ink) are both cases where that check failed
and a derived value was needed — neither was predictable by eye.

---

## 5. A worked example: why status pills use neutral text

The first version of `StatusPill` put the status colour as *text* on a 13% tint
of itself — a common pattern, and it looks right in a mockup. Measured:

| Status | Light | |
|--------|-------|---|
| Under maintenance | Cream Yolk on `#FFF7E6` | **1.45:1** |
| Available | Nest Green on `#E5F5EE` | **2.25:1** |
| Lost | Coral on `#FCE7E7` | 3.30:1 |
| Assigned | Ink on `#E2E5E7` | 8.94:1 |

Only *Assigned* passed, and only because Ink is dark to begin with. The failure
is structural, not a bad colour choice: **a tint of a colour is by definition
close to that colour**, so the lighter and warmer the hue, the worse it gets.
Cream Yolk at 1.45:1 is roughly white-on-white.

The fix was to move the colour off the text: the tint and dot carry the status
colour as decoration, and the label uses the normal text colour. Worst case
across both themes and both surfaces went from **1.45:1 to 8.59:1**.

That is also the accessible answer rather than merely the legible one — the
status is conveyed by a word, so a reader who cannot distinguish the hues loses
nothing, and the dot is decorative rather than load-bearing.
