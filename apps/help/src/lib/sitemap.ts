import { siteUrl } from "@repo/sites"
import type { HelpArticle, HelpCategory } from "./help-core"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

/**
 * A help page's absolute URL, as its canonical link and the sitemap both give it: the home page is
 * the bare origin, with no trailing slash, the form Next prints a root canonical in.
 */
export function helpPageUrl(path: string, env?: Env): string {
  const base = siteUrl("help", env)
  return path === "/" ? base : `${base}${path}`
}

/**
 * The help center's full sitemap: the home page, every category, every article (`lastModified` its
 * frontmatter's `updated`, omitted when unset — never the build time, which would claim every page
 * changed on every deploy) and `/all`.
 */
export function helpSitemap(
  categories: Pick<HelpCategory, "slug">[],
  articles: Pick<HelpArticle, "path" | "updated">[],
  env?: Env
): { url: string; lastModified?: Date }[] {
  const base = siteUrl("help", env)
  return [
    { url: base },
    ...categories.map((category) => ({ url: `${base}/${category.slug}` })),
    ...articles.map((article) => ({
      url: `${base}${article.path}`,
      ...(article.updated && { lastModified: article.updated }),
    })),
    ...PUBLIC_ROUTES.map((route) => ({ url: `${base}${route}` })),
  ]
}
