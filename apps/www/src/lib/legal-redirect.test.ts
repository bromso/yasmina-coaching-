import { expect, test } from "bun:test"
import { legalUrl } from "@repo/sites/legal"
import robots from "@/app/robots"
import { LEGACY_LEGAL_PATHS, legalRedirect, legalTarget } from "./legal-redirect"
import { localeFromCookie } from "./site-locale"

test("the old pages redirect to the legal app in the reader's language", () => {
  expect(legalTarget("privacy", "en")).toBe(legalUrl("privacy", "en"))
  expect(legalTarget("terms", "en")).toBe(legalUrl("terms", "en"))
  expect(legalTarget("privacy", "sv")).toBe(legalUrl("privacy", "sv"))
})

test("without a language, Swedish: the site's own", () => {
  expect(legalTarget("privacy")).toBe(legalUrl("privacy", "sv"))
  expect(legalTarget("terms", undefined)).toBe(legalUrl("terms", "sv"))
})

test("the locale cookie decides: en lands on /en/privacy, none on /integritet", () => {
  const env = { SITE_DOMAIN: "example.com" }
  expect(legalTarget("privacy", localeFromCookie("en"), env)).toBe(
    "https://legal.example.com/en/privacy"
  )
  expect(legalTarget("privacy", localeFromCookie(undefined), env)).toBe(
    "https://legal.example.com/integritet"
  )
})

test("robots keeps the redirecting paths out of the index", () => {
  const rules = robots().rules
  const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((rule) => rule.disallow ?? [])
  for (const path of Object.values(LEGACY_LEGAL_PATHS)) expect(disallow).toContain(path)
})

test("the route handlers answer 308 to the legal app: sv, en, and no cookie", () => {
  const env = { SITE_DOMAIN: "example.com" }
  const cases = [
    ["privacy", "locale=sv", "https://legal.example.com/integritet"],
    ["privacy", "consent=all; locale=en", "https://legal.example.com/en/privacy"],
    ["privacy", null, "https://legal.example.com/integritet"],
    ["terms", "locale=sv", "https://legal.example.com/villkor"],
    ["terms", "locale=en", "https://legal.example.com/en/terms"],
    ["terms", null, "https://legal.example.com/villkor"],
  ] as const
  for (const [page, cookie, location] of cases) {
    const headers = cookie ? { cookie } : undefined
    const response = legalRedirect(
      page,
      env
    )(new Request(`https://www.example.com${LEGACY_LEGAL_PATHS[page]}`, { headers }))
    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(location)
  }
})

test("both app routes export that handler", async () => {
  for (const page of ["privacy", "terms"] as const) {
    const { GET } = await import(`@/app/${page}/route`)
    const response: Response = GET(
      new Request(`https://www.example.com/${page}`, {
        headers: { cookie: "locale=en" },
      })
    )
    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(legalUrl(page, "en"))
  }
})
