import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"
import {
  isOptionalNotificationEmailType,
  NOTIFICATION_EMAIL,
  NOTIFICATION_EMAIL_DEFAULT,
  NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH,
  type NotificationDataMap,
  type NotificationPreference,
  type OptionalNotificationEmailType,
} from "@repo/api-contract"
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/locales"
import type { Queries } from "./db"
import { UNSAFE_HEADER_URL } from "./env"
import { enqueueMail } from "./jobs/builtin/mail"
import type { Enqueue } from "./jobs/enqueue"

/**
 * The optional notification emails (Phase 13 B) and the unsubscribe token their links carry.
 *
 * The token is `base64url(payload).base64url(mac)`, the payload `<userId>.<type>.1` (the trailing
 * `1` is the token version) and the mac HMAC-SHA256 of the payload's bytes under a key derived
 * from TWO_FACTOR_ENCRYPTION_KEY for this one purpose with HKDF-SHA256 (`info` =
 * NOTIFICATION_UNSUBSCRIBE_LABEL, empty salt) — so the raw key is never used for anything but the
 * TOTP secrets it encrypts, and no new env var is needed. A token never expires (it works until
 * that key rotates), names exactly one user and one optional type, and can only be minted for an
 * optional type.
 */

/** The fixed context label the unsubscribe key is derived under. Changing it voids every link. */
export const NOTIFICATION_UNSUBSCRIBE_LABEL = "notification-unsubscribe-v1"
const VERSION = "1"
const MAC_BYTES = 32
const BASE64URL = /^[A-Za-z0-9_-]+$/
const PAYLOAD = /^([1-9][0-9]{0,15})\.([a-z_.]{1,64})\.([0-9]{1,3})$/

/**
 * HKDF's salt: fixed and empty on purpose (RFC 5869 §3.1 allows it when the input key is already
 * uniformly random, as TWO_FACTOR_ENCRYPTION_KEY's 32 bytes are). The `info` label alone separates
 * this key from the AES-GCM use of the same input key.
 */
const HKDF_SALT = Buffer.alloc(0)

/** One derived key per TWO_FACTOR_ENCRYPTION_KEY value for the life of the process. */
const derivedKeys = new Map<string, Buffer>()

/** HKDF-SHA256(key, salt = empty, info = NOTIFICATION_UNSUBSCRIBE_LABEL, 32 bytes). */
export function unsubscribeKey(twoFactorKey: string): Buffer {
  let key = derivedKeys.get(twoFactorKey)
  if (!key) {
    key = Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(twoFactorKey, "base64"),
        HKDF_SALT,
        NOTIFICATION_UNSUBSCRIBE_LABEL,
        32
      )
    )
    derivedKeys.set(twoFactorKey, key)
  }
  return key
}

const mac = (twoFactorKey: string, payload: string) =>
  createHmac("sha256", unsubscribeKey(twoFactorKey)).update(payload, "utf8").digest()

/**
 * Mints the unsubscribe token for one user and one optional type (a locked type cannot be named).
 */
export function mintUnsubscribeToken(
  twoFactorKey: string,
  userId: number,
  type: OptionalNotificationEmailType
): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid user id")
  if (!isOptionalNotificationEmailType(type)) throw new Error("Not an optional notification type")
  const payload = `${userId}.${type}.${VERSION}`
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${mac(twoFactorKey, payload).toString("base64url")}`
}

/**
 * Strict base64url: only the alphabet, no padding, and only the one canonical spelling of its
 * bytes (Node's decoder ignores stray characters and trailing bits, so it would accept several).
 */
function decodeCanonical(part: string): Buffer | null {
  if (!BASE64URL.test(part)) return null
  const bytes = Buffer.from(part, "base64url")
  return bytes.toString("base64url") === part ? bytes : null
}

/**
 * The user and type a token names, or null — for a forged, truncated, re-encoded or otherwise
 * altered token, a token of another version, or one naming a locked (or unknown) type. The mac is
 * compared in constant time on equal-length buffers; any parse failure is simply invalid.
 */
export function verifyUnsubscribeToken(
  twoFactorKey: string,
  token: unknown
): { userId: number; type: OptionalNotificationEmailType } | null {
  if (typeof token !== "string" || token.length > NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH) return null
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [payloadPart, macPart] = parts as [string, string]
  const payloadBytes = decodeCanonical(payloadPart)
  const given = decodeCanonical(macPart)
  if (!payloadBytes || !given || given.length !== MAC_BYTES) return null
  const payload = payloadBytes.toString("utf8")
  // The bytes must be exactly what that string encodes (no invalid UTF-8 smuggled through).
  if (!Buffer.from(payload, "utf8").equals(payloadBytes)) return null
  const expected = mac(twoFactorKey, payload)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  const match = PAYLOAD.exec(payload)
  if (!match) return null
  const [, id, type, version] = match
  if (version !== VERSION || !isOptionalNotificationEmailType(type)) return null
  const userId = Number(id)
  if (!Number.isSafeInteger(userId)) return null
  return { userId, type }
}

/** What sending an optional notification email needs; a request's `Context` has all of it. */
export type NotificationEmailDeps = {
  enqueue: Enqueue
  /** AUTH_URL: where the unsubscribe page and the one-click endpoint live. */
  authUrl: string
  /** ACCOUNT_URL: the inbox each mail links to. */
  accountUrl: string
  /** TWO_FACTOR_ENCRYPTION_KEY, which the unsubscribe key is derived from. */
  twoFactorKey: string
}

/** An optional type with its own data, so `switch (type)` narrows `data` too. */
type OptionalNotification = {
  [T in OptionalNotificationEmailType]: { type: T; data: NotificationDataMap[T] }
}[OptionalNotificationEmailType]

/**
 * The `List-Unsubscribe` pair (RFC 8058) for a token: the one-click POST endpoint on the auth app.
 */
export function unsubscribeHeaders(authUrl: string, token: string): Record<string, string> {
  // Defence in depth behind loadEnv's own check: never build a header that could be split or
  // break out of its `<…>`.
  if (UNSAFE_HEADER_URL.test(authUrl) || !/^[A-Za-z0-9_.-]+$/.test(token))
    throw new Error("Refusing to build List-Unsubscribe from an unsafe value")
  return {
    "List-Unsubscribe": `<${authUrl.replace(/\/$/, "")}/email/unsubscribe/one-click?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }
}

/**
 * Enqueues the optional email for a notification just written for `userId`, in `db` (the change's
 * own transaction, so a rolled-back change sends nothing) — only when the user's setting for
 * `type` is on (no row: the default, on). The recipient's address, name and saved locale (else
 * English) are read from their own row here, inside the same transaction; nothing about anyone
 * else reaches the template. Nobody without a verified address is mailed: an address nobody has
 * proven to own is never sent anything it did not ask for. Resolves whether a mail was enqueued.
 */
export async function enqueueNotificationEmail<T extends OptionalNotificationEmailType>(
  deps: NotificationEmailDeps,
  db: Queries,
  input: { userId: number; type: T; data: NotificationDataMap[T]; notificationId: number },
  inTransaction: boolean
): Promise<boolean> {
  const { userId, type } = input
  const on = await db.notificationPreferences.emailEnabled(userId, type, NOTIFICATION_EMAIL_DEFAULT)
  if (!on) return false
  const user = await db.users.find(userId)
  if (!user || user.email_verified_at === null) return false
  const token = mintUnsubscribeToken(deps.twoFactorKey, userId, type)
  const authUrl = deps.authUrl.replace(/\/$/, "")
  const links = {
    inboxUrl: `${deps.accountUrl.replace(/\/$/, "")}/notifications`,
    unsubscribeUrl: `${authUrl}/email/unsubscribe?token=${token}`,
  }
  const common = { ...links, name: user.name || undefined }
  const options = {
    ...(inTransaction ? { tx: db } : {}),
    locale: isLocale(user.locale) ? user.locale : DEFAULT_LOCALE,
    headers: unsubscribeHeaders(authUrl, token),
    // One mail per notification: a provider that honours it drops a retried duplicate.
    idempotencyKey: `notification-email:${input.notificationId}`,
  }
  const sent = { type, data: input.data } as OptionalNotification
  switch (sent.type) {
    case "member.role_changed":
      await enqueueMail(
        deps.enqueue,
        "roleChanged",
        user.email,
        { ...common, workspaceName: sent.data.workspaceName, role: sent.data.to },
        options
      )
      break
    case "member.removed":
      await enqueueMail(
        deps.enqueue,
        "removedFromWorkspace",
        user.email,
        { ...common, workspaceName: sent.data.workspaceName },
        options
      )
      break
    case "plan.changed":
      await enqueueMail(
        deps.enqueue,
        "planChanged",
        user.email,
        { ...common, workspaceName: sent.data.workspaceName, plan: sent.data.plan },
        options
      )
      break
  }
  return true
}

/**
 * `account.notificationPreferences.get`: every type that emails, optional ones first (each the
 * stored setting, else the default) then the locked ones, always on and marked `locked`.
 */
export async function notificationPreferencesFor(
  db: Pick<Queries, "notificationPreferences">,
  userId: number
): Promise<NotificationPreference[]> {
  const stored = new Map(
    (await db.notificationPreferences.list(userId)).map((row) => [row.type, row.email_enabled])
  )
  return [
    ...NOTIFICATION_EMAIL.optional.map((type) => ({
      type,
      email: stored.get(type) ?? NOTIFICATION_EMAIL_DEFAULT,
      locked: false,
    })),
    ...NOTIFICATION_EMAIL.locked.map((type) => ({ type, email: true, locked: true })),
  ]
}

/**
 * Sets `userId`'s email setting for one optional type, inside `tx`, and audits it
 * (`user.notification_email_changed`, the user as actor) only when it changed — a no-op writes
 * nothing. `via` tells the settings page (`settings`) from an unsubscribe link (`link`). A locked
 * type is refused before anything is read: the types say so, and so does this check at run time.
 */
export async function setNotificationEmail(
  tx: Pick<Queries, "notificationPreferences" | "audit">,
  input: {
    userId: number
    type: OptionalNotificationEmailType
    email: boolean
    at: string
    via: "settings" | "link"
  }
): Promise<boolean> {
  if (!isOptionalNotificationEmailType(input.type)) return false
  const changed = await tx.notificationPreferences.set({
    userId: input.userId,
    type: input.type,
    email: input.email,
    fallback: NOTIFICATION_EMAIL_DEFAULT,
    at: input.at,
  })
  if (changed)
    await tx.audit.create({
      actorUserId: input.userId,
      impersonatedUserId: null,
      action: "user.notification_email_changed",
      targetType: "user",
      targetId: String(input.userId),
      reason: null,
      ip: null,
      userAgent: null,
      metadata: JSON.stringify({ type: input.type, email: input.email, via: input.via }),
    })
  return changed
}
