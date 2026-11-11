import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SITES } from "../packages/sites/src/index"

// Every Next app takes its whole look from @repo/ui: one stylesheet import, one set of font
// variables on <body>, and no colour of its own. Rules that used to live in an app's globals.css
// (www's motion, breakpoints, forced-colors support, …) are packages/ui/src/styles/globals.css's.
const ROOT = join(import.meta.dir, "..")
const NEXT_APPS = Object.keys(SITES)

/**
 * The apps whose source may hold no colour literal. Only www and blog for now: the other apps'
 * literals are replaced in a later task, which widens this to `NEXT_APPS`.
 */
const COLOUR_CHECKED_APPS = ["www", "blog"]

/**
 * Colour literals that stay, each with why. `literals` is exact: a new literal in the same file
 * still fails, and an entry none of whose literals is left fails as stale. Outside the scan
 * altogether: `public/` (static files), `manifest.ts` (a `.ts` file; its `theme_color` must be a
 * literal) and the OG images, which call `ogImage` and hold no colour of their own.
 */
const ALLOWED_COLOURS: { file: string; literals: string[]; reason: string }[] = [
  {
    file: "apps/www/src/app/layout.tsx",
    literals: ["#fcfaf4", "#121a1a"],
    reason: "viewport themeColor is browser-chrome metadata, not CSS: it cannot read a token",
  },
  {
    file: "apps/blog/src/components/blog-document.tsx",
    literals: ["#fcfaf4", "#121a1a"],
    reason: "viewport themeColor is browser-chrome metadata, not CSS: it cannot read a token",
  },
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
const BODY = /^\s*<body[\s>][^>]*>/m
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

  test("every <body> it renders carries fontVariables", () => {
    // global-error.tsx replaces a layout that threw; it loads no fonts on purpose.
    const bodies = sourceFiles(app, "**/*.tsx").filter(
      (file) => !file.endsWith("/global-error.tsx") && BODY.test(read(file))
    )
    expect(bodies.length).toBeGreaterThan(0)
    for (const file of bodies) {
      const body = read(file).match(BODY)?.[0] ?? ""
      expect(body, `${file}: <body> must use fontVariables from @repo/ui/lib/fonts`).toMatch(
        /\$\{fontVariables\}/
      )
    }
  })
})

describe.each(COLOUR_CHECKED_APPS)("%s colours", (app) => {
  test("its source names no colour: every colour is a token", () => {
    const found: string[] = []
    for (const file of sourceFiles(app, "**/*.{tsx,css}")) {
      const allowed = ALLOWED_COLOURS.find((entry) => entry.file === file)?.literals ?? []
      for (const [i, line] of read(file).split("\n").entries()) {
        for (const [literal] of line.matchAll(COLOUR)) {
          if (!allowed.includes(literal.toLowerCase())) found.push(`${file}:${i + 1} ${literal}`)
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
    const source = read(entry.file).toLowerCase()
    const stale = entry.literals.filter((literal) => !source.includes(literal))
    expect(stale, `${entry.file}: remove the allowlisted literals it no longer has`).toEqual([])
  })
})
