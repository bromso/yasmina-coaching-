// Outgoing webhook events: what an endpoint receives. Each delivery's body is one envelope
// `{ type, timestamp, data }`, minified JSON, signed per Standard Webhooks (`webhook-id`,
// `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256>` over `id.timestamp.body`).
// `data` is the same object `/v1` returns for that resource, and never an email address. The rule
// is the same as `/v1`'s: events and fields are only ever added.
import { z } from "zod"
import { MemberSchema, NoteSchema, ROLES, SCOPES, WorkspaceSchema } from "./index"
import {
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  type SubscribableWebhookEvent,
  WEBHOOK_EVENTS,
  type WebhookEventType,
} from "./webhook-events"

export type { SubscribableWebhookEvent, WebhookEventType }
export { SUBSCRIBABLE_WEBHOOK_EVENTS, WEBHOOK_EVENTS }

const id = z.number().int().positive()

/** `note.deleted`: only the id survives. */
export const NoteDeletedDataSchema = z.object({ id: id.describe("The deleted note's id.") })

/** `member.role_changed`: the member now, plus the role they had. */
export const MemberRoleChangedDataSchema = MemberSchema.extend({
  previousRole: z.enum(ROLES).describe("The role the member had before."),
})

/** `api_key.created` / `api_key.revoked`: never the key or its hash. */
export const ApiKeyDataSchema = z.object({
  id: id.describe("The API key's id."),
  name: z.string().describe("The key's name."),
  /** The 8 characters after `bb_live_`. */
  prefix: z.string().describe("The 8 characters after `bb_live_` that identify the key."),
  scopes: z.array(z.enum(SCOPES)).describe("What the key may do."),
  expiresAt: z.iso
    .datetime()
    .nullable()
    .describe("When the key stops working; `null` if it never expires."),
})

/** `ping`: the endpoint the test was sent to. */
export const PingDataSchema = z.object({
  endpointId: id.describe("The id of the endpoint the test was sent to."),
})

/** Each event type's `data`. */
export const WEBHOOK_DATA_SCHEMAS = {
  "note.created": NoteSchema,
  "note.deleted": NoteDeletedDataSchema,
  "member.joined": MemberSchema,
  "member.left": MemberSchema,
  "member.role_changed": MemberRoleChangedDataSchema,
  "workspace.updated": WorkspaceSchema,
  "api_key.created": ApiKeyDataSchema,
  "api_key.revoked": ApiKeyDataSchema,
  ping: PingDataSchema,
} as const satisfies Record<WebhookEventType, z.ZodType>

export type WebhookData<T extends WebhookEventType> = z.infer<(typeof WEBHOOK_DATA_SCHEMAS)[T]>

const envelope = <T extends WebhookEventType>(type: T) =>
  z.object({
    type: z.literal(type).describe("The event type."),
    /** When the event happened (ISO 8601); `webhook-timestamp` is when this attempt was signed. */
    timestamp: z.iso
      .datetime()
      .describe(
        "When the event happened. The `webhook-timestamp` header is when this attempt was signed."
      ),
    // `.describe()` returns the schema's own type, but on an indexed access TypeScript widens it to
    // every event's; the cast restores this event's `data` type.
    data: WEBHOOK_DATA_SCHEMAS[type].describe(
      "The event's payload."
    ) as (typeof WEBHOOK_DATA_SCHEMAS)[T],
  })

/** One delivery's body, discriminated by `type`. */
export const WebhookEventSchema = z.discriminatedUnion("type", [
  envelope("note.created"),
  envelope("note.deleted"),
  envelope("member.joined"),
  envelope("member.left"),
  envelope("member.role_changed"),
  envelope("workspace.updated"),
  envelope("api_key.created"),
  envelope("api_key.revoked"),
  envelope("ping"),
])
export type WebhookEvent = z.infer<typeof WebhookEventSchema>
/** The envelope for one type. */
export type WebhookEventOf<T extends WebhookEventType> = Extract<WebhookEvent, { type: T }>
