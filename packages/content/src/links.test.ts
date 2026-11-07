import { describe, expect, test } from "bun:test"
import { checkLinks } from "./links"

const known = {
  paths: new Set(["/", "/a-post", "/tags/x", "/authors/y", "/rss.xml", "/atom.xml", "/feed.json"]),
  hosts: new Set([
    "www.brand.localhost:3000",
    "app.brand.localhost:3001",
    "auth.brand.localhost:3002",
    "account.brand.localhost:3003",
    "docs.brand.localhost:3004",
    "help.brand.localhost:3005",
    "jobs.brand.localhost:3006",
    "blog.brand.localhost:3009",
  ]),
  ownHost: "blog.brand.localhost:3009",
}

describe("checkLinks", () => {
  test("a relative link to a missing path is reported with its file", () => {
    const problems = checkLinks([{ file: "a.mdx", links: ["/missing"] }], known)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("a.mdx")
    expect(problems[0]).toContain("/missing")
  })

  test("a relative link to a known path is fine", () => {
    expect(checkLinks([{ file: "a.mdx", links: ["/a-post"] }], known)).toEqual([])
  })

  test("an absolute link to an unknown subdomain of the site domain is reported", () => {
    const problems = checkLinks(
      [{ file: "a.mdx", links: ["http://blag.brand.localhost:3009/"] }],
      known
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain("a.mdx")
  })

  test("an absolute link to a known app host is fine", () => {
    expect(
      checkLinks([{ file: "a.mdx", links: ["http://docs.brand.localhost:3004/guide"] }], known)
    ).toEqual([])
  })

  test("an external https://example.org link is fine", () => {
    expect(checkLinks([{ file: "a.mdx", links: ["https://example.org"] }], known)).toEqual([])
  })

  test("#anchor and mailto: are ignored", () => {
    expect(
      checkLinks([{ file: "a.mdx", links: ["#anchor", "mailto:a@example.org"] }], known)
    ).toEqual([])
  })

  test("/tags/x?y=1#z matches /tags/x", () => {
    expect(checkLinks([{ file: "a.mdx", links: ["/tags/x?y=1#z"] }], known)).toEqual([])
  })

  test("an absolute link to the blog's own missing path is reported", () => {
    const problems = checkLinks(
      [{ file: "a.mdx", links: ["http://blog.brand.localhost:3009/missing"] }],
      known
    )
    expect(problems).toHaveLength(1)
  })

  test("clean input yields no problems", () => {
    expect(
      checkLinks([{ file: "a.mdx", links: ["/a-post", "https://example.org", "#top"] }], known)
    ).toEqual([])
  })

  test("a trailing slash is stripped before matching, except for /", () => {
    expect(checkLinks([{ file: "a.mdx", links: ["/a-post/"] }], known)).toEqual([])
    expect(checkLinks([{ file: "a.mdx", links: ["/"] }], known)).toEqual([])
  })

  describe("relative hrefs must be root-relative", () => {
    test.each([["a-post"], ["./x"], ["../tags/x"]])("%s is reported", (href) => {
      const problems = checkLinks([{ file: "a.mdx", links: [href] }], known)
      expect(problems).toEqual([`a.mdx: link "${href}" must be root-relative (start with "/")`])
    })
  })

  describe("protocol-relative links are treated as absolute", () => {
    test("a known app host is fine", () => {
      expect(
        checkLinks([{ file: "a.mdx", links: ["//docs.brand.localhost:3004/guide"] }], known)
      ).toEqual([])
    })

    test("an unknown subdomain is reported", () => {
      const problems = checkLinks(
        [{ file: "a.mdx", links: ["//blag.brand.localhost:3009/"] }],
        known
      )
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain("a.mdx")
    })
  })

  describe("links to a local development host", () => {
    const production = {
      paths: known.paths,
      hosts: new Set(["docs.brand.com", "blog.brand.com"]),
      ownHost: "blog.brand.com",
    }

    test.each([
      ["http://docs.brand.localhost:3004/"],
      ["http://localhost:3000/x"],
      ["//blog.brand.localhost:3009/a-post"],
      ["http://127.0.0.1:3000/x"],
      ["http://127.12.0.5/x"],
      ["http://0.0.0.0:3007/"],
      ["http://[::1]:3000/x"],
      ["//127.0.0.1/x"],
    ])("%s is reported when the blog is not on .localhost", (href) => {
      expect(checkLinks([{ file: "a.mdx", links: [href] }], production)).toEqual([
        `a.mdx: link "${href}" points at a local development host`,
      ])
    })

    test("an ordinary public IP is not a development host", () => {
      expect(
        checkLinks(
          [{ file: "a.mdx", links: ["http://128.0.0.1/x", "http://10.0.0.1/"] }],
          production
        )
      ).toEqual([])
    })

    test("are fine while the blog itself runs on .localhost", () => {
      expect(
        checkLinks([{ file: "a.mdx", links: ["http://docs.brand.localhost:3004/"] }], known)
      ).toEqual([])
    })
  })
})
