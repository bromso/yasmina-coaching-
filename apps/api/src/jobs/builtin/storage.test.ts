import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { mkdtemp, rm, utimes } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { storeAnalyticsProvider } from "../../analytics/providers/provider"
import { newCvKey } from "../../applications"
import { createDb, type Db } from "../../db"
import { memoryBroadcaster } from "../../realtime/memory"
import { fakeS3 } from "../../storage/fake-s3"
import { localStorage } from "../../storage/local"
import { s3Storage } from "../../storage/s3"
import type { Storage } from "../../storage/storage"
import { storeProvider } from "../../telemetry/store"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import { newFileKey } from "../../uploads"
import { createEnqueue } from "../enqueue"
import { createWorker } from "../worker"
import { newExportKey } from "./privacy"
import { enqueueStorageDelete, SWEEP_BATCH, storageDeleteJob, storageSweepJob } from "./storage"

// Shared across every describe below (object storage, unlike the database, is not per-engine):
// a fake S3 server so storage.sweep is proven against both providers, not just local disk.
const fake = fakeS3()
afterAll(() => {
  fake.server.stop(true)
})
const s3For = () =>
  s3Storage({
    bucket: "test",
    region: "us-east-1",
    endpoint: `http://localhost:${fake.server.port}`,
    accessKeyId: "k",
    secretAccessKey: "s",
  })
/** Back-dates a fake S3 object's `lastModified` directly (there is no `utimes` for a bucket). */
function touchFakeS3(key: string, at: Date) {
  const object = fake.objects.get(`/test/${key}`)
  if (!object) throw new Error(`no fake s3 object for ${key}`)
  object.lastModified = at.getTime()
}

const T0 = new Date("2026-10-06T12:00:00.000Z")
const HOUR = 3_600_000
const DAY = 24 * HOUR

for (const engine of engines) {
  describe(`storage jobs on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "storage-job-test-")) : null
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

    /** A worker over `db` and `storage`, with an injectable clock. */
    function setup(db: Db, storage: Storage) {
      const clock = { at: T0 }
      const log = () => {}
      const recordFailure = () => {}
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
          backupRetentionDays: 14,
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
        jobs: [storageDeleteJob, storageSweepJob],
        schedules: [],
        concurrency: 4,
        pollMs: 10,
        now: () => clock.at,
        log,
        recordFailure,
      })
      cleanups.push(() => worker.stop(1_000))
      const enqueue = createEnqueue({ db, now: () => clock.at, nudge: worker.nudge })
      return { worker, enqueue, clock }
    }

    test("storage.delete removes the object; deleting a missing key is still fine", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue } = setup(db, storage)
      const key = newFileKey("avatars", 1, "png")
      await storage.put(key, new Uint8Array([1, 2, 3]), "image/png")
      await enqueue(storageDeleteJob, { key })
      await worker.drain()
      expect(await storage.get(key)).toBeNull()
      await enqueue(storageDeleteJob, { key }) // already gone: still succeeds
      await worker.drain()
      expect((await db.jobs.counts()).succeeded).toBe(2)
    })

    test("enqueueStorageDelete dedupes by key: replacing twice before drain queues one job", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue } = setup(db, storage)
      const key = newFileKey("avatars", 1, "png")
      await storage.put(key, new Uint8Array([1]), "image/png")
      await enqueueStorageDelete(enqueue, key)
      await enqueueStorageDelete(enqueue, key)
      expect((await db.jobs.counts()).queued).toBe(1)
      await worker.drain()
      expect(await storage.get(key)).toBeNull()
    })

    test("storage.sweep deletes only unreferenced objects older than 24h", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue, clock } = setup(db, storage)

      const user = await db.users.create({ email: "a@example.com", passwordHash: null, name: "A" })
      const referenced = newFileKey("avatars", user.id, "png")
      await storage.put(referenced, new Uint8Array([1]), "image/png")
      await db.users.setAvatarKey(user.id, referenced)

      const unreferencedOld = newFileKey("avatars", user.id, "png")
      await storage.put(unreferencedOld, new Uint8Array([2]), "image/png")

      const unreferencedRecent = newFileKey("avatars", user.id, "png")
      await storage.put(unreferencedRecent, new Uint8Array([3]), "image/png")

      // All three default to "now"; back-date the referenced and the old-unreferenced one so age
      // alone cannot explain which one survives.
      const touch = (key: string, at: Date) => utimes(join(dir, key), at, at)
      await touch(referenced, new Date(clock.at.getTime() - 10 * DAY))
      await touch(unreferencedOld, new Date(clock.at.getTime() - 2 * DAY))
      await touch(unreferencedRecent, new Date(clock.at.getTime() - 1 * HOUR))

      await enqueue(storageSweepJob, {})
      await worker.drain()

      expect(await storage.get(referenced)).not.toBeNull()
      expect(await storage.get(unreferencedOld)).toBeNull()
      expect(await storage.get(unreferencedRecent)).not.toBeNull()
    })

    test("storage.sweep also sweeps unreferenced logos, same rule, the other prefix", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue, clock } = setup(db, storage)

      const owner = await db.users.create({ email: "b@example.com", passwordHash: null, name: "B" })
      const workspace = await db.workspaces.create({
        name: "Acme",
        slug: "acme",
        createdBy: owner.id,
      })
      const referenced = newFileKey("logos", workspace.id, "png")
      await storage.put(referenced, new Uint8Array([1]), "image/png")
      await db.workspaces.setLogoKey(workspace.id, referenced)

      const unreferencedOld = newFileKey("logos", workspace.id, "png")
      await storage.put(unreferencedOld, new Uint8Array([2]), "image/png")

      const unreferencedRecent = newFileKey("logos", workspace.id, "png")
      await storage.put(unreferencedRecent, new Uint8Array([3]), "image/png")

      const touch = (key: string, at: Date) => utimes(join(dir, key), at, at)
      await touch(referenced, new Date(clock.at.getTime() - 10 * DAY))
      await touch(unreferencedOld, new Date(clock.at.getTime() - 2 * DAY))
      await touch(unreferencedRecent, new Date(clock.at.getTime() - 1 * HOUR))

      await enqueue(storageSweepJob, {})
      await worker.drain()

      expect(await storage.get(referenced)).not.toBeNull()
      expect(await storage.get(unreferencedOld)).toBeNull()
      expect(await storage.get(unreferencedRecent)).not.toBeNull()
    })

    test("storage.sweep keeps a ready export's file and deletes an orphan or expired one", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue, clock } = setup(db, storage)

      const user = await db.users.create({ email: "e@example.com", passwordHash: null, name: "E" })
      const at = (offset: number) => new Date(clock.at.getTime() + offset).toISOString()
      const live = newExportKey(user.id)
      const liveRow = await db.exports.create(user.id, at(-2 * DAY))
      await db.exports.markReady(liveRow.id, live, at(-2 * DAY), at(5 * DAY))
      const expired = newExportKey(user.id)
      const expiredRow = await db.exports.create(user.id, at(-9 * DAY))
      await db.exports.markReady(expiredRow.id, expired, at(-9 * DAY), at(-2 * DAY))
      await db.exports.expireBefore(at(0))
      const orphan = newExportKey(user.id)

      const touch = (key: string, when: Date) => utimes(join(dir, key), when, when)
      for (const key of [live, expired, orphan]) {
        await storage.put(key, new TextEncoder().encode("{}"), "application/json")
        await touch(key, new Date(clock.at.getTime() - 3 * DAY))
      }

      await enqueue(storageSweepJob, {})
      await worker.drain()

      expect(await storage.get(live)).not.toBeNull()
      expect(await storage.get(expired)).toBeNull()
      expect(await storage.get(orphan)).toBeNull()
    })

    test("storage.sweep keeps a CV a job application references and deletes an orphan", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue, clock } = setup(db, storage)

      const live = newCvKey()
      await db.applications.create({
        jobSlug: "engineer",
        jobTitle: "Engineer",
        name: "Ada",
        email: "ada@example.com",
        link: null,
        note: null,
        cvKey: live,
        ipHash: null,
        createdAt: clock.at.toISOString(),
        deleteAfter: new Date(clock.at.getTime() + 180 * DAY).toISOString(),
      })
      const orphan = newCvKey()
      const recent = newCvKey()
      for (const key of [live, orphan, recent]) {
        await storage.put(key, new TextEncoder().encode("%PDF-"), "application/pdf")
      }
      const old = new Date(clock.at.getTime() - 3 * DAY)
      await utimes(join(dir, live), old, old)
      await utimes(join(dir, orphan), old, old)

      await enqueue(storageSweepJob, {})
      await worker.drain()

      expect(await storage.get(live)).not.toBeNull()
      expect(await storage.get(orphan)).toBeNull()
      // Younger than 24 h: an upload whose row may still be committing.
      expect(await storage.get(recent)).not.toBeNull()
    })

    test("storage.sweep over the s3 provider deletes only unreferenced objects older than 24h", async () => {
      const { db } = await fresh()
      const storage = s3For()
      const { worker, enqueue, clock } = setup(db, storage)

      const user = await db.users.create({ email: "s3@example.com", passwordHash: null, name: "S" })
      const referenced = newFileKey("avatars", user.id, "png")
      await storage.put(referenced, new Uint8Array([1]), "image/png")
      await db.users.setAvatarKey(user.id, referenced)

      const unreferencedOld = newFileKey("avatars", user.id, "png")
      await storage.put(unreferencedOld, new Uint8Array([2]), "image/png")

      const unreferencedRecent = newFileKey("avatars", user.id, "png")
      await storage.put(unreferencedRecent, new Uint8Array([3]), "image/png")

      touchFakeS3(referenced, new Date(clock.at.getTime() - 10 * DAY))
      touchFakeS3(unreferencedOld, new Date(clock.at.getTime() - 2 * DAY))
      touchFakeS3(unreferencedRecent, new Date(clock.at.getTime() - 1 * HOUR))

      await enqueue(storageSweepJob, {})
      await worker.drain()

      expect(await storage.get(referenced)).not.toBeNull()
      expect(await storage.get(unreferencedOld)).toBeNull()
      expect(await storage.get(unreferencedRecent)).not.toBeNull()
    })

    test("storage.sweep leaves a key outside FILE_KEY_PATTERN alone", async () => {
      const { db } = await fresh()
      const dir = await mkdtemp(join(tmpdir(), "storage-job-test-disk-"))
      cleanups.push(() => rm(dir, { recursive: true, force: true }))
      const storage = localStorage(dir)
      const { worker, enqueue, clock } = setup(db, storage)
      // `local.list` itself already skips anything that fails the pattern, so this stray file
      // never even reaches the job — the job has nothing to decide, and nothing is deleted.
      const stray = "avatars/1/not-a-real-key.png"
      await storage.put(stray, new Uint8Array([9]), "image/png")
      await utimes(
        join(dir, stray),
        new Date(clock.at.getTime() - 10 * DAY),
        new Date(clock.at.getTime() - 10 * DAY)
      )
      await enqueue(storageSweepJob, {})
      await worker.drain()
      expect(await storage.get(stray)).not.toBeNull()
    })

    /** A storage that lists `count` old avatar keys and records deletes; `onListed` sees each. */
    function listingStorage(count: number, onListed: (n: number) => void = () => {}) {
      const deleted: string[] = []
      const old = new Date(T0.getTime() - 2 * DAY)
      const keys = Array.from({ length: count }, () => newFileKey("avatars", 1, "png"))
      const storage: Storage = {
        kind: "local",
        put: async () => {},
        get: async () => null,
        delete: async (key) => void deleted.push(key),
        async *list(prefix) {
          if (prefix !== "avatars/") return
          for (const [n, key] of keys.entries()) {
            yield { key, lastModified: old }
            onListed(n + 1)
          }
        },
      }
      return { storage, deleted, keys }
    }

    function sweepContext(db: Db, storage: Storage, signal: AbortSignal) {
      return {
        db,
        mailer: captureMailer(),
        storage,
        log: () => {},
        recordFailure: () => {},
        telemetry: storeProvider,
        analyticsRetentionDays: 90,
        backupRetentionDays: 14,
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
        signal,
        attempt: 1,
        maxAttempts: 5,
        now: () => T0,
      }
    }

    test("storage.sweep looks referenced keys up one query per batch, not per object", async () => {
      const { db } = await fresh()
      const { storage, deleted, keys } = listingStorage(SWEEP_BATCH * 2 + 5)
      let lookups = 0
      const counting = new Proxy(db.users, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver)
          if (typeof value !== "function") return value
          return (...args: unknown[]) => {
            lookups++
            return value.apply(target, args)
          }
        },
      })
      const user = await db.users.create({ email: "k@example.com", passwordHash: null, name: "K" })
      await db.users.setAvatarKey(user.id, keys[7] as string)
      await storageSweepJob.run(
        {},
        sweepContext({ ...db, users: counting }, storage, new AbortController().signal)
      )
      expect(lookups).toBe(3)
      expect(deleted).toHaveLength(keys.length - 1)
      expect(deleted).not.toContain(keys[7])
    })

    test("storage.sweep stops cleanly once its signal aborts", async () => {
      const { db } = await fresh()
      const controller = new AbortController()
      const { storage, deleted } = listingStorage(SWEEP_BATCH * 3, (n) => {
        if (n === SWEEP_BATCH + 10) controller.abort()
      })
      await storageSweepJob.run({}, sweepContext(db, storage, controller.signal))
      // The first batch was swept before the abort; nothing after it.
      expect(deleted).toHaveLength(SWEEP_BATCH)
    })
  })
}
