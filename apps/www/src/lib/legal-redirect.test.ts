import { expect, test } from "bun:test"
import { legalUrl } from "@repo/sites/legal"
import robots from "@/app/robots"
import { LEGACY_LEGAL_PATHS, legalTarget } from "./legal-redirect"
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
