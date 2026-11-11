import { describe, expect, test } from "bun:test"
import { readFileSync, statSync } from "node:fs"
import { contrast, oklchToRgb, parseOklch, toHex } from "./color"
import { build, generate } from "./generate"
import { OUTPUTS, readTokens, render } from "./render"

const { css, email } = await generate()

/** Every `--name: value` of the generated `selector { … }` block. */
function vars(selector: ":root" | ".dark"): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`no "${selector}" block`)
  const body = css.slice(start, css.indexOf("\n}", start))
  const tokens = new Map<string, string>()
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name && value) tokens.set(name, value)
  }
  return tokens
}

/**
 * The colours that are deliberately the same in both themes (no dark value, own or inherited
 * through a reference): the vendored components' fixed hues. A colour missing from here needs a
 * dark value, so a new light-only colour cannot slip through.
 */
const SAME_IN_BOTH_THEMES = [
  "color-1",
  "color-2",
  "color-3",
  "color-4",
  "color-5",
  "chart-tooltip-background",
  "chart-tooltip-foreground",
  "chart-tooltip-muted",
]

const light = vars(":root")
const dark = vars(".dark")

/** The tokens that are the same in both themes, so `.dark` never repeats them. */
const MODE_INDEPENDENT = [
  /^radius$/,
  /^spacing$/,
  /^shadow/,
  /^typeface-/,
  /^tracking-/,
  /^display-/,
  /^text-/,
  /^ease-/,
  /^site-header-/,
  /^layer-/,
]

describe("the generated theme", () => {
  test("every :root token has a .dark twin, apart from the mode-independent ones", () => {
    const missing = [...light.keys()].filter(
      (name) =>
        !dark.has(name) &&
        !MODE_INDEPENDENT.some((re) => re.test(name)) &&
        !SAME_IN_BOTH_THEMES.includes(name)
    )
    expect(missing).toEqual([])
  })

  test("a colour that is the same in both themes is written once, under :root", () => {
    for (const name of ["color-1", "chart-tooltip-background", "chart-tooltip-muted"]) {
      expect(light.has(name)).toBe(true)
      expect(dark.has(name)).toBe(false)
    }
  })

  test(".dark only sets tokens :root defines", () => {
    expect([...dark.keys()].filter((name) => !light.has(name))).toEqual([])
  })

  test("mode-independent tokens are not repeated in .dark", () => {
    expect([...dark.keys()].filter((name) => MODE_INDEPENDENT.some((re) => re.test(name)))).toEqual(
      []
    )
  })

  test("a reference follows the token it names in each theme, so .dark may sit on any element", () => {
    for (const [alias, target] of [
      ["sidebar", "background"],
      ["sidebar-accent", "muted"],
      ["sidebar-ring", "ring"],
      ["card-foreground", "foreground"],
      ["ring", "brand-blue"],
      ["input", "border"],
      ["chart-line-primary", "chart-1"],
      ["chart-brush-border", "chart-grid"],
    ] as const) {
      expect(light.get(alias), alias).toBe(light.get(target))
      expect(dark.get(alias), alias).toBe(dark.get(target))
    }
    // No colour is a `var()` alias, which would resolve where `:root` declares it, light or dark.
    const colours = [...light].filter(([name]) => !/^(typeface|display|text)-/.test(name))
    expect(colours.filter(([, value]) => value.startsWith("var("))).toEqual([])
  })

  test("never writes the palette primitives into the stylesheet", () => {
    expect([...light.keys()].filter((name) => name.startsWith("palette"))).toEqual([])
  })

  test("carries the coaching palette, not the boilerplate one", () => {
    expect(light.get("background")).toBe("oklch(0.985 0.008 90)")
    expect(dark.get("background")).toBe("oklch(0.21 0.012 200)")
    expect(light.get("sun-soft")).toBe("oklch(0.975 0.045 97)")
    expect(dark.get("sun-soft")).toBe("oklch(0.26 0.03 95)")
  })

  test("--radius is the coaching radius", () => {
    expect(light.get("radius")).toBe("0.875rem")
  })

  test("keeps the easing", () => {
    expect(light.get("ease-out-soft")).toBe("cubic-bezier(0.2, 0.7, 0.2, 1)")
  })

  test("the typefaces name what next/font loads, then their fallbacks, never themselves", () => {
    const serif = 'Georgia, "Times New Roman", serif'
    expect(light.get("typeface-serif")).toBe(serif)
    // Fraunces, then Georgia; Georgia alone where next/font set no --font-fraunces (Storybook).
    expect(light.get("typeface-display")).toBe(`var(--font-fraunces, ${serif}), ${serif}`)
    expect(light.get("typeface-sans")).toBe(`var(--font-inter, ${light.get("typeface-system")})`)
    const typefaces = [...light].filter(([name]) => name.startsWith("typeface-"))
    for (const [name, value] of typefaces) {
      expect(value, name).not.toContain(`var(--${name})`)
      expect(value, name).not.toMatch(/\b(Inter|Merriweather)\b(?!\w)/)
    }
    // No indirection left for a theme variable to loop through.
    for (const gone of ["display-family", "text-family", "font-sans", "font-serif", "font-mono"]) {
      expect(light.has(gone), gone).toBe(false)
    }
  })

  test("never writes the email-only tokens into the stylesheet", () => {
    expect([...light.keys()].filter((name) => name.startsWith("email"))).toEqual([])
  })
})

describe("the email constants", () => {
  const hexOf = (name: string) => toHex(parseOklch(light.get(name) ?? ""))
  const color = (key: string) => email.match(new RegExp(`\\b${key}: "(#[0-9a-f]{6})"`))?.[1]

  test("are the light theme's colours as sRGB hex", () => {
    expect(color("background")).toBe(toHex(parseOklch("oklch(0.985 0.008 90)")))
    expect(color("sunSoft")).toBe(hexOf("sun-soft"))
    expect(color("brandBlue")).toBe(hexOf("brand-blue"))
  })

  test("name every colour the templates use", () => {
    for (const key of [
      "background",
      "foreground",
      "muted",
      "mutedForeground",
      "primary",
      "primaryForeground",
      "border",
      "brandBlue",
      "sun",
      "sunSoft",
    ]) {
      expect(color(key)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  test("set headings in Georgia, the display serif's fallback", () => {
    expect(email).toContain(`display: 'Georgia, "Times New Roman", serif'`)
  })
})

describe("the build", () => {
  test("leaves a committed file untouched when its content is unchanged", async () => {
    const mtimes = () => Object.values(OUTPUTS).map((path) => statSync(path).mtimeMs)
    const before = mtimes()
    await build()
    expect(mtimes()).toEqual(before)
  })

  test("resolves {…} references the way style-dictionary does", () => {
    const display = readTokens().find((token) => token.path.join(".") === "email.font.display")
    expect(display?.value).toBe('Georgia, "Times New Roman", serif')
  })

  test("writes no colour value twice: a repeat is a {reference}", () => {
    const source = JSON.parse(readFileSync(`${import.meta.dir}/tokens/color.json`, "utf8"))
    const seen = new Map<string, string>()
    const repeats: string[] = []
    const walk = (node: Record<string, unknown>, path: string[]) => {
      if ("$value" in node) {
        const dark = (node.$extensions as { mode?: { dark?: string } } | undefined)?.mode?.dark
        for (const [mode, value] of [
          ["light", node.$value],
          ["dark", dark],
        ] as const) {
          if (typeof value !== "string" || value.includes("{")) continue
          // oklch(1.0 0 0) and oklch(1 0 0) are the same colour.
          const key = value.replace(/(\d)\.0\b/g, "$1")
          const where = `${path.join(".")} (${mode})`
          if (seen.has(key)) repeats.push(`${where} repeats ${seen.get(key)}: ${value}`)
          else seen.set(key, where)
        }
        return
      }
      for (const [key, child] of Object.entries(node)) {
        if (!key.startsWith("$") && child && typeof child === "object") {
          walk(child as Record<string, unknown>, [...path, key])
        }
      }
    }
    walk(source, [])
    expect(repeats).toEqual([])
  })

  test("a reference in a dark value names the other token's dark value", () => {
    const tokens = readTokens(`${import.meta.dir}/__fixtures__/references`)
    const get = (name: string) => tokens.find((token) => token.path.join(".") === name)
    expect(get("color.base")).toEqual({
      path: ["color", "base"],
      value: "oklch(1 0 0)",
      dark: "oklch(0 0 0)",
    })
    // A bare reference inherits both themes.
    expect(get("color.alias")?.dark).toBe("oklch(0 0 0)")
    expect(get("color.alias-of-alias")?.dark).toBe("oklch(0 0 0)")
    // A dark reference to a colour with no dark value takes its one value.
    expect(get("color.mixed")).toEqual({
      path: ["color", "mixed"],
      value: "oklch(0 0 0)",
      dark: "oklch(0.5 0 0)",
    })
    // A reference to a token that is the same in both themes stays light-only.
    expect(get("color.fixed")?.dark).toBeUndefined()
  })

  test("names the token behind an unknown reference", () => {
    const dir = `${import.meta.dir}/__fixtures__/bad-reference`
    expect(() => readTokens(dir)).toThrow("color.broken refers to {color.missing}")
  })

  test("style-dictionary renders what the dependency-free drift check renders", async () => {
    expect(await generate()).toEqual(render())
  })
})

describe("color", () => {
  test("parses oklch() in numbers and percentages", () => {
    expect(parseOklch("oklch(1 0 0)")).toEqual(oklchToRgb(1, 0, 0))
    expect(parseOklch("oklch(66.2% 0.225 25.9)")).toEqual(oklchToRgb(0.662, 0.225, 25.9))
  })

  test("writes white and black as hex", () => {
    expect(toHex(oklchToRgb(1, 0, 0))).toBe("#ffffff")
    expect(toHex(oklchToRgb(0, 0, 0))).toBe("#000000")
  })

  test("matches axe's figure for the old primary (#6366f1) behind white", () => {
    expect(contrast([1, 1, 1], oklchToRgb(0.5854, 0.2041, 277.1173))).toBeCloseTo(4.47, 2)
  })
})
