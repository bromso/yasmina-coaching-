import { BRAND_NAME } from "@repo/sites/brand"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import type { BlogLocale, BlogUi } from "@/content/ui"
import { LanguageLink } from "./language-link"

export type BlogHeaderProps = {
  locale: BlogLocale
  ui: BlogUi
  /** www's own address (`siteUrl("www")`), resolved by the server component above. */
  wwwUrl: string
  /** The same page in the other language, or that language's index. */
  languageHref: string
  /** The shared cookies' `Domain`, for the language link's `locale` cookie. */
  cookieDomain?: string
  labels: { nav: string; themeToggle: string }
}

const focus = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
const pill = `inline-flex h-9 items-center rounded-full px-3 transition-colors hover:bg-muted ${focus}`

/**
 * The blog's header: the shared `SiteHeader` in www's look, with the blog's own content — the
 * brand linking home to www, www's Ledarskap inifrån page and this page in the other language as
 * its nav, the theme toggle, and the booking button. Server-rendered and static. Below `sm` the
 * links and the toggle take rows of their own under the brand and "Boka", and the header scrolls
 * away with the page instead of covering it; from `sm` up it stays at the top.
 */
export function BlogHeader({
  locale,
  ui,
  wwwUrl,
  languageHref,
  cookieDomain,
  labels,
}: BlogHeaderProps) {
  const other = locale === "sv" ? "en" : "sv"
  return (
    <SiteHeader
      sticky
      className="max-sm:relative"
      navLabel={labels.nav}
      brand={
        <a href={wwwUrl} className={`truncate rounded-md ${focus}`}>
          {BRAND_NAME}
        </a>
      }
      links={[]}
      nav={
        <ul className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
          <li>
            <a href={`${wwwUrl}/inifran`} className={pill}>
              {ui.header.inner}
            </a>
          </li>
          <li>
            <LanguageLink
              href={languageHref}
              locale={other}
              domain={cookieDomain}
              name={ui.header.language.name}
              className={pill}
            >
              {ui.header.language.label}
            </LanguageLink>
          </li>
        </ul>
      }
      controls={<ThemeToggle label={labels.themeToggle} />}
      end={
        <a
          href={`${wwwUrl}/book`}
          className={`inline-flex h-9 items-center rounded-full bg-primary px-4 text-primary-foreground text-sm tracking-[0.035em] transition-colors hover:bg-primary/90 ${focus}`}
        >
          {ui.header.book}
        </a>
      }
    />
  )
}
