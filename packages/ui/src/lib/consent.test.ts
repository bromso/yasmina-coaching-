import { describe, expect, test } from "bun:test"
import { consentCookie, parseConsent } from "./consent"

describe("parseConsent", () => {
  test("finds the value among other cookies and ignores garbage", () => {
    expect(parseConsent("session=abc; consent=all; theme=dark")).toBe("all")
    expect(parseConsent("consent=necessary")).toBe("necessary")
    expect(parseConsent("consent=yes")).toBeNull()
    expect(parseConsent("notconsent=all")).toBeNull()
    expect(parseConsent("")).toBeNull()
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent("consent = all ;x=1")).toBe("all")
    expect(parseConsent("consent=x; consent=all")).toBe("all")
  })
})

describe("consentCookie", () => {
  test("serialises with domain, path, max-age, SameSite and Secure in production", () => {
    const c = consentCookie("all", { domain: ".brand.localhost", secure: false })
    expect(c).toContain("consent=all")
    expect(c).toContain("Domain=.brand.localhost")
    expect(c).toContain("Path=/")
    expect(c).toContain("Max-Age=15552000")
    expect(c).toContain("SameSite=Lax")
    expect(c).not.toContain("Secure")
    expect(consentCookie("necessary", { secure: true })).toContain("Secure")
    expect(consentCookie("necessary", { secure: true })).not.toContain("Domain=")
  })
})
