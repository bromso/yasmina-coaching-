import type { FeedEntry, FeedSite } from "@repo/content/feeds"
import type { Blog } from "@repo/content/posts"
import { siteUrl } from "@repo/sites"
import { authors } from "../../content/authors"
import { BLOG_DESCRIPTION } from "./blog-core"

/** A `<code>…</code>` or `<pre>…</pre>` block, start to its own closing tag. A code sample may
 * show example markup — `<a href="/x">` as literal text — whose quotes are not escaped in HTML
 * text content (only `<`, `>` and `&` are), so they can look exactly like a live attribute to a
 * regex working on the raw markup. Protecting these blocks wholesale keeps that text untouched. */
const CODE_OR_PRE_BLOCK = /<(code|pre)\b[^>]*>[\s\S]*?<\/\1>/g

/** `rewrite` applied only to the parts of `html` outside a `<code>`/`<pre>` block; those blocks
 * pass through unchanged. */
function outsideCode(html: string, rewrite: (chunk: string) => string): string {
  let result = ""
  let lastIndex = 0
  for (const match of html.matchAll(CODE_OR_PRE_BLOCK)) {
    const start = match.index ?? 0
    result += rewrite(html.slice(lastIndex, start))
    result += match[0]
    lastIndex = start + match[0].length
  }
  result += rewrite(html.slice(lastIndex))
  return result
}

/** A `srcset` value's URLs, each becoming absolute like `src`; the trailing density/width
 * descriptor (` 2x`, ` 640w`), if any, is kept as-is. */
function absolutizeSrcset(srcset: string, origin: string): string {
  return srcset
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim()
      const spaceIndex = trimmed.indexOf(" ")
      const url = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex)
      const descriptor = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex)
      const absolute = url.startsWith("/") && !url.startsWith("//") ? `${origin}${url}` : url
      return `${absolute}${descriptor}`
    })
    .join(", ")
}

/**
 * `href="/…`, `src="/…` and every URL inside a `srcset="…"` become absolute against the blog's
 * own origin; a bare `href="#…` fragment resolves against the post's own URL instead — a feed
 * reader has no current page for either to resolve against. `(?<![\w-])`, not `\b`, keeps a
 * hyphenated attribute such as `data-src` untouched (a word boundary sits between `-` and `s`
 * too). Protocol-relative (`//`), absolute and other schemes are left alone, and nothing inside a
 * `<code>`/`<pre>` block is touched at all (see `CODE_OR_PRE_BLOCK`).
 */
function absolutize(html: string, origin: string, postUrl: string): string {
  return outsideCode(html, (chunk) =>
    chunk
      .replace(/(?<![\w-])(href|src)="\/(?!\/)/g, `$1="${origin}/`)
      .replace(/(?<![\w-])href="#/g, `href="${origin}${postUrl}#`)
      // React renders the `srcSet` prop back out with that exact casing, not lowercased (valid
      // HTML — attribute names are case-insensitive), so this matches case-insensitively and
      // keeps whatever casing it found.
      .replace(/(?<![\w-])(srcset)="([^"]*)"/gi, (_match, attr: string, value: string) => {
        return `${attr}="${absolutizeSrcset(value, origin)}"`
      })
  )
}

/**
 * Every published post as a `FeedEntry`, in `blog.posts()`'s own order (newest first): the full
 * post HTML from `render` (the route handlers pass the real renderer — `renderToReadableStream`
 * over the compiled MDX body, read to a string; tests pass a stub) with its relative links and
 * images made absolute, and the author's display name.
 */
export function feedEntries(blog: Blog, render: (slug: string) => string): FeedEntry[] {
  const origin = siteUrl("blog").replace(/\/+$/, "")
  return blog.posts().map((post) => ({
    post,
    html: absolutize(render(post.slug), origin, post.url),
    authorName: authors[post.author]?.name ?? post.author,
  }))
}

/**
 * The feed-level site info shared by the three feeds: `updated` is the max of `updated ?? date`
 * across every entry (not just the first — the newest-*dated* post need not be the most recently
 * *updated* one), or the current time with no posts yet.
 */
export function feedSite(title: string, entries: FeedEntry[]): FeedSite {
  const updated = entries.reduce<Date | undefined>((latest, { post }) => {
    const candidate = post.updated ?? post.date
    return !latest || candidate.getTime() > latest.getTime() ? candidate : latest
  }, undefined)
  return {
    title,
    description: BLOG_DESCRIPTION,
    url: siteUrl("blog"),
    updated: updated ?? new Date(),
  }
}
