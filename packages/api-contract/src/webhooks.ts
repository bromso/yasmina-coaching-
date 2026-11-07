import { z } from "zod"
import { WorkspaceIdSchema } from "./ids"
import {
  MAX_WEBHOOK_ENDPOINTS,
  WEBHOOK_DELIVERIES_LIMIT,
  WEBHOOK_DELIVERY_ERRORS,
  WEBHOOK_DELIVERY_EVENT_TYPES,
  WEBHOOK_DESCRIPTION_MAX,
  WEBHOOK_DISABLED_REASONS,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_TEST_RATE_LIMIT,
  WEBHOOK_TEST_RATE_WINDOW_MS,
  WEBHOOK_URL_MAX,
  type WebhookDeliveryError,
  type WebhookDeliveryEventType,
  type WebhookDisabledReason,
  type WebhookEventType,
} from "./webhooks-limits"

// Kept narrow like api-keys.ts: zod and ./ids only. The `workspaces.webhooks.*` procedures in
// index.ts use these shapes. The plain constants live in the dependency-free `./webhooks-limits`
// (re-exported below) so a client component can import them without zod or the contract.

export type {
  WebhookDeliveryError,
  WebhookDeliveryEventType,
  WebhookDisabledReason,
  WebhookEventType,
}
export {
  MAX_WEBHOOK_ENDPOINTS,
  WEBHOOK_DELIVERIES_LIMIT,
  WEBHOOK_DELIVERY_ERRORS,
  WEBHOOK_DELIVERY_EVENT_TYPES,
  WEBHOOK_DESCRIPTION_MAX,
  WEBHOOK_DISABLED_REASONS,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_MAX_CONSECUTIVE_FAILURES,
  WEBHOOK_TEST_RATE_LIMIT,
  WEBHOOK_TEST_RATE_WINDOW_MS,
  WEBHOOK_URL_MAX,
}

const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]*$/u

export const WebhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES)
export const WebhookDisabledReasonSchema = z.enum(WEBHOOK_DISABLED_REASONS)
export const WebhookDeliveryErrorSchema = z.enum(WEBHOOK_DELIVERY_ERRORS)

/** The URL as typed (trimmed, 1–2000 characters, no control characters). Whether it is https,
 * userinfo- and fragment-free and resolves to public addresses only is the api's SSRF guard's
 * call (`BAD_REQUEST` `WEBHOOK_URL_*` messages), since it needs DNS and the environment. */
export const WebhookUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(WEBHOOK_URL_MAX)
  .regex(NO_CONTROL_CHARACTERS, "URL contains an invalid character")

/** Optional free text, trimmed, at most 200 characters; empty (or null) stores no description. */
export const WebhookDescriptionSchema = z
  .string()
  .trim()
  .max(WEBHOOK_DESCRIPTION_MAX)
  .regex(NO_CONTROL_CHARACTERS, "Description contains an invalid character")
  .nullable()

/** At least one event, each at most once. */
export const WebhookEventsSchema = z
  .array(WebhookEventTypeSchema)
  .min(1)
  .max(WEBHOOK_EVENT_TYPES.length)
  .refine((events) => new Set(events).size === events.length, "Each event at most once")

/** One delivery attempt: never a request or response body, never a header. */
export const WebhookDeliverySchema = z.object({
  id: z.number().int().positive(),
  /** The event's `webhook-id` (`msg_…`): every attempt of one event shares it. */
  eventId: z.string(),
  eventType: z.enum(WEBHOOK_DELIVERY_EVENT_TYPES),
  /** 1 for the first try, counting up on each retry. */
  attempt: z.number().int().positive(),
  /** The HTTP status the endpoint answered with; null when no response arrived. */
  status: z.number().int().nullable(),
  /** Null on success. */
  error: WebhookDeliveryErrorSchema.nullable(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
})
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>

/** `workspaces.webhooks.list`'s rows: never the secret. */
export const WebhookEndpointSchema = z.object({
  id: z.number().int().positive(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(WebhookEventTypeSchema),
  enabled: z.boolean(),
  /** Null while enabled. */
  disabledReason: WebhookDisabledReasonSchema.nullable(),
  disabledAt: z.iso.datetime().nullable(),
  /** Dead deliveries in a row; reset by a success or by re-enabling. */
  consecutiveFailures: z.number().int().nonnegative(),
  /** Null when the creator's account is gone (purged) or was never recorded. */
  createdBy: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  /** The newest delivery attempt, or null before the first. */
  lastDelivery: WebhookDeliverySchema.nullable(),
})
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>

export const WebhookEndpointListSchema = z.object({ items: z.array(WebhookEndpointSchema) })
export type WebhookEndpointList = z.infer<typeof WebhookEndpointListSchema>

export const CreateWebhookEndpointSchema = WorkspaceIdSchema.extend({
  url: WebhookUrlSchema,
  description: WebhookDescriptionSchema.optional(),
  events: WebhookEventsSchema,
})
export type CreateWebhookEndpoint = z.input<typeof CreateWebhookEndpointSchema>

/** `create`'s answer: the signing secret (`whsec_…`), here and in `rotateSecret`'s, nowhere else. */
export const CreatedWebhookEndpointSchema = z.object({
  secret: z.string(),
  endpoint: WebhookEndpointSchema,
})
export type CreatedWebhookEndpoint = z.infer<typeof CreatedWebhookEndpointSchema>

const EndpointIdField = z.coerce.number().int().positive()

export const WebhookEndpointIdSchema = WorkspaceIdSchema.extend({ id: EndpointIdField })
export type WebhookEndpointId = z.infer<typeof WebhookEndpointIdSchema>

/** Every field optional: only what is given changes. `enabled: true` on a disabled endpoint
 * re-enables it (clearing the reason and the failure count); `enabled: false` disables it
 * (`manual`). A new `url` is checked by the SSRF guard like on create. */
export const UpdateWebhookEndpointSchema = WebhookEndpointIdSchema.extend({
  url: WebhookUrlSchema.optional(),
  description: WebhookDescriptionSchema.optional(),
  events: WebhookEventsSchema.optional(),
  enabled: z.boolean().optional(),
})
export type UpdateWebhookEndpoint = z.input<typeof UpdateWebhookEndpointSchema>

/** `rotateSecret`'s answer: the new secret, once. The old one stops signing at once. */
export const RotatedWebhookSecretSchema = z.object({ secret: z.string() })
export type RotatedWebhookSecret = z.infer<typeof RotatedWebhookSecretSchema>

/** `deliveries`' input: the same `{ workspaceId, id }` as every other per-endpoint route. */
export const WebhookDeliveriesInputSchema = WebhookEndpointIdSchema
export type WebhookDeliveriesInput = z.infer<typeof WebhookDeliveriesInputSchema>

/** `test`'s answer: the id of the queued `ping` (its `webhook-id` header and delivery rows). */
export const SentWebhookTestSchema = z.object({ eventId: z.string() })
export type SentWebhookTest = z.infer<typeof SentWebhookTestSchema>

/** The endpoint's newest `WEBHOOK_DELIVERIES_LIMIT` attempts, newest first. */
export const WebhookDeliveryListSchema = z.object({ items: z.array(WebhookDeliverySchema) })
export type WebhookDeliveryList = z.infer<typeof WebhookDeliveryListSchema>

/** Creating an endpoint in a workspace that already holds `MAX_WEBHOOK_ENDPOINTS`. */
export const WEBHOOK_LIMIT_MESSAGE =
  "A workspace can have up to 10 webhook endpoints. Delete one to add another."

/** An id that is not one of this workspace's endpoints. */
export const WEBHOOK_NOT_FOUND_MESSAGE = "Webhook endpoint not found"

/** Not https, userinfo or a fragment, not a URL, or too long. */
export const WEBHOOK_URL_INVALID_MESSAGE =
  "Use an https:// URL without a username, password or #fragment, up to 2000 characters."

/** The host resolves (or is written as) a private, loopback, link-local or reserved address. */
export const WEBHOOK_URL_BLOCKED_MESSAGE =
  "That URL points to a private or reserved address. Use a public endpoint."

/** The host has no A or AAAA record (or DNS failed). */
export const WEBHOOK_URL_UNRESOLVED_MESSAGE =
  "We couldn't find that URL's host. Check the address and try again."

/** `test` on a disabled endpoint: nothing is ever delivered to one, a ping included. */
export const WEBHOOK_TEST_DISABLED_MESSAGE = "Turn this endpoint on before sending a test event."

/** `test` past `WEBHOOK_TEST_RATE_LIMIT` in a workspace within the hour. */
export const WEBHOOK_TEST_RATE_MESSAGE = "Too many test events, try again later."
