/**
 * Dependency-free webhook endpoint constants: safe for a browser bundle that must not pull in zod
 * or the oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not
 * part of). `webhooks.ts` imports these and re-exports them, so every `@repo/api-contract` import
 * keeps working; a client component (the account app's Webhooks card) imports them from here.
 *
 * The event names mirror `SUBSCRIBABLE_WEBHOOK_EVENTS` in `@repo/public-api-contract/webhooks`
 * (the public, versioned list); apps/api pins the two equal in a test.
 */

/** What an endpoint can subscribe to. None is preselected in the UI; an endpoint has at least one. */
export const WEBHOOK_EVENT_TYPES = [
  "note.created",
  "note.deleted",
  "member.joined",
  "member.left",
  "member.role_changed",
  "workspace.updated",
  "api_key.created",
  "api_key.revoked",
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

/** What a delivery row can name: every subscribable event plus `ping` (the test event). */
export const WEBHOOK_DELIVERY_EVENT_TYPES = [...WEBHOOK_EVENT_TYPES, "ping"] as const
export type WebhookDeliveryEventType = (typeof WEBHOOK_DELIVERY_EVENT_TYPES)[number]

/** The most endpoints one workspace may hold. Past it `workspaces.webhooks.create` answers
 * `CONFLICT` `WEBHOOK_LIMIT_MESSAGE`, decided inside the inserting transaction under the workspace
 * row's lock, so two concurrent creates at `MAX_WEBHOOK_ENDPOINTS - 1` cannot both pass. */
export const MAX_WEBHOOK_ENDPOINTS = 10

/** An endpoint URL's maximum length, in characters. */
export const WEBHOOK_URL_MAX = 2000
/** An endpoint description's maximum length, in characters (after trimming). */
export const WEBHOOK_DESCRIPTION_MAX = 200

/** Why an endpoint is disabled: too many dead deliveries, a `410 Gone`, or an admin turned it off. */
export const WEBHOOK_DISABLED_REASONS = ["failures", "gone", "manual"] as const
export type WebhookDisabledReason = (typeof WEBHOOK_DISABLED_REASONS)[number]

/** A failed delivery attempt's class — never a response body. */
export const WEBHOOK_DELIVERY_ERRORS = [
  "timeout",
  "network",
  "blocked",
  "redirect",
  "http",
] as const
export type WebhookDeliveryError = (typeof WEBHOOK_DELIVERY_ERRORS)[number]

/** How many delivery rows `workspaces.webhooks.deliveries` returns, newest first. */
export const WEBHOOK_DELIVERIES_LIMIT = 50

/** Dead deliveries in a row after which an endpoint is disabled (`failures`). */
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 5

/** `workspaces.webhooks.test`: at most this many test events per workspace per
 * `WEBHOOK_TEST_RATE_WINDOW_MS` (limiter key `webhook-test:<workspaceId>`); past it the api answers
 * `TOO_MANY_REQUESTS` `WEBHOOK_TEST_RATE_MESSAGE`. */
export const WEBHOOK_TEST_RATE_LIMIT = 20
export const WEBHOOK_TEST_RATE_WINDOW_MS = 60 * 60 * 1000
