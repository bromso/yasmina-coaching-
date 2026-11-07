import { describe, expect, test } from "bun:test"
import type { Blog, Post } from "@repo/content/posts"
import { BRAND_NAME } from "@repo/sites/brand"
import { mdxStaticComponents } from "@repo/ui/components/mdx/static"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { renderToReadableStream } from "react-dom/server.edge"
import { feedEntries, feedSite } from "./feed-entries"

function post(slug: string, overrides: Partial<Post> = {}): Post {
  return {
    slug,
    url: `/${slug}`,
    title: `Post ${slug}`,
    description: `About ${slug}.`,
    date: new Date("2026-10-01"),
    author: "team",
    tags: ["guides"],
    type: "Blog Post",
    readingMinutes: 2,
    ...overrides,
  }
}

function blogOf(posts: Post[]): Blog {
  return {
    posts: () => posts,
    post: (slug) => posts.find((p) => p.slug === slug),
    page: () => ({ posts, page: 1, pages: 1 }),
    tags: () => [],
    byTag: () => [],
    authors: () => [],
    byAuthor: () => [],
    author: () => undefined,
    related: () => [],
    neighbours: () => ({}),
  }
}

describe("feedEntries", () => {
  test("excludes nothing that blog.posts() returns, in the same order", () => {
    const posts = [post("newest"), post("oldest")]
    const entries = feedEntries(blogOf(posts), (slug) => `<p>${slug}</p>`)
    expect(entries.map((entry) => entry.post.slug)).toEqual(["newest", "oldest"])
  })

  test("uses the author's display name from content/authors.ts", () => {
    const entries = feedEntries(blogOf([post("hello", { author: "team" })]), () => "<p>x</p>")
    expect(entries[0]?.authorName).toBe(`${BRAND_NAME} team`)
  })

  test("falls back to the author key when it is unknown", () => {
    const entries = feedEntries(blogOf([post("hello", { author: "ghost" })]), () => "<p>x</p>")
    expect(entries[0]?.authorName).toBe("ghost")
  })

  test("absolutizes root-relative hrefs and srcs rendered from JSX, leaving everything else", () => {
    function Body() {
      return (
        <div>
          <p>
            See <a href="/tags/guides">guides</a> and{" "}
            <a href="https://example.org/x">an external link</a>.
          </p>
          <a href="//cdn.example.org/y">protocol-relative</a>
          <img src="/images/cover.png" alt="" />
        </div>
      )
    }

    const html = feedEntries(blogOf([post("hello")]), () => renderToStaticMarkup(<Body />))[0]
      ?.html as string

    expect(html).toContain('href="http://blog.brand.localhost:3009/tags/guides"')
    expect(html).toContain('src="http://blog.brand.localhost:3009/images/cover.png"')
    expect(html).toContain('href="https://example.org/x"')
    expect(html).toContain('href="//cdn.example.org/y"')
    expect(html).not.toContain("<script")
  })

  test("absolutizes every URL in a srcset, keeping each descriptor", () => {
    function Body() {
      // React renders the `srcSet` prop back out with that exact casing (not lowercased) —
      // valid HTML (attribute names are case-insensitive), but means the rewrite has to match
      // case-insensitively too.
      return <img src="/cat-400.png" srcSet="/cat-400.png 400w, /cat-800.png 800w" alt="" />
    }
    const html = feedEntries(blogOf([post("hello")]), () => renderToStaticMarkup(<Body />))[0]
      ?.html as string
    expect(html).toContain(
      'srcSet="http://blog.brand.localhost:3009/cat-400.png 400w, http://blog.brand.localhost:3009/cat-800.png 800w"'
    )
  })

  test("never rewrites a data-src (a word boundary alone would match it)", () => {
    function Body() {
      return <div data-src="/not-a-real-src">lazy placeholder</div>
    }
    const html = feedEntries(blogOf([post("hello")]), () => renderToStaticMarkup(<Body />))[0]
      ?.html as string
    expect(html).toContain('data-src="/not-a-real-src"')
    expect(html).not.toContain("blog.brand.localhost:3009/not-a-real-src")
  })

  test("resolves a bare #fragment href against the post's own URL", () => {
    function Body() {
      return <a href="#pricing">Jump to pricing</a>
    }
    const html = feedEntries(blogOf([post("hello", { url: "/hello" })]), () =>
      renderToStaticMarkup(<Body />)
    )[0]?.html as string
    expect(html).toContain('href="http://blog.brand.localhost:3009/hello#pricing"')
  })

  test("a code sample's own markup, through the real static map, never looks like a live attribute", async () => {
    // Rendered through the real `mdxStaticComponents` — the same map the feed routes use, not a
    // hand-built stub — React's own HTML escaping turns the sample's quotes into `&quot;`, so
    // `absolutize`'s regexes (which look for a literal `"`) never see anything to match here in
    // the first place.
    const Pre = mdxStaticComponents.pre
    const Code = mdxStaticComponents.code
    async function render(): Promise<string> {
      const stream = await renderToReadableStream(
        createElement(Pre, {}, createElement(Code, {}, '<a href="/x">text</a>'))
      )
      await stream.allReady
      return new Response(stream).text()
    }
    const rendered = await render()
    expect(rendered).toContain("href=&quot;/x&quot;")

    const entries = feedEntries(blogOf([post("hello")]), () => rendered)
    expect(entries[0]?.html).toContain("href=&quot;/x&quot;")
    expect(entries[0]?.html).not.toContain("blog.brand.localhost:3009")
  })

  test('a code sample\'s href="/x" is left alone even with a raw, unescaped quote (defense in depth)', () => {
    // Belt and braces: even if some future change ever hands `absolutize` a `<pre>`/`<code>`
    // block with a real (unescaped) quote character inside — `dangerouslySetInnerHTML`, say,
    // or a non-React rendering path — the whole block is protected wholesale, not just the
    // specific href/src/srcset shapes this file knows about.
    const raw =
      '<p>See <a href="/tags/guides">guides</a>.</p>' +
      '<pre><code>Example: &lt;a href="/x"&gt;text&lt;/a&gt;</code></pre>'
    const html = feedEntries(blogOf([post("hello")]), () => raw)[0]?.html as string
    expect(html).toContain('href="http://blog.brand.localhost:3009/tags/guides"')
    expect(html).toContain('href="/x"')
    expect(html).not.toContain("blog.brand.localhost:3009/x")
  })
})

describe("feedSite", () => {
  test("updated is the newest post's updated date, falling back to its date", () => {
    const entries = feedEntries(
      blogOf([post("newest", { updated: new Date("2026-10-05") }), post("oldest")]),
      () => "<p>x</p>"
    )
    const site = feedSite("Blog", entries)
    expect(site.updated).toEqual(new Date("2026-10-05"))
  })

  test("updated is the max across every entry, not just the newest-dated one", () => {
    // "newest" (by date) was updated first; "oldest" (by date) was updated much more recently —
    // entries[0] alone would pick the wrong one.
    const entries = feedEntries(
      blogOf([
        post("newest", { date: new Date("2026-10-05"), updated: new Date("2026-10-06") }),
        post("oldest", { date: new Date("2026-09-01"), updated: new Date("2026-10-07") }),
      ]),
      () => "<p>x</p>"
    )
    const site = feedSite("Blog", entries)
    expect(site.updated).toEqual(new Date("2026-10-07"))
  })

  test("updated is the build time with no posts", () => {
    const before = new Date()
    const site = feedSite("Blog", [])
    expect((site.updated as Date).getTime()).toBeGreaterThanOrEqual(before.getTime())
  })
})
