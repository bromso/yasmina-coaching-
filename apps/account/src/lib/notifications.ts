import { ORPCError } from "@orpc/client"
import type { ApiClient, Notification, NotificationPreference } from "@repo/api-contract"
import { PLANS } from "@repo/api-contract/billing-plans"
import {
  isOptionalNotificationEmailType,
  type LockedNotificationEmailType,
  NOTIFICATION_CURSOR_PATTERN,
  NOTIFICATION_EMAIL,
  NOTIFICATION_EMAIL_DEFAULT,
  type OptionalNotificationEmailType,
} from "@repo/api-contract/notifications"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import type { FormState } from "@repo/ui/components/form-feedback"
import { type AccountT, accountTranslator } from "./i18n"
import { NOTIFICATIONS_HEADING_ID } from "./notifications-focus"

export type { FormState }
export { NOTIFICATIONS_HEADING_ID }

// The Notifications page (Phase 13 A): its query string, each row's sentence and target, and the
// mark-read action's core. Phase 13 B adds the Email section below it: which optional types also
// arrive by email, and its own save action's core. Rendered by server components and server
// actions only.

/** The page's own query parameters. */
export const UNREAD_PARAM = "unread"
export const CURSOR_PARAM = "cursor"
/** `?error=open`: an **Open** whose workspace switch was refused (left since, or gone). */
export const ERROR_PARAM = "error"

export type NotificationsParams = { unreadOnly: boolean; cursor?: string; openFailed?: boolean }

type SearchValue = string | string[] | undefined
const first = (value: SearchValue) => (Array.isArray(value) ? value[0] : value)

/** The same test the contract applies: the pattern, a time that round-trips, a 32-bit id. */
function isCursor(value: string): boolean {
  const match = NOTIFICATION_CURSOR_PATTERN.exec(value)
  if (!match) return false
  const at = match[1] as string
  const time = new Date(at)
  return (
    !Number.isNaN(time.getTime()) && time.toISOString() === at && Number(match[2]) <= 2_147_483_647
  )
}

/**
 * The filter and page the URL asks for: `?unread=1` keeps only unread rows, `?cursor=…` an older
 * page. A malformed cursor is dropped rather than passed on, so a hand-edited URL shows the first
 * page instead of a failed list.
 */
export function notificationsParams(search: Record<string, SearchValue>): NotificationsParams {
  const cursor = first(search[CURSOR_PARAM])
  return {
    unreadOnly: first(search[UNREAD_PARAM]) === "1",
    ...(cursor !== undefined && isCursor(cursor) ? { cursor } : {}),
    ...(first(search[ERROR_PARAM]) === "open" ? { openFailed: true } : {}),
  }
}

/**
 * The page's URL for one view: the filter kept, the cursor when there is one, `?error=open` when
 * an **Open** was refused, landing on the heading.
 */
export function notificationsHref({ unreadOnly, cursor, openFailed }: NotificationsParams): string {
  const query = new URLSearchParams()
  if (unreadOnly) query.set(UNREAD_PARAM, "1")
  if (cursor) query.set(CURSOR_PARAM, cursor)
  if (openFailed) query.set(ERROR_PARAM, "open")
  const search = query.toString()
  return `/notifications${search ? `?${search}` : ""}#${NOTIFICATIONS_HEADING_ID}`
}

/** Each type's catalog key under `notifications.types` (webhook.disabled has one per reason). */
function sentenceKey(item: Notification): string {
  switch (item.type) {
    case "invitation.received":
      return "invitationReceived"
    case "member.role_changed":
      return "roleChanged"
    case "member.removed":
      return "removed"
    case "workspace.two_factor_required":
      return "twoFactorRequired"
    case "export.ready":
      return "exportReady"
    case "webhook.disabled":
      return item.data.reason === "gone" ? "webhookDisabledGone" : "webhookDisabledFailures"
    case "plan.changed":
      return "planChanged"
  }
}

/**
 * The row's sentence in the page's language, from the names in its `data` — a workspace name, a
 * role, a plan, an endpoint's host — never an email address (none is ever stored).
 */
export function notificationSentence(item: Notification, t: AccountT): string {
  const values: Record<string, string> = {}
  switch (item.type) {
    case "invitation.received":
      values.workspace = item.data.workspaceName
      values.role = t(`notifications.roles.${item.data.role}`)
      break
    case "member.role_changed":
      values.workspace = item.data.workspaceName
      values.to = t(`notifications.roles.${item.data.to}`)
      break
    case "member.removed":
    case "workspace.two_factor_required":
      values.workspace = item.data.workspaceName
      break
    case "export.ready":
      break
    case "webhook.disabled":
      values.workspace = item.data.workspaceName
      values.host = item.data.host
      break
    case "plan.changed":
      values.workspace = item.data.workspaceName
      values.plan = PLANS[item.data.plan].name
      break
  }
  return t(`notifications.types.${sentenceKey(item)}`, values)
}

/** This app's pages a notification can point at. */
export type AccountPage = "/workspace" | "/payments" | "/security" | "/data-privacy"

/**
 * Where a row leads, or null for none:
 * - `href`: a plain link (this app's page, or the app's onboarding page for an invitation, where
 *   pending invitations are listed and accepted — the notification carries no invitation token).
 * - `switchTo`: a page about a workspace other than the current one: opening it switches the
 *   current workspace first (a form, so it works without JavaScript), since every workspace page
 *   here shows the current workspace.
 *
 * A workspace-scoped notification whose `workspaceId` is null (the user has since left, or the
 * workspace is gone) leads nowhere, so a link never points into a workspace they left.
 */
export type NotificationTarget =
  | { kind: "href"; href: string }
  | { kind: "switchTo"; workspaceId: number; page: AccountPage }
  | null

export function notificationTarget(
  item: Notification,
  context: { currentWorkspaceId: number | null; appUrl: string }
): NotificationTarget {
  const inWorkspace = (page: AccountPage): NotificationTarget => {
    if (item.workspaceId === null) return null
    if (item.workspaceId === context.currentWorkspaceId) return { kind: "href", href: page }
    return { kind: "switchTo", workspaceId: item.workspaceId, page }
  }
  switch (item.type) {
    case "invitation.received":
      return { kind: "href", href: `${context.appUrl}/workspaces/new` }
    case "member.role_changed":
    case "webhook.disabled":
      return inWorkspace("/workspace")
    case "plan.changed":
      return inWorkspace("/payments")
    case "workspace.two_factor_required":
      // The Security page is the account's own, not the workspace's: no switch needed.
      return { kind: "href", href: "/security" }
    case "export.ready":
      return { kind: "href", href: "/data-privacy" }
    case "member.removed":
      return null
  }
}

const ACCOUNT_PAGES: ReadonlySet<string> = new Set([
  "/workspace",
  "/payments",
  "/security",
  "/data-privacy",
])

/** Only this app's own pages, never an arbitrary path from a posted form. */
export function isAccountPage(value: unknown): value is AccountPage {
  return typeof value === "string" && ACCOUNT_PAGES.has(value)
}

/**
 * The page's list, or null when it could not be read — the page then says so in place of the
 * list rather than falling into its error boundary.
 */
export async function readNotifications<Page>(
  fetchPage: () => Promise<Page>
): Promise<Page | null> {
  try {
    return await fetchPage()
  } catch {
    return null
  }
}

type MarkReadDeps = {
  api: Pick<ApiClient["notifications"], "markRead">
  locale?: Locale
}

/**
 * **Mark all as read** (`all=1`) or one row's **Mark as read** (`id=<n>`). Only the caller's own
 * rows are ever marked (the api ignores anyone else's ids). A refusal while impersonating, an
 * unusable form or a failed call each answer with a message in the page's language; success
 * carries none — the list and the header's bell re-render, and the bell's live region announces
 * the new count.
 */
export async function markReadCore(deps: MarkReadDeps, fd: FormData): Promise<FormState> {
  const t = accountTranslator(deps.locale ?? DEFAULT_LOCALE)
  const all = fd.get("all") === "1"
  const id = Number(fd.get("id"))
  if (!all && !(Number.isInteger(id) && id > 0 && id <= 2_147_483_647)) {
    return { ok: false, message: t("notifications.markFailed") }
  }
  try {
    await deps.api.markRead(all ? { all: true } : { ids: [id] })
    return { ok: true }
  } catch (error) {
    if (error instanceof ORPCError && error.code === "FORBIDDEN") {
      return { ok: false, message: t("notifications.impersonating") }
    }
    return { ok: false, message: t("notifications.markFailed") }
  }
}

// --- Email section (Phase 13 B): which optional types also arrive by email. ---

/**
 * `account.notificationPreferences.get()`'s read, or null when it could not be read — the Email
 * section then shows a short unavailable note in place of the card's controls, like the list
 * above does for a failed `notifications.list`.
 */
export async function readNotificationPreferences(
  fetchPreferences: () => Promise<NotificationPreference[]>
): Promise<NotificationPreference[] | null> {
  try {
    return await fetchPreferences()
  } catch {
    return null
  }
}

/** The optional types' own rows, narrowed and in `NOTIFICATION_EMAIL.optional` order — what the
 * Email section's checkboxes render. The locked rows are shown separately, read-only. */
export function optionalEmailPreferences(
  preferences: readonly NotificationPreference[]
): { type: OptionalNotificationEmailType; email: boolean }[] {
  const byType = new Map(preferences.map((row) => [row.type, row.email]))
  return NOTIFICATION_EMAIL.optional.map((type) => ({
    type,
    email: byType.get(type) ?? NOTIFICATION_EMAIL_DEFAULT,
  }))
}

/** Each locked type's catalog key under `notifications.email.lockedTypes`. */
function lockedEmailKey(type: LockedNotificationEmailType): string {
  switch (type) {
    case "invitation.received":
      return "invitationReceived"
    case "workspace.two_factor_required":
      return "twoFactorRequired"
    case "export.ready":
      return "exportReady"
    case "webhook.disabled":
      return "webhookDisabled"
  }
}

/** A locked type's read-only line, in the page's language. */
export function notificationEmailLockedLabel(
  type: LockedNotificationEmailType,
  t: AccountT
): string {
  return t(`notifications.email.lockedTypes.${lockedEmailKey(type)}`)
}

export type NotificationEmailChange = { type: OptionalNotificationEmailType; email: boolean }

/**
 * The Email form, decoded: every optional type is posted as a hidden `type` field (so a missing
 * checkbox reads as unchecked rather than as "this type was never on the form"), its checkbox
 * (`email`, same value) says what it should be now, and a hidden `wasEmail` (same value, only for
 * a type that was on when the page rendered) says what it was. Only the types whose answer
 * changed come back — an unknown type name (tampered, or a locked one) is dropped, never sent on.
 */
export function emailPreferenceChanges(fd: FormData): NotificationEmailChange[] {
  const checked = new Set(fd.getAll("email").map(String))
  const was = new Set(fd.getAll("wasEmail").map(String))
  const changes: NotificationEmailChange[] = []
  for (const raw of fd.getAll("type")) {
    const type = String(raw)
    if (!isOptionalNotificationEmailType(type)) continue
    const email = checked.has(type)
    if (email !== was.has(type)) changes.push({ type, email })
  }
  return changes
}

type SetEmailDeps = {
  api: Pick<ApiClient["account"]["notificationPreferences"], "set">
  locale?: Locale
}

/**
 * **Save email settings**: one `set` per optional type whose checkbox changed from how the page
 * rendered it — a save with nothing changed calls the api not at all. Impersonation and any other
 * failure answer their own message; success always says so, even when nothing changed.
 */
export async function setNotificationEmailCore(
  deps: SetEmailDeps,
  fd: FormData
): Promise<FormState> {
  const t = accountTranslator(deps.locale ?? DEFAULT_LOCALE)
  try {
    for (const change of emailPreferenceChanges(fd)) {
      await deps.api.set(change)
    }
    return { ok: true, message: t("notifications.email.saved") }
  } catch (error) {
    if (error instanceof ORPCError && error.code === "FORBIDDEN") {
      return { ok: false, message: t("notifications.impersonating") }
    }
    return { ok: false, message: t("notifications.email.saveFailed") }
  }
}
