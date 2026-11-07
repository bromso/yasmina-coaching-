import { CV_KEY_PATTERN, EXPORT_KEY_PATTERN, FILE_KEY_PATTERN } from "@repo/api-contract"
import { z } from "zod"
import { defineJob } from "../define"
import type { Enqueue, EnqueueOptions } from "../enqueue"

/** `storage.sweep` never deletes an object younger than this, referenced or not. */
const SWEEP_MIN_AGE_MS = 24 * 60 * 60 * 1000

/** How many listed keys `storage.sweep` checks against the database in one query. */
export const SWEEP_BATCH = 100

/** Deletes one storage object: every replaced/removed avatar or logo becomes this job. */
export const storageDeleteJob = defineJob<{ key: string }>({
  name: "storage.delete",
  payload: z.object({ key: z.string() }),
  run: async (payload, ctx) => {
    await ctx.storage.delete(payload.key)
  },
})

/**
 * Typed helper over `enqueue`: dedupes by key (`storage.delete:<key>`) unless the caller gives its
 * own `dedupeKey`, so replacing the same key twice before the first delete runs still queues one
 * job.
 */
export function enqueueStorageDelete(
  enqueue: Enqueue,
  key: string,
  options?: EnqueueOptions
): Promise<number> {
  return enqueue(
    storageDeleteJob,
    { key },
    { ...options, dedupeKey: options?.dedupeKey ?? `storage.delete:${key}` }
  )
}

/**
 * Deletes stored objects no row references, older than `SWEEP_MIN_AGE_MS` — the schedule that
 * catches what a crash between the storage write and the commit (or between the commit and the
 * `storage.delete` enqueue) would otherwise leave behind forever. `exports/` keys a `ready` data
 * export references, and `applications/` CVs a job application row references, are kept like
 * referenced avatars and logos. A key outside `FILE_KEY_PATTERN` (or `EXPORT_KEY_PATTERN` under
 * `exports/`, `CV_KEY_PATTERN` under `applications/`) is left alone, not deleted:
 * `local`'s `list` already skips such keys, but `s3`'s returns every object under the prefix,
 * and this is the one place a stray object would otherwise be removed with no human in the loop,
 * so the check here is what keeps it.
 *
 * "Unreferenced" means unreferenced by *this* database: two environments sharing one bucket (the
 * keys carry no environment prefix) delete each other's files: one bucket per environment.
 * Lookups go one query per `SWEEP_BATCH` keys, and the run stops when `ctx.signal` aborts.
 */
export const storageSweepJob = defineJob<Record<string, never>>({
  name: "storage.sweep",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const cutoff = ctx.now().getTime() - SWEEP_MIN_AGE_MS
    // Read once per run, on the first `exports/` (or `applications/`) batch: one query however
    // many files there are.
    let liveExports: Set<string> | undefined
    let liveCvs: Set<string> | undefined
    const patterns = {
      "avatars/": FILE_KEY_PATTERN,
      "logos/": FILE_KEY_PATTERN,
      "exports/": EXPORT_KEY_PATTERN,
      "applications/": CV_KEY_PATTERN,
    } as const
    // Fixed, exhaustive: `backups/` is deliberately never one of these. backup.run's own
    // retention prunes its own objects by BACKUP_KEY_PATTERN; a sweep run while a dump is mid
    // upload must never be able to see (let alone delete) a backup, referenced by no row as every
    // object here is.
    for (const prefix of ["avatars/", "logos/", "exports/", "applications/"] as const) {
      const pattern = patterns[prefix]
      const referencedIn = async (keys: string[]): Promise<Set<string>> => {
        if (prefix === "avatars/") return ctx.db.users.avatarKeysIn(keys)
        if (prefix === "logos/") return ctx.db.workspaces.logoKeysIn(keys)
        if (prefix === "applications/") {
          liveCvs ??= await ctx.db.applications.liveKeys()
          const live = liveCvs
          return new Set(keys.filter((key) => live.has(key)))
        }
        // Only a `ready` export's file is live; a pending row has no key yet and an expired one's
        // file is already queued for deletion.
        liveExports ??= await ctx.db.exports.liveKeys(prefix)
        const live = liveExports
        return new Set(keys.filter((key) => live.has(key)))
      }
      const sweep = async (keys: string[]) => {
        const referenced = await referencedIn(keys)
        for (const key of keys) {
          // Timed out: stop here. The worker already retries this attempt; nothing half-done needs
          // undoing (each delete stands alone).
          if (ctx.signal.aborted) return
          if (!referenced.has(key)) await ctx.storage.delete(key)
        }
      }
      let batch: string[] = []
      for await (const object of ctx.storage.list(prefix)) {
        if (ctx.signal.aborted) return
        if (!pattern.test(object.key)) continue
        if (object.lastModified.getTime() > cutoff) continue
        batch.push(object.key)
        if (batch.length === SWEEP_BATCH) {
          await sweep(batch)
          batch = []
        }
      }
      if (batch.length > 0) await sweep(batch)
      if (ctx.signal.aborted) return
    }
  },
})
