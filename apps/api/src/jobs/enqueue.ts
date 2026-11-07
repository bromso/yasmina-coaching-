import { currentRequestId } from "@repo/log/context"
import type { Db, Queries } from "../db"
import type { JobDefinition } from "./define"

export type EnqueueOptions = {
  runAt?: Date
  dedupeKey?: string
  /**
   * With `dedupeKey`: the key is spent once any job has held it, finished or not (until
   * `jobs.prune` deletes that row). Without it, only a queued or running job blocks the key.
   * Schedules use it so a run that already succeeded is not enqueued again by a later tick.
   */
  dedupeAnyStatus?: boolean
  tx?: Queries
}

/**
 * Builds the one `enqueue` function the rest of the app calls: validates the payload against the
 * job's own schema (so a bad payload throws in the caller and never reaches the table), inserts a
 * queued row and nudges the worker to poll sooner.
 *
 * With `options.tx`, the insert joins the caller's transaction instead of running on its own: if
 * that transaction rolls back, nothing was enqueued, so `nudge` is skipped too — there is nothing
 * to wake the worker for yet, and the worker's own poll picks the row up once the transaction
 * commits.
 */
export function createEnqueue(deps: { db: Db; now?: () => Date; nudge?: () => void }) {
  const now = deps.now ?? (() => new Date())
  return async function enqueue<P>(
    def: JobDefinition<P>,
    payload: P,
    options: EnqueueOptions = {}
  ): Promise<number> {
    const parsed = def.payload.parse(payload)
    const queries = options.tx ?? deps.db
    // One `now()` call: when runAt is not given, run_at and created_at must agree exactly.
    const at = now()
    const id = await queries.jobs.insert({
      name: def.name,
      payload: JSON.stringify(parsed),
      maxAttempts: def.maxAttempts,
      runAt: (options.runAt ?? at).toISOString(),
      dedupeKey: options.dedupeKey,
      dedupeAnyStatus: options.dedupeAnyStatus,
      createdAt: at.toISOString(),
      requestId: currentRequestId() ?? null,
    })
    if (!options.tx) deps.nudge?.()
    return id
  }
}

export type Enqueue = ReturnType<typeof createEnqueue>
