import { hasFeature } from "@repo/api-contract"
import { WEBHOOK_MAX_CONSECUTIVE_FAILURES } from "@repo/api-contract/webhooks-limits"
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/locales"
import {
  WEBHOOK_DATA_SCHEMAS,
  WEBHOOK_EVENTS,
  type WebhookEventType,
} from "@repo/public-api-contract/webhooks"
import { BRAND_NAME } from "@repo/sites/brand"
import { z } from "zod"
import { auditWorkspace } from "../../admin"
import { entitlementsForWorkspace } from "../../billing/entitlements"
import type { Queries } from "../../db"
import { notifyUser } from "../../notifications"
import { parseWebhookEvents, type WebhookEndpointRow } from "../../queries/webhooks"
import {
  type AttemptOutcome,
  bunWebhookFetch,
  postToCheckedAddresses,
} from "../../webhooks/deliver"
import { decryptWebhookSecret } from "../../webhooks/secret"
import { signedHeaders, WEBHOOK_EVENT_ID_PATTERN } from "../../webhooks/sign"
import { checkWebhookUrl } from "../../webhooks/ssrf"
import { defineJob, type JobContext } from "../define"
import { enqueueMail } from "./mail"

/** How long delivery rows are kept (`webhooks.prune`). */
export const WEBHOOK_DELIVERY_RETENTION_DAYS = 30
const DAY_MS = 86_400_000

export type WebhookDeliverPayload = {
  endpointId: number
  /** `msg_…`: the `webhook-id` header, the same on every attempt (receivers dedupe on it). */
  eventId: string
  type: WebhookEventType
  /** When the event happened (ISO); `webhook-timestamp` is when each attempt was signed. */
  timestamp: string
  data: unknown
}

const payloadSchema = z
  .object({
    endpointId: z.number().int().positive(),
    eventId: z.string().regex(WEBHOOK_EVENT_ID_PATTERN),
    type: z.enum(WEBHOOK_EVENTS),
    timestamp: z.iso.datetime(),
    data: z.unknown(),
  })
  .superRefine((payload, issues) => {
    const parsed = WEBHOOK_DATA_SCHEMAS[payload.type].safeParse(payload.data)
    if (!parsed.success) issues.addIssue({ code: "custom", path: ["data"], message: "invalid" })
  }) as z.ZodType<WebhookDeliverPayload>

/** The account app's page where an owner fixes and re-enables an endpoint. */
const settingsLink = (accountUrl: string) => `${accountUrl.replace(/\/$/, "")}/workspace`

/** The endpoint URL's host (with a non-default port), for audit metadata and the owners' mail. */
const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}

/**
 * Turns the endpoint off on our own (`failures` or `gone`), inside `tx`: audited with no actor
 * (the system), and every owner mailed `webhookDisabled` in their saved locale (English when they
 * never chose one) and sent a `webhook.disabled` notification. Does nothing when it was already off (an admin got there first).
 */
async function disableEndpoint(
  tx: Queries,
  ctx: JobContext,
  endpoint: WebhookEndpointRow,
  reason: "failures" | "gone",
  failures: number
): Promise<boolean> {
  if (!(await tx.webhooks.disable(endpoint.id, reason, ctx.now().toISOString()))) return false
  const host = hostOf(endpoint.url)
  await auditWorkspace({ db: tx }, endpoint.workspace_id, {
    action: "workspace.webhook_disabled",
    targetType: "webhook",
    targetId: endpoint.id,
    metadata: {
      endpointId: endpoint.id,
      host,
      events: parseWebhookEvents(endpoint.events),
      reason,
      consecutiveFailures: failures,
    },
  })
  const workspace = await tx.workspaces.find(endpoint.workspace_id)
  if (!workspace) return true
  for (const member of await tx.memberships.list(endpoint.workspace_id)) {
    if (member.role !== "owner") continue
    const owner = await tx.users.find(member.user_id)
    await enqueueMail(
      ctx.enqueue,
      "webhookDisabled",
      member.email,
      {
        name: member.name,
        workspaceName: workspace.name,
        host,
        reason,
        failures,
        link: settingsLink(ctx.accountUrl),
      },
      { tx, locale: owner && isLocale(owner.locale) ? owner.locale : DEFAULT_LOCALE }
    )
    await notifyUser(
      ctx,
      member.user_id,
      "webhook.disabled",
      { workspaceName: workspace.name, host, reason },
      { tx, workspaceId: endpoint.workspace_id }
    )
  }
  return true
}

/** The error a failed attempt throws, so the queue retries it: a class and a status, no body. */
const failureMessage = (outcome: Extract<AttemptOutcome, { kind: "failure" }>) =>
  `webhook delivery failed: ${outcome.error}${outcome.status === null ? "" : ` ${outcome.status}`}`

/**
 * Delivers one event to one endpoint (Standard Webhooks). Before dialling it re-reads everything
 * that could have changed since the event was queued: an endpoint deleted, disabled, no longer
 * subscribed, or a workspace that lost the `api` feature finishes quietly, sending nothing; and the
 * SSRF guard runs again, so only addresses it has just checked are dialled. Every attempt writes a
 * `webhook_deliveries` row (a status or an error class — never a body). A 2xx resets the failure
 * count; a 410 turns the endpoint off (`gone`) without a retry; anything else throws, so the queue
 * retries with its backoff. When the last attempt fails, the endpoint's `consecutive_failures`
 * goes up by one, and at `WEBHOOK_MAX_CONSECUTIVE_FAILURES` it is turned off (`failures`).
 */
export const webhookDeliverJob = defineJob<WebhookDeliverPayload>({
  name: "webhook.deliver",
  payload: payloadSchema,
  maxAttempts: 8,
  // One 10 s attempt, a DNS lookup (5 s at most) and the bookkeeping, with room to spare.
  timeoutMs: 30_000,
  run: async (payload, ctx) => {
    const endpoint = await ctx.db.webhooks.find(payload.endpointId)
    if (!endpoint?.enabled) return
    if (payload.type !== "ping" && !parseWebhookEvents(endpoint.events).includes(payload.type))
      return
    // Only `features` is read here, which `kind` does not affect.
    const entitlements = await entitlementsForWorkspace(ctx.db, endpoint.workspace_id, ctx.billing)
    if (!hasFeature(entitlements, "api")) return

    const started = performance.now()
    const check = await checkWebhookUrl(endpoint.url, {
      resolve: ctx.webhookResolve,
      allowLocalhostHttp: ctx.webhookAllowLocalhostHttp,
    })
    let outcome: AttemptOutcome
    if (!check.ok) {
      // Unresolvable now is a network failure; anything else (private now: rebinding) is blocked.
      outcome = {
        kind: "failure",
        status: null,
        error: check.reason === "unresolvable" ? "network" : "blocked",
      }
    } else {
      const secret = await decryptWebhookSecret(endpoint.secret, ctx.twoFactorKey)
      const body = JSON.stringify({
        type: payload.type,
        timestamp: payload.timestamp,
        data: payload.data,
      })
      const signed = signedHeaders({
        secret,
        id: payload.eventId,
        timestamp: Math.floor(ctx.now().getTime() / 1000),
        body,
      })
      outcome = await postToCheckedAddresses({
        check,
        body,
        headers: {
          "content-type": "application/json",
          "user-agent": `${BRAND_NAME}-webhooks`,
          ...signed,
        },
        fetch: ctx.webhookFetch ?? bunWebhookFetch,
        signal: ctx.signal,
      })
    }
    // An endpoint deleted while this attempt was in flight: on Postgres the foreign key refuses
    // the row (the job retries once and then finds no endpoint); SQLite does not enforce it, so an
    // orphan row with a dangling `endpoint_id` stays until `webhooks.prune` — never readable (no
    // endpoint lists it) and never inherited (ids are AUTOINCREMENT). Harmless, so left as is.
    await ctx.db.webhooks.recordDelivery({
      endpointId: endpoint.id,
      eventId: payload.eventId,
      eventType: payload.type,
      attempt: ctx.attempt,
      status: outcome.status,
      error: outcome.kind === "failure" ? outcome.error : null,
      durationMs: performance.now() - started,
      createdAt: ctx.now().toISOString(),
    })

    if (outcome.kind === "success") {
      await ctx.db.webhooks.resetFailures(endpoint.id)
      return
    }
    if (outcome.kind === "gone") {
      await ctx.db.transaction((tx) =>
        disableEndpoint(tx, ctx, endpoint, "gone", endpoint.consecutive_failures)
      )
      return
    }
    // The last attempt (by the row's own `max_attempts`): the job dies once this throws, so it
    // counts against the endpoint now. Not counted: a final attempt the worker loses outright (a
    // crash mid-run, so the row is reclaimed with attempts past max and killed unrun, worker.ts),
    // or one whose bookkeeping below is cut off. A worker timeout is still counted: the run goes
    // on, sees its aborted signal and records `timeout`. An admin Retry of the dead job is a new
    // run of up to 8 attempts, and its death counts again.
    if (ctx.attempt >= ctx.maxAttempts) {
      await ctx.db.transaction(async (tx) => {
        const failures = await tx.webhooks.incrementFailures(endpoint.id)
        if (failures >= WEBHOOK_MAX_CONSECUTIVE_FAILURES)
          await disableEndpoint(tx, ctx, endpoint, "failures", failures)
      })
    }
    throw new Error(failureMessage(outcome))
  },
})

/** Nightly (`55 3 * * *`): deletes delivery rows older than 30 days. Idempotent. */
export const webhooksPruneJob = defineJob<Record<string, never>>({
  name: "webhooks.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const before = new Date(ctx.now().getTime() - WEBHOOK_DELIVERY_RETENTION_DAYS * DAY_MS)
    await ctx.db.webhooks.pruneDeliveries(before.toISOString())
  },
})
