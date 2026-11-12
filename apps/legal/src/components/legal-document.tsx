import { translatorFor } from "@repo/i18n/translate"
import { BRAND_NAME, footerGroups, relabelFooter, siteUrl } from "@repo/sites"
import { type LegalLocale, legalUrl } from "@repo/sites/legal"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { SkipLink } from "@repo/ui/components/skip-link"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { fontVariables } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import type { ReactElement, ReactNode } from "react"
import { Providers } from "@/app/providers"
import { UI } from "@/content/ui"
import { cookieDomain } from "@/lib/cookie-domain"
import "@/styles/globals.css"

/**
 * The legal app has one root layout per language — `src/app/(sv)/layout.tsx` and
 * `src/app/(en)/layout.tsx`, two route groups — because `<html lang>` belongs to the root layout
 * and the app is fully static: a single root layout could not know a page's language at build
 * time without reading the URL at request time. Both render this document, so the chrome is
 * defined once, as the blog's `BlogDocument` does. The footer's legal line and the cookie banner
 * link to this app's own pages in the page's language.
 */

/** Each language's root `metadata`. Every page sets its own canonical and alternates. */
export function documentMetadata(locale: LegalLocale): Metadata {
  const ui = UI[locale]
  return {
    // Resolves the OG/Twitter image URLs (and any relative canonical) against the app's origin.
    metadataBase: new URL(siteUrl("legal")),
    title: { default: `${ui.title} | ${BRAND_NAME}`, template: `%s | ${BRAND_NAME}` },
    description: ui.description,
    manifest: "/manifest.webmanifest",
    openGraph: { siteName: BRAND_NAME, locale: ui.ogLocale },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: ui.title },
    formatDetection: { telephone: false },
  }
}

export const documentViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf4" },
    { media: "(prefers-color-scheme: dark)", color: "#121a1a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export function LegalDocument({
  locale,
  children,
}: {
  locale: LegalLocale
  children: ReactNode
}): ReactElement {
  const ui = UI[locale]
  const t = translatorFor(locale, "ui")
  const www = siteUrl("www")
  const legal = (
    <SiteFooterLegal
      links={[
        { label: ui.legal.privacy, href: legalUrl("privacy", locale) },
        { label: ui.legal.terms, href: legalUrl("terms", locale) },
        { label: ui.legal.accessibility, href: legalUrl("accessibility", locale) },
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
      <head>
        {/* The theme toggle's icon loads from Iconify */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body className="group/body font-sans antialiased">
        <SkipLink label={t("skipLink")} />
        <WebVitals />
        <BrowserTelemetry />
        <Analytics />
        <Providers>
          {children}
          <SiteFooter
            brand={<Brand href={www} />}
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
        </Providers>
      </body>
    </html>
  )
}
