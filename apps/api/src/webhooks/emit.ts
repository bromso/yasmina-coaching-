// Emitting an outgoing webhook event: one `webhook.deliver` job per enabled endpoint of the
// workspace subscribed to the event's type, only while the workspace has the paid `api` feature.
// Call it where the change happens, inside the change's own transaction (`tx`): the jobs then
// commit with the change, or roll back with it, so a change that never happened sends nothing and
// a committed one sends exactly once. Without a `tx`, call it right after the committed write —
// a failed enqueue then rejects (a 500 though the write stands: durability over silent loss).
import { hasFeature } from "@repo/api-contract"
import {
  WEBHOOK_DATA_SCHEMAS,
  type WebhookData,
  type WebhookEventType,
} from "@repo/public-api-contract/webhooks"
import { entitlementsForWorkspace } from "../billing/entitlements"
import type { BillingProvider } from "../billing/provider"
import type { Db, Queries } from "../db"
import { webhookDeliverJob } from "../jobs/builtin/webhooks"
import type { Enqueue } from "../jobs/enqueue"
import type { WebhookEndpointRow } from "../queries/webhooks"
import { newEventId } from "./sign"

export type EmitContext = {
  db: Db | Queries
  billing: Pick<BillingProvider, "kind">
  enqueue: Enqueue
  /** Stamps the event's `timestamp`; defaults to the system clock. */
  now?: () => Date
}

/**
 * The event's `data`, or a function building it: called only once there is an endpoint to send
 * to (most workspaces have none, so the extra reads are skipped on almost every write). A builder
 * answering null (the thing is already gone) sends nothing.
 */
export type WebhookDataSource<T extends WebhookEventType> =
  | WebhookData<T>
  | (() => Promise<WebhookData<T> | null>)

/** Whether the workspace may receive webhooks right now (the paid `api` feature). */
export async function workspaceHasWebhooks(
  queries: Db | Queries,
  billing: Pick<BillingProvider, "kind">,
  workspaceId: number
): Promise<boolean> {
  return hasFeature(await entitlementsForWorkspace(queries, workspaceId, billing), "api")
}

/** Enqueues one delivery per endpoint for one event (one id, one timestamp). */
async function enqueueEvent<T extends WebhookEventType>(
  ctx: EmitContext,
  endpoints: readonly Pick<WebhookEndpointRow, "id">[],
  type: T,
  source: WebhookDataSource<T>,
  tx: Queries | undefined
): Promise<string | null> {
  const raw = typeof source === "function" ? await source() : source
  if (raw === null) return null
  // The public schema strips anything it does not declare: an email can never ride along.
  const data = WEBHOOK_DATA_SCHEMAS[type].parse(raw)
  const eventId = newEventId()
  const timestamp = (ctx.now ?? (() => new Date()))().toISOString()
  for (const endpoint of endpoints) {
    await ctx.enqueue(
      webhookDeliverJob,
      { endpointId: endpoint.id, eventId, type, timestamp, data },
      { tx, dedupeKey: `webhook:${eventId}:${endpoint.id}` }
    )
  }
  return eventId
}

/**
 * Emits `type` for the workspace. Resolves to the event id, or null when nothing was enqueued
 * (no subscribed, enabled endpoint; no `api` feature; or `data` resolved to null).
 */
export async function emitWebhookEvent<T extends Exclude<WebhookEventType, "ping">>(
  ctx: EmitContext,
  workspaceId: number,
  type: T,
  data: WebhookDataSource<T>,
  options: { tx?: Queries } = {}
): Promise<string | null> {
  const queries = options.tx ?? ctx.db
  const endpoints = await queries.webhooks.listSubscribed(workspaceId, type)
  if (endpoints.length === 0) return null
  if (!(await workspaceHasWebhooks(queries, ctx.billing, workspaceId))) return null
  return enqueueEvent(ctx, endpoints, type, data, options.tx)
}

/** Queues a `ping` to one endpoint only (`workspaces.webhooks.test`); resolves to its event id. */
export async function sendWebhookPing(ctx: EmitContext, endpointId: number): Promise<string> {
  const eventId = await enqueueEvent(ctx, [{ id: endpointId }], "ping", { endpointId }, undefined)
  if (eventId === null) throw new Error("a ping always has data")
  return eventId
}
