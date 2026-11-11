import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { contrast, over, parseOklch, type Rgb } from "@repo/tokens/color"

/*
 * Pins the WCAG contrast of the design tokens every app shares, in both themes, so a future token
 * tweak cannot quietly fall under 1.4.3 (text, 4.5:1) or 1.4.11 (the solid focus-ring colour,
 * 3:1). The colours are read from the generated theme (`tokens.generated.css`, built from
 * packages/tokens) and converted OKLCH → sRGB (gamut-clipped, as browsers render them) → relative
 * luminance by `@repo/tokens/color`, the same conversion the email hex constants use.
 */

const generated = readFileSync(new URL("./tokens.generated.css", import.meta.url), "utf8")

type Token = (name: string) => Rgb

/** Every opaque `--name: oklch(…)` token of the theme's `selector { … }` block. */
function block(selector: string): Token {
  const start = generated.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no "${selector}" block`)
  const body = generated.slice(start, generated.indexOf("\n}", start))
  const tokens: Record<string, Rgb> = {}
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(oklch\([\d.%\s]+\));/g)) {
    if (name && value) tokens[name] = parseOklch(value)
  }
  return (name) => {
    const rgb = tokens[name]
    if (!rgb) throw new Error(`${selector} has no --${name} oklch() token`)
    return rgb
  }
}

const white: Rgb = [1, 1, 1]

type Pair = { name: string; fg: Rgb; bg: Rgb; min: number }

function pairs(t: Token, dark: boolean): Pair[] {
  const text = 4.5
  const ui = 3
  const list: Pair[] = [
    { name: "foreground on background", fg: t("foreground"), bg: t("background"), min: text },
    { name: "card-foreground on card", fg: t("card-foreground"), bg: t("card"), min: text },
    {
      name: "muted-foreground on background",
      fg: t("muted-foreground"),
      bg: t("background"),
      min: text,
    },
    { name: "muted-foreground on card", fg: t("muted-foreground"), bg: t("card"), min: text },
    { name: "muted-foreground on muted", fg: t("muted-foreground"), bg: t("muted"), min: text },
    // Default Button, avatar fallback (initials), Cta block.
    {
      name: "primary-foreground on primary",
      fg: t("primary-foreground"),
      bg: t("primary"),
      min: text,
    },
    {
      name: "primary-foreground on primary/90 over background (hover)",
      fg: t("primary-foreground"),
      bg: over(t("primary"), 0.9, t("background")),
      min: text,
    },
    {
      name: "primary-foreground on primary/90 over card (hover)",
      fg: t("primary-foreground"),
      bg: over(t("primary"), 0.9, t("card")),
      min: text,
    },
    {
      name: "primary-foreground at opacity-90 on primary (Cta copy)",
      fg: over(t("primary-foreground"), 0.9, t("primary")),
      bg: t("primary"),
      min: text,
    },
    // Link-style text (`text-primary`).
    { name: "primary on background", fg: t("primary"), bg: t("background"), min: text },
    { name: "primary on card", fg: t("primary"), bg: t("card"), min: text },
    // Focus indicators (WCAG 1.4.11): the solid `--ring` colour at 3:1, which Button and Input
    // draw as their 1px `border-ring` on focus. Their 3px `ring-ring/50` halo is half-opacity and
    // measures lower — 2.14:1 over the light background (up from 1.94:1) — so it is a known
    // limitation, not guarded here; the solid border is the indicator that meets 3:1.
    { name: "ring on background", fg: t("ring"), bg: t("background"), min: ui },
    { name: "ring on card", fg: t("ring"), bg: t("card"), min: ui },
    // Error text (`text-destructive`).
    { name: "destructive on background", fg: t("destructive"), bg: t("background"), min: text },
    { name: "destructive on card", fg: t("destructive"), bg: t("card"), min: text },
    {
      name: "destructive-foreground on destructive",
      fg: t("destructive-foreground"),
      bg: t("destructive"),
      min: text,
    },
    {
      name: "secondary-foreground on secondary",
      fg: t("secondary-foreground"),
      bg: t("secondary"),
      min: text,
    },
    { name: "accent-foreground on accent", fg: t("accent-foreground"), bg: t("accent"), min: text },
    {
      name: "sidebar-foreground on sidebar",
      fg: t("sidebar-foreground"),
      bg: t("sidebar"),
      min: text,
    },
    {
      name: "sidebar-primary-foreground on sidebar-primary",
      fg: t("sidebar-primary-foreground"),
      bg: t("sidebar-primary"),
      min: text,
    },
  ]
  // The destructive Button: `bg-destructive text-white hover:bg-destructive/90`, and
  // `dark:bg-destructive/60` in the dark theme.
  if (dark) {
    for (const base of ["background", "card"] as const) {
      list.push({
        name: `white on destructive/60 over ${base} (destructive button)`,
        fg: white,
        bg: over(t("destructive"), 0.6, t(base)),
        min: text,
      })
    }
  } else {
    list.push({
      name: "white on destructive (destructive button)",
      fg: white,
      bg: t("destructive"),
      min: text,
    })
    for (const base of ["background", "card"] as const) {
      list.push({
        name: `white on destructive/90 over ${base} (hover)`,
        fg: white,
        bg: over(t("destructive"), 0.9, t(base)),
        min: text,
      })
    }
  }
  return list
}

/** The coaching pairs: text on the sun panels, the blue call to action. */
function coachingPairs(t: Token): Pair[] {
  const text = 4.5
  return [
    { name: "foreground on sun", fg: t("foreground"), bg: t("sun"), min: text },
    { name: "foreground on sun-soft", fg: t("foreground"), bg: t("sun-soft"), min: text },
    {
      name: "muted-foreground on sun-soft",
      fg: t("muted-foreground"),
      bg: t("sun-soft"),
      min: text,
    },
    {
      name: "brand-blue-foreground on brand-blue",
      fg: t("brand-blue-foreground"),
      bg: t("brand-blue"),
      min: text,
    },
  ]
}

for (const [theme, selector] of [
  ["light", ":root"],
  ["dark", ".dark"],
] as const) {
  describe(`${theme} theme token contrast`, () => {
    const tokens = block(selector)
    for (const pair of [...pairs(tokens, theme === "dark"), ...coachingPairs(tokens)]) {
      test(`${pair.name} ≥ ${pair.min}:1`, () => {
        expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min)
      })
    }
  })
}
