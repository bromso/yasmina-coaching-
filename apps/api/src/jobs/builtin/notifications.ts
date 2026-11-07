import {
  NOTIFICATION_READ_RETENTION_DAYS,
  NOTIFICATION_RETENTION_DAYS,
} from "@repo/api-contract/notifications"
import { z } from "zod"
import { defineJob } from "../define"

const DAY_MS = 86_400_000

/**
 * `notifications.prune` (nightly): deletes every read notification created more than
 * `NOTIFICATION_READ_RETENTION_DAYS` (30) days ago and every notification, read or not, created
 * more than `NOTIFICATION_RETENTION_DAYS` (90) days ago. Idempotent; reads the worker's clock.
 */
export const notificationsPruneJob = defineJob<Record<string, never>>({
  name: "notifications.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const now = ctx.now().getTime()
    const readBefore = new Date(now - NOTIFICATION_READ_RETENTION_DAYS * DAY_MS).toISOString()
    const anyBefore = new Date(now - NOTIFICATION_RETENTION_DAYS * DAY_MS).toISOString()
    await ctx.db.notifications.prune(readBefore, anyBefore)
  },
})
