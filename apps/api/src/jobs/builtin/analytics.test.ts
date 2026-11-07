import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import {
  type AnalyticsProvider,
  type ForwardItem,
  storeAnalyticsProvider,
} from "../../analytics/providers/provider"
import { createDb, type Db } from "../../db"
import { memoryBroadcaster } from "../../realtime/memory"
import { localStorage } from "../../storage/local"
import { storeProvider } from "../../telemetry/store"
import { engines, testDatabase } from "../../test-db"
import { captureMailer } from "../../test-server"
import type { JobContext } from "../define"
import type { Enqueue } from "../enqueue"
import { createEnqueue } from "../enqueue"
import { createWorker } from "../worker"
import {
  analyticsEventJob,
  analyticsForwardJob,
  analyticsPruneJob,
  analyticsRollupJob,
  rollupDays,
  yesterday,
} from "./analytics"

const T0 = new Date("2026-10-06T12:00:00.000Z")
const HOUR = 3_600_000

for (const engine of engines) {
  describe(`analytics jobs on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    /**
     * A tempfile SQLite database (not `:memory:`, private per connection) so the raw second
     * connection below can see what the queries layer wrote — the same pattern `jobs/queue.test.ts`
     * uses.
     */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "analytics-job-test-")) : null
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

    function ctx(
      db: Db,
      now: Date,
      analyticsRetentionDays = 90,
      opts: {
        analytics?: AnalyticsProvider
        enqueue?: Enqueue
        recordFailure?: (message: string, error: unknown) => void
      } = {}
    ): JobContext {
      return {
        db,
        mailer: captureMailer(),
        storage: localStorage(join(tmpdir(), "analytics-job-test-storage-unused")),
        log: () => {},
        recordFailure: opts.recordFailure ?? (() => {}),
        telemetry: storeProvider,
        analyticsRetentionDays,
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
        analytics: opts.analytics ?? storeAnalyticsProvider,
        enqueue: opts.enqueue ?? (async () => 0),
        signal: new AbortController().signal,
        attempt: 1,
        maxAttempts: 5,
        now: () => now,
      }
    }

    /** `analytics_daily`'s rows for one day, in a stable order for `toEqual`. */
    async function dailyRows(raw: SQL, day: string) {
      const rows: { kind: string; app: string; key: string; count: number; visitors: number }[] =
        await raw`
          SELECT kind, app, key, count, visitors FROM analytics_daily
          WHERE day = ${day} ORDER BY kind, key
        `
      return rows
    }

    async function saltDays(raw: SQL) {
      const rows: { day: string }[] = await raw`SELECT day FROM analytics_daily_salts ORDER BY day`
      return rows.map((r) => r.day)
    }

    test("yesterday() is the UTC day before `now`, whatever the local offset", () => {
      expect(yesterday(new Date("2026-10-06T00:10:00.000Z"))).toBe("2026-10-05")
      expect(yesterday(new Date("2026-10-06T23:59:59.000Z"))).toBe("2026-10-05")
      expect(yesterday(new Date("2026-01-01T00:00:00.000Z"))).toBe("2025-12-31")
    })

    test("analytics.event: the row's day comes from the event's own `at`, not the job's run time", async () => {
      const { db } = await fresh()
      const runsMuchLater = new Date("2026-10-08T03:00:00.000Z")
      await analyticsEventJob.run(
        {
          name: "note_created",
          userId: 1,
          workspaceId: 1,
          props: {},
          at: "2026-10-05T23:59:59.000Z",
        },
        ctx(db, runsMuchLater)
      )
      await analyticsEventJob.run(
        {
          name: "note_created",
          userId: 1,
          workspaceId: 1,
          props: {},
          at: "2026-10-06T00:00:01.000Z",
        },
        ctx(db, runsMuchLater)
      )
      const before = await db.analytics.eventsForDay("2026-10-05")
      const after = await db.analytics.eventsForDay("2026-10-06")
      expect(before).toHaveLength(1)
      expect(after).toHaveLength(1)
      expect(before[0]).toMatchObject({
        name: "note_created",
        source: "api",
        user_id: 1,
        workspace_id: 1,
        visitor_id: null,
      })
    })

    test("analytics.event enqueues analytics.forward only when the provider isn't store", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db, now: () => T0, nudge: () => {} })

      await analyticsEventJob.run(
        {
          name: "note_created",
          userId: 1,
          workspaceId: 1,
          props: {},
          at: "2026-10-05T12:00:00.000Z",
        },
        ctx(db, T0, 90, { analytics: storeAnalyticsProvider, enqueue })
      )
      expect(await raw`SELECT name FROM jobs`).toHaveLength(0)

      const posthogLike: AnalyticsProvider = { kind: "posthog", forward: async () => {} }
      await analyticsEventJob.run(
        {
          name: "note_created",
          userId: 2,
          workspaceId: 1,
          props: {},
          at: "2026-10-05T12:00:01.000Z",
        },
        ctx(db, T0, 90, { analytics: posthogLike, enqueue })
      )
      const rows: { name: string; payload: string }[] = await raw`SELECT name, payload FROM jobs`
      expect(rows).toHaveLength(1)
      expect(rows[0]?.name).toBe("analytics.forward")
      const payload = JSON.parse(rows[0]?.payload ?? "{}")
      expect(payload).toMatchObject({
        kind: "event",
        name: "note_created",
        source: "api",
        props: {},
        visitorId: null,
        userId: 2,
        at: "2026-10-05T12:00:01.000Z",
      })
      expect(payload.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    test("a forward-enqueue failure after the insert is recorded, not retried (no duplicate row)", async () => {
      const { db } = await fresh()
      const failures: string[] = []
      const failingEnqueue: Enqueue = async () => {
        throw new Error("db hiccup")
      }
      const posthogLike: AnalyticsProvider = { kind: "posthog", forward: async () => {} }
      await analyticsEventJob.run(
        {
          name: "note_created",
          userId: 1,
          workspaceId: 1,
          props: {},
          at: "2026-10-05T12:00:00.000Z",
        },
        ctx(db, T0, 90, {
          analytics: posthogLike,
          enqueue: failingEnqueue,
          recordFailure: (message) => failures.push(message),
        })
      )
      expect(await db.analytics.eventsForDay("2026-10-05")).toHaveLength(1)
      expect(failures).toEqual(["analytics.forward enqueue failed"])
    })

    test("analytics.rollup: counts pageviews (total + distinct visitors) and events per key", async () => {
      const { db, raw } = await fresh()
      const day = "2026-10-05"
      const at = `${day}T12:00:00.000Z`
      const pageview = (visitorId: string) =>
        db.analytics.insertPageview({
          app: "app",
          path: "/notes",
          referrerHost: null,
          visitorId,
          userId: null,
          workspaceId: null,
          day,
          createdAt: at,
        })
      // 3 pageviews on /notes from 2 distinct visitors.
      await pageview("v1")
      await pageview("v1")
      await pageview("v2")
      const noteCreated = (userId: number) =>
        db.analytics.insertEvent({
          name: "note_created",
          source: "api",
          props: {},
          visitorId: null,
          userId,
          workspaceId: 1,
          day,
          createdAt: at,
        })
      // 2 note_created events, by 2 different users.
      await noteCreated(1)
      await noteCreated(2)

      await analyticsRollupJob.run({ day }, ctx(db, new Date(`${day}T00:10:00.000Z`)))

      expect(await dailyRows(raw, day)).toEqual([
        { kind: "event", app: "api", key: "note_created", count: 2, visitors: 2 },
        // "*" (app total) sorts before "/notes": '*' < '/' — the per-app row rollup now also
        // writes, same count and distinct-visitor values here since "app" has only one page.
        { kind: "page", app: "app", key: "*", count: 3, visitors: 2 },
        { kind: "page", app: "app", key: "/notes", count: 3, visitors: 2 },
      ])
    })

    test("analytics.rollup is idempotent: running it twice lands on the same rows", async () => {
      const { db, raw } = await fresh()
      const day = "2026-10-05"
      await db.analytics.insertPageview({
        app: "app",
        path: "/notes",
        referrerHost: null,
        visitorId: "v1",
        userId: null,
        workspaceId: null,
        day,
        createdAt: `${day}T12:00:00.000Z`,
      })
      const runOnce = () =>
        analyticsRollupJob.run({ day }, ctx(db, new Date(`${day}T00:10:00.000Z`)))
      await runOnce()
      const first = await dailyRows(raw, day)
      await runOnce()
      await runOnce()
      expect(await dailyRows(raw, day)).toEqual(first)
      expect(first).toEqual([
        { kind: "page", app: "app", key: "*", count: 1, visitors: 1 },
        { kind: "page", app: "app", key: "/notes", count: 1, visitors: 1 },
      ])
    })

    test("analytics.rollup defaults to yesterday (UTC) when no day is given", async () => {
      const { db, raw } = await fresh()
      await db.analytics.insertPageview({
        app: "app",
        path: "/home",
        referrerHost: null,
        visitorId: "v1",
        userId: null,
        workspaceId: null,
        day: "2026-10-05",
        createdAt: "2026-10-05T23:00:00.000Z",
      })
      // Nothing for the other day, so a wrong default would show up as an empty rollup.
      await analyticsRollupJob.run({}, ctx(db, new Date("2026-10-06T00:10:00.000Z")))
      expect(await dailyRows(raw, "2026-10-05")).toEqual([
        { kind: "page", app: "app", key: "*", count: 1, visitors: 1 },
        { kind: "page", app: "app", key: "/home", count: 1, visitors: 1 },
      ])
      expect(await dailyRows(raw, "2026-10-06")).toEqual([])
    })

    test("rollupDays: the scheduled run rebuilds the day before yesterday and yesterday (UTC)", () => {
      expect(rollupDays(new Date("2026-10-06T00:10:00.000Z"))).toEqual(["2026-10-04", "2026-10-05"])
      expect(rollupDays(new Date("2026-01-01T00:10:00.000Z"))).toEqual(["2025-12-30", "2025-12-31"])
    })

    test("analytics.rollup with no day also rebuilds D-2, picking up a row that landed after its first rollup", async () => {
      const { db, raw } = await fresh()
      const pageview = (day: string, visitorId: string) =>
        db.analytics.insertPageview({
          app: "app",
          path: "/notes",
          referrerHost: null,
          visitorId,
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T23:59:00.000Z`,
        })
      await pageview("2026-10-04", "v1")
      // The 2026-10-05 00:10 run: rolls up 2026-10-04 with its one row.
      await analyticsRollupJob.run({}, ctx(db, new Date("2026-10-05T00:10:00.000Z")))
      expect(await dailyRows(raw, "2026-10-04")).toEqual([
        { kind: "page", app: "app", key: "*", count: 1, visitors: 1 },
        { kind: "page", app: "app", key: "/notes", count: 1, visitors: 1 },
      ])
      // A late row for 2026-10-04 (its job retried past 00:10), then the next night's run.
      await pageview("2026-10-04", "v2")
      await analyticsRollupJob.run({}, ctx(db, new Date("2026-10-06T00:10:00.000Z")))
      expect(await dailyRows(raw, "2026-10-04")).toEqual([
        { kind: "page", app: "app", key: "*", count: 2, visitors: 2 },
        { kind: "page", app: "app", key: "/notes", count: 2, visitors: 2 },
      ])
    })

    test("analytics.rollup leaves a day's analytics_daily rows alone once its raw rows are gone", async () => {
      const { db, raw } = await fresh()
      const day = "2026-07-01"
      await db.analytics.insertPageview({
        app: "app",
        path: "/notes",
        referrerHost: null,
        visitorId: "v1",
        userId: null,
        workspaceId: null,
        day,
        createdAt: `${day}T12:00:00.000Z`,
      })
      expect(await db.analytics.rollup(day)).toEqual({ rebuilt: true })
      const built = await dailyRows(raw, day)
      expect(built.length).toBeGreaterThan(0)
      // Past retention: the prune takes the raw rows. A re-run (manual, or as someone's D-2)
      // must not replace the rollup — now the day's only record — with nothing.
      await db.analytics.prune("2026-08-01", "2026-08-01")
      expect(await db.analytics.rollup(day)).toEqual({ rebuilt: false })
      await analyticsRollupJob.run({ day }, ctx(db, new Date("2026-10-06T00:10:00.000Z")))
      expect(await dailyRows(raw, day)).toEqual(built)
    })

    test("analytics.prune deletes raw rows past retention and salts older than today, keeping analytics_daily", async () => {
      const { db, raw } = await fresh()
      const old = "2026-09-01"
      const recent = "2026-10-05"
      const today = "2026-10-06"
      for (const day of [old, recent]) {
        await db.analytics.insertPageview({
          app: "app",
          path: "/p",
          referrerHost: null,
          visitorId: "v1",
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
        await db.analytics.insertEvent({
          name: "note_created",
          source: "api",
          props: {},
          visitorId: null,
          userId: 1,
          workspaceId: 1,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
        await db.analytics.saltFor(day)
      }
      await db.analytics.saltFor(today)
      // The rollup's own output survives whatever its age — simulate yesterday's as already built.
      await analyticsRollupJob.run({ day: recent }, ctx(db, new Date(`${today}T00:10:00.000Z`)))
      const builtRollup = await dailyRows(raw, recent)
      expect(builtRollup.length).toBeGreaterThan(0)

      // Retention of 30 days from "today": `old` (over a month back) is pruned, `recent` is kept.
      // The job's own `run` returns void (`JobDefinition`'s contract), so the counts it logs are
      // what this asserts on, not a throwaway `toBeUndefined()`.
      const logs: string[] = []
      await analyticsPruneJob.run(
        {},
        { ...ctx(db, new Date(`${today}T00:20:00.000Z`), 30), log: (m) => logs.push(m) }
      )
      expect(logs).toEqual(["analytics.prune: 1 pageview(s), 1 event(s), 2 salt(s)"])
      expect(await db.analytics.pageviewsForDay(old)).toHaveLength(0)
      expect(await db.analytics.eventsForDay(old)).toHaveLength(0)
      expect(await db.analytics.pageviewsForDay(recent)).toHaveLength(1)
      expect(await db.analytics.eventsForDay(recent)).toHaveLength(1)
      // Salts strictly before today are gone; today's own salt (just created) remains.
      expect(await saltDays(raw)).toEqual([today])
      // The rollup's own rows are never pruned, however old the day they summarise.
      expect(await dailyRows(raw, recent)).toEqual(builtRollup)
    })

    test("prune never deletes the two days the nightly rollup rebuilds", async () => {
      const { db, raw } = await fresh()
      const dMinus3 = "2026-10-03"
      const dMinus2 = "2026-10-04"
      const dMinus1 = "2026-10-05"
      const now = new Date("2026-10-06T00:20:00.000Z")
      for (const day of [dMinus3, dMinus2, dMinus1]) {
        await db.analytics.insertPageview({
          app: "app",
          path: "/p",
          referrerHost: null,
          visitorId: "v1",
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
      }
      // Retention of 1 day from `now` puts the cutoff at `dMinus1` — without the rollup-days
      // floor this would prune `dMinus2` too, before the nightly rollup has rebuilt it.
      const logs: string[] = []
      await analyticsPruneJob.run({}, { ...ctx(db, now, 1), log: (m) => logs.push(m) })
      expect(await db.analytics.pageviewsForDay(dMinus3)).toHaveLength(0)
      expect(await db.analytics.pageviewsForDay(dMinus2)).toHaveLength(1)
      expect(await db.analytics.pageviewsForDay(dMinus1)).toHaveLength(1)

      // The rollup (no `day`: its default `rollupDays`) still finds both days' raw rows.
      await analyticsRollupJob.run({}, ctx(db, now))
      expect((await dailyRows(raw, dMinus2)).length).toBeGreaterThan(0)
      expect((await dailyRows(raw, dMinus1)).length).toBeGreaterThan(0)
    })

    test("db.analytics.prune() (the query the job wraps) returns exactly how many rows it deleted", async () => {
      const { db } = await fresh()
      for (const day of ["2026-09-01", "2026-09-02"]) {
        await db.analytics.insertPageview({
          app: "app",
          path: "/p",
          referrerHost: null,
          visitorId: "v1",
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
      }
      await db.analytics.insertEvent({
        name: "note_created",
        source: "api",
        props: {},
        visitorId: null,
        userId: 1,
        workspaceId: 1,
        day: "2026-09-01",
        createdAt: "2026-09-01T12:00:00.000Z",
      })
      await db.analytics.saltFor("2026-09-01")
      await db.analytics.saltFor("2026-10-06")
      expect(await db.analytics.prune("2026-10-01", "2026-10-06")).toEqual({
        pageviews: 2,
        events: 1,
        salts: 1,
      })
      // Running it again finds nothing left to delete.
      expect(await db.analytics.prune("2026-10-01", "2026-10-06")).toEqual({
        pageviews: 0,
        events: 0,
        salts: 0,
      })
    })

    describe("analytics.forward (worker-driven)", () => {
      function workerSetup(db: Db, analytics: AnalyticsProvider) {
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
            storage: localStorage(join(tmpdir(), "analytics-forward-test-unused")),
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
            analytics,
            enqueue: async () => 0,
          },
          jobs: [analyticsForwardJob],
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

      const item: ForwardItem = {
        kind: "pageview",
        app: "www",
        path: "/",
        referrerHost: null,
        visitorId: "v1",
        userId: null,
        workspaceId: null,
        at: T0.toISOString(),
        uuid: "33333333-3333-3333-3333-333333333333",
      }

      test("calls the provider with the item", async () => {
        const { db } = await fresh()
        const forwarded: ForwardItem[] = []
        const analytics: AnalyticsProvider = {
          kind: "posthog",
          forward: async (i) => void forwarded.push(i),
        }
        const { worker, enqueue } = workerSetup(db, analytics)
        await enqueue(analyticsForwardJob, item)
        await worker.drain()
        expect(forwarded).toEqual([item])
      })

      test("a provider that resolves without throwing (its own 4xx) succeeds, once", async () => {
        const { db } = await fresh()
        let calls = 0
        const analytics: AnalyticsProvider = {
          kind: "plausible",
          forward: async () => {
            calls++
          },
        }
        const { worker, enqueue } = workerSetup(db, analytics)
        await enqueue(analyticsForwardJob, item)
        await worker.drain()
        expect(calls).toBe(1)
        expect((await db.jobs.counts()).succeeded).toBe(1)
      })

      test("a provider that fails twice (503/429) then works retries, succeeds on attempt 3", async () => {
        const { db } = await fresh()
        let calls = 0
        const analytics: AnalyticsProvider = {
          kind: "posthog",
          forward: async () => {
            calls++
            if (calls < 3) throw new Error(`still down (${calls})`)
          },
        }
        const { worker, enqueue, advance } = workerSetup(db, analytics)
        await enqueue(analyticsForwardJob, item)
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

      test("a retried forward resends the same uuid every attempt (the job's stored payload)", async () => {
        const { db } = await fresh()
        const uuids: string[] = []
        const analytics: AnalyticsProvider = {
          kind: "posthog",
          forward: async (i) => {
            uuids.push(i.uuid)
            if (uuids.length < 3) throw new Error(`still down (${uuids.length})`)
          },
        }
        const { worker, enqueue, advance } = workerSetup(db, analytics)
        await enqueue(analyticsForwardJob, item)
        await worker.drain()
        advance(HOUR)
        await worker.drain()
        advance(HOUR)
        await worker.drain()
        expect(uuids).toEqual([item.uuid, item.uuid, item.uuid])
      })

      test("a provider that never stops failing dies after 5 attempts, recorded as a failure", async () => {
        const { db } = await fresh()
        const analytics: AnalyticsProvider = {
          kind: "posthog",
          forward: async () => {
            throw new Error("provider down")
          },
        }
        const { worker, enqueue, advance, failures } = workerSetup(db, analytics)
        await enqueue(analyticsForwardJob, item)
        for (let i = 0; i < 5; i++) {
          await worker.drain()
          advance(HOUR)
        }
        expect((await db.jobs.counts()).dead).toBe(1)
        expect(failures).toEqual(["job analytics.forward died"])
      })
    })
  })
}
