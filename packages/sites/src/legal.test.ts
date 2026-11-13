import { expect, test } from "bun:test"
import { LEGAL_PAGES, type LegalLocale, type LegalPageId, legalPath, legalUrl } from "./legal"

test("legalPath: Swedish at the root, English under /en", () => {
  expect(legalPath("privacy", "sv")).toBe("/integritet")
  expect(legalPath("terms", "en")).toBe("/en/terms")
  expect(legalPath("accessibility", "sv")).toBe("/tillganglighet")
  expect(legalPath("company", "en")).toBe("/en/company")
})

test("legalUrl: the legal app's address plus the page's path", () => {
  expect(legalUrl("terms", "sv", {})).toBe("http://legal.brand.localhost:3010/villkor")
})

test("legalUrl follows SITE_DOMAIN and SITE_HOST_PREFIX", () => {
  const env = { NODE_ENV: "production", SITE_DOMAIN: "undefined.guru", SITE_HOST_PREFIX: "yas-" }
  expect(legalUrl("privacy", "en", env)).toBe("https://yas-legal.undefined.guru/en/privacy")
})

test("every slug is unique within its language", () => {
  const ids = Object.keys(LEGAL_PAGES) as LegalPageId[]
  for (const locale of ["sv", "en"] as const satisfies readonly LegalLocale[]) {
    const slugs = ids.map((id) => LEGAL_PAGES[id][locale])
    expect(new Set(slugs).size).toBe(slugs.length)
  }
})
