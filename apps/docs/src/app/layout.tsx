import { LOCALE_NAMES, LOCALES } from "@repo/i18n/locales"
import { BRAND_NAME, footerGroups, siteNav, siteUrl } from "@repo/sites"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { Button } from "@repo/ui/components/button"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { SkipLink } from "@repo/ui/components/skip-link"
import { Toaster } from "@repo/ui/components/sonner"
import { StaticLocaleSwitcher } from "@repo/ui/components/static-locale-switcher"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { fontVariables } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import type { ReactElement, ReactNode } from "react"
import { Providers } from "./providers"
import "@/styles/globals.css"

export const metadata: Metadata = {
  // Resolves the per-page OG image URLs (and any other relative metadata URL) to absolute ones.
  metadataBase: new URL(siteUrl("docs")),
  title: {
    default: `${BRAND_NAME} Docs`,
    template: `%s | ${BRAND_NAME}`,
  },
  description: "Docs shell — frontend boilerplate",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Docs",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf4" },
    { media: "(prefers-color-scheme: dark)", color: "#121a1a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))

const SITE = "docs" as const

// Read at build time (the app is static). Production without COOKIE_DOMAIN writes a host-only
// consent cookie, so the choice is not shared with the other subdomains — see the README.
const cookieDomain =
  process.env.COOKIE_DOMAIN ||
  (process.env.NODE_ENV === "production" ? undefined : ".brand.localhost")

const legal = (
  <SiteFooterLegal
    links={[
      { label: "Terms", href: `${siteUrl("www")}/terms` },
      { label: "Privacy", href: `${siteUrl("www")}/privacy` },
    ]}
  />
)

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): ReactElement {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Preconnect to external resources for faster loading */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body className={`${fontVariables} group/body font-sans antialiased`}>
        <SkipLink />
        <WebVitals />
        <BrowserTelemetry />
        <Analytics />
        <Providers>
          <SiteHeader
            brand={<Brand href={siteUrl("www")} />}
            links={siteNav(SITE)}
            controls={
              <>
                <ThemeToggle />
                <StaticLocaleSwitcher domain={cookieDomain} options={LOCALE_OPTIONS} />
                <SignInLink authUrl={siteUrl("auth")} />
              </>
            }
            end={
              <Button asChild size="sm">
                <a href={siteUrl("app")}>Open app</a>
              </Button>
            }
          />
          {children}
          <SiteFooter
            brand={<Brand href={siteUrl("www")} />}
            groups={footerGroups()}
            legal={legal}
          />
          <CookieConsent domain={cookieDomain} privacyHref={`${siteUrl("www")}/privacy`} />
        </Providers>
        <Toaster />
      </body>
    </html>
  )
}
