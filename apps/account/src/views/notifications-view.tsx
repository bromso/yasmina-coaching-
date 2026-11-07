import type { NotificationPage, NotificationPreference } from "@repo/api-contract"
import { NOTIFICATION_EMAIL } from "@repo/api-contract/notifications"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Label } from "@repo/ui/components/label"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { openInWorkspace } from "@/app/(account)/notifications/actions"
import { BellCurrent } from "@/components/bell-current"
import { NotificationEmailForm } from "@/components/notification-email-form"
import { NotificationMarkForm } from "@/components/notification-mark-form"
import { SettingsCard } from "@/components/settings-card"
import type { AccountT } from "@/lib/i18n"
import {
  NOTIFICATIONS_HEADING_ID,
  type NotificationsParams,
  notificationEmailLockedLabel,
  notificationSentence,
  notificationsHref,
  notificationTarget,
  optionalEmailPreferences,
  UNREAD_PARAM,
} from "@/lib/notifications"

const FILTER_ID = "notifications-unread-only"
const EMAIL_HEADING_ID = "notification-email-heading"

const linkClass = "text-foreground text-sm underline underline-offset-4"

/**
 * The Notifications page: the signed-in user's own notifications, newest first. A server
 * component: the **Unread only** filter is a plain GET form, **Older** / **Newest** plain links,
 * **Open** a link (or, for another workspace's page, a form that switches to it first) and each
 * mark button its own small form — all of it works without JavaScript. The cursor only pages
 * toward older rows, so the way back is **Newest** (filter kept), never "Newer". While
 * impersonating, the list is readable and the mark buttons are absent, with a note saying why.
 */
export function NotificationsView({
  page,
  params,
  locale,
  currentWorkspaceId,
  appUrl,
  impersonating,
  emailVerified,
  unread,
  preferences,
}: {
  /** One page of `notifications.list`; null when it could not be read. */
  page: NotificationPage | null
  params: NotificationsParams
  locale: Locale
  /** The current workspace, so a row about it links straight to its page. */
  currentWorkspaceId: number | null
  /** The app's origin, for an invitation's onboarding page. */
  appUrl: string
  impersonating: boolean
  /** Whether the user's address is verified: an unverified one is mailed none of these. */
  emailVerified: boolean
  /** The user's unread count (all pages); null when it could not be read. */
  unread: number | null
  /** `account.notificationPreferences.get()`'s answer; null when it could not be read. */
  preferences: NotificationPreference[] | null
}) {
  // Sentences are looked up by keys built at runtime; `lib/notifications.ts` takes the plain type.
  const t = useTranslations("account") as unknown as AccountT
  const tEmail = useTranslations("account.notifications.email")
  const newest = params.cursor ? notificationsHref({ unreadOnly: params.unreadOnly }) : undefined
  const older = page?.nextCursor
    ? notificationsHref({ unreadOnly: params.unreadOnly, cursor: page.nextCursor })
    : undefined
  // Anything unread anywhere, not only on this page; this page's own rows when the count is unknown.
  const anyUnread = unread !== null ? unread > 0 : (page?.items.some((item) => !item.read) ?? false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("notifications.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("notifications.intro")}</p>
      </div>

      <BellCurrent />
      <SettingsCard title={t("notifications.list")} titleId={NOTIFICATIONS_HEADING_ID}>
        {params.openFailed && (
          <div className="px-6 py-4">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t("notifications.openFailed")}</AlertDescription>
            </Alert>
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3 px-6 py-4">
          <form
            method="get"
            action={`/notifications#${NOTIFICATIONS_HEADING_ID}`}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="flex items-center gap-2">
              {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
              <input
                type="checkbox"
                id={FILTER_ID}
                name={UNREAD_PARAM}
                value="1"
                defaultChecked={params.unreadOnly}
                className="size-4 accent-primary"
              />
              <Label htmlFor={FILTER_ID} className="text-sm font-normal">
                {t("notifications.filterUnread")}
              </Label>
            </div>
            <Button type="submit" variant="outline" size="sm">
              {t("notifications.filterSubmit")}
            </Button>
          </form>
          {impersonating ? (
            <p className="text-muted-foreground text-sm">{t("notifications.impersonating")}</p>
          ) : (
            anyUnread && <NotificationMarkForm label={t("notifications.markAll")} />
          )}
        </div>

        {page === null ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            {t("notifications.unavailable")}
          </p>
        ) : page.items.length === 0 ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            {params.unreadOnly ? t("notifications.emptyUnread") : t("notifications.empty")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {page.items.map((item) => {
              const sentence = notificationSentence(item, t)
              const date = formatUtcDate(item.createdAt, locale, { time: true })
              const target = notificationTarget(item, { currentWorkspaceId, appUrl })
              const openLabel = t("notifications.openLabel", { sentence, date })
              return (
                <li
                  key={item.id}
                  data-notification-id={item.id}
                  data-read={item.read ? "true" : "false"}
                  className={
                    item.read
                      ? "flex flex-col gap-2 px-6 py-3 text-sm"
                      : "flex flex-col gap-2 border-l-4 border-l-primary bg-muted/40 px-6 py-3 text-sm"
                  }
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {item.read ? (
                        <span className="sr-only">{t("notifications.readText")}</span>
                      ) : (
                        <Badge>{t("notifications.unreadBadge")}</Badge>
                      )}
                      <span className={item.read ? "break-words" : "font-medium break-words"}>
                        {sentence}
                      </span>
                    </p>
                    <time
                      dateTime={item.createdAt}
                      className="text-muted-foreground shrink-0 text-xs sm:pt-0.5"
                    >
                      {date}
                    </time>
                  </div>
                  {(target || (!item.read && !impersonating)) && (
                    <div className="flex flex-wrap items-start gap-3">
                      {target?.kind === "href" && (
                        <a href={target.href} aria-label={openLabel} className={linkClass}>
                          {t("notifications.open")}
                        </a>
                      )}
                      {target?.kind === "switchTo" && (
                        <form action={openInWorkspace}>
                          <input type="hidden" name="workspaceId" value={target.workspaceId} />
                          <input type="hidden" name="page" value={target.page} />
                          <Button
                            type="submit"
                            variant="link"
                            size="sm"
                            aria-label={openLabel}
                            className="h-auto p-0"
                          >
                            {t("notifications.open")}
                          </Button>
                        </form>
                      )}
                      {!item.read && !impersonating && (
                        <NotificationMarkForm
                          id={item.id}
                          label={t("notifications.markRead")}
                          ariaLabel={t("notifications.markReadLabel", { sentence, date })}
                        />
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {(newest || older) && (
          <nav
            aria-label={t("notifications.pages")}
            className="flex flex-wrap gap-x-6 gap-y-2 px-6 py-3"
          >
            {newest && (
              <Link href={newest} prefetch={false} className={linkClass}>
                {t("notifications.newest")}
              </Link>
            )}
            {older && (
              <Link href={older} prefetch={false} className={linkClass}>
                {t("notifications.older")}
              </Link>
            )}
          </nav>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("notifications.email.title")}
        titleId={EMAIL_HEADING_ID}
        description={t("notifications.email.intro")}
      >
        {preferences === null ? (
          <p className="text-muted-foreground px-6 py-4 text-sm">
            {t("notifications.email.unavailable")}
          </p>
        ) : (
          <>
            {!emailVerified && (
              <p className="px-6 pt-4 text-sm">
                {tEmail.rich("unverified", {
                  link: (chunks) => (
                    <a href="/personal-info" className="underline underline-offset-4">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            )}
            <div className="px-6 py-4">
              <NotificationEmailForm
                preferences={optionalEmailPreferences(preferences)}
                impersonating={impersonating}
              />
            </div>
            <div className="flex flex-col gap-2 px-6 py-4">
              <p className="text-sm font-medium">{t("notifications.email.lockedTitle")}</p>
              <ul className="text-muted-foreground list-disc gap-1 pl-5 text-sm">
                {NOTIFICATION_EMAIL.locked.map((type) => (
                  <li key={type}>{notificationEmailLockedLabel(type, t)}</li>
                ))}
              </ul>
            </div>
          </>
        )}
      </SettingsCard>
    </div>
  )
}
