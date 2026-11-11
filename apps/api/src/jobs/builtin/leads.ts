import { z } from "zod"
import { defineJob } from "../define"

/**
 * Nightly (`10 4 * * *`): deletes every contact request past its `delete_after` (twelve months
 * after it arrived, `LEAD_RETENTION_MONTHS`). A lead has no file to clean up, so one statement
 * does it. Idempotent: a rerun finds nothing left to delete.
 */
export const leadsPruneJob = defineJob<Record<string, never>>({
  name: "leads.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    await ctx.db.leads.deleteExpired(ctx.now().toISOString())
  },
})
