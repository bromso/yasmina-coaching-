/**
 * Dependency-free notification vocabulary: safe for a browser bundle that must not pull in zod or
 * the oRPC contract (both rooted in this package's index, which re-exports this module).
 *
 * A notification is something that happened *to* the signed-in person (Phase 13 A): `apps/api`
 * writes one per recipient inside the change's own transaction (`notifyUser` in
 * apps/api/src/notifications.ts) and `notifications.list` / `unreadCount` / `markRead` read and
 * mark the caller's own rows. `data` holds ids and display names only — never an email address,
 * a token or a secret.
 */
export const NOTIFICATION_TYPES = [
  "invitation.received",
  "member.role_changed",
  "member.removed",
  "workspace.two_factor_required",
  "export.ready",
  "webhook.disabled",
  "plan.changed",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** `notifications.list`'s page size: the default, and the most a caller may ask for. */
export const NOTIFICATIONS_PAGE_SIZE = 20
export const NOTIFICATIONS_MAX_PAGE_SIZE = 50
/** The most ids one `notifications.markRead` call may name. */
export const NOTIFICATIONS_MARK_READ_MAX_IDS = 100
/**
 * The unread count's display cap: `notifications.unreadCount` counts at most one past it, so a
 * client shows `99+` for any count above `NOTIFICATION_UNREAD_CAP` without the api ever counting
 * an unbounded backlog.
 */
export const NOTIFICATION_UNREAD_CAP = 99

/** `notifications.prune` deletes a read notification once it is older than this many days. */
export const NOTIFICATION_READ_RETENTION_DAYS = 30
/** …and any notification, read or not, once it is older than this many days. */
export const NOTIFICATION_RETENTION_DAYS = 90

/**
 * A page cursor: the last row's `createdAt` (ISO 8601 UTC, millisecond precision — how every
 * notification's time is written) and id, joined by `_`. Opaque to callers; only its shape is
 * checked, and the list is always scoped to the caller's own rows, so a forged cursor can only
 * page within them.
 */
export const NOTIFICATION_CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([1-9]\d{0,9})$/

/**
 * Which notification types also arrive by email (Phase 13 B). `locked` types are mailed exactly
 * as they always were and can never be turned off — the invitation itself, a workspace's two-step
 * requirement, a ready data export and a disabled webhook endpoint keep an account and its
 * workspaces working. `optional` types are mailed by default and each can be turned off on its own
 * (`account.notificationPreferences.set`, or the one-click unsubscribe link every such mail
 * carries). The in-app inbox always receives every type either way.
 */
export const NOTIFICATION_EMAIL = {
  locked: [
    "invitation.received",
    "workspace.two_factor_required",
    "export.ready",
    "webhook.disabled",
  ],
  optional: ["member.role_changed", "member.removed", "plan.changed"],
} as const satisfies Record<"locked" | "optional", readonly NotificationType[]>

export type LockedNotificationEmailType = (typeof NOTIFICATION_EMAIL.locked)[number]
export type OptionalNotificationEmailType = (typeof NOTIFICATION_EMAIL.optional)[number]

/** An optional type's email setting when the user never chose one: on. */
export const NOTIFICATION_EMAIL_DEFAULT = true

/** Whether `type` names an optional (user-switchable) email type — never a locked one. */
export const isOptionalNotificationEmailType = (
  type: unknown
): type is OptionalNotificationEmailType =>
  typeof type === "string" && (NOTIFICATION_EMAIL.optional as readonly string[]).includes(type)

/** The longest unsubscribe token `auth.notificationEmail.*` accepts; real ones are far shorter. */
export const NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH = 512
