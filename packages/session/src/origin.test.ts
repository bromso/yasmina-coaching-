import { describe, expect, test } from "bun:test"
import { assertSameOrigin, safeNextUrl } from "./origin"

const req = (headers: Record<string, string>) =>
  new Request("https://app.brand.com/api/chat", { method: "POST", headers })

describe("assertSameOrigin", () => {
  test("allows same-origin and user-initiated requests", () => {
    expect(assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBeNull()
    expect(assertSameOrigin(req({ "sec-fetch-site": "none" }))).toBeNull()
    expect(assertSameOrigin(req({ origin: "https://app.brand.com" }))).toBeNull()
  })
  test("refuses cross-site and sibling-subdomain requests with the shared 403 shape", async () => {
    const refused: Array<Record<string, string>> = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: "https://evil.brand.com" },
      { origin: "https://evil.com" },
      { origin: "null" },
      {},
    ]
    for (const h of refused) {
      const res = assertSameOrigin(req(h))
      expect(res?.status).toBe(403)
      expect(await res?.json()).toMatchObject({ code: "FORBIDDEN", status: 403 })
    }
  })
})

describe("safeNextUrl", () => {
  const prod = { appUrl: "https://app.brand.com", production: true, domain: ".brand.com" }
  const dev = {
    appUrl: "http://app.brand.localhost:3001",
    production: false,
    domain: ".brand.localhost",
  }
  test("accepts our own hosts", () => {
    expect(safeNextUrl("https://account.brand.com/security", prod)).toBe(
      "https://account.brand.com/security"
    )
    expect(safeNextUrl("http://app.brand.localhost:3001/notes?x=1", dev)).toBe(
      "http://app.brand.localhost:3001/notes?x=1"
    )
  })
  test("strips credentials from an accepted URL", () => {
    expect(safeNextUrl("https://x:y@app.brand.com/", prod)).toBe("https://app.brand.com/")
    expect(safeNextUrl("http://x:y@app.brand.localhost:3001/", dev)).toBe(
      "http://app.brand.localhost:3001/"
    )
  })
  test("the rule follows the cookie domain, not a hard-coded brand", () => {
    const other = { appUrl: "https://app.acme.io", production: true, domain: ".acme.io" }
    expect(safeNextUrl("https://account.acme.io/x", other)).toBe("https://account.acme.io/x")
    expect(safeNextUrl("https://app.brand.com/", other)).toBe("https://app.acme.io")
  })
  test("falls back to appUrl for anything else", () => {
    for (const bad of [
      null,
      "",
      "/notes",
      "//evil.com",
      "https://evil.com",
      "https://app.brand.com.evil.com/",
      "http://app.brand.com/",
      "javascript:alert(1)",
      "http://app.brand.localhost:3001/",
      "https://brand.com/",
      "https://evilbrand.com/",
    ]) {
      expect(safeNextUrl(bad, prod)).toBe("https://app.brand.com")
    }
    for (const bad of [
      null,
      "/notes",
      "//evil.com",
      "http://evil.com",
      "https://app.brand.com/",
      "http://app.brand.localhost.evil.com/",
      "http://brand.localhost:3001/",
      "javascript:alert(1)",
    ]) {
      expect(safeNextUrl(bad, dev)).toBe("http://app.brand.localhost:3001")
    }
  })
  describe("a `.localhost` cookie domain accepts http: even in production", () => {
    const prodLocalhost = {
      appUrl: "http://app.brand.localhost:3001",
      production: true,
      domain: ".brand.localhost",
    }
    test("keeps a same-suffix http: target", () => {
      expect(safeNextUrl("http://account.brand.localhost:3003/security", prodLocalhost)).toBe(
        "http://account.brand.localhost:3003/security"
      )
    })
    test("still requires https: for a non-localhost domain in production", () => {
      const prodBrand = { appUrl: "https://app.brand.com", production: true, domain: ".brand.com" }
      expect(safeNextUrl("http://account.brand.com/", prodBrand)).toBe("https://app.brand.com")
    })
    test("still enforces the domain suffix", () => {
      expect(safeNextUrl("http://evil.localhost/", prodLocalhost)).toBe(
        "http://app.brand.localhost:3001"
      )
    })
    test("a domain merely ending in .localhost elsewhere in its hostname is not the exception", () => {
      const prodLookalike = {
        appUrl: "http://app.brand.localhost:3001",
        production: true,
        domain: ".localhost.evil.com",
      }
      expect(safeNextUrl("http://a.localhost.evil.com/", prodLookalike)).toBe(
        "http://app.brand.localhost:3001"
      )
    })
    test("the .localhost check is case-insensitive", () => {
      const prodShouting = {
        appUrl: "http://app.brand.localhost:3001",
        production: true,
        domain: ".BRAND.LOCALHOST",
      }
      expect(safeNextUrl("http://account.brand.localhost/", prodShouting)).toBe(
        "http://account.brand.localhost/"
      )
    })
    test("also accepts https: on a .localhost domain, dev or production", () => {
      expect(safeNextUrl("https://app.brand.localhost:3001/", dev)).toBe(
        "https://app.brand.localhost:3001/"
      )
      expect(safeNextUrl("https://account.brand.localhost:3003/", prodLocalhost)).toBe(
        "https://account.brand.localhost:3003/"
      )
    })
  })
})
