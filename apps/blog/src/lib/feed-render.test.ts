import { beforeAll, describe, expect, test } from "bun:test"
import { rssFeed } from "@repo/content/feeds"
import { createMdxPlugin } from "fumadocs-mdx/bun"

/**
 * A smoke test of the real feed path — the compiled starter post (`content/posts/welcome.mdx`,
 * through fumadocs-mdx's own Bun plugin), `blog.ts`'s loading and validation, `renderPostHtml`'s
 * `react-dom/server.edge` stream and `feedResponse` — so a silent change in how that renderer
 * behaves (an empty body, markup gone) fails `bun test`, not just a reader's feed. What it cannot
 * cover is Next's own aliasing of `react-dom/server.edge` inside a route handler (see the comment
 * on `renderPostHtml`): Bun resolves the real module, so that half is still checked only by
 * `next build` and the e2e journey.
 */
let feedRender: typeof import("./feed-render")

beforeAll(async () => {
  // Registered before the first import of `./feed-render`, so `collections/server`'s `.mdx`
  // imports load through it.
  await Bun.plugin(createMdxPlugin())
  feedRender = await import("./feed-render")
})

describe("feed rendering, end to end", () => {
  test("the starter post renders to HTML with its paragraphs", async () => {
    const html = await feedRender.renderPostHtml("welcome")
    expect(html).toContain("<p")
    expect(html).toContain("This is the first post on the blog.")
  })

  test("the RSS route's response carries that HTML as the item's content", async () => {
    const response = await feedRender.feedResponse(rssFeed, "application/rss+xml")
    expect(response.headers.get("content-type")).toBe("application/rss+xml")
    const xml = await response.text()
    expect(xml).toContain("<content:encoded><![CDATA[")
    expect(xml).toContain("<p")
  })

  test("a slug with no page throws rather than rendering an empty entry", async () => {
    await expect(feedRender.renderPostHtml("no-such-post")).rejects.toThrow("post/page mismatch")
  })
})
