import { z } from "zod"
import { defineJob } from "../define"

export const ERROR_RETENTION_MS = 30 * 24 * 60 * 60_000
export const VITAL_RETENTION_MS = 7 * 24 * 60 * 60_000

/**
 * Forwards one new (fingerprint, day) error row to the configured provider. `recordBatch`
 * (telemetry/record.ts) enqueues this only when the provider is not the keyless `store` — a
 * `store` provider's `onNewError` is a no-op, so there is nothing to queue. A provider that
 * throws (a bad response, a timeout the provider does not swallow itself) retries like any other
 * job and eventually dies, recorded through `recordFailure`.
 */
export const telemetryForwardJob = defineJob<{ errorId: number }>({
  name: "telemetry.forward",
  payload: z.object({ errorId: z.number().int().positive() }),
  run: async (payload, ctx) => {
    const row = await ctx.db.telemetry.findById(payload.errorId)
    // Already pruned (the retention schedule ran first, or the row's day aged out): nothing left
    // to forward.
    if (!row) return
    await ctx.telemetry.onNewError(row)
  },
})

/** The telemetry retention prune: old `telemetry_errors` and `telemetry_vitals` rows. */
export const telemetryPruneJob = defineJob<Record<string, never>>({
  name: "telemetry.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const now = ctx.now().getTime()
    await ctx.db.telemetry.prune(
      new Date(now - ERROR_RETENTION_MS).toISOString(),
      new Date(now - VITAL_RETENTION_MS).toISOString()
    )
  },
})
