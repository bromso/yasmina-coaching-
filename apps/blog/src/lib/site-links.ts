import { SITES, type SiteId, siteUrl } from "@repo/sites"

type Env = Record<string, string | undefined>

/**
 * A post's link to another app of the site, `<app>:/<path>` (`www:/book`), as the absolute URL it
 * stands for: `siteUrl("www")` + `/book`, read at build time so one post works on every domain.
 * Every other href (root-relative, `https:`, `mailto:`, `#…`) comes back unchanged. The build has
 * already refused a malformed site link (`siteLinkProblems` in `blog-core.ts`). Server-only: it
 * reads `SITE_DOMAIN`.
 */
export function resolveSiteHref(href: string | undefined, env?: Env): string | undefined {
  const match = href?.match(/^([a-z]+):(\/.*)$/i)
  const id = match?.[1]?.toLowerCase()
  if (!match || !id || !Object.hasOwn(SITES, id)) return href
  return `${siteUrl(id as SiteId, env)}${match[2] === "/" ? "" : match[2]}`
}
