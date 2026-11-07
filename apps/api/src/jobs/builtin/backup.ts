import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import { type DumpSource, dumpDatabase } from "../../backup/dump"
import { BACKUP_KEY_PATTERN } from "../../backup/format"
import type { Dialect } from "../../dialect"
import type { Storage } from "../../storage/storage"
import { defineJob } from "../define"

const pad = (n: number) => String(n).padStart(2, "0")

/** `backups/<YYYY-MM-DD>/<engine>-<HHMMSS>.jsonl.gz`, in UTC — see `BACKUP_KEY_PATTERN`. */
export function backupKey(engine: Dialect, at: Date): string {
  const date = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
  const time = `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`
  return `backups/${date}/${engine}-${time}.jsonl.gz`
}

/** The backup's own date, read from its key (never from storage metadata), past `retentionDays`. */
export function isBackupExpired(key: string, retentionDays: number, now: Date): boolean {
  const date = key.match(/^backups\/(\d{4}-\d{2}-\d{2})\//)?.[1]
  if (!date) return false
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000
  return Date.parse(`${date}T00:00:00Z`) < cutoff
}

/** Deletes every backup past `retentionDays`, by the date in its own key. A stray key under
 * `backups/` that `BACKUP_KEY_PATTERN` does not match (an upload that landed there by mistake) is
 * left alone, not deleted — the same rule `storage.sweep` applies to its own prefixes. */
async function pruneOldBackups(storage: Storage, retentionDays: number, now: Date): Promise<void> {
  for await (const object of storage.list("backups/")) {
    if (!BACKUP_KEY_PATTERN.test(object.key)) continue
    if (isBackupExpired(object.key, retentionDays, now)) await storage.delete(object.key)
  }
}

/**
 * Dumps `db` to a local temp file, then uploads it to `storage` at `key` — never straight to
 * storage: the dump holds its transaction (a Postgres snapshot, a SQLite read connection) for as
 * long as its stream is read (see `backup/dump.ts`), so draining it to disk first — fast, no
 * network — ends it well before a slow upload could stretch it. The temp file is always removed,
 * success or failure.
 * Shared by the nightly job below and the backup CLI (`backup-cli.ts`): the job's `signal` cancels
 * the dump (ending its transaction) and skips the upload once the job has timed out; the CLI
 * passes none. Resolves to the number of bytes uploaded.
 */
export async function dumpToStorage(
  db: DumpSource,
  storage: Storage,
  key: string,
  signal?: AbortSignal
): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "backup-run-"))
  const tempPath = join(dir, "backup.jsonl.gz")
  try {
    await Bun.write(tempPath, new Response(abortable(dumpDatabase(db), signal)))
    signal?.throwIfAborted()
    const bytes = new Uint8Array(await readFile(tempPath))
    await storage.put(key, bytes, "application/gzip")
    return bytes.byteLength
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * `stream`, cancelled when `signal` aborts: the relay errors (so the write stops) and the source
 * is cancelled (so the dump's transaction ends) instead of reading on after a timeout.
 */
function abortable(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal | undefined
): ReadableStream<Uint8Array> {
  if (!signal) return stream
  const relay = new TransformStream<Uint8Array, Uint8Array>()
  // The rejection is the abort itself (or a dump error, which the relay's reader sees too).
  stream.pipeTo(relay.writable, { signal }).catch(() => {})
  return relay.readable
}

/**
 * Dumps the whole database into the storage seam, then prunes backups older than
 * `ctx.backupRetentionDays`. Off by default (`BACKUP_ENABLED`); scheduled nightly at `0 2 * * *`
 * when it is on (see `jobs/registry.ts`). The backup CLI never enqueues it: it dumps directly
 * (through `dumpToStorage`), so a CLI backup does not move `backup_last_success_timestamp_seconds`.
 * A storage failure is recorded at once (an operator should hear about a failed backup sooner than
 * after five dead attempts) and rethrown, so the job still retries with the usual backoff. A prune
 * failure after a successful upload is only recorded: the backup exists, and re-running the whole
 * dump to retry a prune would upload another one; the next night prunes again.
 */
export const backupRunJob = defineJob<Record<string, never>>({
  name: "backup.run",
  payload: z.object({}),
  // A large database can take a while to dump and upload; well past the 60 s default.
  timeoutMs: 30 * 60_000,
  run: async (_payload, ctx) => {
    const now = ctx.now()
    const key = backupKey(ctx.db.dialect, now)
    let bytes: number
    try {
      bytes = await dumpToStorage(ctx.db, ctx.storage, key, ctx.signal)
    } catch (error) {
      // A timeout is already the worker's to record; anything else is a failed backup.
      if (!ctx.signal.aborted) ctx.recordFailure(`backup.run: writing ${key} failed`, error)
      throw error
    }
    ctx.log(`backup written ${key} (${bytes} bytes)`, undefined)

    if (ctx.signal.aborted) return
    try {
      await pruneOldBackups(ctx.storage, ctx.backupRetentionDays, now)
    } catch (error) {
      ctx.recordFailure("backup.run: pruning old backups failed", error)
    }
  },
})
