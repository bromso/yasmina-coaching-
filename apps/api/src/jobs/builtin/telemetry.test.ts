import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import { storeAnalyticsProvider } from "../../analytics/providers/provider"
import { createDb, type Db } from "../../db"
import type { ErrorRow } from "../../queries/telemetry"
import { memoryBroadcaster } from "../../realtime/memory"
import { localStorage } from "../../storage/local"
import type { TelemetryProvider } from "../../telemetry/provider"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import { createEnqueue } from "../enqueue"
import { createWorker } from "../worker"
import { telemetryForwardJob, telemetryPruneJob } from "./telemetry"

const T0 = new Date("2026-10-06T12:00:00.000Z")
const HOUR = 3_600_000
const DAY = 24 * HOUR

for (const engine of engines) {
  describe(`telemetry jobs on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "telemetry-job-test-")) : null
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

    function setup(db: Db, telemetry: TelemetryProvider) {
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
          storage: localStorage(join(tmpdir(), "telemetry-job-test-unused")),
          log,
          recordFailure,
          telemetry,
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
        jobs: [telemetryForwardJob, telemetryPruneJob],
        schedules: [],
        concurrency: 4,
        pollMs: 10,
        now: () => clock.at,
        log,
        recordFailure,
      })
      cleanups.push(() => worker.stop(1_000))
      const enqueue = createEnqueue({ db, now: () => clock.at, nudge: worker.nudge })
      const advance = (ms: number) => {
        clock.at = new Date(clock.at.getTime() + ms)
      }
      return { worker, enqueue, clock, advance, logs, failures }
    }

    test("telemetry.forward calls the provider with the row", async () => {
      const { db } = await fresh()
      const forwarded: ErrorRow[] = []
      const provider: TelemetryProvider = {
        kind: "sentry",
        onNewError: async (row) => void forwarded.push(row),
      }
      const { worker, enqueue } = setup(db, provider)
      const { row } = await db.telemetry.upsertError({
        fingerprint: "f".repeat(64),
        app: "api",
        event: { kind: "server", message: "boom" },
        now: T0.toISOString(),
      })
      await enqueue(telemetryForwardJob, { errorId: row.id })
      await worker.drain()
      expect(forwarded).toHaveLength(1)
      expect(forwarded[0]).toMatchObject({ id: row.id, message: "boom" })
    })

    test("telemetry.forward on an already-pruned row calls nothing and succeeds", async () => {
      const { db, raw } = await fresh()
      let called = 0
      const provider: TelemetryProvider = {
        kind: "sentry",
        onNewError: async () => {
          called++
        },
      }
      const { worker, enqueue } = setup(db, provider)
      await enqueue(telemetryForwardJob, { errorId: 999_999 })
      await worker.drain()
      expect(called).toBe(0)
      const rows: { status: string }[] = await raw`SELECT status FROM jobs`
      expect(rows.map((r) => r.status)).toEqual(["succeeded"])
    })

    test("a provider that fails twice then works retries, succeeds on attempt 3", async () => {
      const { db } = await fresh()
      let calls = 0
      const provider: TelemetryProvider = {
        kind: "sentry",
        onNewError: async () => {
          calls++
          if (calls < 3) throw new Error(`still down (${calls})`)
        },
      }
      const { worker, enqueue, advance } = setup(db, provider)
      const { row } = await db.telemetry.upsertError({
        fingerprint: "f".repeat(64),
        app: "api",
        event: { kind: "server", message: "boom" },
        now: T0.toISOString(),
      })
      await enqueue(telemetryForwardJob, { errorId: row.id })
      await worker.drain()
      expect(calls).toBe(1)
      advance(HOUR)
      await worker.drain()
      expect(calls).toBe(2)
      advance(HOUR)
      await worker.drain()
      expect(calls).toBe(3)
      expect((await db.jobs.counts()).succeeded).toBe(1)
    })

    test("a provider that never stops failing dies after 5 attempts, recorded as a failure", async () => {
      const { db } = await fresh()
      const provider: TelemetryProvider = {
        kind: "sentry",
        onNewError: async () => {
          throw new Error("provider down")
        },
      }
      const { worker, enqueue, advance, failures } = setup(db, provider)
      const { row } = await db.telemetry.upsertError({
        fingerprint: "f".repeat(64),
        app: "api",
        event: { kind: "server", message: "boom" },
        now: T0.toISOString(),
      })
      await enqueue(telemetryForwardJob, { errorId: row.id })
      for (let i = 0; i < 5; i++) {
        await worker.drain()
        advance(HOUR)
      }
      expect((await db.jobs.counts()).dead).toBe(1)
      expect(failures).toEqual(["job telemetry.forward died"])
    })

    test("telemetry.prune deletes old errors and vitals, keeps recent ones", async () => {
      const { db, raw } = await fresh()
      const provider: TelemetryProvider = { kind: "store", onNewError: async () => {} }
      const { worker, enqueue, clock } = setup(db, provider)
      const old = new Date(clock.at.getTime() - 31 * DAY).toISOString()
      const recent = clock.at.toISOString()
      await db.telemetry.upsertError({
        fingerprint: "old".padEnd(64, "0"),
        app: "api",
        event: { kind: "server", message: "old" },
        now: old,
      })
      await db.telemetry.upsertError({
        fingerprint: "new".padEnd(64, "0"),
        app: "api",
        event: { kind: "server", message: "new" },
        now: recent,
      })
      await db.telemetry.insertVitals(
        "api",
        [{ name: "CLS", value: 0.01, rating: "good", route: "/" }],
        new Date(clock.at.getTime() - 8 * DAY).toISOString()
      )
      await db.telemetry.insertVitals(
        "api",
        [{ name: "CLS", value: 0.02, rating: "good", route: "/" }],
        recent
      )
      await enqueue(telemetryPruneJob, {})
      await worker.drain()
      const errors: { message: string }[] = await raw`SELECT message FROM telemetry_errors`
      expect(errors.map((r) => r.message)).toEqual(["new"])
      const vitals: { value: number }[] = await raw`SELECT value FROM telemetry_vitals`
      expect(vitals.map((r) => Number(r.value))).toEqual([0.02])
    })
  })
}
