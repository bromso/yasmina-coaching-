import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { rssFeed } from "@repo/content/feeds"
import { createMdxPlugin } from "fumadocs-mdx/bun"

/**
 * A smoke test of the real feed path — real posts (`content/posts/att-leda-genom-en-kris.mdx` and
 * its translation `en-leading-through-a-crisis.mdx`, compiled through fumadocs-mdx's own Bun
 * plugin), `blog.ts`'s loading and validation, `renderPostHtml`'s
 * `react-dom/server.edge` stream and `feedResponse` — so a silent change in how that renderer
 * behaves (an empty body, markup gone) fails `bun test`, not just a reader's feed. What it cannot
 * cover is Next's own aliasing of `react-dom/server.edge` inside a route handler (see the comment
 * on `renderPostHtml`): Bun resolves the real module, so that half is still checked only by
 * `next build` and the e2e journey.
 */
let feedRender: typeof import("./feed-render")
const startDir = process.cwd()

beforeAll(async () => {
  // blog.ts reads each post from `content/posts` under the working directory, as `next build`
  // runs it from the app; `bun test apps/blog` from the repo root would look in the wrong place.
  process.chdir(join(import.meta.dir, "..", ".."))
  // Registered before the first import of `./feed-render`, so `collections/server`'s `.mdx`
  // imports load through it.
  await Bun.plugin(createMdxPlugin())
  feedRender = await import("./feed-render")
})

afterAll(() => process.chdir(startDir))

describe("feed rendering, end to end", () => {
  test("a post renders to HTML with its paragraphs and a resolved www: link", async () => {
    const html = await feedRender.renderPostHtml("att-leda-genom-en-kris")
    expect(html).toContain("<p")
    expect(html).toContain("En kris på jobbet har oftast ett namn.")
    expect(html).toContain('href="http://www.brand.localhost:3000/kontakt"')
    expect(html).not.toContain("www:/")
  })

  test("each language's RSS carries only its own posts, as HTML", async () => {
    const sv = await (await feedRender.feedResponse(rssFeed, "application/rss+xml", "sv")).text()
    expect(sv).toContain("<content:encoded><![CDATA[")
    expect(sv).toContain("<language>sv</language>")
    expect(sv).toContain("Att leda genom en kris, på jobbet och hemma")
    expect(sv).not.toContain("Leading through a crisis, at work and at home")
    const response = await feedRender.feedResponse(rssFeed, "application/rss+xml", "en")
    expect(response.headers.get("content-type")).toBe("application/rss+xml")
    const en = await response.text()
    expect(en).toContain("Leading through a crisis, at work and at home")
    expect(en).toContain("/en/leading-through-a-crisis</link>")
    expect(en).not.toContain("Att leda genom en kris, på jobbet och hemma")
  })

  test("a slug with no page throws rather than rendering an empty entry", async () => {
    await expect(feedRender.renderPostHtml("no-such-post")).rejects.toThrow("post/page mismatch")
  })
})
