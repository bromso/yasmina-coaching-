import type { FeedEntry, FeedSite } from "@repo/content/feeds"
import { mdxStaticComponents } from "@repo/ui/components/mdx/static"
import { createElement } from "react"
import { renderToReadableStream } from "react-dom/server.edge"
import { BlogLink } from "@/components/blog-link"
import type { BlogLocale } from "@/content/ui"
import { blog, postPage } from "@/lib/blog"
import { feedEntries, feedSite } from "@/lib/feed-entries"

/**
 * The post's full-content HTML: its compiled MDX body, rendered with `mdxStaticComponents`
 * (`@repo/ui/components/mdx/static` — no Client Component anywhere in its graph, checked by its
 * own guard test in `packages/ui`).
 *
 * `renderToStaticMarkup` cannot be imported here — verified on Next 16.2.12, it refuses the bare
 * specifier `"react-dom/server"` in a route handler at *compile* time ("You're importing a
 * component that imports react-dom/server … render or return the content directly as a Server
 * Component instead"), before the module even resolves. `"react-dom/server.edge"` is not banned:
 * in 16.2.12's `create-compiler-aliases.js` it is aliased, in the RSC layer, to
 * `next/dist/build/webpack/alias/react-dom-server.js` — a shim that throws for `renderToString`
 * and `renderToStaticMarkup` but still re-exports Fizz's real `renderToReadableStream` — so this
 * imports that instead and reads the stream to a string. If a future Next version closes this
 * gap, the import fails at *build* time with a webpack/module error — loudly, not with silently
 * broken feeds.
 *
 * Throws (rather than returning `""`) when a post that `blog.posts()` lists has no fumadocs page
 * — a post/page mismatch is a bug, not an empty feed entry.
 */
export async function renderPostHtml(slug: string): Promise<string> {
  const page = postPage(slug)
  if (!page) {
    throw new Error(`renderPostHtml: no page for published post "${slug}" (post/page mismatch)`)
  }
  const stream = await renderToReadableStream(
    createElement(page.data.body, { components: { ...mdxStaticComponents, a: BlogLink } })
  )
  await stream.allReady
  return new Response(stream).text()
}

/** Every published post of one language, its HTML rendered once each, as a lookup
 * `feedEntries` can call synchronously. */
async function renderedEntries(locale: BlogLocale): Promise<FeedEntry[]> {
  const own = blog.inLocale(locale)
  const posts = own.posts()
  const html = new Map(
    await Promise.all(
      posts.map(async (post) => [post.slug, await renderPostHtml(post.slug)] as const)
    )
  )
  return feedEntries(own, (slug) => {
    const rendered = html.get(slug)
    if (rendered === undefined) {
      throw new Error(`renderedEntries: "${slug}" was not pre-rendered`)
    }
    return rendered
  })
}

/**
 * Builds one of the three feeds (`rssFeed`, `atomFeed` or `jsonFeed`) of one language and wraps
 * it in a `Response` with the given `content-type`. The one thing each feed route does.
 */
export async function feedResponse(
  feedFn: (site: FeedSite, entries: FeedEntry[]) => string,
  contentType: string,
  locale: BlogLocale
): Promise<Response> {
  const entries = await renderedEntries(locale)
  const site = feedSite(locale, entries)
  return new Response(feedFn(site, entries), { headers: { "content-type": contentType } })
}
