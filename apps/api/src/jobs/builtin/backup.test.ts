import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { storeAnalyticsProvider } from "../../analytics/providers/provider"
import { BACKUP_KEY_PATTERN } from "../../backup/format"
import { restoreDatabase } from "../../backup/restore"
import { createDb, type Db } from "../../db"
import { isEnvEnabled } from "../../env"
import { memoryBroadcaster } from "../../realtime/memory"
import { localStorage } from "../../storage/local"
import type { Storage } from "../../storage/storage"
import { storeProvider } from "../../telemetry/store"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import { createEnqueue } from "../enqueue"
import { SCHEDULES } from "../registry"
import { dueSchedules } from "../scheduler"
import { createWorker } from "../worker"
import { backupKey, backupRunJob, dumpToStorage, isBackupExpired } from "./backup"

const T0 = new Date("2026-10-06T02:00:00.000Z")
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

describe("backupKey", () => {
  test("backups/<date>/<engine>-<time>.jsonl.gz, matching BACKUP_KEY_PATTERN", () => {
    const key = backupKey("sqlite", T0)
    expect(key).toBe("backups/2026-10-06/sqlite-020000.jsonl.gz")
    expect(BACKUP_KEY_PATTERN.test(key)).toBe(true)
    expect(BACKUP_KEY_PATTERN.test(backupKey("postgres", T0))).toBe(true)
  })
})

describe("isBackupExpired", () => {
  test("by the date in the key, not by lastModified", () => {
    expect(isBackupExpired("backups/2020-01-01/sqlite-000000.jsonl.gz", 14, T0)).toBe(true)
    expect(isBackupExpired(backupKey("sqlite", T0), 14, T0)).toBe(false)
    expect(isBackupExpired(backupKey("sqlite", new Date(T0.getTime() - DAY_MS)), 14, T0)).toBe(
      false
    )
    // Not one of ours: never reads as expired (the caller still filters by BACKUP_KEY_PATTERN).
    expect(isBackupExpired("backups/notes.txt", 14, T0)).toBe(false)
  })
})

describe("backup.run's schedule", () => {
  const schedule = SCHEDULES.find((s) => s.name === "backup.run")
  const AT = new Date("2026-10-07T02:00:00Z") // matches its cron, 0 2 * * *

  test("is registered at 0 2 * * *", () => {
    expect(schedule?.cron).toBe("0 2 * * *")
  })

  test("BACKUP_ENABLED unset: never due", () => {
    const original = Bun.env.BACKUP_ENABLED
    delete Bun.env.BACKUP_ENABLED
    try {
      expect(dueSchedules(SCHEDULES, AT).map((s) => s.name)).not.toContain("backup.run")
    } finally {
      if (original === undefined) delete Bun.env.BACKUP_ENABLED
      else Bun.env.BACKUP_ENABLED = original
    }
  })

  test("BACKUP_ENABLED=true: due at its cron minute, read fresh (not cached at import time)", () => {
    const original = Bun.env.BACKUP_ENABLED
    Bun.env.BACKUP_ENABLED = "true"
    try {
      expect(dueSchedules(SCHEDULES, AT).map((s) => s.name)).toContain("backup.run")
    } finally {
      if (original === undefined) delete Bun.env.BACKUP_ENABLED
      else Bun.env.BACKUP_ENABLED = original
    }
  })

  test("STORAGE_SWEEP_ENABLED: unset or blank → storage.sweep due; false pauses it", () => {
    const original = Bun.env.STORAGE_SWEEP_ENABLED
    const sweepAt = new Date("2026-10-06T03:30:00.000Z")
    const due = () => dueSchedules(SCHEDULES, sweepAt).map((s) => s.name)
    try {
      delete Bun.env.STORAGE_SWEEP_ENABLED
      expect(due()).toContain("storage.sweep")
      Bun.env.STORAGE_SWEEP_ENABLED = ""
      expect(due()).toContain("storage.sweep")
      Bun.env.STORAGE_SWEEP_ENABLED = "false"
      expect(due()).not.toContain("storage.sweep")
      Bun.env.STORAGE_SWEEP_ENABLED = "true"
      expect(due()).toContain("storage.sweep")
    } finally {
      if (original === undefined) delete Bun.env.STORAGE_SWEEP_ENABLED
      else Bun.env.STORAGE_SWEEP_ENABLED = original
    }
  })

  test("isEnvEnabled with a fallback: unset/blank is the fallback, a value decides", () => {
    expect(isEnvEnabled(undefined, true)).toBe(true)
    expect(isEnvEnabled(" ", true)).toBe(true)
    expect(isEnvEnabled("off", true)).toBe(false)
    expect(isEnvEnabled("on", false)).toBe(true)
  })

  test("isEnvEnabled: true/1/yes/on (any case); anything else, including unset, is false", () => {
    for (const value of ["true", "TRUE", "1", "yes", "on", " on\n"]) {
      expect(isEnvEnabled(value)).toBe(true)
    }
    for (const value of [undefined, "", "false", "0", "no", "off", "nope"]) {
      expect(isEnvEnabled(value)).toBe(false)
    }
  })
})

for (const engine of engines) {
  describe(`backup.run on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "backup-job-test-")) : null
      const tdb = dir
        ? {
            url: `sqlite://${join(dir, "t.db")}`,
            cleanup: async () => rmSync(dir, { recursive: true, force: true }),
          }
        : await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      cleanups.push(async () => {
        await db.close()
        await tdb.cleanup()
      })
      return { db }
    }

    /** A database with nothing in it — not even migrations — to restore into. */
    async function freshTarget() {
      const tdb =
        engine === "sqlite"
          ? { url: "sqlite://:memory:", cleanup: async () => {} }
          : await testDatabase("postgres")
      const db = createDb(tdb.url)
      cleanups.push(async () => {
        await db.close()
        await tdb.cleanup()
      })
      return db
    }

    async function storageDir() {
      const dir = await mkdtemp(join(tmpdir(), "backup-job-test-storage-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      return localStorage(dir)
    }

    /** A worker over `db` and `storage`, with an injectable clock. */
    function setup(db: Db, storage: Storage, retentionDays = 14) {
      const clock = { at: T0 }
      const logs: string[] = []
      const failures: string[] = []
      const log = (message: string) => void logs.push(message)
      const recordFailure = (message: string) => void failures.push(message)
      const worker = createWorker({
        db,
        context: {
          db,
          mailer: captureMailer(),
          storage,
          log,
          recordFailure,
          telemetry: storeProvider,
          analyticsRetentionDays: 90,
          backupRetentionDays: retentionDays,
          broadcaster: memoryBroadcaster(() => {}),
          auditPiiRetentionDays: 90,
          auditRetentionDays: 365,
          accountUrl: "http://account.example.com",
          storagePublicUrl: null,
          billing: { kind: "mock" as const, cancelSubscription: async () => {} },
          twoFactorKey: "unused",
          webhookResolve: async () => [],
          webhookAllowLocalhostHttp: false,
          analytics: storeAnalyticsProvider,
          enqueue: async () => 0,
        },
        jobs: [backupRunJob],
        schedules: [],
        concurrency: 4,
        pollMs: 10,
        now: () => clock.at,
        log,
        recordFailure,
      })
      cleanups.push(() => worker.stop(1_000))
      const enqueue = createEnqueue({ db, now: () => clock.at, nudge: worker.nudge })
      return { worker, enqueue, clock, logs, failures }
    }

    test("writes a backup object under backups/<today>/<engine>-<time>.jsonl.gz, and it restores", async () => {
      const { db } = await fresh()
      const storage = await storageDir()
      const { enqueue, worker } = setup(db, storage)

      await enqueue(backupRunJob, {})
      await worker.drain()

      const key = backupKey(db.dialect, T0)
      const object = await storage.get(key)
      expect(object).not.toBeNull()

      const target = await freshTarget()
      const result = await restoreDatabase(target, object?.body ?? new Uint8Array())
      expect(result.migrationsAfter).toEqual([])
    })

    test("retention deletes a backup older than BACKUP_RETENTION_DAYS, keeps a newer one and a stray key", async () => {
      const { db } = await fresh()
      const storage = await storageDir()
      const oldKey = backupKey(db.dialect, new Date(T0.getTime() - 15 * DAY_MS))
      const strayKey = "backups/notes.txt"
      await storage.put(oldKey, new TextEncoder().encode("old"), "application/gzip")
      await storage.put(strayKey, new TextEncoder().encode("not a backup"), "text/plain")

      const { enqueue, worker } = setup(db, storage, 14)
      await enqueue(backupRunJob, {})
      await worker.drain()

      expect(await storage.get(oldKey)).toBeNull()
      expect(await storage.get(strayKey)).not.toBeNull()
      expect(await storage.get(backupKey(db.dialect, T0))).not.toBeNull()
    })

    test("logs the key and size it wrote", async () => {
      const { db } = await fresh()
      const storage = await storageDir()
      const { enqueue, worker, logs } = setup(db, storage)
      await enqueue(backupRunJob, {})
      await worker.drain()
      const key = backupKey(db.dialect, T0)
      const size = (await storage.get(key))?.body.byteLength
      expect(logs).toContain(`backup written ${key} (${size} bytes)`)
    })

    test("a prune failure after the upload is recorded; the job succeeds, no second dump", async () => {
      const { db } = await fresh()
      const inner = await storageDir()
      let puts = 0
      const storage: Storage = {
        ...inner,
        async put(key, bytes, contentType) {
          puts++
          await inner.put(key, bytes, contentType)
        },
        // biome-ignore lint/correctness/useYield: a listing that fails before yielding anything.
        async *list() {
          throw new Error("list failed")
        },
      }
      const { enqueue, worker, failures } = setup(db, storage)
      const id = await enqueue(backupRunJob, {})
      await worker.drain()
      const [row] = await db.sql`SELECT * FROM jobs WHERE id = ${id}`
      expect(row.status).toBe("succeeded")
      expect(puts).toBe(1)
      expect(failures).toContain("backup.run: pruning old backups failed")
    })

    test("an aborted signal cancels the dump: nothing is uploaded, the database still answers", async () => {
      const { db } = await fresh()
      const storage = await storageDir()
      const controller = new AbortController()
      controller.abort(new Error("timed out"))
      const key = backupKey(db.dialect, T0)
      const outcome = await dumpToStorage(db, storage, key, controller.signal).then(
        () => "resolved",
        (error: unknown) => (error instanceof Error ? error.message : String(error))
      )
      expect(outcome).not.toBe("resolved")
      expect(await storage.get(key)).toBeNull()
      await db.ping()
    })

    test("a storage failure is recorded and the job retries, then succeeds", async () => {
      const { db } = await fresh()
      const inner = await storageDir()
      let failNext = true
      const storage: Storage = {
        ...inner,
        async put(key, bytes, contentType) {
          if (failNext) {
            failNext = false
            throw new Error("network down")
          }
          await inner.put(key, bytes, contentType)
        },
      }
      const { enqueue, worker, clock, failures } = setup(db, storage)
      const id = await enqueue(backupRunJob, {})
      await worker.drain()

      const [failed] = await db.sql`SELECT * FROM jobs WHERE id = ${id}`
      expect(failed.status).toBe("queued")
      expect(failed.attempts).toBe(1)
      expect(failures.some((message) => message.includes("backup.run"))).toBe(true)

      // Past the backoff: the next drain claims it again, and this time storage.put succeeds.
      clock.at = new Date(clock.at.getTime() + HOUR_MS)
      await worker.drain()
      const [succeeded] = await db.sql`SELECT * FROM jobs WHERE id = ${id}`
      expect(succeeded.status).toBe("succeeded")
    })
  })
}
