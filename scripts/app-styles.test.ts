import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SITES } from "../packages/sites/src/index"
import { parseOklch, toHex } from "../packages/tokens/src/color"

// Every Next app takes its whole look from @repo/ui: one stylesheet import, one set of font
// variables and Next's smooth-scroll opt-in on <html>, `font-sans` on <body>, and no colour of its
// own. Rules that used to live in an app's globals.css
// (www's motion, breakpoints, forced-colors support, …) are packages/ui/src/styles/globals.css's.
const ROOT = join(import.meta.dir, "..")
const NEXT_APPS = Object.keys(SITES)

/** The apps whose source may hold no colour literal: every Next app. */
const COLOUR_CHECKED_APPS = NEXT_APPS

/** The browser chrome's colours: the light and dark page background, and the charcoal primary. */
const CHROME = { background: "#fcfaf4", darkBackground: "#121a1a", primary: "#202829" }

const THEME_COLOR = {
  literals: [CHROME.background, CHROME.darkBackground],
  reason: "viewport themeColor is browser-chrome metadata, not CSS: it cannot read a token",
}
const MANIFEST_COLOURS = {
  literals: [CHROME.background, CHROME.primary],
  reason: "the web manifest's background_color/theme_color are JSON for the OS, not CSS",
}

/**
 * Colour literals that stay, each with why. `literals` is exact: a new literal in the same file
 * still fails, and an entry with a literal the file no longer has fails as stale. Outside the scan
 * altogether: `public/` (static files, not source). The OG images are scanned and pass: they call
 * `ogImage` and hold no colour of their own.
 */
const ALLOWED_COLOURS: { file: string; literals: string[]; reason: string }[] = [
  ...[
    ...NEXT_APPS.filter((app) => app !== "blog").map((app) => `apps/${app}/src/app/layout.tsx`),
    // The blog's two root layouts share one document component, which sets the viewport.
    "apps/blog/src/components/blog-document.tsx",
  ].map((file) => ({ file, ...THEME_COLOR })),
  ...NEXT_APPS.map((app) => ({ file: `apps/${app}/src/app/manifest.ts`, ...MANIFEST_COLOURS })),
  {
    file: "apps/www/src/components/booking/payment-methods.tsx",
    literals: [
      "#000",
      "#fff",
      "#c7c7c7",
      "#4285f4",
      "#3c4043",
      "#18a14a",
      "#1f7ae0",
      "#1f2a37",
      "#f4f1ea",
      "#5b5348",
    ],
    reason:
      "third-party payment marks (Apple Pay, Google Pay, Swish): their brand sets the colours",
  },
]

/** A JSX `<body …>` opening tag: first on its line, so a `<body>` in a comment does not count. */
const BODY = /^\s*<body[\s>][^>]*>/gm
/** A JSX `<html …>` opening tag, likewise. */
const HTML = /^\s*<html[\s>][^>]*>/gm
const SINGLE_IMPORT = '@import "@repo/ui/globals.css";'
/** `oklch(` or a 3/4/6/8-digit hex colour, not part of a longer word or an HTML entity. */
const COLOUR = /oklch\(|(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8")
}

function sourceFiles(app: string, pattern: string) {
  return [...new Bun.Glob(pattern).scanSync({ cwd: join(ROOT, "apps", app, "src") })]
    .filter((file) => !/\.test\.tsx?$/.test(file))
    .map((file) => `apps/${app}/src/${file}`)
    .sort()
}

/** Every opening tag `pattern` (a global regex) finds, with the file it is in. */
function tags(files: string[], pattern: RegExp) {
  return files.flatMap((file) => [...read(file).matchAll(pattern)].map(([tag]) => ({ file, tag })))
}

function colours(source: string) {
  return [...source.matchAll(COLOUR)].map(([literal]) => literal.toLowerCase())
}

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

test("packages/ui exports fontVariables: the sans and the display serif together", () => {
  expect(read("packages/ui/src/lib/fonts.ts")).toMatch(
    /export const fontVariables = `\$\{fontSans\.variable\} \$\{fontDisplay\.variable\}`/
  )
})

describe.each(NEXT_APPS)("%s", (app) => {
  test("its globals.css is the one @repo/ui import and nothing else", () => {
    const css = stripComments(read(`apps/${app}/src/styles/globals.css`)).replace(/\s+/g, "")
    expect(css).toBe(SINGLE_IMPORT.replace(/\s+/g, ""))
  })

  // global-error.tsx replaces a layout that threw; it loads no fonts on purpose.
  const layouts = sourceFiles(app, "**/*.tsx").filter((file) => !file.endsWith("/global-error.tsx"))

  test("every <html> it renders carries fontVariables, where the typeface tokens resolve", () => {
    // The tokens are declared on :root, and a custom property resolves where it is declared: the
    // variables next/font sets (`--font-inter`, `--font-fraunces`) must be on that element too.
    const roots = tags(layouts, HTML)
    expect(roots.length).toBeGreaterThan(0)
    for (const { file, tag } of roots) {
      expect(tag, `${file}: <html> must use fontVariables from @repo/ui/lib/fonts`).toMatch(
        /className=\{fontVariables\}/
      )
    }
  })

  test("every <body> it renders is set in font-sans, and none carries the font variables", () => {
    const bodies = tags(layouts, BODY)
    expect(bodies.length).toBeGreaterThan(0)
    for (const { file, tag } of bodies) {
      expect(tag, `${file}: <body> needs font-sans`).toMatch(/[\s"`{]font-sans[\s"`}]/)
      expect(tag, `${file}: fontVariables belong on <html>`).not.toContain("fontVariables")
    }
  })

  test('every <html> it renders opts into smooth scrolling: data-scroll-behavior="smooth"', () => {
    // globals.css sets `scroll-behavior: smooth` on <html>; with the attribute, Next turns it off
    // for a route change, so a new page starts at the top instead of scrolling there.
    const roots = tags(sourceFiles(app, "**/*.tsx"), HTML)
    expect(roots.length).toBeGreaterThan(0)
    for (const { file, tag } of roots) {
      expect(tag, `${file}: <html> needs data-scroll-behavior="smooth"`).toContain(
        'data-scroll-behavior="smooth"'
      )
    }
  })
})

describe.each(COLOUR_CHECKED_APPS)("%s colours", (app) => {
  test("its source names no colour: every colour is a token", () => {
    const found: string[] = []
    for (const file of sourceFiles(app, "**/*.{ts,tsx,css}")) {
      const allowed = ALLOWED_COLOURS.find((entry) => entry.file === file)?.literals ?? []
      for (const [i, line] of read(file).split("\n").entries()) {
        for (const literal of colours(line)) {
          if (!allowed.includes(literal)) found.push(`${file}:${i + 1} ${literal}`)
        }
      }
    }
    expect(found, "use a token (`bg-sun`, `var(--primary)`, …) instead").toEqual([])
  })
})

describe("the colour allowlist", () => {
  test.each(ALLOWED_COLOURS)("$file is scanned, and still needs each literal", (entry) => {
    expect(COLOUR_CHECKED_APPS.some((app) => entry.file.startsWith(`apps/${app}/src/`))).toBe(true)
    expect(entry.reason.length).toBeGreaterThanOrEqual(20)
    const present = colours(read(entry.file))
    const stale = entry.literals.filter((literal) => !present.includes(literal))
    expect(stale, `${entry.file}: remove the allowlisted literals it no longer has`).toEqual([])
  })
})

describe("the browser chrome's colours", () => {
  test("are the tokens' own values, as sRGB hex", () => {
    const css = read("packages/ui/src/styles/tokens.generated.css")
    const token = (selector: string, name: string) => {
      const body = css.slice(css.indexOf(`${selector} {`))
      const value = body.match(new RegExp(`--${name}:\\s*(oklch\\([^)]*\\));`))?.[1]
      if (!value) throw new Error(`${selector} has no --${name}`)
      return toHex(parseOklch(value))
    }
    expect(CHROME).toEqual({
      background: token(":root", "background"),
      darkBackground: token(".dark", "background"),
      primary: token(":root", "primary"),
    })
  })
})
