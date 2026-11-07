import { loadEnv } from "@repo/session"
import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import {
  notificationsParams,
  readNotificationPreferences,
  readNotifications,
} from "@/lib/notifications"
import { NotificationsView } from "@/views/notifications-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("notifications") }
}

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function Page({ searchParams }: { searchParams: Search }) {
  await connection()
  // `?unread=1` and `?cursor=…`; a malformed cursor is dropped, so a hand-edited URL shows the
  // first page rather than a failed list.
  const params = notificationsParams(await searchParams)
  const auth = getAuth()
  await auth.requireUser()
  // Not workspace-scoped: a workspace's two-step requirement never blocks this page.
  // The unread count is the layout's own (cached per request): Mark all as read shows whenever
  // anything is unread, not only when this page's rows are.
  const [page, me, list, locale, unread, preferences] = await Promise.all([
    readNotifications(async () =>
      (await auth.api()).notifications.list({
        unreadOnly: params.unreadOnly,
        ...(params.cursor ? { cursor: params.cursor } : {}),
      })
    ),
    auth.getMe(),
    auth.listWorkspaces(),
    getLocale(),
    auth.unreadNotificationCount(),
    readNotificationPreferences(async () =>
      (await auth.api()).account.notificationPreferences.get()
    ),
  ])
  const workspace = await auth.currentWorkspace(list)
  const { APP_URL } = loadEnv(["APP_URL"])
  return (
    <NotificationsView
      page={page}
      params={params}
      locale={locale}
      currentWorkspaceId={workspace?.id ?? null}
      appUrl={APP_URL}
      impersonating={Boolean(me?.impersonation)}
      emailVerified={me?.user.emailVerified ?? true}
      unread={unread}
      preferences={preferences}
    />
  )
}
