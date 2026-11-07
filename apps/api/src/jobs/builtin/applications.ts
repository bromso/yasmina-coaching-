import { z } from "zod"
import { defineJob } from "../define"
import { enqueueStorageDelete } from "./storage"

/**
 * Nightly (`50 3 * * *`): deletes every job application past its `delete_after` (six months after
 * it was sent) and queues its CV for `storage.delete`, in one transaction, so a row is never
 * deleted with its CV left unqueued. Idempotent: a rerun finds nothing left to delete.
 */
export const applicationsPruneJob = defineJob<Record<string, never>>({
  name: "applications.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const now = ctx.now().toISOString()
    await ctx.db.transaction(async (tx) => {
      for (const { id } of await tx.applications.expiredBefore(now)) {
        const deleted = await tx.applications.delete(id)
        if (deleted) await enqueueStorageDelete(ctx.enqueue, deleted.cvKey, { tx })
      }
    })
  },
})
