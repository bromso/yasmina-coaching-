import { z } from "zod"
import { PLAN_KEYS } from "./billing-plans"
import {
  NOTIFICATION_CURSOR_PATTERN,
  NOTIFICATION_EMAIL,
  NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH,
  NOTIFICATION_TYPES,
  NOTIFICATION_UNREAD_CAP,
  NOTIFICATIONS_MARK_READ_MAX_IDS,
  NOTIFICATIONS_MAX_PAGE_SIZE,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationType,
} from "./notifications"
import { ROLES } from "./roles"

// The `notifications.*` shapes. Kept apart from the dependency-free `./notifications` (which a
// client component may import) because these need zod.

const workspaceName = z.string()

/**
 * What each type's `data` holds: ids and display names, never an email address, token or secret.
 * Strict, so a key nobody reviewed can never be stored or returned.
 */
export const NOTIFICATION_DATA_SCHEMAS = {
  "invitation.received": z.strictObject({
    workspaceName,
    role: z.enum(ROLES),
    invitationId: z.number().int().positive(),
  }),
  "member.role_changed": z.strictObject({
    workspaceName,
    from: z.enum(ROLES),
    to: z.enum(ROLES),
  }),
  "member.removed": z.strictObject({ workspaceName }),
  "workspace.two_factor_required": z.strictObject({ workspaceName }),
  "export.ready": z.strictObject({}),
  "webhook.disabled": z.strictObject({
    workspaceName,
    /** The endpoint URL's host (with a non-default port), never its path or query. */
    host: z.string(),
    reason: z.enum(["failures", "gone"]),
  }),
  "plan.changed": z.strictObject({ workspaceName, plan: z.enum(PLAN_KEYS) }),
} satisfies Record<NotificationType, z.ZodType>

export type NotificationDataMap = {
  [T in NotificationType]: z.infer<(typeof NOTIFICATION_DATA_SCHEMAS)[T]>
}

/** A cursor whose shape is valid and whose time and id are real values. */
const isCursor = (value: string) => {
  const match = NOTIFICATION_CURSOR_PATTERN.exec(value)
  if (!match) return false
  const [, at, id] = match
  // An impossible date (month 13) is an Invalid Date, whose toISOString throws: check it first.
  const date = new Date(at as string)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString() === at && Number(id) <= 2_147_483_647 // a 32-bit id
  )
}

export const ListNotificationsSchema = z
  .object({
    cursor: z.string().max(40).refine(isCursor, "Invalid cursor").optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(NOTIFICATIONS_MAX_PAGE_SIZE)
      .default(NOTIFICATIONS_PAGE_SIZE),
    /** Only the caller's unread rows. Accepts `"true"` / `"false"` from a query string. */
    unreadOnly: z
      .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
      .default(false),
  })
  .optional()
  .default({ limit: NOTIFICATIONS_PAGE_SIZE, unreadOnly: false })

const base = {
  id: z.number().int(),
  /**
   * The workspace the notification is about, only while the caller is still a member of it — else
   * null, so a link never points into a workspace they left (or one that is gone).
   */
  workspaceId: z.number().int().nullable(),
  createdAt: z.string(),
  read: z.boolean(),
}

export const NotificationSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("invitation.received"),
    data: NOTIFICATION_DATA_SCHEMAS["invitation.received"],
  }),
  z.object({
    ...base,
    type: z.literal("member.role_changed"),
    data: NOTIFICATION_DATA_SCHEMAS["member.role_changed"],
  }),
  z.object({
    ...base,
    type: z.literal("member.removed"),
    data: NOTIFICATION_DATA_SCHEMAS["member.removed"],
  }),
  z.object({
    ...base,
    type: z.literal("workspace.two_factor_required"),
    data: NOTIFICATION_DATA_SCHEMAS["workspace.two_factor_required"],
  }),
  z.object({
    ...base,
    type: z.literal("export.ready"),
    data: NOTIFICATION_DATA_SCHEMAS["export.ready"],
  }),
  z.object({
    ...base,
    type: z.literal("webhook.disabled"),
    data: NOTIFICATION_DATA_SCHEMAS["webhook.disabled"],
  }),
  z.object({
    ...base,
    type: z.literal("plan.changed"),
    data: NOTIFICATION_DATA_SCHEMAS["plan.changed"],
  }),
])
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationPageSchema = z.object({
  /** The caller's own notifications, newest first. */
  items: z.array(NotificationSchema),
  /** Pass back as `cursor` for the next (older) page; null on the last one. */
  nextCursor: z.string().nullable(),
})
export type NotificationPage = z.infer<typeof NotificationPageSchema>

export const UnreadCountSchema = z.object({
  /** Exact up to `NOTIFICATION_UNREAD_CAP`; `NOTIFICATION_UNREAD_CAP + 1` means "more than that". */
  count: z
    .number()
    .int()
    .min(0)
    .max(NOTIFICATION_UNREAD_CAP + 1),
})
export type UnreadCount = z.infer<typeof UnreadCountSchema>

/** Mark some of the caller's notifications read by id (others' ids are ignored), or all of them. */
export const MarkNotificationsReadSchema = z.union([
  z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1).max(NOTIFICATIONS_MARK_READ_MAX_IDS),
  }),
  z.object({ all: z.literal(true) }),
])
export type MarkNotificationsRead = z.infer<typeof MarkNotificationsReadSchema>

/** One type's email setting: `locked` types are always emailed and `email` is then always true. */
export const NotificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  email: z.boolean(),
  locked: z.boolean(),
})
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>

/** Every type that emails, optional ones first, in `NOTIFICATION_EMAIL` order. */
export const NotificationPreferencesSchema = z.array(NotificationPreferenceSchema)

/** Only an optional type can be switched; a locked type (or any other string) is refused. */
export const SetNotificationPreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_EMAIL.optional),
  email: z.boolean(),
})
export type SetNotificationPreference = z.infer<typeof SetNotificationPreferenceSchema>

/** The token an optional notification mail's unsubscribe links carry. */
export const NotificationEmailTokenSchema = z.object({
  token: z.string().min(1).max(NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH),
})

/**
 * `auth.notificationEmail.unsubscribe`'s answer: the same for a good token and a bad one, so the
 * outcome is never an oracle.
 */
export const NotificationUnsubscribeResultSchema = z.object({ ok: z.literal(true) })

/** `auth.notificationEmail.peek`: the type a good token turns off, else null. Never the user. */
export const NotificationEmailPeekSchema = z
  .object({ type: z.enum(NOTIFICATION_EMAIL.optional) })
  .nullable()
