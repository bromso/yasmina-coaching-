import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Every app's footer legal line is `SiteFooterLegal` (@repo/ui/blocks/site-footer), styled once
// in packages/ui. A layout that renders `<SiteFooter` must pass it, and no app source writes a
// "©" of its own — the sign of a hand-copied copyright line drifting from the shared look.
// Reads files only (Bun.Glob, node:fs), so it runs before `bun install`, as CI runs it.
const ROOT = join(import.meta.dir, "..")

/**
 * Files under `apps/*\/src` that may hold "©", each with why. Exact paths: an entry whose file no
 * longer holds one fails as stale.
 */
const ALLOWED_COPYRIGHT: { file: string; reason: string }[] = []

const SOURCE = new Bun.Glob("apps/*/src/**/*.{ts,tsx,js,jsx,mjs,md,mdx,json,css}")
const sources = [...SOURCE.scanSync({ cwd: ROOT })].filter(
  (file) => !file.includes("/node_modules/")
)
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")

describe("site footer legal line", () => {
  const footers = sources.filter((file) => /<SiteFooter\b/.test(read(file)))

  test("the scan finds the apps' footers", () => {
    // www, blog, app, auth, account, docs, help, jobs: at least one each.
    expect(footers.length).toBeGreaterThanOrEqual(8)
  })

  test.each(footers)("%s passes SiteFooterLegal as the legal line", (file) => {
    expect(read(file)).toMatch(/<SiteFooterLegal\b/)
  })

  test("no app source writes its own ©", () => {
    const allowed = new Set(ALLOWED_COPYRIGHT.map((entry) => entry.file))
    const offenders = sources.filter((file) => read(file).includes("©") && !allowed.has(file))
    expect(offenders).toEqual([])
  })

  test("every allowlist entry has a reason and still matches a file with ©", () => {
    for (const entry of ALLOWED_COPYRIGHT) {
      expect(entry.reason.length).toBeGreaterThanOrEqual(20)
      expect(sources).toContain(entry.file)
      expect(read(entry.file)).toContain("©")
    }
  })
})
