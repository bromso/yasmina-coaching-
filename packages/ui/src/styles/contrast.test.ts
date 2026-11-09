import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/*
 * Pins the WCAG contrast of the design tokens every app shares, in both themes, so a future token
 * tweak cannot quietly fall under 1.4.3 (text, 4.5:1) or 1.4.11 (the solid focus-ring colour,
 * 3:1). The colours are read from globals.css itself and converted OKLCH → sRGB (gamut-clipped, as
 * browsers render them) → relative luminance. The coaching theme (`themes/coaching.css`, www and
 * the blog) is checked the same way, its overrides layered over globals.css's tokens as the
 * cascade does, plus the pairs only it has (the sun panels, the blue call to action).
 */

type Rgb = [number, number, number]

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const base = read("./globals.css")
const coaching = read("./themes/coaching.css")

type Token = (name: string) => Rgb

/** Every `--name: oklch(…)` token of one `selector { … }` block of `css`. */
function tokensOf(css: string, selector: string): Record<string, Rgb> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no "${selector}" block`)
  const body = css.slice(start, css.indexOf("\n}", start))
  const tokens: Record<string, Rgb> = {}
  for (const [, name, l, c, h] of body.matchAll(
    /--([\w-]+):\s*oklch\(([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\)/g
  )) {
    if (!name || !l || !c || !h) continue
    const lightness = l.endsWith("%") ? Number.parseFloat(l) / 100 : Number(l)
    tokens[name] = oklchToRgb(lightness, Number(c), Number(h))
  }
  return tokens
}

/** `selector`'s tokens from each sheet, a later sheet's winning as the cascade's would. */
function block(selector: string, sheets: string[]): Token {
  const tokens = Object.assign({}, ...sheets.map((css) => tokensOf(css, selector))) as Record<
    string,
    Rgb
  >
  return (name) => {
    const rgb = tokens[name]
    if (!rgb) throw new Error(`${selector} has no --${name} oklch() token`)
    return rgb
  }
}

function map3(rgb: Rgb, f: (v: number, i: 0 | 1 | 2) => number): Rgb {
  return [f(rgb[0], 0), f(rgb[1], 1), f(rgb[2], 2)]
}

function oklchToRgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]
  return map3(linear as Rgb, (v) => {
    const x = Math.min(1, Math.max(0, v))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
  })
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = map3(rgb, (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** `fg` at `alpha` composited over `bg`, as `bg-primary/90` renders over its parent. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return map3(fg, (v, i) => v * alpha + bg[i] * (1 - alpha))
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

/** The pairs only the coaching theme has: text on the sun panels, the blue call to action. */
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

for (const [sheet, sheets] of [
  ["shared", [base]],
  ["coaching", [base, coaching]],
] as const) {
  for (const [theme, selector] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ] as const) {
    describe(`${sheet} ${theme} theme token contrast`, () => {
      const tokens = block(selector, [...sheets])
      const list = pairs(tokens, theme === "dark")
      if (sheet === "coaching") list.push(...coachingPairs(tokens))
      for (const pair of list) {
        test(`${pair.name} ≥ ${pair.min}:1`, () => {
          expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min)
        })
      }
    })
  }
}

describe("contrast()", () => {
  test("matches axe's figure for the old primary (#6366f1) behind white", () => {
    expect(contrast(white, oklchToRgb(0.5854, 0.2041, 277.1173))).toBeCloseTo(4.47, 2)
  })
})
