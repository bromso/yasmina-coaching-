import { describe, expect, test } from "bun:test"
import {
  __resetSiteDomainWarning,
  footerGroups,
  relabelFooter,
  relabelNav,
  robotsFor,
  SITES,
  siteDomain,
  sitemapFor,
  siteNav,
  siteUrl,
} from "./index"

describe("siteDomain", () => {
  test("unset: brand.localhost", () => {
    expect(siteDomain({})).toBe("brand.localhost")
  })
  test("normalised like siteUrl: scheme, leading dots, trailing slashes and case dropped", () => {
    expect(siteDomain({ SITE_DOMAIN: " https://Acme.com/ " })).toBe("acme.com")
    expect(siteDomain({ SITE_DOMAIN: ".brand.com" })).toBe("brand.com")
  })
})

describe("siteUrl", () => {
  test("unset: dev hosts with ports", () => {
    expect(siteUrl("docs", {})).toBe("http://docs.brand.localhost:3004")
    expect(siteUrl("www", {})).toBe("http://www.brand.localhost:3000")
  })
  test("a .localhost domain keeps http and ports", () => {
    expect(siteUrl("app", { SITE_DOMAIN: "acme.localhost" })).toBe("http://app.acme.localhost:3001")
  })
  test("a real domain is https without a port", () => {
    expect(siteUrl("auth", { SITE_DOMAIN: "acme.com" })).toBe("https://auth.acme.com")
    expect(siteUrl("auth", { SITE_DOMAIN: " acme.com/ " })).toBe("https://auth.acme.com")
  })
  test("SITE_HOST_PREFIX goes in front of the app id on a real domain only", () => {
    const env = { SITE_DOMAIN: "undefined.guru", SITE_HOST_PREFIX: "yas-" }
    expect(siteUrl("www", env)).toBe("https://yas-www.undefined.guru")
    expect(siteUrl("auth", env)).toBe("https://yas-auth.undefined.guru")
    expect(siteUrl("www", { SITE_DOMAIN: "acme.localhost", SITE_HOST_PREFIX: "yas-" })).toBe(
      "http://www.acme.localhost:3000"
    )
    expect(siteUrl("www", { SITE_DOMAIN: "acme.com", SITE_HOST_PREFIX: "a.b/" })).toBe(
      "https://www.acme.com"
    )
  })
  test("blog: dev host with its port, and https in production", () => {
    expect(siteUrl("blog", {})).toBe("http://blog.brand.localhost:3009")
    expect(siteUrl("blog", { SITE_DOMAIN: "example.com" })).toBe("https://blog.example.com")
  })
  test("a leading dot or scheme is dropped", () => {
    expect(siteUrl("docs", { SITE_DOMAIN: ".brand.com" })).toBe("https://docs.brand.com")
    expect(siteUrl("docs", { SITE_DOMAIN: "https://brand.com" })).toBe("https://docs.brand.com")
    expect(siteUrl("docs", { SITE_DOMAIN: "http://acme.localhost/" })).toBe(
      "http://docs.acme.localhost:3004"
    )
  })
  test("production without SITE_DOMAIN falls back and warns once", () => {
    __resetSiteDomainWarning()
    const warnings: string[] = []
    const warn = console.warn
    console.warn = (m: string) => {
      warnings.push(m)
    }
    try {
      expect(siteUrl("docs", { NODE_ENV: "production" })).toBe("http://docs.brand.localhost:3004")
      siteUrl("help", { NODE_ENV: "production" })
    } finally {
      console.warn = warn
    }
    expect(warnings.filter((w) => w.includes("SITE_DOMAIN is not set"))).toHaveLength(1)
  })
})

describe("siteNav", () => {
  test("lists App, Docs, Blog, Help, Jobs and flags the current one without changing its href", () => {
    const nav = siteNav("docs", {})
    expect(nav.map((n) => n.id)).toEqual(["app", "docs", "blog", "help", "jobs"])
    expect(nav.find((n) => n.id === "docs")).toEqual({
      id: "docs",
      label: "Docs",
      href: "http://docs.brand.localhost:3004",
      current: true,
    })
    expect(nav.filter((n) => n.current)).toHaveLength(1)
  })
  test("www is never a nav item", () => {
    expect(siteNav("www", {}).some((n) => n.id === "www")).toBe(false)
  })
})

describe("footerGroups", () => {
  test("three groups in the documented order", () => {
    const groups = footerGroups({})
    expect(groups.map((g) => g.title)).toEqual(["Product", "Company", "Account"])
    expect(groups[1]?.links.map((l) => l.label)).toEqual(["Blog", "Jobs", "Help"])
    expect(groups[2]?.links.map((l) => l.label)).toEqual(["Sign in", "Account"])
    expect(groups[0]?.links[1]?.href).toBe("http://docs.brand.localhost:3004")
    expect(groups.map((g) => g.id)).toEqual(["product", "company", "account"])
    expect(groups[2]?.links.map((l) => l.id)).toEqual(["auth", "account"])
  })
})

describe("relabelNav / relabelFooter", () => {
  test("replace labels and titles by id, keeping ids, hrefs and the current flag", () => {
    const nav = relabelNav(siteNav("docs", {}), (id) => `<${id}>`)
    expect(nav.map((n) => n.label)).toEqual(["<app>", "<docs>", "<blog>", "<help>", "<jobs>"])
    expect(nav.find((n) => n.current)?.href).toBe("http://docs.brand.localhost:3004")
    const groups = relabelFooter(
      footerGroups({}),
      (id) => `<${id}>`,
      (id) => `[${id}]`
    )
    expect(groups.map((g) => g.title)).toEqual(["[product]", "[company]", "[account]"])
    expect(groups[2]?.links).toEqual([
      { id: "auth", label: "<auth>", href: "http://auth.brand.localhost:3002" },
      { id: "account", label: "<account>", href: "http://account.brand.localhost:3003" },
    ])
  })
})

test("SITES covers the nine apps with their dev ports", () => {
  expect(Object.keys(SITES)).toEqual([
    "www",
    "app",
    "auth",
    "account",
    "docs",
    "help",
    "jobs",
    "blog",
    "legal",
  ])
  expect(SITES.jobs).toEqual({ label: "Jobs", port: 3006 })
  expect(SITES.blog).toEqual({ label: "Blog", port: 3009 })
  expect(SITES.legal).toEqual({ label: "Legal", port: 3010 })
})

test("sitemapFor and robotsFor use the site domain", () => {
  const env = { SITE_DOMAIN: "example.com" }
  const map = sitemapFor("www", ["/", "/terms"], env)
  expect(map.map((e) => e.url)).toEqual([
    "https://www.example.com/",
    "https://www.example.com/terms",
  ])
  const robots = robotsFor("auth", { disallow: ["/oauth/", "/magic"] }, env)
  expect(robots.sitemap).toBe("https://auth.example.com/sitemap.xml")
  expect(robots.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/oauth/", "/magic"] }])
  expect(sitemapFor("www", ["/"], {})[0]?.url).toBe("http://www.brand.localhost:3000/")
})

test("robotsFor omits disallow when there is nothing to disallow", () => {
  expect(robotsFor("docs", {}, {}).rules).toEqual([{ userAgent: "*", allow: "/" }])
})

test("a fully private app: disallow everything (no competing allow) and an empty sitemap", () => {
  // RFC 9309: an equally specific Allow beats Disallow, so `Allow: /` must not accompany `Disallow: /`.
  expect(robotsFor("app", { disallow: ["/"] }, {}).rules).toEqual([
    { userAgent: "*", disallow: ["/"] },
  ])
  expect(sitemapFor("app", [], {})).toEqual([])
})
