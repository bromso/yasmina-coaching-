import { describe, expect, test } from "bun:test"
import { isDraft } from "./draft"
import { legalRobots } from "./robots"

describe("isDraft", () => {
  test("is on unless LEGAL_DRAFT is exactly false", () => {
    expect(isDraft({})).toBe(true)
    expect(isDraft({ LEGAL_DRAFT: "false" })).toBe(false)
    expect(isDraft({ LEGAL_DRAFT: "0" })).toBe(true)
    expect(isDraft({ LEGAL_DRAFT: "true" })).toBe(true)
  })
})

describe("legalRobots", () => {
  test("disallows everything while in draft", () => {
    const robots = legalRobots({ SITE_DOMAIN: "example.com" })
    expect(robots.rules).toEqual([{ userAgent: "*", disallow: ["/"] }])
    expect(robots.sitemap).toBe("https://legal.example.com/sitemap.xml")
  })

  test("allows everything once the draft is approved", () => {
    const robots = legalRobots({ SITE_DOMAIN: "example.com", LEGAL_DRAFT: "false" })
    expect(robots.rules).toEqual([{ userAgent: "*", allow: "/" }])
  })
})
