import { messagesFor } from "@repo/i18n/messages"
import { BRAND_NAME } from "@repo/sites"
import { Analytics } from "@repo/ui/components/analytics"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { SkipLink } from "@repo/ui/components/skip-link"
import { Toaster } from "@repo/ui/components/sonner"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { fontVariables } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import { connection } from "next/server"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import type { ReactElement, ReactNode } from "react"
import { IntlReady } from "@/components/intl-ready"
import { Providers } from "./providers"
import "@/styles/globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account.meta")
  return {
    title: {
      default: `${BRAND_NAME} Account`,
      template: `%s | ${BRAND_NAME}`,
    },
    description: t("description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Account",
    },
    formatDetection: {
      telephone: false,
    },
  }
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): Promise<ReactElement> {
  // Every page here is signed in and renders per request; the language is the request's too.
  await connection()
  const locale = await getLocale()
  const t = await getTranslations("ui")
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Preconnect to external resources for faster loading */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body className={`${fontVariables} group/body font-sans antialiased`}>
        <SkipLink label={t("skipLink")} />
        <WebVitals />
        <BrowserTelemetry />
        <Analytics />
        {/* Here rather than in the (account) layout, so error.tsx and not-found.tsx read the
            request's language too. Only what client components read: `account` (the forms, the
            sidebar, the error page); the `ui` labels reach @repo/ui as props, so that namespace
            never ships to the browser. */}
        <NextIntlClientProvider locale={locale} messages={messagesFor(locale, ["account"])}>
          <IntlReady>
            <Providers>{children}</Providers>
          </IntlReady>
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  )
}
