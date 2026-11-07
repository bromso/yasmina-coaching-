import {
  isOptionalNotificationEmailType,
  NOTIFICATION_CURSOR_PATTERN,
  NOTIFICATION_DATA_SCHEMAS,
  type Notification,
  type NotificationDataMap,
  type NotificationPage,
  type NotificationType,
  type OptionalNotificationEmailType,
  userChannel,
} from "@repo/api-contract"
import type { Queries } from "./db"
import { enqueueNotificationEmail, type NotificationEmailDeps } from "./notification-email"
import { type PublishContext, publishAfterCommit } from "./realtime/after-commit"

/**
 * What `notifyUser` needs: a request's `Context`, a job's `JobContext` or the billing mirror's
 * deps all fit. `db` is the pool or a transaction's queries; `tx` (below) wins when given.
 */
export type NotifyContext = PublishContext & {
  db: Queries
  /** The clock the row's `created_at` reads (a job's `now`); the wall clock when absent. */
  now?: () => Date
}

/**
 * An optional email type (`NOTIFICATION_EMAIL.optional`) also needs what mailing it takes, so a
 * caller can never notify one without being able to email it; a locked type needs nothing more —
 * its own mail (if any) is sent by its caller exactly as before.
 */
export type NotifyContextFor<T extends NotificationType> = NotifyContext &
  (T extends OptionalNotificationEmailType ? NotificationEmailDeps : unknown)

/**
 * Writes one notification for `userId` and announces it on `userChannel(userId)` once it is
 * durable. With `tx`, the row is part of the caller's transaction — a rolled-back change creates
 * nothing — and the publish waits for the commit (`tx.afterCommit`); without one, the row is
 * written on the pool and published right after. The publish is fire-and-forget
 * (`publishAfterCommit`): it never fails the change.
 *
 * `data` is validated against the type's strict schema before anything is written, so only the
 * reviewed display keys (ids and names, never an email, token or secret) can be stored. Callers
 * decide the recipients and never pass the actor of the change (see `isActor`).
 *
 * An optional email type (`NOTIFICATION_EMAIL.optional`) is also mailed — enqueued on the same
 * `tx`, so it is rolled back with the change — when the recipient's setting for it is on (see
 * `enqueueNotificationEmail`). The in-app row is written either way. Locked types are untouched
 * here: their callers send their own mail exactly as before.
 */
export async function notifyUser<T extends NotificationType>(
  ctx: NotifyContextFor<T>,
  userId: number,
  type: T,
  data: NotificationDataMap[T],
  options: { tx?: Queries; workspaceId?: number } = {}
): Promise<void> {
  const parsed = NOTIFICATION_DATA_SCHEMAS[type].parse(data)
  const db = options.tx ?? ctx.db
  const { id } = await db.notifications.create({
    userId,
    workspaceId: options.workspaceId ?? null,
    type,
    data: JSON.stringify(parsed),
    createdAt: (ctx.now?.() ?? new Date()).toISOString(),
  })
  if (isOptionalNotificationEmailType(type))
    await enqueueNotificationEmail(
      ctx as NotifyContext & NotificationEmailDeps,
      db,
      { userId, type, data: parsed as NotificationDataMap[typeof type], notificationId: id },
      options.tx !== undefined
    )
  db.afterCommit(() =>
    publishAfterCommit(ctx, userChannel(userId), { type: "notification.created", id })
  )
}

/**
 * Whether `userId` is who made the change — the session's user, or the superadmin impersonating
 * them — so never one of its recipients: nobody is told about their own action, and an
 * impersonation never notifies the impersonator.
 */
export const isActor = (
  context: { user?: { id: number } | null; impersonator?: { id: number } | null },
  userId: number
) => context.user?.id === userId || context.impersonator?.id === userId

/** Parses a page cursor (`<createdAt>_<id>`); the schema already checked its shape. */
const parseCursor = (cursor: string | undefined) => {
  if (cursor === undefined) return undefined
  const match = NOTIFICATION_CURSOR_PATTERN.exec(cursor)
  if (!match) return undefined
  return { createdAt: match[1] as string, id: Number(match[2]) }
}

/**
 * `notifications.list`: the caller's own rows, newest first. A stored row whose type or data no
 * longer matches the contract is skipped and reported, never returned half-shaped.
 */
export async function listNotifications(
  db: Pick<Queries, "notifications">,
  input: { userId: number; cursor?: string; limit: number; unreadOnly: boolean },
  recordFailure: (message: string, error: unknown) => void
): Promise<NotificationPage> {
  const rows = await db.notifications.list({
    userId: input.userId,
    before: parseCursor(input.cursor),
    unreadOnly: input.unreadOnly,
    limit: input.limit + 1,
  })
  const page = rows.slice(0, input.limit)
  const items: Notification[] = []
  for (const row of page) {
    const schema = NOTIFICATION_DATA_SCHEMAS[row.type as NotificationType]
    let data: unknown
    try {
      data = JSON.parse(row.data)
    } catch {
      data = undefined
    }
    const parsed = schema?.safeParse(data)
    if (!parsed?.success) {
      recordFailure("notification unreadable", { id: row.id, type: row.type })
      continue
    }
    items.push({
      id: row.id,
      type: row.type,
      data: parsed.data,
      workspaceId: row.workspace_id,
      createdAt: row.created_at,
      read: row.read_at !== null,
    } as Notification)
  }
  const last = page.at(-1)
  return {
    items,
    nextCursor: rows.length > input.limit && last ? `${last.created_at}_${last.id}` : null,
  }
}
