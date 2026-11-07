import { siteUrl } from "@repo/sites"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

/**
 * A docs page's absolute URL, as its canonical link and the sitemap both give it: the landing page
 * is the bare origin, with no trailing slash, the form Next prints a root canonical in.
 */
export function docsPageUrl(url: string, env?: Env): string {
  const base = siteUrl("docs", env)
  return url === "/" ? base : `${base}${url}`
}

export type SitemapPage = { url: string; updated?: Date }

/**
 * The docs sitemap: every page (`lastModified` its frontmatter's `updated`, omitted when unset —
 * never the build time, which would claim every page changed on every deploy) plus `/all`.
 */
export function docsSitemap(
  pages: SitemapPage[],
  env?: Env
): { url: string; lastModified?: Date }[] {
  const base = siteUrl("docs", env)
  return [
    ...pages.map((page) => ({
      url: docsPageUrl(page.url, env),
      ...(page.updated && { lastModified: page.updated }),
    })),
    ...PUBLIC_ROUTES.map((route) => ({ url: `${base}${route}` })),
  ]
}
