import { describe, expect, test } from "bun:test"
import { createLegal } from "@repo/content/legal"
import { LEGAL_PAGES } from "@repo/sites/legal"
import { allInputs, legalInput } from "./fixtures"
import { legalSitemap } from "./sitemap"

const env = { SITE_DOMAIN: "example.com" }
const base = "https://legal.example.com"

describe("legalSitemap", () => {
  test("lists both indexes and the eight pages", () => {
    const legal = createLegal(allInputs(), LEGAL_PAGES, { rootLocale: "sv" })
    expect(legalSitemap(legal, env).map((entry) => entry.url)).toEqual([
      `${base}/`,
      `${base}/en`,
      `${base}/integritet`,
      `${base}/en/privacy`,
      `${base}/villkor`,
      `${base}/en/terms`,
      `${base}/tillganglighet`,
      `${base}/en/accessibility`,
      `${base}/foretaget`,
      `${base}/en/company`,
    ])
  })

  test("every entry links both languages, the Swedish one the default", () => {
    const legal = createLegal(allInputs(), LEGAL_PAGES, { rootLocale: "sv" })
    const entries = legalSitemap(legal, env)
    for (const entry of entries) {
      expect(Object.keys(entry.alternates.languages).sort()).toEqual(["en", "sv", "x-default"])
    }
    const privacy = entries.find((entry) => entry.url === `${base}/en/privacy`)
    expect(privacy?.alternates.languages).toEqual({
      sv: `${base}/integritet`,
      en: `${base}/en/privacy`,
      "x-default": `${base}/integritet`,
    })
    expect(entries[1]?.alternates.languages).toEqual({
      sv: `${base}/`,
      en: `${base}/en`,
      "x-default": `${base}/`,
    })
  })

  test("a page's lastModified is its newest change; an index's, its newest page", () => {
    const changes = [
      { date: "2026-12-01", summary: "Ny regel." },
      { date: "2026-11-12", summary: "Första utkastet." },
    ]
    const inputs = allInputs().map((input) =>
      input.file.endsWith("villkor.mdx") || input.file.endsWith("en-terms.mdx")
        ? legalInput("terms", input.file.endsWith("villkor.mdx") ? "sv" : "en", { changes })
        : input
    )
    const entries = legalSitemap(createLegal(inputs, LEGAL_PAGES, { rootLocale: "sv" }), env)
    const at = (url: string) => entries.find((entry) => entry.url === url)?.lastModified
    expect(at(`${base}/villkor`)).toEqual(new Date("2026-12-01"))
    expect(at(`${base}/integritet`)).toEqual(new Date("2026-11-12"))
    expect(at(`${base}/`)).toEqual(new Date("2026-12-01"))
    expect(at(`${base}/en`)).toEqual(new Date("2026-12-01"))
  })
})
