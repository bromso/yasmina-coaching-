import { NOTIFICATION_UNREAD_CAP, roleAtLeast } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import { LOCALE_NAMES, LOCALES } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { BRAND_NAME, footerGroups, relabelFooter, relabelNav, siteNav, siteUrl } from "@repo/sites"
import { NotificationBell } from "@repo/ui/blocks/notification-bell"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { DeletionBanner } from "@repo/ui/components/deletion-banner"
import { ImpersonationBanner } from "@repo/ui/components/impersonation-banner"
import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { SkipLink } from "@repo/ui/components/skip-link"
import { Toaster } from "@repo/ui/components/sonner"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { UserMenu } from "@repo/ui/components/user-menu"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { parseConsent } from "@repo/ui/lib/consent"
import { fontVariables } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { NextIntlClientProvider } from "next-intl"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { type ReactElement, type ReactNode, Suspense } from "react"
import { IntlReady } from "@/components/intl-ready"
import { LiveNotificationRefresh } from "@/components/live-notification-refresh"
import { LocaleErrorNotice } from "@/components/locale-error-notice"
import { getAuth } from "@/lib/auth"
import { loadEnv } from "@/lib/env"
import { cancelDeletion, setLocale, signOut, switchWorkspace } from "./actions"
import { Providers } from "./providers"
import "@/styles/globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta")
  return {
    title: {
      default: `${BRAND_NAME} App`,
      template: `%s | ${BRAND_NAME}`,
    },
    description: t("description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "App",
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

const legal = (labels: { terms: string; privacy: string }) => (
  <SiteFooterLegal
    links={[
      { label: labels.terms, href: `${siteUrl("www")}/terms` },
      { label: labels.privacy, href: `${siteUrl("www")}/privacy` },
    ]}
  />
)

/** Each language named in itself, for the switcher. */
const LOCALE_OPTIONS = LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))

/** The bell's accessible name: the ICU plural, "More than 99", or plain when the count is unknown. */
async function bellLabel(count: number | null): Promise<string> {
  const t = await getTranslations("ui.notificationBell")
  if (count === null) return t("unknown")
  if (count > NOTIFICATION_UNREAD_CAP) return t("many", { cap: NOTIFICATION_UNREAD_CAP })
  return t("label", { count })
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>): Promise<ReactElement> {
  // Every page shows who is signed in, so every page renders per request — and `next build`,
  // which has no env in production mode, never reaches getAuth() while prerendering.
  await connection()
  const auth = getAuth()
  const me = await auth.getMe()
  const user = me?.user ?? null
  // The bell's count never fails the page: `unreadNotificationCount` is null on any error.
  const [list, unread] = user
    ? await Promise.all([auth.listWorkspaces(), auth.unreadNotificationCount()])
    : [null, null]
  const workspace = list && (await auth.currentWorkspace(list))
  const { AUTH_URL, APP_URL, COOKIE_DOMAIN } = loadEnv(["AUTH_URL", "APP_URL", "COOKIE_DOMAIN"])
  const headerList = await headers()
  // `x-url` is set by the shared security proxy (src/proxy.ts), overwriting any client value.
  const current = headerList.get("x-url") ?? APP_URL
  const initialConsent = parseConsent(headerList.get("cookie"))
  const locale = await getLocale()
  const t = await getTranslations()
  const format = await getFormatter()
  const note = me?.impersonation ? t("app.layout.impersonating") : undefined
  const pending = list?.pendingInvitations.length ?? 0
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Preconnect to external resources for faster loading */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body className={`${fontVariables} group/body font-sans antialiased`}>
        <SkipLink label={t("ui.skipLink")} />
        <WebVitals consent={initialConsent} />
        <BrowserTelemetry />
        <Analytics />
        {/* Only what client components read: `app` (the forms, the live notes, the error page).
            The `ui` labels reach @repo/ui as props from here, so that namespace never ships to
            the browser. */}
        <NextIntlClientProvider locale={locale} messages={messagesFor(locale, ["app"])}>
          <IntlReady>
            <Providers>
              {me?.impersonation && (
                <ImpersonationBanner
                  name={me.user.name}
                  email={me.user.email}
                  reason={me.impersonation.reason}
                  expiresAt={me.impersonation.expiresAt}
                  stopUrl={`${AUTH_URL}/admin/stop`}
                  labels={{
                    viewingAs: t("ui.impersonation.viewingAs"),
                    ends: t("ui.impersonation.ends"),
                    stop: t("ui.impersonation.stop"),
                  }}
                  endsAtText={t("ui.impersonation.endsAt", {
                    time: format.dateTime(new Date(me.impersonation.expiresAt), {
                      hour: "2-digit",
                      minute: "2-digit",
                      hourCycle: "h23",
                      timeZone: "UTC",
                    }),
                  })}
                />
              )}
              {me?.user.deletionScheduledAt && (
                <DeletionBanner
                  deletionScheduledAt={me.user.deletionScheduledAt}
                  cancel={cancelDeletion}
                  text={t("app.layout.deletionScheduled", {
                    date: formatUtcDate(me.user.deletionScheduledAt, locale),
                  })}
                  labels={{ cancel: t("app.layout.cancelDeletion") }}
                />
              )}
              <SiteHeader
                brand={<Brand href={siteUrl("www")} />}
                links={relabelNav(siteNav("app"), (id) => t(`ui.sites.${id}`))}
                navLabel={t("ui.siteNav")}
                mobileLabels={{
                  open: t("ui.menu.open"),
                  title: t("ui.menu.title"),
                  close: t("ui.menu.close"),
                }}
                controls={
                  <>
                    <LocaleSwitcher
                      current={locale}
                      options={LOCALE_OPTIONS}
                      action={setLocale}
                      label={t("app.locale.label")}
                    />
                    <ThemeToggle label={t("ui.themeToggle")} />
                  </>
                }
                end={
                  user ? (
                    <>
                      <NotificationBell
                        count={unread}
                        href={`${siteUrl("account")}/notifications`}
                        label={await bellLabel(unread)}
                      />
                      <UserMenu
                        user={user}
                        note={note}
                        accountUrl={siteUrl("account")}
                        signOut={signOut}
                        labels={{
                          trigger: t("ui.userMenu.trigger", {
                            name: note
                              ? `${user.name || user.email} ${note}`
                              : user.name || user.email,
                            pending,
                          }),
                          workspace: t("ui.userMenu.workspace"),
                          noWorkspace: t("ui.userMenu.noWorkspace"),
                          createWorkspace: t("ui.userMenu.createWorkspace"),
                          manageMembers: t("ui.userMenu.manageMembers"),
                          invitations: t("ui.userMenu.invitations"),
                          account: t("ui.userMenu.account"),
                          signOut: t("ui.userMenu.signOut"),
                        }}
                        workspaces={
                          list
                            ? {
                                items: list.items.map(({ id, name, logoUrl }) => ({
                                  id,
                                  name,
                                  logoUrl,
                                })),
                                currentId: workspace?.id ?? null,
                                switchTo: switchWorkspace,
                                pendingInvitations: list.pendingInvitations.length,
                                newUrl: "/workspaces/new",
                                manageUrl: `${siteUrl("account")}/workspace`,
                                canManage: workspace ? roleAtLeast(workspace.role, "admin") : false,
                              }
                            : undefined
                        }
                      />
                    </>
                  ) : (
                    <SignInLink authUrl={AUTH_URL} next={current} label={t("ui.signIn")} />
                  )
                }
              />
              {user && <LiveNotificationRefresh renderedAt={Date.now()} />}
              <Suspense fallback={null}>
                <LocaleErrorNotice />
              </Suspense>
              {children}
              <SiteFooter
                brand={<Brand href={siteUrl("www")} />}
                groups={relabelFooter(
                  footerGroups(),
                  (id) => t(`ui.sites.${id}`),
                  (id) => t(`ui.footerGroups.${id}`)
                )}
                navLabel={t("ui.footerNav")}
                legal={legal({ terms: t("app.layout.terms"), privacy: t("app.layout.privacy") })}
              />
              <CookieConsent
                domain={COOKIE_DOMAIN}
                initial={initialConsent}
                privacyHref={`${siteUrl("www")}/privacy`}
                labels={{
                  region: t("ui.cookieConsent.region"),
                  text: t("ui.cookieConsent.text"),
                  privacy: t("ui.cookieConsent.privacy"),
                  acceptAll: t("ui.cookieConsent.acceptAll"),
                  necessaryOnly: t("ui.cookieConsent.necessaryOnly"),
                }}
              />
            </Providers>
          </IntlReady>
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  )
}
