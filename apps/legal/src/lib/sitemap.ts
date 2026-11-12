import type { Legal, LegalDoc } from "@repo/content/legal"
import { sitemapFor, siteUrl } from "@repo/sites"
import { LEGAL_LOCALES } from "@/content/ui"
import { PUBLIC_ROUTES } from "./routes"

type Env = Record<string, string | undefined>

export type SitemapEntry = {
  url: string
  lastModified: Date
  alternates: { languages: Record<string, string> }
}

/** Both languages' addresses of one page, the Swedish one the default (as on the pages). */
export function languagesOf(sv: string, en: string): Record<string, string> {
  return { sv, en, "x-default": sv }
}

/** The newest last update among `docs`. */
function newestOf(docs: LegalDoc[]): Date | undefined {
  return docs.reduce<Date | undefined>(
    (latest, doc) => (!latest || doc.updated > latest ? doc.updated : latest),
    undefined
  )
}

/**
 * The legal app's sitemap: the two indexes (each dated by its own language's newest page), then
 * every page in `legal.docs()` order (each dated by its newest change). Every entry links its
 * counterpart in the other language.
 */
export function legalSitemap(legal: Legal, env?: Env): SitemapEntry[] {
  const base = siteUrl("legal", env)
  const homes = { sv: `${base}/`, en: `${base}/en` }
  // The indexes are the static routes; `sitemapFor` stamps them with the build time, which a
  // language's newest page replaces.
  const indexes = sitemapFor("legal", PUBLIC_ROUTES, env).map((entry) => {
    const locale = LEGAL_LOCALES.find((l) => homes[l] === entry.url)
    const newest = locale && newestOf(legal.inLocale(locale))
    return {
      ...entry,
      lastModified: newest || entry.lastModified,
      alternates: { languages: languagesOf(homes.sv, homes.en) },
    }
  })
  const pages = legal.docs().map((doc) => {
    const other = legal.translation(doc)
    const [sv, en] = doc.locale === "sv" ? [doc, other] : [other, doc]
    return {
      url: `${base}${doc.url}`,
      lastModified: doc.updated,
      alternates: { languages: languagesOf(`${base}${sv.url}`, `${base}${en.url}`) },
    }
  })
  return [...indexes, ...pages]
}
