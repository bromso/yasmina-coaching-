import { type AnalyticsEventName, parseEventProps } from "@repo/api-contract/analytics"
import type { Queries } from "../db"
import { analyticsEventJob } from "../jobs/builtin/analytics"
import type { Enqueue } from "../jobs/enqueue"

/** The slice of `Context` (or `JobContext`) `recordEvent` needs — every call site already has it. */
export type RecordEventContext = {
  enqueue: Enqueue
  /** For a detached failure: logs it and records it as a telemetry `server` row for app "api". */
  recordFailure: (message: string, error: unknown) => void
  /**
   * True on an impersonation session (the router's `authed` middleware sets it, exactly the flag
   * `auditWhileImpersonating` reads): an admin acting as the user is not the user's own product
   * activity, so `recordEvent` records nothing. Absent (a job, a webhook, an anonymous call) means
   * not impersonating.
   */
  impersonating?: boolean
}

/**
 * A context that enqueues nothing: the default for a billing call site that is not given a real
 * one (most of `billing.test.ts` and `telemetry.test.ts` never drive analytics at all).
 */
export const noopEvents: RecordEventContext = {
  enqueue: async () => 0,
  recordFailure: () => {},
}

/**
 * Records one server-side product event: `source` is always `"api"`, there is never a
 * `visitor_id` (product events are account-tied, not cookieless), and `props` is validated
 * against `name`'s allowlist exactly as `analytics.ingest` validates a client event's. Enqueues
 * `analytics.event` (inside the caller's transaction when `options.tx` is given, so the event is
 * queued only if the write it belongs to actually commits) and nudges the worker.
 *
 * Whether an enqueue failure (a database outage, say) reaches the caller depends on `options.tx`:
 * - With a `tx`: it propagates. The enqueue's insert runs on the caller's own transaction
 *   connection, so on Postgres a failed statement already aborts that transaction — the caller's
 *   write is rolling back regardless, and catching the error here would only hide that from it.
 * - Without a `tx`: it is caught and recorded through `recordFailure`, exactly like every other
 *   detached write in this router. The write this event reports on already committed on its own,
 *   so a product event must never fail or slow down the request it rides on.
 *
 * Invalid `props` is different from an enqueue failure: that is a bug in the call site, not bad
 * input or a transient outage, so it is never silently swallowed — development and test throw
 * immediately (an intentional loud failure: it is meant to fail the test that exercises the bad
 * call site, caught by `record.test.ts`), while production records the mistake and drops the
 * event instead of 500ing a real user's request over a reporting detail.
 *
 * On an impersonation session (`context.impersonating`) nothing is recorded at all, before any
 * validation: what an admin does while acting as a user must not be credited to that user, and
 * keeping the check here means no call site can forget it.
 */
export async function recordEvent<N extends AnalyticsEventName>(
  context: RecordEventContext,
  name: N,
  ids: { userId: number | null; workspaceId: number | null },
  props: Record<string, unknown>,
  options?: { tx?: Queries }
): Promise<void> {
  if (context.impersonating) return
  const parsed = parseEventProps(name, props)
  if (parsed === null) {
    const message = `recordEvent: invalid props for event "${name}"`
    // Intentionally loud in development/test: a call site passing props that fail its own
    // event's allowlist is a bug to fix, not data to drop — `bun test` sets NODE_ENV=test, and
    // `bun dev` is expected to set `development` (see env.ts's own NODE_ENV comment), so this
    // throws in exactly the environments where a human is watching the result.
    const nodeEnv = Bun.env.NODE_ENV
    if (nodeEnv === "development" || nodeEnv === "test") throw new Error(message)
    context.recordFailure(message, new Error(message))
    return
  }
  const payload = {
    name,
    userId: ids.userId,
    workspaceId: ids.workspaceId,
    props: parsed,
    at: new Date().toISOString(),
  }
  if (options?.tx) {
    await context.enqueue(analyticsEventJob, payload, { tx: options.tx })
    return
  }
  try {
    await context.enqueue(analyticsEventJob, payload)
  } catch (error) {
    context.recordFailure(`analytics.event enqueue failed (${name})`, error)
  }
}
