import type { Blog, Post } from "@repo/content/posts"
import { sitemapFor, siteUrl } from "@repo/sites"
import { BLOG_LOCALES, prefixFor } from "@/content/ui"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

export type SitemapEntry = {
  url: string
  lastModified: Date
  alternates?: { languages: Record<string, string> }
}

/** The newest `updated ?? date` among `posts`, or `undefined` for an empty list. */
function newestOf(posts: Post[]): Date | undefined {
  return posts.reduce<Date | undefined>((latest, post) => {
    const candidate = post.updated ?? post.date
    return !latest || candidate.getTime() > latest.getTime() ? candidate : latest
  }, undefined)
}

/**
 * The blog's full sitemap, both languages: the two indexes (`sitemapFor`, each `lastModified`
 * overwritten with its own language's newest post, linked to each other as hreflang alternates),
 * then per language one entry per post (`lastModified` its own `updated ?? date`, with an
 * alternate when it has a published translation), further list page (`<prefix>/page/<n>`, n >= 2,
 * the language's newest), tag and author (each the newest `updated ?? date` among their own
 * posts). Every path `knownPaths` tracks except the feeds, which a sitemap never lists.
 * `sitemapFor` stamps the static routes with the current time, which survives only for an index
 * whose language has no post yet.
 */
export function blogSitemap(blog: Blog, env?: Env): SitemapEntry[] {
  const base = siteUrl("blog", env)
  const homes = { sv: `${base}/`, en: `${base}/en` }
  const indexAlternates = { languages: { sv: homes.sv, en: homes.en, "x-default": homes.sv } }

  const entries: SitemapEntry[] = sitemapFor("blog", PUBLIC_ROUTES, env).map((entry) => {
    const locale = BLOG_LOCALES.find((l) => homes[l] === entry.url)
    if (!locale) return entry
    const newest = newestOf(blog.inLocale(locale).posts())
    return { ...entry, lastModified: newest ?? entry.lastModified, alternates: indexAlternates }
  })

  for (const locale of BLOG_LOCALES) {
    const own = blog.inLocale(locale)
    const prefix = prefixFor(locale)
    const posts = own.posts()
    const overallNewest = newestOf(posts)

    for (const post of posts) {
      const translation = own.translation(post.slug)
      entries.push({
        url: `${base}${post.url}`,
        lastModified: post.updated ?? post.date,
        ...(translation && {
          alternates: {
            languages: {
              [post.locale]: `${base}${post.url}`,
              [translation.locale]: `${base}${translation.url}`,
              // As on the pages: the Swedish one is the default.
              "x-default": `${base}${(post.locale === "sv" ? post : translation).url}`,
            },
          },
        }),
      })
    }

    const { pages } = own.page(1)
    for (let n = 2; n <= pages; n++) {
      entries.push({ url: `${base}${prefix}/page/${n}`, lastModified: overallNewest ?? new Date() })
    }

    for (const { tag } of own.tags()) {
      const lastModified = newestOf(own.byTag(tag)) ?? new Date()
      entries.push({ url: `${base}${prefix}/tags/${tag}`, lastModified })
    }

    for (const author of own.authors()) {
      const lastModified = newestOf(own.byAuthor(author)) ?? new Date()
      entries.push({ url: `${base}${prefix}/authors/${author}`, lastModified })
    }
  }

  return entries
}
