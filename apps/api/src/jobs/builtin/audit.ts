import { z } from "zod"
import { DEFAULT_TIMEOUT_MS, defineJob, type JobContext } from "../define"
import { DAY_MS } from "./analytics"

/** The batch size `audit.prune` uses outside tests (1000 by id, per the design). */
export const AUDIT_PRUNE_BATCH = 1000

/**
 * `audit.prune`'s own time budget: 80 % of the default job `timeoutMs` (`DEFAULT_TIMEOUT_MS`,
 * 60 s), so 48 s. Past it the run stops between batches and returns normally, so a large backlog
 * (the first nights after an upgrade) drains over several nights without a failed attempt, a retry
 * or a dead job — the worker only ever sees a timeout when a single batch hangs.
 */
export const AUDIT_PRUNE_BUDGET_MS = DEFAULT_TIMEOUT_MS * 0.8

export type AuditPruneResult = {
  stripped: number
  deleted: number
  /** True when the run stopped early (its time budget, or its signal) and left work for the next. */
  partial: boolean
}

export type AuditPruneOptions = {
  /** Rows per batch (1000 outside tests). */
  batchSize?: number
  /** Stop starting new batches once this many ms have passed (unbounded when omitted). */
  budgetMs?: number
  /** Monotonic ms clock for the budget; wall time (`performance.now`) unless a test injects one. */
  clock?: () => number
}

/**
 * Runs one `audit.prune` pass. First deletes rows older than `rowDays` (`ctx.now()` minus
 * `rowDays` days); then strips `ip`/`user_agent` from rows between that cutoff and the `piiDays`
 * one that still hold either — so a row about to be deleted is never stripped first. Both stages
 * go batch by batch (`batchSize`, 1000 outside tests), lowest id first, keyset on the last id each
 * batch touched (linear in the table, never rescanning finished rows), each batch its own
 * statement with no wrapping transaction. Before every batch it checks `ctx.signal` and the time
 * budget; either stops the run there with `partial: true`, and the next scheduled run continues
 * the backlog. A row exactly at either cutoff is kept (strict `<`). Idempotent: a run that finds
 * nothing left to touch returns zero for that stage.
 */
export async function pruneAudit(
  ctx: Pick<JobContext, "db" | "now" | "signal" | "auditPiiRetentionDays" | "auditRetentionDays">,
  {
    batchSize = AUDIT_PRUNE_BATCH,
    budgetMs = Number.POSITIVE_INFINITY,
    clock = () => performance.now(),
  }: AuditPruneOptions = {}
): Promise<AuditPruneResult> {
  const now = ctx.now()
  const piiCutoff = new Date(now.getTime() - ctx.auditPiiRetentionDays * DAY_MS).toISOString()
  const rowCutoff = new Date(now.getTime() - ctx.auditRetentionDays * DAY_MS).toISOString()
  const started = clock()
  const stop = () => ctx.signal.aborted || clock() - started >= budgetMs

  let deleted = 0
  let afterId = 0
  for (;;) {
    if (stop()) return { stripped: 0, deleted, partial: true }
    const batch = await ctx.db.audit.deleteBefore(rowCutoff, afterId, batchSize)
    deleted += batch.count
    afterId = batch.lastId
    if (batch.count < batchSize) break
  }

  let stripped = 0
  afterId = 0
  for (;;) {
    if (stop()) return { stripped, deleted, partial: true }
    const batch = await ctx.db.audit.stripNetworkBetween(rowCutoff, piiCutoff, afterId, batchSize)
    stripped += batch.count
    afterId = batch.lastId
    if (batch.count < batchSize) break
  }

  return { stripped, deleted, partial: false }
}

/**
 * Builds `audit.prune` (cron `45 3 * * *`): `queries/audit.ts`'s `deleteBefore`/
 * `stripNetworkBetween` do the batched work; the job supplies the retention settings
 * (`AUDIT_PII_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`, reaching it as
 * `ctx.auditPiiRetentionDays`/`ctx.auditRetentionDays` like `analytics.prune`'s
 * `ctx.analyticsRetentionDays`) and logs the result, saying so when the time budget cut it short.
 * Apart from the privacy purge nulling user ids, the only code that updates or deletes an
 * `audit_log` row — every writer stays append-only. Options exist for tests (a small batch, a
 * tiny budget, a fake clock); the registered job uses the defaults.
 */
export function createAuditPruneJob({
  batchSize = AUDIT_PRUNE_BATCH,
  budgetMs = AUDIT_PRUNE_BUDGET_MS,
  clock,
}: AuditPruneOptions = {}) {
  return defineJob<Record<string, never>>({
    name: "audit.prune",
    payload: z.object({}),
    // No `timeoutMs` of its own: the default (60 s) keeps the worker's shared batch lock — and so
    // every crashed job's reclaim — where it was. The run's own budget (80 % of it) ends it first.
    run: async (_payload, ctx) => {
      const { stripped, deleted, partial } = await pruneAudit(ctx, { batchSize, budgetMs, clock })
      const prefix = partial
        ? "audit pruned (partial: time budget reached, the next run continues)"
        : "audit pruned"
      ctx.log(`${prefix}: ${stripped} stripped, ${deleted} deleted`, undefined)
    },
  })
}

export const auditPruneJob = createAuditPruneJob()
