import type { Blog, Post } from "@repo/content/posts"
import { sitemapFor, siteUrl } from "@repo/sites"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

/** The newest `updated ?? date` among `posts`, or `undefined` for an empty list. */
function newestOf(posts: Post[]): Date | undefined {
  return posts.reduce<Date | undefined>((latest, post) => {
    const candidate = post.updated ?? post.date
    return !latest || candidate.getTime() > latest.getTime() ? candidate : latest
  }, undefined)
}

/**
 * The blog's full sitemap: the static routes (`sitemapFor`, `/` with its `lastModified`
 * overwritten below), one entry per post (`lastModified` its own `updated ?? date`), tag, author
 * (each the newest `updated ?? date` among their own posts) and further list page (`/page/<n>`,
 * n >= 2, the newest overall) — every path `knownPaths` tracks except the feeds, which a sitemap
 * never lists. `sitemapFor` stamps every static route with the current time, which is otherwise
 * never used here: a tag, author or `/page/<n>` entry only exists once at least one post backs
 * it, so the one case that falls back to the build time is `/` on a blog with zero posts.
 */
export function blogSitemap(blog: Blog, env?: Env): { url: string; lastModified: Date }[] {
  const base = siteUrl("blog", env)
  const posts = blog.posts()
  const overallNewest = newestOf(posts)

  const homeUrl = `${base}/`
  const entries = sitemapFor("blog", PUBLIC_ROUTES, env).map((entry) =>
    entry.url === homeUrl && overallNewest ? { ...entry, lastModified: overallNewest } : entry
  )

  for (const post of posts) {
    entries.push({ url: `${base}${post.url}`, lastModified: post.updated ?? post.date })
  }

  const { pages } = blog.page(1)
  for (let n = 2; n <= pages; n++) {
    entries.push({ url: `${base}/page/${n}`, lastModified: overallNewest ?? new Date() })
  }

  for (const { tag } of blog.tags()) {
    const lastModified = newestOf(blog.byTag(tag)) ?? new Date()
    entries.push({ url: `${base}/tags/${tag}`, lastModified })
  }

  for (const author of blog.authors()) {
    const lastModified = newestOf(blog.byAuthor(author)) ?? new Date()
    entries.push({ url: `${base}/authors/${author}`, lastModified })
  }

  return entries
}
