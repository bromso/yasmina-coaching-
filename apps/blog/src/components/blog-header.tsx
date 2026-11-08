import { BRAND_NAME } from "@repo/sites/brand"
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

/**
 * The blog's header, in www's style: a floating pill with the brand in the display serif linking
 * home to www, www's Ledarskap inifrån page, a link to this page in the other language, the theme
 * toggle and the booking button. Server-rendered and static. On a phone it wraps onto more rows
 * rather than scrolling sideways, and scrolls away with the page instead of covering it.
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
    <header className="relative z-50 flex justify-center px-2.5 pt-2.5 sm:sticky sm:top-[env(safe-area-inset-top,0px)] lg:px-4">
      <nav
        aria-label={labels.nav}
        className="flex w-full max-w-[1024px] flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[18px] bg-background/85 px-4 py-3 shadow-[0_0_0_1px_var(--border)] backdrop-blur-xl"
      >
        <a
          href={wwwUrl}
          className={`truncate rounded-md font-display text-xl leading-tight ${focus}`}
        >
          {BRAND_NAME}
        </a>
        <ul className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
          <li>
            <a
              href={`${wwwUrl}/inifran`}
              className={`inline-flex h-9 items-center rounded-full px-3 transition-colors hover:bg-muted ${focus}`}
            >
              {ui.header.inner}
            </a>
          </li>
          <li>
            <LanguageLink
              href={languageHref}
              locale={other}
              domain={cookieDomain}
              name={ui.header.language.name}
              className={`inline-flex h-9 items-center rounded-full px-3 transition-colors hover:bg-muted ${focus}`}
            >
              {ui.header.language.label}
            </LanguageLink>
          </li>
          <li>
            <ThemeToggle label={labels.themeToggle} className="rounded-full" />
          </li>
          <li>
            <a
              href={`${wwwUrl}/book`}
              className={`inline-flex h-9 items-center rounded-full bg-primary px-4 text-primary-foreground tracking-[0.035em] transition-colors hover:bg-primary/90 ${focus}`}
            >
              {ui.header.book}
            </a>
          </li>
        </ul>
      </nav>
    </header>
  )
}
