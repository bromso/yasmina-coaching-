import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The privacy policy, the terms and the accessibility statement live on the legal app
// (`legal.<domain>`), linked through `legalUrl` from `@repo/sites/legal`. A string literal that is
// `/privacy` or `/terms` (`"/privacy"`, `href="/terms"`, `` `${www}/privacy` ``) is a link to
// where those pages used to be: www, which now only redirects. The legal app's own sources and
// test files are left out. Reads files only (Bun.Glob, node:fs), so it runs before `bun install`,
// as CI runs it.
const ROOT = join(import.meta.dir, "..")

/** A literal ending in `/privacy` or `/terms`, opened by a quote or a template's `}`. */
const OLD_LEGAL_LINK = /(?:["'`]|\})\/(?:privacy|terms)(?=["'`#?])/g

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

const SOURCE = new Bun.Glob("{apps,packages}/*/src/**/*.{ts,tsx}")
const sources = [...SOURCE.scanSync({ cwd: ROOT })].filter(
  (file) =>
    !file.includes("/node_modules/") &&
    !file.startsWith("apps/legal/") &&
    !/\.test\.tsx?$/.test(file)
)
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")
const matches = (text: string) => [...text.matchAll(OLD_LEGAL_LINK)].map((m) => m[0])

describe("links to the legal pages", () => {
  test("the pattern catches every literal shape, and nothing else", () => {
    expect(matches('privacyHref="/privacy"')).toEqual(['"/privacy'])
    expect(matches("const a = '/terms'")).toEqual(["'/terms"])
    // The source of a template literal, as a file holds it.
    expect(matches(`href={\`\${siteUrl("www")}/terms\`}`)).toEqual(["}/terms"])
    expect(matches('href="/privacy#cookies"')).toEqual(['"/privacy'])
    expect(matches('import { purge } from "./jobs/builtin/privacy"')).toEqual([])
    expect(matches('import { x } from "@/content/privacy"')).toEqual([])
    expect(matches('page: "/privacy/export"')).toEqual([])
    expect(matches('<Link href="/data-privacy">')).toEqual([])
  })

  test("no app or package source links to www's old /privacy or /terms", () => {
    const allowed = new Set(ALLOWED.map((entry) => entry.file))
    const offenders = sources
      .filter((file) => !allowed.has(file))
      .flatMap((file) => matches(read(file)).map((match) => `${file}: ${match}`))
    expect(offenders).toEqual([])
  })

  test("every allowlist entry has a reason and still matches its file", () => {
    for (const entry of ALLOWED) {
      expect(entry.reason.length).toBeGreaterThanOrEqual(20)
      expect(sources).toContain(entry.file)
      expect(matches(read(entry.file)).length).toBeGreaterThan(0)
    }
  })
})
