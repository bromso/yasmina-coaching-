import { describe, expect, test } from "bun:test"
import { jobPageUrl, jobsSitemap } from "./sitemap"

const env = { SITE_DOMAIN: "acme.com" }

describe("jobsSitemap", () => {
  test("the home page and every open posting, lastModified its posted date", () => {
    expect(
      jobsSitemap(
        [
          { path: "/senior-fullstack-engineer", posted: "2026-09-15" },
          { path: "/product-designer", posted: "2026-09-20" },
        ],
        env
      )
    ).toEqual([
      // As the home page's canonical link: Next prints the root canonical without a trailing slash.
      { url: "https://jobs.acme.com" },
      {
        url: "https://jobs.acme.com/senior-fullstack-engineer",
        lastModified: new Date("2026-09-15"),
      },
      { url: "https://jobs.acme.com/product-designer", lastModified: new Date("2026-09-20") },
    ])
  })

  test("no open postings: just the home page", () => {
    expect(jobsSitemap([], env)).toEqual([{ url: "https://jobs.acme.com" }])
  })
})

describe("jobPageUrl", () => {
  test("the home page is the bare origin; other pages append their path", () => {
    expect(jobPageUrl("/", env)).toBe("https://jobs.acme.com")
    expect(jobPageUrl("/senior-fullstack-engineer", env)).toBe(
      "https://jobs.acme.com/senior-fullstack-engineer"
    )
  })
})
