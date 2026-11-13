import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import {
  type AllowEntry,
  applyAllowlist,
  formatViolations,
  routeMatches,
  type Violation,
  WCAG_TAGS,
} from "../apps/e2e/a11y/core"
import { A11Y_PAGES, EXCLUDED, routeOf, uncovered, variantsFor } from "../apps/e2e/a11y/routes"

const violation = (id: string, targets: string[]): Violation => ({
  id,
  impact: "serious",
  help: `${id} help`,
  helpUrl: `https://dequeuniversity.com/rules/axe/4.11/${id}`,
  nodes: targets.map((t) => ({ target: [t] })),
})

describe("a11y core", () => {
  test("checks every WCAG A/AA tag through 2.2", () => {
    expect([...WCAG_TAGS]).toEqual(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
  })

  test("route patterns: exact, and * matching one or more characters", () => {
    expect(routeMatches("account:/security", "account:/security")).toBe(true)
    expect(routeMatches("account:/security", "account:/security/x")).toBe(false)
    expect(routeMatches("help:/*", "help:/getting-started/create-an-account")).toBe(true)
    expect(routeMatches("help:/*", "docs:/x")).toBe(false)
    // `*` is one or more characters: a prefix wildcard does not cover the root itself.
    expect(routeMatches("help:/*", "help:/")).toBe(false)
  })

  test("an entry removes only the nodes it covers; the rest of the violation stays", () => {
    const entries: AllowEntry[] = [
      { rule: "color-contrast", route: "www:/", selector: ".hero", reason: "r" },
    ]
    const v = violation("color-contrast", [".hero h1", ".footer a"])
    const { remaining, matched } = applyAllowlist([v], entries, "www:/")
    expect(matched).toEqual([0])
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.nodes.map((n) => n.target.join(" "))).toEqual([".footer a"])
  })

  test("an entry for another rule or route allows nothing", () => {
    const entries: AllowEntry[] = [{ rule: "label", route: "www:/", reason: "r" }]
    const v = violation("color-contrast", [".a"])
    expect(applyAllowlist([v], entries, "www:/").remaining).toEqual([v])
    const e2: AllowEntry[] = [{ rule: "color-contrast", route: "www:/terms", reason: "r" }]
    expect(applyAllowlist([v], e2, "www:/").remaining).toEqual([v])
  })

  test("a fully allowed violation disappears", () => {
    const entries: AllowEntry[] = [{ rule: "region", route: "blog:/*", reason: "r" }]
    expect(
      applyAllowlist([violation("region", [".x"])], entries, "blog:/welcome").remaining
    ).toEqual([])
  })

  test("the failure message names the label, rule, impact, selectors and help url", () => {
    const text = formatViolations("account /security dark sv", [violation("label", ["#name"])])
    expect(text).toContain("account /security dark sv")
    expect(text).toContain("label (serious)")
    expect(text).toContain("#name")
    expect(text).toContain("https://dequeuniversity.com/rules/axe/4.11/label")
  })
})

describe("a11y route manifest", () => {
  test("route patterns: groups dropped, dynamic segments kept, index is /", () => {
    expect(routeOf("apps/www/src/app/page.tsx")).toEqual({ app: "www", route: "/" })
    expect(routeOf("apps/account/src/app/(account)/security/page.tsx")).toEqual({
      app: "account",
      route: "/security",
    })
    expect(routeOf("apps/auth/src/app/admin/(gated)/users/[id]/page.tsx")).toEqual({
      app: "auth",
      route: "/admin/users/[id]",
    })
    expect(routeOf("apps/docs/src/app/[[...slug]]/page.tsx")).toEqual({
      app: "docs",
      route: "/[[...slug]]",
    })
    expect(routeOf("apps/story/src/app/page.tsx")).toBeNull()
  })

  test("a route neither in the manifest nor excluded is reported", () => {
    expect(uncovered(["apps/www/src/app/brand-new/page.tsx"])).toEqual(["www /brand-new"])
  })

  test("every page.tsx of the nine Next apps is covered or excluded with a reason", () => {
    const files = [...new Glob("apps/*/src/app/**/page.tsx").scanSync(".")]
    expect(files.length).toBeGreaterThan(30)
    expect(uncovered(files)).toEqual([])
    for (const e of EXCLUDED) expect(e.reason.length).toBeGreaterThan(10)
  })

  test("translated apps get Swedish variants, admin and static apps do not", () => {
    const login = A11Y_PAGES.find((p) => p.app === "auth" && p.path === "/login")
    const admin = A11Y_PAGES.find((p) => p.app === "auth" && p.path === "/admin")
    // A www page with no variants of its own (the legal pages add an English one).
    const terms = A11Y_PAGES.find((p) => p.app === "www" && p.path === "/book")
    if (!login || !admin || !terms) throw new Error("manifest is missing a page this test needs")
    expect(variantsFor(login)).toEqual(["light", "dark", "sv-light", "sv-dark"])
    expect(variantsFor(admin)).toEqual(["light", "dark"])
    expect(variantsFor(terms)).toEqual(["light", "dark"])
  })
})
