import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
// A relative import of a dependency-free file, so this still runs before `bun install`.
import { LEGAL_PAGES } from "../packages/sites/src/legal"

// The privacy policy, the terms, the accessibility statement and the company page live on the
// legal app (`legal.<domain>`), linked only through `legalUrl` / `legalPath` from
// `@repo/sites/legal`, so a renamed slug moves every link with it. Two shapes fail:
//  - the old www paths: a literal that is `/privacy` or `/terms` (`"/privacy"`, `href="/terms"`,
//    `` `${www}/privacy` ``, a Markdown `(/privacy)` or `www:/privacy`), where those pages used to
//    be — www now only redirects;
//  - a hard-coded legal app path: any `LEGAL_PAGES` slug as `/<sv slug>` or `/en/<en slug>`, the
//    same shapes or after a host (`https://legal.brand.com/en/privacy`).
// Scanned: `apps/*/src` and `packages/*/src`, the stories, and the content apps' MDX. Left out:
// the legal app itself, `packages/sites/src/legal*` (the one definition), and test files.
// Reads files only (Bun.Glob, node:fs), so it runs before `bun install`, as CI runs it.
const ROOT = join(import.meta.dir, "..")

/** What may open a path literal: a quote, a template's `}`, a Markdown `(`, or `www:`. */
const OPEN = String.raw`(?:["'\x60}(]|www:)`
/** What may close one: a quote, `#`, `?` or a Markdown `)`. */
const CLOSE = String.raw`(?=["'\x60#?)])`

/** A literal ending in www's old `/privacy` or `/terms`. */
const OLD_LEGAL_LINK = new RegExp(String.raw`${OPEN}\/(?:privacy|terms)${CLOSE}`, "g")

const SV_SLUGS = Object.values(LEGAL_PAGES).map((page) => page.sv)
const EN_SLUGS = Object.values(LEGAL_PAGES).map((page) => page.en)
/** A legal app path written out, as a literal or after a host (`.com`, `.localhost:3010`). */
const LEGAL_SLUG_PATH = new RegExp(
  String.raw`(?:${OPEN}|\.[a-z]{2,}(?::\d+)?)\/(?:${SV_SLUGS.join("|")}|en\/(?:${EN_SLUGS.join("|")}))${CLOSE}`,
  "g"
)

/**
 * Files that may still name the old paths, each with why. Exact paths: an entry whose file no
 * longer holds one fails as stale.
 */
const ALLOWED: { file: string; reason: string }[] = [
  {
    file: "apps/www/src/lib/legal-redirect.ts",
    reason: "names www's retired /privacy and /terms once, for the redirects and robots' disallow",
  },
]

const SOURCES = [
  "{apps,packages}/*/src/**/*.{ts,tsx}",
  "apps/story/stories/**/*.{ts,tsx,mdx}",
  "apps/*/content/**/*.{md,mdx}",
]
const sources = SOURCES.flatMap((pattern) => [
  ...new Bun.Glob(pattern).scanSync({ cwd: ROOT }),
]).filter(
  (file) =>
    !file.includes("/node_modules/") &&
    !file.startsWith("apps/legal/") &&
    !file.startsWith("packages/sites/src/legal") &&
    !/\.test\.tsx?$/.test(file)
)
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")
const matches = (text: string, pattern = OLD_LEGAL_LINK) =>
  [...text.matchAll(pattern)].map((m) => m[0])

describe("links to the legal pages", () => {
  test("the old-path pattern catches every literal shape, and nothing else", () => {
    expect(matches('privacyHref="/privacy"')).toEqual(['"/privacy'])
    expect(matches("const a = '/terms'")).toEqual(["'/terms"])
    // The source of a template literal, as a file holds it.
    expect(matches(`href={\`\${siteUrl("www")}/terms\`}`)).toEqual(["}/terms"])
    expect(matches('href="/privacy#cookies"')).toEqual(['"/privacy'])
    expect(matches("[the terms](www:/terms)")).toEqual(["www:/terms"])
    expect(matches("[the policy](/privacy)")).toEqual(["(/privacy"])
    expect(matches('import { purge } from "./jobs/builtin/privacy"')).toEqual([])
    expect(matches('import { x } from "@/content/privacy"')).toEqual([])
    expect(matches('page: "/privacy/export"')).toEqual([])
    expect(matches('<Link href="/data-privacy">')).toEqual([])
  })

  test("the slug pattern catches every legal app path, written out", () => {
    const slug = (text: string) => matches(text, LEGAL_SLUG_PATH)
    expect(slug('href="/integritet"')).toEqual(['"/integritet'])
    expect(slug(`\`\${siteUrl("legal")}/tillganglighet\``)).toEqual(["}/tillganglighet"])
    expect(slug('"https://legal.brand.com/en/privacy"')).toEqual([".com/en/privacy"])
    expect(slug('"http://legal.brand.localhost:3010/villkor#a"')).toEqual([
      ".localhost:3010/villkor",
    ])
    expect(slug("[företaget](/foretaget)")).toEqual(["(/foretaget"])
    expect(slug('"/en/company?x"')).toEqual(['"/en/company'])
    // Not a legal path: another app's page, a longer slug, an English slug without `/en`.
    expect(slug('"/en/privacy-policy"')).toEqual([])
    expect(slug('"/villkoren"')).toEqual([])
    expect(slug('"/accessibility"')).toEqual([])
    expect(slug('legalUrl("privacy", "en")')).toEqual([])
  })

  test("no scanned source links to www's old /privacy or /terms", () => {
    const allowed = new Set(ALLOWED.map((entry) => entry.file))
    const offenders = sources
      .filter((file) => !allowed.has(file))
      .flatMap((file) => matches(read(file)).map((match) => `${file}: ${match}`))
    expect(offenders).toEqual([])
  })

  test("no scanned source writes a legal app path by hand", () => {
    const offenders = sources.flatMap((file) =>
      matches(read(file), LEGAL_SLUG_PATH).map((match) => `${file}: ${match}`)
    )
    expect(offenders).toEqual([])
  })

  test("the scan reaches the stories and the content apps' MDX", () => {
    expect(sources).toContain("apps/story/stories/CookieConsent.stories.tsx")
    expect(sources.some((file) => /^apps\/blog\/content\/.+\.mdx$/.test(file))).toBe(true)
  })

  test("every allowlist entry has a reason and still matches its file", () => {
    for (const entry of ALLOWED) {
      expect(entry.reason.length).toBeGreaterThanOrEqual(20)
      expect(sources).toContain(entry.file)
      expect(matches(read(entry.file)).length).toBeGreaterThan(0)
    }
  })
})
