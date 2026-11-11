import { NOTIFICATION_UNREAD_CAP, roleAtLeast, type WorkspaceList } from "@repo/api-contract"
import { LOCALE_NAMES, LOCALES } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { createLogger } from "@repo/log"
import { loadEnv } from "@repo/session"
import { BRAND_NAME, footerGroups, relabelFooter, relabelNav, siteNav, siteUrl } from "@repo/sites"
import { NotificationBell } from "@repo/ui/blocks/notification-bell"
import { SiteFooter } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Analytics } from "@repo/ui/components/analytics"
import { Brand } from "@repo/ui/components/brand"
import { BrowserTelemetry } from "@repo/ui/components/browser-telemetry"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { ImpersonationBanner } from "@repo/ui/components/impersonation-banner"
import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { SkipLink } from "@repo/ui/components/skip-link"
import { Toaster } from "@repo/ui/components/sonner"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { UserMenu } from "@repo/ui/components/user-menu"
import { WebVitals } from "@repo/ui/components/web-vitals"
import { parseConsent } from "@repo/ui/lib/consent"
import { fontSans } from "@repo/ui/lib/fonts"
import type { Metadata, Viewport } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { NextIntlClientProvider } from "next-intl"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { type ReactElement, type ReactNode, Suspense } from "react"
import { IntlReady } from "@/components/intl-ready"
import { LocaleErrorNotice } from "@/components/locale-error-notice"
import { canUseAdmin } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { setLocale, signOut, switchWorkspace } from "./actions"
import { Providers } from "./providers"
import "@/styles/globals.css"

const logger = createLogger({ service: "auth" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.meta")
  return {
    title: {
      default: `${BRAND_NAME} Auth`,
      template: `%s | ${BRAND_NAME}`,
    },
    description: t("description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Auth",
    },
    formatDetection: {
      telephone: false,
    },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

const legal = (labels: { terms: string; privacy: string }) => (
  <p className="text-muted-foreground text-xs">
    © {new Date().getFullYear()} {BRAND_NAME} ·{" "}
    <a
      href={`${siteUrl("www")}/terms`}
      className="underline underline-offset-4 hover:text-foreground"
    >
      {labels.terms}
    </a>{" "}
    ·{" "}
    <a
      href={`${siteUrl("www")}/privacy`}
      className="underline underline-offset-4 hover:text-foreground"
    >
      {labels.privacy}
    </a>
  </p>
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
  // The header shows who is signed in, so every page renders per request — and `next build`,
  // which has no env in production mode, never reaches getAuth() while prerendering.
  await connection()
  const auth = getAuth()
  const me = await auth.getMe()
  const user = me?.user ?? null
  // The switcher is a nicety here: an api that cannot list workspaces must not break sign-in pages.
  let list: WorkspaceList | null = null
  // The bell's count never fails the page: `unreadNotificationCount` is null on any error.
  let unread: number | null = null
  if (user) {
    const [listed, count] = await Promise.allSettled([
      auth.listWorkspaces(),
      auth.unreadNotificationCount(),
    ])
    if (listed.status === "fulfilled") list = listed.value
    else logger.error("workspaces.list failed", { error: listed.reason })
    unread = count.status === "fulfilled" ? count.value : null
  }
  const workspace = list && (await auth.currentWorkspace(list))
  const { APP_URL, AUTH_URL, COOKIE_DOMAIN } = loadEnv(["APP_URL", "AUTH_URL", "COOKIE_DOMAIN"])
  // Admin is a link only a superadmin (not impersonating) sees; for anyone else /admin is a 404.
  const initialConsent = parseConsent((await headers()).get("cookie"))
  const locale = await getLocale()
  const t = await getTranslations()
  const nav = relabelNav(siteNav("auth"), (id) => t(`ui.sites.${id}`))
  // "Admin" stays English, like the admin pages it leads to (internal tooling, not translated).
  const links = canUseAdmin(me) ? [...nav, { label: "Admin", href: "/admin" }] : nav
  const format = await getFormatter()
  const note = me?.impersonation ? t("auth.layout.impersonating") : undefined
  const pending = list?.pendingInvitations.length ?? 0
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Preconnect to external resources for faster loading */}
        <link rel="preconnect" href="https://api.iconify.design" />
        <link rel="dns-prefetch" href="https://api.iconify.design" />
      </head>
      <body
        className={`${fontSans.variable} group/body flex min-h-svh flex-col font-sans antialiased`}
      >
        <SkipLink label={t("ui.skipLink")} />
        <WebVitals consent={initialConsent} />
        <BrowserTelemetry />
        <Analytics />
        {/* Only what client components read: `auth` (the forms, the error page). The `ui` labels
            reach @repo/ui as props from here, so that namespace never ships to the browser. */}
        <NextIntlClientProvider locale={locale} messages={messagesFor(locale, ["auth"])}>
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
              <SiteHeader
                brand={<Brand href={siteUrl("www")} />}
                links={links}
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
                      label={t("auth.locale.label")}
                    />
                    <ThemeToggle label={t("ui.themeToggle")} />
                  </>
                }
                end={
                  user && (
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
                                newUrl: `${APP_URL}/workspaces/new`,
                                manageUrl: `${siteUrl("account")}/workspace`,
                                canManage: workspace ? roleAtLeast(workspace.role, "admin") : false,
                              }
                            : undefined
                        }
                      />
                    </>
                  )
                }
              />
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
                legal={legal({ terms: t("auth.layout.terms"), privacy: t("auth.layout.privacy") })}
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
