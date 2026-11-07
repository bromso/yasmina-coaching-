import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkApp, measureApp, routeFiles } from "./bundle-budget"

// A hand-made slice of a Next 16 webpack build (`.next`): a root layout with error and
// global-error boundaries, a home page with a heavy widget, a page under a `(marketing)` group
// with its own layout, a dynamic `/blog/[slug]`, a route handler and Next's internal pages.
const FIXTURE = join(import.meta.dir, "fixtures/next-build/site")
const C = "static/chunks/"
const ROOT = [`${C}main-app-2222222222222222.js`, `${C}webpack-1111111111111111.js`]
// In the fixture's build manifest as `polyfillFiles`: `noModule`, never counted.
const POLYFILLS = `${C}polyfills-3333333333333333.js`
const SHARED = `${C}shared-4444444444444444.js`
const ROOT_LAYOUT = [
  `${C}app/error-bbbbbbbbbbbbbbbb.js`,
  `${C}app/global-error-cccccccccccccccc.js`,
  `${C}app/layout-aaaaaaaaaaaaaaaa.js`,
  SHARED,
]

const gzipKb = (files: string[]) =>
  Math.round(
    files.reduce(
      (sum, f) => sum + Bun.gzipSync(readFileSync(join(FIXTURE, f)), { level: 9 }).byteLength,
      0
    ) / 100
  ) / 10

describe("routeFiles", () => {
  const routes = routeFiles(FIXTURE)

  test("every page route, groups dropped, Next's internal pages and route handlers left out", () => {
    expect([...routes.keys()].sort()).toEqual(["/", "/about", "/blog/[slug]"])
  })

  test("a route loads the root chunks, its segments' boundaries and its page", () => {
    expect(routes.get("/")).toEqual(
      [
        ...ROOT,
        ...ROOT_LAYOUT,
        `${C}big-5555555555555555.js`,
        `${C}app/page-dddddddddddddddd.js`,
      ].sort()
    )
    expect(routes.get("/about")).toEqual(
      [
        ...ROOT,
        ...ROOT_LAYOUT,
        `${C}app/(marketing)/layout-eeeeeeeeeeeeeeee.js`,
        `${C}app/(marketing)/about/page-ffffffffffffffff.js`,
      ].sort()
    )
    expect(routes.get("/blog/[slug]")).toEqual(
      [...ROOT, ...ROOT_LAYOUT, `${C}app/blog/[slug]/page-0123456789abcdef.js`].sort()
    )
  })

  test("the noModule polyfills are left out of every route", () => {
    for (const files of routes.values()) expect(files).not.toContain(POLYFILLS)
  })

  test("a chunk shared by several groups is listed once per route", () => {
    for (const files of routes.values()) {
      expect(files.filter((f) => f === SHARED)).toHaveLength(1)
      expect(new Set(files).size).toBe(files.length)
    }
  })
})

describe("routeFiles: a changed Next manifest shape fails loudly", () => {
  test("no entry chunk groups at all (every client-reference-manifest unmatched)", () => {
    const broken = join(import.meta.dir, "fixtures/next-build/no-groups")
    expect(() => routeFiles(broken)).toThrow(/no entry chunk groups/)
  })

  test("a route whose own keys match no group — only root files — fails instead of undercounting", () => {
    const broken = join(import.meta.dir, "fixtures/next-build/broken-route")
    expect(() => routeFiles(broken)).toThrow(/resolved no segment group of its own/)
  })
})

describe("measureApp", () => {
  const measured = measureApp(FIXTURE)

  test("sums each file's gzip size once, in KB", () => {
    for (const [route, files] of routeFiles(FIXTURE)) {
      expect(measured[route]?.kb).toBe(gzipKb(files))
    }
    expect(measured["/"]?.chunks).toHaveLength(8)
  })

  test("lists a route's chunks largest first", () => {
    const kbs = measured["/"]?.chunks.map((c) => c.kb) ?? []
    expect(kbs).toEqual([...kbs].sort((a, b) => b - a))
    expect(measured["/"]?.chunks[0]?.file).toBe(`${C}big-5555555555555555.js`)
  })
})

describe("checkApp", () => {
  const measured = measureApp(FIXTURE)
  const roomy = { "/": 100, "/about": 100, "/blog/[slug]": 100 }

  test("under budget passes", () => {
    const { ok, lines } = checkApp("site", measured, roomy)
    expect(ok).toBe(true)
    expect(lines.every((l) => l.startsWith("ok"))).toBe(true)
  })

  test("over budget fails, naming the route, measured, budget and the largest chunks", () => {
    const { ok, lines } = checkApp("site", measured, { ...roomy, "/": 1 })
    expect(ok).toBe(false)
    const kb = measured["/"]?.kb
    expect(lines).toContain(
      `FAIL site / first-load JS: ${kb} KB is over the budget 1 KB (+${Number(((kb ?? 0) - 1).toFixed(3))} KB)`
    )
    const largest = lines.find((l) => l.includes("largest chunks:")) ?? ""
    expect(largest).toContain(`${C}big-5555555555555555.js`)
    expect(largest.split(", ")).toHaveLength(5)
  })

  test("a built route with no budget fails", () => {
    const { ok, lines } = checkApp("site", measured, { "/": 100, "/about": 100 })
    expect(ok).toBe(false)
    expect(lines.find((l) => l.startsWith("FAIL"))).toContain("site /blog/[slug]")
    expect(lines.find((l) => l.startsWith("FAIL"))).toContain("no budget")
    expect(
      checkApp("site", measured, undefined).lines.filter((l) => l.startsWith("FAIL"))
    ).toHaveLength(3)
  })

  test("a budgeted route the build does not have is ignored here", () => {
    expect(checkApp("site", measured, { ...roomy, "/gone": 100 }).ok).toBe(true)
  })
})
