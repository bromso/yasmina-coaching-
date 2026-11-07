/**
 * Dependency-free webhook event names: the public, versioned list (additive only, like `/v1`).
 * `./webhooks` re-exports these next to the payload schemas; a bundle that must stay Zod-free
 * imports them from here.
 */

/** Every event type a delivery can carry, `ping` (the test event) included. */
export const WEBHOOK_EVENTS = [
  "note.created",
  "note.deleted",
  "member.joined",
  "member.left",
  "member.role_changed",
  "workspace.updated",
  "api_key.created",
  "api_key.revoked",
  "ping",
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]

/** The events an endpoint can subscribe to: all but `ping`, which only the test button sends. */
export const SUBSCRIBABLE_WEBHOOK_EVENTS = WEBHOOK_EVENTS.filter(
  (event): event is Exclude<WebhookEventType, "ping"> => event !== "ping"
)
export type SubscribableWebhookEvent = Exclude<WebhookEventType, "ping">
