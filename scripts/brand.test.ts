import { expect, test } from "bun:test"
import { findBrandLiterals, firstPartySources, readSources } from "./brand"

test("finds the literal in JSX text and template strings", () => {
  const hits = findBrandLiterals([
    { path: "apps/x/src/a.tsx", text: "<p>\n  © 2026 Boilerplate\n</p>" },
    { path: "apps/x/src/b.ts", text: "const t = `%s | Boilerplate`" },
  ])
  expect(hits).toEqual(["apps/x/src/a.tsx:2", "apps/x/src/b.ts:1"])
})

test("skips test files and the allow-list", () => {
  const hits = findBrandLiterals([
    { path: "packages/sites/src/brand.ts", text: 'export const BRAND_NAME = "Boilerplate"' },
    { path: "apps/x/src/a.test.tsx", text: "Boilerplate" },
  ])
  expect(hits).toEqual([])
})

test("a tracked file deleted from the working tree is skipped, not a crash", () => {
  // `rm -rf apps/<app>` before `git rm` leaves its files in `git ls-files`.
  const files = readSources(["scripts/brand.ts", "apps/removed/src/gone.ts"])
  expect(files.map((f) => f.path)).toEqual(["scripts/brand.ts"])
})

test("first-party src names the brand only through BRAND_NAME", () => {
  const sources = firstPartySources()
  // Otherwise an empty list (e.g. `git ls-files` misbehaving) would pass vacuously.
  expect(sources.length).toBeGreaterThan(0)
  expect(findBrandLiterals(sources)).toEqual([])
})
