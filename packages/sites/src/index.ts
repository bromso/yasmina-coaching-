/**
 * Every app of this site, and how to link between them. Pure TypeScript for server components,
 * next config and tests; pass computed hrefs to client components as props
 * (`process.env.SITE_DOMAIN` is not inlined into the browser bundle). Rename a project by setting
 * SITE_DOMAIN.
 */

export { BRAND_NAME } from "./brand"

export const SITES = {
  www: { label: "Home", port: 3000 },
  app: { label: "App", port: 3001 },
  auth: { label: "Sign in", port: 3002 },
  account: { label: "Account", port: 3003 },
  docs: { label: "Docs", port: 3004 },
  help: { label: "Help", port: 3005 },
  jobs: { label: "Jobs", port: 3006 },
  blog: { label: "Blog", port: 3009 },
  legal: { label: "Legal", port: 3010 },
} as const

export type SiteId = keyof typeof SITES
type Env = Record<string, string | undefined>

const DEV_DOMAIN = "brand.localhost"
let warned = false

/** Test-only: forget that the missing-SITE_DOMAIN warning was printed. */
export function __resetSiteDomainWarning() {
  warned = false
}

/** SITE_DOMAIN normalised (scheme, leading dots and trailing slashes dropped), or undefined. */
function configuredDomain(env: Env): string | undefined {
  return (
    env.SITE_DOMAIN?.trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^\.+/, "")
      .replace(/\/+$/, "") || undefined
  )
}

/**
 * The parent domain every app lives under (`brand.localhost` until SITE_DOMAIN is set), so a
 * caller can tell one of our own hosts (`<domain>` itself or any `*.<domain>`) from anyone
 * else's. Never warns: `siteUrl` already does.
 */
export function siteDomain(env: Env = process.env): string {
  return (configuredDomain(env) ?? DEV_DOMAIN).toLowerCase()
}

/**
 * SITE_HOST_PREFIX, lowercase letters, digits and hyphens only (anything else is ignored): put in
 * front of every app id on a real domain, so a staging stack can share a parent domain with
 * other things (`yas-` → `https://yas-www.example.com`). Never applied to `.localhost`.
 */
function hostPrefix(env: Env): string {
  const prefix = env.SITE_HOST_PREFIX?.trim().toLowerCase() ?? ""
  return /^[a-z0-9-]*$/.test(prefix) ? prefix : ""
}

/**
 * `http://<id>.brand.localhost:<port>` until SITE_DOMAIN is set; a `.localhost` domain keeps the
 * dev form, anything else is `https://<id>.<domain>`. A leading scheme or dot and trailing slashes
 * are dropped, so `https://brand.com/` and `.brand.com` both mean `brand.com`. Never throws: `next build` always runs in
 * production mode, so a missing value warns once instead of failing every local build.
 */
export function siteUrl(id: SiteId, env: Env = process.env): string {
  const domain = configuredDomain(env)
  if (!domain && env.NODE_ENV === "production" && !warned) {
    warned = true
    console.warn("[sites] SITE_DOMAIN is not set — cross-app links point at brand.localhost")
  }
  const host = domain ?? DEV_DOMAIN
  return host.endsWith(".localhost") || host === "localhost"
    ? `http://${id}.${host}:${SITES[id].port}`
    : `https://${hostPrefix(env)}${id}.${host}`
}

/**
 * A content link to another app of the site, `<app>:/<path>` (`www:/book`), as the absolute URL it
 * stands for: `siteUrl("www")` + `/book`, read at build time so one MDX page works on every domain.
 * Every other href (root-relative, `https:`, `mailto:`, `#…`) comes back unchanged, and so does an
 * unknown app id. The blog and the legal app render their MDX `a` through it. Server-only, like
 * `siteUrl`: it reads `SITE_DOMAIN`.
 */
export function resolveSiteHref(href: string | undefined, env?: Env): string | undefined {
  const match = href?.match(/^([a-z]+):(\/.*)$/i)
  const id = match?.[1]?.toLowerCase()
  if (!match || !id || !Object.hasOwn(SITES, id)) return href
  return `${siteUrl(id as SiteId, env)}${match[2] === "/" ? "" : match[2]}`
}

const NAV: readonly SiteId[] = ["app", "docs", "blog", "help", "jobs"]

/** The cross-app navigation, with the current app flagged (rendered as text, not a link). */
export function siteNav(current: SiteId, env: Env = process.env) {
  return NAV.map((id) => ({
    id,
    label: SITES[id].label,
    href: siteUrl(id, env),
    current: id === current,
  }))
}

export type FooterGroupId = "product" | "company" | "account"
type FooterLink = { id: SiteId; label: string; href: string }
export type SiteFooterGroup = { id: FooterGroupId; title: string; links: FooterLink[] }

/** The footer's link groups; the same on every app. */
export function footerGroups(env: Env = process.env): SiteFooterGroup[] {
  const link = (id: SiteId): FooterLink => ({ id, label: SITES[id].label, href: siteUrl(id, env) })
  return [
    { id: "product", title: "Product", links: [link("app"), link("docs")] },
    { id: "company", title: "Company", links: [link("blog"), link("jobs"), link("help")] },
    { id: "account", title: "Account", links: [link("auth"), link("account")] },
  ]
}

/**
 * `siteNav()`'s links with each label replaced through `site`, by id — how a translated app
 * relabels them from its catalog (`ui.sites.<id>`). Ids, hrefs and `current` are unchanged; the
 * static apps keep the English labels.
 */
export function relabelNav<T extends { id: SiteId; label: string }>(
  links: T[],
  site: (id: SiteId) => string
): Array<Omit<T, "label"> & { label: string }> {
  return links.map((link) => ({ ...link, label: site(link.id) }))
}

/** `footerGroups()` relabelled the same way: link labels through `site`, titles through `group`. */
export function relabelFooter(
  groups: SiteFooterGroup[],
  site: (id: SiteId) => string,
  group: (id: FooterGroupId) => string
): SiteFooterGroup[] {
  return groups.map((g) => ({ ...g, title: group(g.id), links: relabelNav(g.links, site) }))
}

/**
 * The app's sitemap entries, structurally a `MetadataRoute.Sitemap` (this package does not import
 * `next`; the app's `sitemap.ts` annotates the type).
 */
export function sitemapFor(id: SiteId, routes: readonly string[], env: Env = process.env) {
  const base = siteUrl(id, env)
  const lastModified = new Date()
  return routes.map((route) => ({ url: `${base}${route}`, lastModified }))
}

/**
 * The app's robots rules, structurally a `MetadataRoute.Robots`; `disallow` is omitted when empty.
 * `disallow: ["/"]` drops the `allow: "/"`: under RFC 9309 an equally specific Allow wins.
 */
export function robotsFor(
  id: SiteId,
  { disallow = [] }: { disallow?: string[] } = {},
  env: Env = process.env
) {
  return {
    rules: [
      {
        userAgent: "*",
        ...(disallow.includes("/") ? {} : { allow: "/" }),
        ...(disallow.length ? { disallow } : {}),
      },
    ],
    sitemap: `${siteUrl(id, env)}/sitemap.xml`,
  }
}
