import { NOTIFICATION_UNREAD_CAP, roleAtLeast } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import { loadEnv } from "@repo/session"
import { footerGroups, relabelFooter, relabelNav, siteNav, siteUrl } from "@repo/sites"
import { type LegalLocale, legalUrl } from "@repo/sites/legal"
import { NotificationBell } from "@repo/ui/blocks/notification-bell"
import { SiteFooter, SiteFooterLegal } from "@repo/ui/blocks/site-footer"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { aboveSidebar } from "@repo/ui/blocks/site-header-shell"
import { Brand } from "@repo/ui/components/brand"
import { CookieConsent } from "@repo/ui/components/cookie-consent"
import { DeletionBanner } from "@repo/ui/components/deletion-banner"
import { ImpersonationBanner } from "@repo/ui/components/impersonation-banner"
import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@repo/ui/components/sidebar"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { UserMenu } from "@repo/ui/components/user-menu"
import { parseConsent } from "@repo/ui/lib/consent"
import { headers } from "next/headers"
import { connection } from "next/server"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { type ReactElement, type ReactNode, Suspense } from "react"
import { cancelDeletion, setLocale, signOut, switchWorkspace } from "@/app/actions"
import { AccountSidebar } from "@/components/account-sidebar"
import { LocaleErrorNotice } from "@/components/locale-error-notice"
import { getAuth } from "@/lib/auth"
import { isNotificationsUrl, NOTIFICATIONS_PATH } from "@/lib/bell-current"
import { LOCALE_OPTIONS } from "@/lib/locale"

/** The footer's legal line: the legal app's pages in the reader's language. */
const legal = (
  locale: LegalLocale,
  labels: Record<"privacy" | "terms" | "accessibility", string>
) => (
  <SiteFooterLegal
    links={[
      { label: labels.privacy, href: legalUrl("privacy", locale) },
      { label: labels.terms, href: legalUrl("terms", locale) },
      { label: labels.accessibility, href: legalUrl("accessibility", locale) },
    ]}
  />
)

/** The bell's accessible name: the ICU plural, "More than 99", or plain when the count is unknown. */
async function bellLabel(count: number | null): Promise<string> {
  const t = await getTranslations("ui.notificationBell")
  if (count === null) return t("unknown")
  if (count > NOTIFICATION_UNREAD_CAP) return t("many", { cap: NOTIFICATION_UNREAD_CAP })
  return t("label", { count })
}

export default async function AccountLayout({
  children,
}: Readonly<{ children: ReactNode }>): Promise<ReactElement> {
  await connection()
  const auth = getAuth()
  const user = await auth.requireUser()
  const me = await auth.getMe()
  // The bell's count never fails the page: `unreadNotificationCount` is null on any error.
  const [list, unread] = await Promise.all([auth.listWorkspaces(), auth.unreadNotificationCount()])
  const workspace = await auth.currentWorkspace(list)
  const { APP_URL, AUTH_URL, COOKIE_DOMAIN } = loadEnv(["APP_URL", "AUTH_URL", "COOKIE_DOMAIN"])
  const headerList = await headers()
  const initialConsent = parseConsent(headerList.get("cookie"))
  // `x-url` is set by the shared security proxy (src/proxy.ts), overwriting any client value. The
  // Notifications page's `BellCurrent` keeps this right across soft navigations.
  const onNotifications = isNotificationsUrl(headerList.get("x-url"))
  const locale = await getLocale()
  const t = await getTranslations()
  const format = await getFormatter()
  const note = me?.impersonation ? t("account.layout.impersonating") : undefined
  const pending = list.pendingInvitations.length
  return (
    <SidebarProvider
      className="flex flex-col"
      labels={{
        toggle: t("account.sidebar.toggle"),
        open: t("account.sidebar.open"),
        close: t("account.sidebar.close"),
        title: t("account.sidebar.title"),
        description: t("account.sidebar.description"),
      }}
    >
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
          text={t("account.layout.deletionScheduled", {
            date: formatUtcDate(me.user.deletionScheduledAt, locale),
          })}
          labels={{ cancel: t("account.layout.cancelDeletion") }}
        />
      )}
      <SiteHeader
        start={<SidebarTrigger className="md:hidden" />}
        sticky
        brand={<Brand href={siteUrl("www")} />}
        links={relabelNav(siteNav("account"), (id) => t(`ui.sites.${id}`))}
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
              label={t("account.locale.label")}
            />
            <ThemeToggle label={t("ui.themeToggle")} />
          </>
        }
        end={
          <>
            <NotificationBell
              count={unread}
              href={NOTIFICATIONS_PATH}
              label={await bellLabel(unread)}
              current={onNotifications}
            />
            <UserMenu
              user={user}
              note={note}
              accountUrl={siteUrl("account")}
              signOut={signOut}
              labels={{
                trigger: t("ui.userMenu.trigger", {
                  name: note ? `${user.name || user.email} ${note}` : user.name || user.email,
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
              workspaces={{
                items: list.items.map(({ id, name, logoUrl }) => ({ id, name, logoUrl })),
                currentId: workspace?.id ?? null,
                switchTo: switchWorkspace,
                pendingInvitations: list.pendingInvitations.length,
                newUrl: `${APP_URL}/workspaces/new`,
                manageUrl: "/workspace",
                canManage: workspace ? roleAtLeast(workspace.role, "admin") : false,
              }}
            />
          </>
        }
      />
      <Suspense fallback={null}>
        <LocaleErrorNotice />
      </Suspense>
      <div className="flex flex-1">
        <AccountSidebar />
        <SidebarInset>
          <div id="main" className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
            {children}
          </div>
        </SidebarInset>
      </div>
      {/* Above the fixed sidebar, which would otherwise cover the footer's start. */}
      <SiteFooter
        brand={<Brand href={siteUrl("www")} />}
        groups={relabelFooter(
          footerGroups(),
          (id) => t(`ui.sites.${id}`),
          (id) => t(`ui.footerGroups.${id}`)
        )}
        navLabel={t("ui.footerNav")}
        legal={legal(locale, {
          privacy: t("ui.footerLegal.privacy"),
          terms: t("ui.footerLegal.terms"),
          accessibility: t("ui.footerLegal.accessibility"),
        })}
        className={aboveSidebar}
      />
      <CookieConsent
        domain={COOKIE_DOMAIN}
        initial={initialConsent}
        privacyHref={legalUrl("privacy", locale)}
        labels={{
          region: t("ui.cookieConsent.region"),
          text: t("ui.cookieConsent.text"),
          privacy: t("ui.cookieConsent.privacy"),
          acceptAll: t("ui.cookieConsent.acceptAll"),
          necessaryOnly: t("ui.cookieConsent.necessaryOnly"),
        }}
      />
    </SidebarProvider>
  )
}
