import { describe, expect, test } from "bun:test"
import { docsPageUrl, docsSitemap } from "./sitemap"

const env = { SITE_DOMAIN: "acme.com" }

describe("docsSitemap", () => {
  test("lists every page plus /all, lastModified only from `updated`", () => {
    const updated = new Date("2026-10-01")
    expect(
      docsSitemap([{ url: "/" }, { url: "/guides/deploying", updated }, { url: "/x" }], env)
    ).toEqual([
      // As the page's canonical link: Next prints the root canonical without a trailing slash.
      { url: "https://docs.acme.com" },
      { url: "https://docs.acme.com/guides/deploying", lastModified: updated },
      { url: "https://docs.acme.com/x" },
      { url: "https://docs.acme.com/all" },
    ])
  })
})

describe("docsPageUrl", () => {
  test("the landing page is the bare origin; other pages append their path", () => {
    expect(docsPageUrl("/", env)).toBe("https://docs.acme.com")
    expect(docsPageUrl("/guides/deploying", env)).toBe("https://docs.acme.com/guides/deploying")
  })
})
