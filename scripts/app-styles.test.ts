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
    file: "apps/www/src/components/booking/payment-step.tsx",
    literals: ["bg-black", "text-white", "bg-black/85", "bg-white", "text-black", "bg-white/85"],
    reason:
      "the Apple Pay / Google Pay button is black with white text (white on black in dark mode), as their brand guidelines require",
  },
  {
    file: "apps/www/src/components/site-nav/explore-nav.tsx",
    literals: ["rgba(0,0,0,0)"],
    reason:
      "motion animates the toggle's fill from transparent to the foreground and interpolates colours, so transparent is written as one",
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
const BODY = /^\s*<body[\s>][^>]*>/gm
/** A JSX `<html …>` opening tag, likewise. */
const HTML = /^\s*<html[\s>][^>]*>/gm
const SINGLE_IMPORT = '@import "@repo/ui/globals.css";'
/** The CSS named colours (`transparent` and `currentColor` are not colours of their own). */
const NAMED = `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink
indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta
maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`
  .split(/\s+/)
  .join("|")
/** Tailwind's own palette: `white`, `black` and every hue's numbered shades. */
const PALETTE = `white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}`
/** The utilities that take a colour. */
const COLOUR_UTILITY =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|from|via|to|outline|decoration|divide|shadow|accent|caret|placeholder|inset-shadow|inset-ring"
/** The properties a named colour would be the value of, in CSS or a React style object. */
const COLOUR_PROPERTY =
  "color|background(?:-color)?|backgroundColor|fill|stroke|border(?:-[a-z]+)?-color|border[A-Za-z]*Color|outline-color|outlineColor|stop-color|stopColor|caret-color|caretColor|accent-color|accentColor"

/**
 * A colour written in source rather than read from a token:
 * - a 3/4/6/8-digit hex colour, not part of a longer word or an HTML entity;
 * - a colour function: `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
 *   `oklch()`, `color()`;
 * - one of Tailwind's palette utilities (`text-white`, `bg-black/50`, `border-slate-200`, …),
 *   with any variant;
 * - a CSS named colour as the value of a colour property (`color: "white"`,
 *   `background-color: red`) or in an arbitrary utility (`bg-[white]`).
 * A named colour in prose ("white space", "Black Friday") is not a colour and is not matched.
 */
const COLOUR = new RegExp(
  [
    "(?<![\\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\\w-])",
    "(?<![\\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^)]*\\)",
    `(?<![\\w-])(?:${COLOUR_UTILITY})-(?:${PALETTE})(?:\\/\\d+)?(?![\\w-])`,
    `(?<![\\w-])(?:${COLOUR_PROPERTY})["']?\\s*:\\s*["']?(?:${NAMED})(?![\\w-])`,
    `-\\[(?:${NAMED})\\]`,
  ].join("|"),
  "gi"
)

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

describe("the colour scan", () => {
  test.each([
    ["a hex colour", 'fill="#4285f4"', "#4285f4"],
    ["rgb()", "color: rgb(0 0 0)", "rgb(0 0 0)"],
    ["rgba()", 'backgroundColor: "rgba(0,0,0,0)"', "rgba(0,0,0,0)"],
    ["hsl()", "border-color: hsl(210 40% 50%)", "hsl(210 40% 50%)"],
    ["oklch()", "--x: oklch(0.5 0.1 200)", "oklch(0.5 0.1 200)"],
    ["a palette utility", 'className="text-white"', "text-white"],
    ["a palette shade with a variant and opacity", "dark:bg-slate-900/50", "bg-slate-900/50"],
    ["a named colour in a style object", 'style={{ color: "white" }}', 'color: "white'],
    [
      "a named colour in CSS",
      "background-color: rebeccapurple;",
      "background-color: rebeccapurple",
    ],
    ["a named colour as an arbitrary value", "bg-[white]", "-[white]"],
  ])("catches %s", (_kind, source, literal) => {
    expect(colours(source)).toEqual([literal.toLowerCase()])
  })

  test.each([
    ["a token utility", 'className="bg-primary text-primary-foreground border-border"'],
    ["a token in CSS", "color: var(--foreground)"],
    ["transparent and currentColor", 'fill: "currentColor", color: "transparent"'],
    ["prose", "White space and black coffee, a red thread"],
    ["an HTML entity", "&#123;"],
  ])("passes %s", (_kind, source) => {
    expect(colours(source)).toEqual([])
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
