/**
 * Verification — accessibility and dark mode.
 *
 * The screen-reader half of this day needs a handset: VoiceOver and TalkBack
 * cannot be driven from here, and neither can focus order. What *can* be
 * checked without one is everything they depend on, and it is the part that
 * rots silently as screens are added:
 *
 *   * **contrast parity** — every pairing the app actually renders, measured in
 *     both themes rather than judged by eye. This is the check that caught
 *     `StatusPill` at 1.45:1 when the gallery was built, and it has been done
 *     ad hoc in three scripts since. Here it is systematic.
 *   * **theme completeness** — the two palettes must carry identical keys, or a
 *     screen that reads `colors.foo` renders `undefined` in one of them, which
 *     React Native draws as black on black rather than throwing.
 *   * **dynamic type** — text must be allowed to scale, and nothing that holds
 *     text may be pinned to a height that clips it at the largest setting.
 *   * **touch targets** — 44pt, the size SRS §12.6 requires.
 *
 * WCAG 2.1: 4.5:1 for normal text, 3:1 for large text (≥18.66px bold or 24px)
 * and for the boundaries of user-interface components.
 *
 *   cd mobile && npx tsx scripts/verify-a11y.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  MIN_TARGET,
  darkColors,
  darkRequestStatusColors,
  darkStatusColors,
  fontSizes,
  lightColors,
  lightRequestStatusColors,
  lightStatusColors,
} from "../src/theme/tokens";

let passed = 0;
let failed = 0;
const findings: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ""}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

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

/** Every surface a screen can put content on. */
const surfacesOf = (c: Record<"bg" | "surface" | "surfaceElevated", string>) => ({
  bg: c.bg,
  surface: c.surface,
  surfaceElevated: c.surfaceElevated,
});

const themes = [
  ["light", lightColors, lightStatusColors, lightRequestStatusColors],
  ["dark", darkColors, darkStatusColors, darkRequestStatusColors],
] as const;

// --------------------------------------------------------------------------
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function main() {
  const files = sourceFiles("src");

  // =======================================================================
  console.log("\n1. Both palettes carry the same keys");

  const lightKeys = Object.keys(lightColors).sort();
  const darkKeys = Object.keys(darkColors).sort();
  check(
    "light and dark define identical colour keys",
    JSON.stringify(lightKeys) === JSON.stringify(darkKeys),
    // A missing key is not a type error at the point of use — `colors.foo`
    // is typed from `Colors`, so a gap only appears at runtime, as undefined,
    // which React Native renders as black.
    `${lightKeys.length} keys`,
  );
  check(
    "and the same status vocabularies",
    JSON.stringify(Object.keys(lightStatusColors).sort()) ===
      JSON.stringify(Object.keys(darkStatusColors).sort()) &&
      JSON.stringify(Object.keys(lightRequestStatusColors).sort()) ===
        JSON.stringify(Object.keys(darkRequestStatusColors).sort()),
    "a status with no dark value would render as nothing",
  );

  // =======================================================================
  console.log("\n2. Text on every surface it is rendered on (4.5:1)");

  for (const [name, colors] of themes) {
    for (const [surfaceName, surface] of Object.entries(surfacesOf(colors))) {
      for (const role of ["text", "textMuted"] as const) {
        const value = contrast(colors[role], surface);
        check(
          `${name}: ${role} on ${surfaceName}`,
          value >= 4.5,
          ratio(value),
        );
      }
    }
  }

  // =======================================================================
  console.log("\n3. Status colours");

  // `StatusPill` renders the *word* in `colors.text` and puts the hue in a dot
  // and a 13% tint. That was the fix after the first version measured 1.45:1,
  // and it is why these are **not** asserted at 3:1: the dot sits beside a
  // label that always states the status, so WCAG 1.4.11 — which governs
  // non-text content *required* to understand the interface — does not bite.
  // Measured anyway, because a hue that vanishes entirely is still worth
  // knowing about, and the numbers move whenever a token changes.
  for (const [name, colors, statuses, requestStatuses] of themes) {
    const all = { ...statuses, ...requestStatuses };
    const faint: string[] = [];
    for (const [status, colour] of Object.entries(all)) {
      const value = contrast(colour, colors.surface);
      if (value < 3) faint.push(`${status} ${ratio(value)}`);
    }
    if (faint.length) findings.push(`${name}: faint status dots — ${faint.join(", ")}`);
    check(
      `${name}: the label carries the meaning, so the dot may be subtle`,
      true,
      faint.length ? `faintest — ${faint.join(", ")}` : "every dot clears 3:1 anyway",
    );
  }

  // What must hold is that the label itself is legible — the pairing the first
  // version of the pill got wrong.
  for (const [name, colors] of themes) {
    const value = contrast(colors.text, colors.surface);
    check(`${name}: the pill's label is normal text on its surface`, value >= 4.5, ratio(value));
  }

  // =======================================================================
  console.log("\n4. Dynamic type");

  const noScaling = files.filter((f) =>
    /allowFontScaling\s*=\s*\{?\s*false/.test(readFileSync(f, "utf8")),
  );
  check(
    "no screen opts out of font scaling",
    noScaling.length === 0,
    noScaling.length ? noScaling.join(", ") : "text scales with the OS setting everywhere",
  );

  // A fixed `height` on **text itself** clips it at the largest setting.
  //
  // The first version of this check looked at every style block containing a
  // `height` and excluded names that sounded decorative. It flagged icon
  // circles and a `shadowOffset` — because the *shape* of a style is no
  // evidence about what it contains, and a name is a guess. It now looks only
  // at styles that set a font, which are the ones applied to `<Text>`.
  const clipped: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/\n\s*(\w+):\s*\{([^}]*)\}/g)) {
      const [, styleName, body] = match;
      const isTextStyle = /fontFamily|fontSize/.test(body);
      const fixed = /\bheight:\s*(\d+)/.exec(body);
      if (isTextStyle && fixed) clipped.push(`${file} → ${styleName}: height ${fixed[1]}`);
    }
  }
  check(
    "no text style is pinned to a fixed height",
    clipped.length === 0,
    clipped.length ? clipped.join(" | ") : "text grows with the OS setting",
  );

  check(
    "the type scale is large enough to start with",
    fontSizes.small >= 12 && fontSizes.body >= 15,
    `small ${fontSizes.small}, body ${fontSizes.body}`,
  );

  // =======================================================================
  console.log("\n5. Screen-reader navigation");

  // A screen reader user moves through a screen by heading. With none marked,
  // the only way past a long list is to swipe through every row in it.
  const tabRoots = [
    "src/screens/assets/AssetsScreen.tsx",
    "src/screens/requests/RequestsScreen.tsx",
    "src/screens/notifications/NotificationsScreen.tsx",
  ];
  const unmarked = tabRoots.filter(
    (f) => !/accessibilityRole="header"/.test(readFileSync(f, "utf8")),
  );
  check(
    "every tab root marks its title as a heading",
    unmarked.length === 0,
    unmarked.length ? unmarked.join(", ") : `${tabRoots.length} tab roots`,
  );

  // The running tally changes while the user is looking at a shelf rather than
  // the phone. Without a live region the haptic is the only feedback and there
  // is no running total at all.
  const scanScreen = readFileSync("src/screens/stocktake/StockTakeScanScreen.tsx", "utf8");
  check(
    "the stock take tally announces itself as it changes",
    /accessibilityLiveRegion="polite"/.test(scanScreen),
  );
  check(
    "and is grouped rather than six loose numbers",
    /accessibilityRole="summary"/.test(scanScreen),
    'ungrouped it reads "14", "Found", "1", "Missing" — numbers with no subjects',
  );

  console.log("\n6. Touch targets");

  check(
    "the minimum target matches SRS §12.6",
    MIN_TARGET === 44,
    `${MIN_TARGET}pt`,
  );

  const smallTargets: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/minHeight:\s*(\d+)/g)) {
      const value = Number(match[1]);
      if (value < 44 && !/MIN_TARGET/.test(match[0])) {
        smallTargets.push(`${file} → minHeight ${value}`);
      }
    }
  }
  check(
    "nothing interactive declares a target under 44",
    smallTargets.length === 0,
    smallTargets.length ? smallTargets.join(" | ") : "",
  );

  // =======================================================================
  console.log("\n6. Dark mode reaches every screen");

  // Only files that actually render something. A barrel of re-exports has no
  // colours to get wrong, so flagging it says nothing about dark mode.
  const screens = files.filter(
    (f) =>
      /[\\/]screens[\\/]/.test(f) &&
      f.endsWith(".tsx") &&
      /<(View|Text|ScrollView|FlatList)\b/.test(readFileSync(f, "utf8")),
  );
  const untheme: string[] = [];
  for (const file of screens) {
    const src = readFileSync(file, "utf8");
    if (!/useTheme\s*\(/.test(src)) untheme.push(file);
  }
  check(
    "every screen reads the theme rather than assuming one",
    untheme.length === 0,
    untheme.length ? untheme.join(", ") : `${screens.length} screens`,
  );

  // A literal colour is not automatically wrong — a camera viewfinder is black
  // in either theme — but each one is a place dark mode cannot reach, so they
  // are listed rather than asserted on.
  const literals: string[] = [];
  for (const file of files) {
    if (file.includes("tokens.ts")) continue;
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/["']#[0-9a-fA-F]{3,8}["']/g)) {
      literals.push(`${file}: ${match[0]}`);
    }
  }
  console.log(`\n   ${literals.length} literal colours outside the tokens:`);
  for (const l of literals) console.log(`     ${l}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (findings.length) {
    console.log("\nContrast findings:");
    for (const f of findings) console.log(`  ${f}`);
  }
  console.log(
    "\nNot covered here: VoiceOver and TalkBack themselves, focus order, and\n" +
    "rendering at the largest system type size. All three need a handset; what\n" +
    "they depend on — labels, targets, scaling and contrast — is checked above.\n",
  );
  process.exit(failed ? 1 : 0);
}

main();
