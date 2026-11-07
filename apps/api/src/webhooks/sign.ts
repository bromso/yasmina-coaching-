// Standard Webhooks signing (https://www.standardwebhooks.com): the receiver checks
// `webhook-signature: v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>`, where `key` is the
// base64-decoded secret after `whsec_`, `id` is `webhook-id` and `timestamp` `webhook-timestamp`
// (unix seconds). `body` must be the exact bytes sent (UTF-8). Pure: no clock, no I/O; the caller
// draws the id and timestamp. Tests verify every signature with the official `standardwebhooks`.
import { createHmac, randomBytes } from "node:crypto"

export const WEBHOOK_SECRET_PREFIX = "whsec_"
/** `whsec_` + standard base64 of exactly 32 bytes. */
export const WEBHOOK_SECRET_PATTERN = /^whsec_[A-Za-z0-9+/]{43}=$/
/** `msg_` + base64url of 16 bytes: never a dot, so `id.timestamp.body` stays unambiguous. */
export const WEBHOOK_EVENT_ID_PATTERN = /^msg_[A-Za-z0-9_-]{22}$/

/** A fresh signing secret: `whsec_` + base64 of 32 random bytes. Returned once, stored encrypted. */
export const newWebhookSecret = (): string =>
  `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString("base64")}`

/** A fresh event id (`webhook-id`): `msg_` + base64url of 16 random bytes. */
export const newEventId = (): string => `msg_${randomBytes(16).toString("base64url")}`

export type SignInput = {
  /** `whsec_…`, as `newWebhookSecret` drew it (decrypted). */
  secret: string
  /** `msg_…` (`newEventId`). */
  id: string
  /** Unix seconds. */
  timestamp: number
  /** The exact body sent: minified JSON. */
  body: string
}

/** `v1,<base64 HMAC-SHA256>` over `id.timestamp.body`. Throws on a malformed secret, id or time. */
export function signWebhook({ secret, id, timestamp, body }: SignInput): string {
  if (!WEBHOOK_SECRET_PATTERN.test(secret)) throw new Error("Malformed webhook secret")
  if (!WEBHOOK_EVENT_ID_PATTERN.test(id)) throw new Error("Malformed webhook event id")
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new Error("Malformed webhook timestamp")
  const key = Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), "base64")
  const mac = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64")
  return `v1,${mac}`
}

/** The three Standard Webhooks headers for one attempt. */
export function signedHeaders(input: SignInput): {
  "webhook-id": string
  "webhook-timestamp": string
  "webhook-signature": string
} {
  return {
    "webhook-id": input.id,
    "webhook-timestamp": String(input.timestamp),
    "webhook-signature": signWebhook(input),
  }
}
