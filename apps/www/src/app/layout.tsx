import { LOCALE_NAMES, LOCALES } from "@repo/i18n/locales"
import { BRAND_NAME, footerGroups, siteNav, siteUrl } from "@repo/sites"
import { SiteFooter } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { Button } from "@repo/ui/components/button"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { SkipLink } from "@repo/ui/components/skip-link"
import { StaticLocaleSwitcher } from "@repo/ui/components/static-locale-switcher"
import { ThemeProvider } from "@repo/ui/components/theme-provider"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { fontSans } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import "@/styles/globals.css"

const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))

const description = "Marketing site shell — frontend boilerplate"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("www")),
  title: { default: BRAND_NAME, template: `%s | ${BRAND_NAME}` },
  description,
  openGraph: { type: "website", siteName: BRAND_NAME, title: BRAND_NAME, description },
  twitter: { card: "summary_large_image" },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  width: "device-width",
  initialScale: 1,
}

const SITE = "www" as const

// Read at build time (the app is static). Production without COOKIE_DOMAIN writes a host-only
// consent cookie, so the choice is not shared with the other subdomains — see the README.
const cookieDomain =
  process.env.COOKIE_DOMAIN ||
  (process.env.NODE_ENV === "production" ? undefined : ".brand.localhost")

const legal = (
  <p className="text-muted-foreground text-xs">
    © {new Date().getFullYear()} {BRAND_NAME} ·{" "}
    <a
      href={`${siteUrl("www")}/terms`}
      className="underline underline-offset-4 hover:text-foreground"
    >
      Terms
    </a>{" "}
    ·{" "}
    <a
      href={`${siteUrl("www")}/privacy`}
      className="underline underline-offset-4 hover:text-foreground"
    >
      Privacy
    </a>
  </p>
)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} font-sans antialiased`}>
        <SkipLink />
        <WebVitals />
        <BrowserTelemetry />
        <Analytics />
        <ThemeProvider>
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
          <CookieConsent domain={cookieDomain} privacyHref="/privacy" />
        </ThemeProvider>
      </body>
    </html>
  )
}
