import { translatorFor } from "@repo/i18n/translate"
import { siteUrl } from "@repo/sites"
import { BRAND_NAME } from "@repo/sites/brand"
import type { LegalLocale } from "@repo/sites/legal"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { navPill } from "@repo/ui/components/nav-pill"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { indexPath, otherLocale, UI } from "@/content/ui"
import { cookieDomain } from "@/lib/cookie-domain"
import { LanguageLink } from "./language-link"

const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
/** The nav's links: the shared pill at the h-9 controls' height, in the text's own colour. */
const pill = navPill({ size: "md", className: "text-foreground" })

/**
 * The header of one page, in `locale`: the shared `SiteHeader` in www's look, as the blog's — the
 * brand linking home to www, and as its nav the legal index, this page in the other language and
 * the theme toggle. `languageHref` is the page's own translation; without one, the other
 * language's index. Server-rendered and static; below `sm` the list wraps under the brand and the
 * header scrolls away with the page.
 */
export function PageHeader({
  locale,
  languageHref,
}: {
  locale: LegalLocale
  languageHref?: string
}) {
  const ui = UI[locale]
  const other = otherLocale(locale)
  const t = translatorFor(locale, "ui")
  return (
    <SiteHeader
      sticky
      className="max-sm:relative"
      navLabel={t("siteNav")}
      brand={
        <a href={siteUrl("www")} className={`truncate rounded-md ${focus}`}>
          {BRAND_NAME}
        </a>
      }
      links={[]}
      nav={
        <ul className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
          <li>
            <a href={indexPath(locale)} className={pill}>
              {ui.title}
            </a>
          </li>
          <li>
            <LanguageLink
              href={languageHref ?? indexPath(other)}
              locale={other}
              domain={cookieDomain}
              name={ui.header.language.name}
              className={pill}
            >
              {ui.header.language.label}
            </LanguageLink>
          </li>
          <li>
            <ThemeToggle label={t("themeToggle")} />
          </li>
        </ul>
      }
    />
  )
}
