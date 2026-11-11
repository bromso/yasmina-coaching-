import { translatorFor } from "@repo/i18n/translate"
import { BRAND_NAME, footerGroups, relabelFooter, siteUrl } from "@repo/sites"
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
import { type BlogLocale, UI } from "@/content/ui"
import { cookieDomain } from "@/lib/cookie-domain"
import { feedTypes } from "@/lib/feed-types"
import "@/styles/globals.css"

/**
 * The blog has one root layout per language — `src/app/(sv)/layout.tsx` and
 * `src/app/(en)/layout.tsx`, two route groups — because `<html lang>` belongs to the root layout
 * and the blog is fully static: a single root layout could not know a page's language at build
 * time without reading the URL at request time. Both render this document, so the chrome is
 * defined once. Moving between the two languages is a full page load, which the language link
 * is anyway. The header is the one piece each page renders itself (`PageHeader`): its language
 * link points at the page's own translation, which a layout cannot know.
 */

/** Each language's root `metadata`. Every page sets its own canonical and alternates. */
export function documentMetadata(locale: BlogLocale): Metadata {
  const ui = UI[locale]
  return {
    // Resolves the OG/Twitter image URLs (and any relative canonical) against the blog's origin.
    metadataBase: new URL(siteUrl("blog")),
    title: { default: `${ui.title} | ${BRAND_NAME}`, template: `%s | ${BRAND_NAME}` },
    description: ui.description,
    manifest: "/manifest.webmanifest",
    alternates: { types: feedTypes(locale) },
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

export function BlogDocument({
  locale,
  children,
}: {
  locale: BlogLocale
  children: ReactNode
}): ReactElement {
  const ui = UI[locale]
  const t = translatorFor(locale, "ui")
  const www = siteUrl("www")
  const legal = (
    <SiteFooterLegal
      links={[
        { label: ui.legal.terms, href: `${www}/terms` },
        { label: ui.legal.privacy, href: `${www}/privacy` },
      ]}
    />
  )
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* The theme toggle's icon loads from Iconify */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body className={`${fontVariables} group/body font-sans antialiased`}>
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
            privacyHref={`${www}/privacy`}
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
