import type { Db } from "../db"
import type { Enqueue } from "../jobs/enqueue"
import type { NotificationEmailDeps } from "../notification-email"
import type { Broadcaster } from "../realtime/broadcaster"
import { applyBillingEvent } from "./mirror"
import { type BillingProvider, BillingSignatureError } from "./provider"

/**
 * POST /billing/webhook: verify the signature over the raw body, apply the event once, and answer
 * 2xx for anything we will never apply (ignored type, duplicate, unattributed, conflict, gone,
 * stale, customer_changed, unknown_price) so the provider stops retrying. A bad signature is 400; a failure on our side is 500, so it retries.
 */
export function createWebhookHandler(deps: {
  db: Db
  billing: BillingProvider
  log: (message: string, error: unknown) => void
  /** Logs and records a failure on our side as a `server` row for app "api". */
  recordFailure: (message: string, error: unknown) => void
  /** For the mirror's `plan_changed` event (apps/api/src/analytics/record.ts). */
  enqueue: Enqueue
  /** For the owners' `plan.changed` notifications (apps/api/src/notifications.ts). */
  broadcaster: Broadcaster
  /** …and their `plan.changed` emails (apps/api/src/notification-email.ts). */
  notificationEmail: Omit<NotificationEmailDeps, "enqueue">
}) {
  return async (req: Request): Promise<Response> => {
    // The raw text, never parsed JSON: the signature is over the exact bytes Stripe sent.
    const raw = await req.text()
    let event: Awaited<ReturnType<BillingProvider["verifyWebhook"]>>
    try {
      event = await deps.billing.verifyWebhook(raw, req.headers.get("stripe-signature"))
    } catch (error) {
      if (error instanceof BillingSignatureError) {
        // Never the body: an unverified payload is attacker-controlled.
        deps.log("billing webhook rejected: bad signature", undefined)
        return Response.json({ error: "Bad signature" }, { status: 400 })
      }
      // Anything else reaches the server's error handler: logged, answered 500.
      throw error
    }
    if (!event) return Response.json({ received: true, ignored: true })
    try {
      const result = await applyBillingEvent(deps.db, deps.billing.kind, event, {
        enqueue: deps.enqueue,
        recordFailure: deps.recordFailure,
        broadcaster: deps.broadcaster,
        notificationEmail: deps.notificationEmail,
      })
      if (!result.applied) {
        deps.log(
          `billing webhook ${event.type} ${event.id} not applied: ${result.reason}`,
          undefined
        )
      }
      return Response.json({ received: true, ...result })
    } catch (error) {
      deps.recordFailure(`billing webhook ${event.type} ${event.id} failed`, error)
      return Response.json({ error: "Internal error" }, { status: 500 })
    }
  }
}
