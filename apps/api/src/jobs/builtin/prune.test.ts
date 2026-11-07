import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import { storeAnalyticsProvider } from "../../analytics/providers/provider"
import { createDb, type Db } from "../../db"
import { memoryBroadcaster } from "../../realtime/memory"
import { localStorage } from "../../storage/local"
import { storeProvider } from "../../telemetry/store"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import { createEnqueue } from "../enqueue"
import { createWorker } from "../worker"
import { jobsPruneJob, tokensPruneJob } from "./prune"

const T0 = new Date("2026-10-06T12:00:00.000Z")
const DAY = 24 * 60 * 60_000

for (const engine of engines) {
  describe(`maintenance prunes on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    /** A tempfile SQLite database (so a raw connection would see the rows too), or a throwaway Postgres. */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "prune-job-test-")) : null
      const tdb = dir
        ? {
            url: `sqlite://${join(dir, "t.db")}`,
            cleanup: async () => rmSync(dir, { recursive: true, force: true }),
          }
        : await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      const raw = new SQL(tdb.url)
      cleanups.push(async () => {
        await raw.close()
        await db.close()
        await tdb.cleanup()
      })
      return { db, raw }
    }

    /** A worker over `db` with an injectable clock, running only the two maintenance jobs. */
    function setup(db: Db) {
      const clock = { at: T0 }
      const log = () => {}
      const recordFailure = () => {}
      const worker = createWorker({
        db,
        context: {
          db,
          mailer: captureMailer(),
          storage: localStorage(join(tmpdir(), "prune-job-test-unused")),
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
        jobs: [jobsPruneJob, tokensPruneJob],
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

    test("tokens.prune deletes used/expired tokens of any purpose, keeps live ones", async () => {
      const { db, raw } = await fresh()
      const { worker, enqueue, clock } = setup(db)
      const user = await db.users.create({ email: "a@example.com", passwordHash: null, name: "A" })
      // Expired.
      await db.tokens.create({
        userId: user.id,
        purpose: "password_reset",
        tokenHash: "e".repeat(64),
        expiresAt: new Date(clock.at.getTime() - 1_000).toISOString(),
      })
      // Consumed (not expired).
      await db.tokens.create({
        userId: user.id,
        purpose: "magic_link",
        tokenHash: "c".repeat(64),
        expiresAt: new Date(clock.at.getTime() + DAY).toISOString(),
      })
      await db.tokens.invalidateForUser(user.id, "magic_link", clock.at.toISOString())
      // Live.
      await db.tokens.create({
        userId: user.id,
        purpose: "email_verify",
        tokenHash: "l".repeat(64),
        expiresAt: new Date(clock.at.getTime() + DAY).toISOString(),
      })
      expect((await raw`SELECT token_hash FROM tokens ORDER BY token_hash`).length).toBe(3)

      await enqueue(tokensPruneJob, {})
      await worker.drain()

      const left: { token_hash: string }[] = await raw`SELECT token_hash FROM tokens`
      expect(left.map((r) => r.token_hash)).toEqual(["l".repeat(64)])
    })

    test("jobs.prune deletes succeeded older than 7 days and dead older than 30, nothing else", async () => {
      const { db, raw } = await fresh()
      const { worker, enqueue, clock } = setup(db)
      // Four rows this worker will never run itself (no matching job definition), claimed and
      // finished directly through the queries layer, exactly as queue.test.ts does.
      const claimOne = async () => {
        const [row] = await db.jobs.claim(clock.at.toISOString(), 1, clock.at.toISOString())
        if (!row) throw new Error("expected a claimed row")
        return row
      }
      const isoInMs = (deltaMs: number) => new Date(clock.at.getTime() + deltaMs).toISOString()

      const oldSucceeded = await enqueue(jobsPruneJob, {}, { dedupeKey: "old-succeeded" })
      await db.jobs.succeed(oldSucceeded, (await claimOne()).attempts, isoInMs(-8 * DAY))

      const recentSucceeded = await enqueue(jobsPruneJob, {}, { dedupeKey: "recent-succeeded" })
      await db.jobs.succeed(recentSucceeded, (await claimOne()).attempts, clock.at.toISOString())

      const oldDead = await enqueue(jobsPruneJob, {}, { dedupeKey: "old-dead" })
      await db.jobs.kill(oldDead, (await claimOne()).attempts, isoInMs(-31 * DAY), "boom")

      const recentDead = await enqueue(jobsPruneJob, {}, { dedupeKey: "recent-dead" })
      await db.jobs.kill(recentDead, (await claimOne()).attempts, clock.at.toISOString(), "boom")

      // The job that runs the prune outlives its own run (it only just succeeded): it belongs in
      // the survivors too.
      const sweepItself = await enqueue(jobsPruneJob, {}, { dedupeKey: "the-sweep-itself" })
      await worker.drain()

      const left: { id: number }[] = await raw`SELECT id FROM jobs ORDER BY id`
      expect(left.map((r) => r.id).sort((a, b) => a - b)).toEqual(
        [recentSucceeded, recentDead, sweepItself].sort((a, b) => a - b)
      )
    })
  })
}
