import { describe, expect, test } from "bun:test"
import { helpPageUrl, helpSitemap } from "./sitemap"

const env = { SITE_DOMAIN: "acme.com" }

describe("helpSitemap", () => {
  test("the home page, every category, every article and /all, lastModified only from `updated`", () => {
    const updated = new Date("2026-10-01")
    expect(
      helpSitemap(
        [{ slug: "getting-started" }, { slug: "troubleshooting" }],
        [
          { path: "/getting-started/create-an-account", updated },
          { path: "/getting-started/invite-your-team" },
        ],
        env
      )
    ).toEqual([
      // As the home page's canonical link: Next prints the root canonical without a trailing slash.
      { url: "https://help.acme.com" },
      { url: "https://help.acme.com/getting-started" },
      { url: "https://help.acme.com/troubleshooting" },
      { url: "https://help.acme.com/getting-started/create-an-account", lastModified: updated },
      { url: "https://help.acme.com/getting-started/invite-your-team" },
      { url: "https://help.acme.com/all" },
      { url: "https://help.acme.com/contact" },
    ])
  })
})

describe("helpPageUrl", () => {
  test("the home page is the bare origin; other pages append their path", () => {
    expect(helpPageUrl("/", env)).toBe("https://help.acme.com")
    expect(helpPageUrl("/getting-started/create-an-account", env)).toBe(
      "https://help.acme.com/getting-started/create-an-account"
    )
  })
})
