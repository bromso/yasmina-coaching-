import { z } from "zod"
import { defineJob } from "../define"

/** `jobs.prune` deletes `succeeded` rows older than this. */
const JOBS_SUCCEEDED_RETENTION_MS = 7 * 24 * 60 * 60_000
/** `jobs.prune` deletes `dead` rows older than this. */
const JOBS_DEAD_RETENTION_MS = 30 * 24 * 60 * 60_000

/**
 * Drops one-time tokens that can never be consumed again (used or expired) — what every
 * verify/reset/magic-link request path used to prune inline.
 */
export const tokensPruneJob = defineJob<Record<string, never>>({
  name: "tokens.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    await ctx.db.tokens.deleteStale(ctx.now().toISOString())
  },
})

/** Deletes `succeeded` jobs older than 7 days and `dead` jobs older than 30 — the queue's own housekeeping. */
export const jobsPruneJob = defineJob<Record<string, never>>({
  name: "jobs.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const now = ctx.now().getTime()
    await ctx.db.jobs.prune(
      new Date(now - JOBS_SUCCEEDED_RETENTION_MS).toISOString(),
      new Date(now - JOBS_DEAD_RETENTION_MS).toISOString()
    )
  },
})
