import { MEMBER_OFFERING_KEYS, OFFERING_KEYS, OFFERINGS } from "@repo/api-contract/booking-limits"
import { LOCALE_NAMES, LOCALES, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND_NAME, footerGroups, relabelFooter, siteUrl } from "@repo/sites"
import { legalUrl } from "@repo/sites/legal"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { SiteHeaderShell } from "@repo/ui/blocks/site-header-shell"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { DevServiceWorkerReset } from "@repo/ui/components/dev-service-worker-reset"
import { SkipLink } from "@repo/ui/components/skip-link"
import { StaticLocaleSwitcher } from "@repo/ui/components/static-locale-switcher"
import { ThemeProvider } from "@repo/ui/components/theme-provider"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { fontVariables } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import type { ExploreNavOffering } from "@/components/site-nav/explore-nav"
import { ExploreNavLoader } from "@/components/site-nav/explore-nav-loader"
import { bookingFor } from "@/content/booking"
import { BOOK_HREF, homeFor } from "@/content/home"
import { mediaFor, OFFERING_MEDIA } from "@/content/media"
import { siteFor } from "@/content/site"
import { getLocale } from "@/lib/locale"
import { OG_LOCALE } from "@/lib/site-locale"
import "@/styles/globals.css"
import { CONTACT_HREF } from "@/content/contact-links"

const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))

/**
 * Swedish by default, English when the visitor picks it (the shared `locale` cookie, read per
 * request by `getLocale()` — so every www page renders dynamically). The shared chrome (nav
 * landmarks, cookie banner, sign-in link, theme toggle, skip link, footer groups) reads the `ui`
 * catalog in that language; the navigation's own words come from `src/content/site.ts`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const { meta } = homeFor(locale)
  const defaultTitle = `${BRAND_NAME} · ${meta.title}`
  return {
    metadataBase: new URL(siteUrl("www")),
    title: { default: defaultTitle, template: `%s | ${BRAND_NAME}` },
    description: meta.description,
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title: defaultTitle,
      description: meta.description,
      locale: OG_LOCALE[locale],
    },
    twitter: { card: "summary_large_image" },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf4" },
    { media: "(prefers-color-scheme: dark)", color: "#121a1a" },
  ],
  width: "device-width",
  initialScale: 1,
}

// COOKIE_DOMAIN as it was at `next build` (`BUILD_COOKIE_DOMAIN`, inlined by next.config.ts's
// `env`). Production without it writes host-only consent and locale cookies, so the choices are
// not shared with the other subdomains — see the README.
const cookieDomain =
  process.env.BUILD_COOKIE_DOMAIN ||
  (process.env.NODE_ENV === "production" ? undefined : ".brand.localhost")

/**
 * The navigation carousel's cards: one per offering the catalog lists (members' sessions are
 * left out, as on `/book`), its name and a short hint in `locale`.
 */
function navOfferings(locale: Locale): ExploreNavOffering[] {
  const booking = bookingFor(locale)
  const media = mediaFor(locale)
  const hint = (key: (typeof OFFERING_KEYS)[number]) => {
    const offering = OFFERINGS[key]
    if (offering.kind === "request") return booking.navHints.request
    if (offering.kind === "group") return booking.navHints.group
    return offering.sessions > 1
      ? booking.navHints.sessions(offering.sessions)
      : `${offering.durationMinutes} min`
  }
  return OFFERING_KEYS.filter((key) => !MEMBER_OFFERING_KEYS.includes(key)).map((key) => {
    const image = media[OFFERING_MEDIA[key]]
    return {
      key,
      label: booking.offerings[key].title,
      hint: hint(key),
      href: `/book/${key}`,
      image: {
        webp: `/media/${image.name}-800.webp`,
        jpg: `/media/${image.name}-800.jpg`,
        width: image.small.width,
        height: image.small.height,
      },
    }
  })
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const t = translatorFor(locale, "ui")
  const site = siteFor(locale)
  const legal = (
    <SiteFooterLegal
      links={[
        { label: site.legal.privacy, href: legalUrl("privacy", locale) },
        { label: site.legal.terms, href: legalUrl("terms", locale) },
        { label: site.legal.accessibility, href: legalUrl("accessibility", locale) },
        { label: site.legal.contact, href: `${siteUrl("www")}${CONTACT_HREF}` },
      ]}
    />
  )
  return (
    <html
      className={fontVariables}
      lang={locale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <SkipLink label={t("skipLink")} />
        <WebVitals />
        <BrowserTelemetry />
        <DevServiceWorkerReset />
        <Analytics />
        <ThemeProvider>
          <SiteHeaderShell sticky>
            <ExploreNavLoader
              brand={{ label: BRAND_NAME, href: siteUrl("www") }}
              book={{ label: site.book, href: BOOK_HREF }}
              bookNote={site.bookNote}
              sections={homeFor(locale).nav.filter((link) => link.href !== BOOK_HREF)}
              offerings={navOfferings(locale)}
              links={[
                { label: t("signIn"), href: `${siteUrl("auth")}/login` },
                { label: site.contact, href: CONTACT_HREF },
              ]}
              controls={
                <>
                  <ThemeToggle label={t("themeToggle")} />
                  <StaticLocaleSwitcher
                    current={locale}
                    domain={cookieDomain}
                    options={LOCALE_OPTIONS}
                    label={site.switcher.label}
                    reloadOnChange
                  />
                </>
              }
              labels={{ nav: t("siteNav"), ...site.nav }}
            />
          </SiteHeaderShell>
          {children}
          <SiteFooter
            brand={<Brand href={siteUrl("www")} />}
            groups={relabelFooter(
              footerGroups(),
              (id) => t(`sites.${id}`),
              (id) => t(`footerGroups.${id}`)
            )}
            navLabel={t("footerNav")}
            legal={legal}
          />
          <CookieConsent
            domain={cookieDomain}
            privacyHref={legalUrl("privacy", locale)}
            labels={{
              region: t("cookieConsent.region"),
              text: t("cookieConsent.text"),
              privacy: t("cookieConsent.privacy"),
              acceptAll: t("cookieConsent.acceptAll"),
              necessaryOnly: t("cookieConsent.necessaryOnly"),
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
