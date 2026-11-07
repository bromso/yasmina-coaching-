"use server"

import { refresh, revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  type FormState,
  isAccountPage,
  markReadCore,
  notificationsHref,
  setNotificationEmailCore,
} from "@/lib/notifications"

/**
 * **Mark all as read** and each row's **Mark as read**. On success `refresh()` re-renders the
 * page and its layout — the list and the header's bell, whose live region announces the new
 * count — in place.
 */
export async function markNotificationsRead(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  await auth.requireUser()
  const out = await markReadCore(
    { api: (await auth.api()).notifications, locale: await auth.getLocale() },
    fd
  )
  if (out.ok) refresh()
  return out
}

/**
 * **Save email settings**: only the optional types whose checkbox changed from how the page
 * rendered it, one `set` per change. `refresh()` re-renders the page whatever the outcome: React
 * 19 resets the form to its render-time defaults once the action finishes, so after a failure —
 * or a partial write, the first change saved and a later one refused — only a fresh render makes
 * the boxes show what the server actually holds. The message still shows in place.
 */
export async function saveNotificationEmailSettings(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const auth = getAuth()
  await auth.requireUser()
  const out = await setNotificationEmailCore(
    { api: (await auth.api()).account.notificationPreferences, locale: await auth.getLocale() },
    fd
  )
  refresh()
  return out
}

/**
 * **Open** on a notification about a workspace other than the current one: makes it current
 * (refused for a workspace the user is no member of — the api re-checks), then opens the page.
 * Only this app's own pages, never a posted path. A refusal goes back to the list with
 * `?error=open`, which the page explains — a plain redirect, so it works without JavaScript.
 */
export async function openInWorkspace(fd: FormData): Promise<void> {
  const auth = getAuth()
  await auth.requireUser()
  const id = Number(fd.get("workspaceId"))
  const page = fd.get("page")
  const refused = notificationsHref({ unreadOnly: false, openFailed: true })
  if (!isAccountPage(page) || !Number.isInteger(id) || id <= 0) redirect(refused)
  if (!(await auth.setCurrentWorkspace(id))) redirect(refused)
  // Every page reads the current workspace (the header's menu included).
  revalidatePath("/", "layout")
  redirect(page)
}
