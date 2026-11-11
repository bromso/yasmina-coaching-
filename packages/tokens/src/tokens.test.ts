import { describe, expect, test } from "bun:test"
import { statSync } from "node:fs"
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
 * The colours that are deliberately the same in both themes (no `$extensions.mode.dark`): the
 * vendored components' fixed hues and the references that resolve per theme on their own. A colour
 * missing from here needs a dark value, so a new light-only colour cannot slip through.
 */
const SAME_IN_BOTH_THEMES = [
  "color-1",
  "color-2",
  "color-3",
  "color-4",
  "color-5",
  "chart-line-primary",
  "chart-line-secondary",
  "chart-brush-border",
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
  /^font-/,
  /^tracking-/,
  /^display-/,
  /^text-/,
  /^ease-/,
  /^site-header-/,
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
    for (const name of ["color-1", "chart-tooltip-background", "chart-line-primary"]) {
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

  test("carries the coaching palette, not the boilerplate one", () => {
    expect(light.get("background")).toBe("oklch(0.985 0.008 90)")
    expect(dark.get("background")).toBe("oklch(0.21 0.012 200)")
    expect(light.get("sun-soft")).toBe("oklch(0.975 0.045 97)")
    expect(dark.get("sun-soft")).toBe("oklch(0.26 0.03 95)")
  })

  test("--radius is the coaching radius", () => {
    expect(light.get("radius")).toBe("0.875rem")
  })

  test("keeps the easing and the display serif's fallback", () => {
    expect(light.get("ease-out-soft")).toBe("cubic-bezier(0.2, 0.7, 0.2, 1)")
    expect(light.get("display-family")).toBe(
      'var(--font-display), Georgia, "Times New Roman", serif'
    )
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
    const display = readTokens().find((token) => token.path.join(".") === "display.family")
    expect(display?.value).toBe('var(--font-display), Georgia, "Times New Roman", serif')
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
