import { translatorFor } from "@repo/i18n/translate"
import { siteUrl } from "@repo/sites"
import { type BlogLocale, otherLocale, prefixFor, UI } from "@/content/ui"
import { cookieDomain } from "@/lib/cookie-domain"
import { BlogHeader } from "./blog-header"

/**
 * The header of one page, in `locale`: `BlogHeader` with www's address and the shared labels
 * resolved here, on the server. `languageHref` is the page's own translation; without one, the
 * other language's index.
 */
export function PageHeader({
  locale,
  languageHref,
}: {
  locale: BlogLocale
  languageHref?: string
}) {
  const t = translatorFor(locale, "ui")
  return (
    <BlogHeader
      locale={locale}
      ui={UI[locale]}
      wwwUrl={siteUrl("www")}
      languageHref={languageHref ?? (prefixFor(otherLocale(locale)) || "/")}
      cookieDomain={cookieDomain}
      labels={{ nav: t("siteNav"), themeToggle: t("themeToggle") }}
    />
  )
}
