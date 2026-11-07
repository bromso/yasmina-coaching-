import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validRequestId } from "@repo/log"
import { currentRequestId, withRequestContext } from "@repo/log/context"
import { SQL } from "bun"
import { z } from "zod"
import { storeAnalyticsProvider } from "../analytics/providers/provider"
import { createDb, type Db } from "../db"
import type { JobRow } from "../queries/jobs"
import { memoryBroadcaster } from "../realtime/memory"
import { localStorage } from "../storage/local"
import { storeProvider } from "../telemetry/store"
import { engines, testDatabase } from "../test-db"
import { captureMailer } from "../test-server"
import { backupRunJob } from "./builtin/backup"
import { defineJob, defineSchedule, type JobDefinition } from "./define"
import { createEnqueue } from "./enqueue"
import { dueSchedules, scheduleKey, tickSchedules } from "./scheduler"
import { createWorker } from "./worker"

const T0 = new Date("2026-10-06T12:00:00.000Z")
const HOUR = 3_600_000

/** Polls `check` every 5 ms until it is true, or fails after `timeoutMs`. */
async function until(check: () => boolean | Promise<boolean>, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`)
    await Bun.sleep(5)
  }
}

describe("scheduler", () => {
  test("scheduleKey is schedule:<name>:<UTC minute>", () => {
    expect(scheduleKey("tokens.prune", new Date("2026-10-06T03:15:42.123Z"))).toBe(
      "schedule:tokens.prune:2026-10-06T03:15"
    )
  })

  test("dueSchedules respects cron", () => {
    const job = defineJob({ name: "x", payload: z.object({}), run: async () => {} })
    const every5 = defineSchedule({ name: "five", cron: "*/5 * * * *", job, payload: {} })
    const nightly = defineSchedule({ name: "nightly", cron: "15 3 * * *", job, payload: {} })
    expect(dueSchedules([every5, nightly], new Date("2026-10-06T12:00:00Z"))).toEqual([every5])
    expect(dueSchedules([every5, nightly], new Date("2026-10-06T12:01:00Z"))).toEqual([])
    expect(dueSchedules([every5, nightly], new Date("2026-10-06T03:15:00Z"))).toEqual([
      every5,
      nightly,
    ])
  })
})

for (const engine of engines) {
  describe(`job worker on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    /** A tempfile SQLite database (so a raw second connection sees the rows), or a throwaway Postgres. */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "worker-test-")) : null
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
      return { db, raw, url: tdb.url }
    }

    const rowOf = async (raw: SQL, id: number) => {
      const [row]: JobRow[] = await raw`SELECT * FROM jobs WHERE id = ${id}`
      if (!row) throw new Error(`no job row for id ${id}`)
      return row
    }

    /** A worker over `db` with an injectable clock, a capturing log and recordFailure. */
    function setup(
      db: Db,
      // biome-ignore lint/suspicious/noExplicitAny: test jobs each carry their own payload type.
      jobs: readonly JobDefinition<any>[],
      extra: Partial<Parameters<typeof createWorker>[0]> = {}
    ) {
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
          storage: localStorage(join(tmpdir(), "worker-test-unused")),
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
        jobs,
        schedules: [],
        concurrency: 4,
        pollMs: 10,
        now: () => clock.at,
        log,
        recordFailure,
        ...extra,
      })
      cleanups.push(() => worker.stop(1_000))
      const enqueue = createEnqueue({ db, now: () => clock.at, nudge: worker.nudge })
      const advance = (ms: number) => {
        clock.at = new Date(clock.at.getTime() + ms)
      }
      return { worker, enqueue, clock, advance, logs, failures }
    }

    test("success → succeeded, payload {}", async () => {
      const { db, raw } = await fresh()
      const seen: unknown[] = []
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({ n: z.number() }),
        run: async (payload, ctx) => {
          seen.push(payload)
          expect(ctx.attempt).toBe(1)
          expect(ctx.signal.aborted).toBe(false)
        },
      })
      const { worker, enqueue } = setup(db, [ok])
      const id = await enqueue(ok, { n: 7 })
      await worker.drain()
      expect(seen).toEqual([{ n: 7 }])
      const row = await rowOf(raw, id)
      expect(row.status).toBe("succeeded")
      expect(row.payload).toBe("{}")
      expect(row.attempts).toBe(1)
      expect(row.finished_at).toBe(T0.toISOString())
    })

    test("a job with a stored request id runs inside that context", async () => {
      const { db } = await fresh()
      const seen: (string | undefined)[] = []
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        run: async () => {
          seen.push(currentRequestId())
        },
      })
      const { worker, enqueue } = setup(db, [ok])
      await withRequestContext({ requestId: "req-abcdefgh" }, () => enqueue(ok, {}))
      await worker.drain()
      expect(seen).toEqual(["req-abcdefgh"])
    })

    test("a poll nudged by an enqueue inside a request runs outside that request", async () => {
      const { db } = await fresh()
      const inJob: (string | undefined)[] = []
      const inClaim: (string | undefined)[] = []
      const claim = db.jobs.claim.bind(db.jobs)
      db.jobs.claim = (...args: Parameters<typeof claim>) => {
        inClaim.push(currentRequestId())
        return claim(...args)
      }
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        run: async () => void inJob.push(currentRequestId()),
      })
      const { worker, enqueue } = setup(db, [ok], { pollMs: 60_000 })
      worker.start()
      await withRequestContext({ requestId: "req-abcdefgh" }, () => enqueue(ok, {}))
      await until(() => inJob.length === 1 && inClaim.length >= 2)
      // The job itself runs in its stored request id; the claims around it carry none.
      expect(inJob).toEqual(["req-abcdefgh"])
      expect(inClaim.filter((id) => id !== undefined)).toEqual([])
    })

    test("a job enqueued with no request id runs inside a fresh one", async () => {
      const { db, raw } = await fresh()
      const seen: (string | undefined)[] = []
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        run: async () => {
          seen.push(currentRequestId())
        },
      })
      const { worker, enqueue } = setup(db, [ok])
      const id = await enqueue(ok, {})
      expect((await rowOf(raw, id)).request_id).toBeNull()
      await worker.drain()
      expect(seen).toHaveLength(1)
      const id0 = seen[0] ?? null
      expect(validRequestId(id0)).toBe(id0)
    })

    test("a schedule's enqueue stores no request id", async () => {
      const { db, raw } = await fresh()
      const job = defineJob({ name: "test.scheduled", payload: z.object({}), run: async () => {} })
      const schedule = defineSchedule({ name: "every-minute", cron: "* * * * *", job, payload: {} })
      const { clock, enqueue } = setup(db, [job])
      // The real worker ticks schedules from its own timer, outside any request — not wrapped here.
      await tickSchedules(enqueue, [schedule], clock.at)
      const [row] = await raw`SELECT * FROM jobs WHERE name = 'test.scheduled'`
      expect(row.request_id).toBeNull()
    })

    test("throws twice, then succeeds → succeeded after 3 attempts, run_at moved by backoff", async () => {
      const { db, raw } = await fresh()
      let calls = 0
      const flaky = defineJob({
        name: "test.flaky",
        payload: z.object({}),
        maxAttempts: 3,
        run: async () => {
          calls++
          if (calls < 3) throw new Error(`boom ${calls}`)
        },
      })
      const { worker, enqueue, clock, advance, failures, logs } = setup(db, [flaky])
      const id = await enqueue(flaky, {})
      const runAts: string[] = []
      for (let i = 0; i < 3; i++) {
        await worker.drain()
        const row = await rowOf(raw, id)
        runAts.push(row.run_at)
        if (i < 2) {
          expect(row.status).toBe("queued")
          expect(row.last_error).toBe(`boom ${i + 1}`)
          // Backoff (30 s × 2^(attempts−1), ±20 %) puts it in the future: not run again yet.
          expect(row.run_at > clock.at.toISOString()).toBe(true)
          await worker.drain()
          expect(calls).toBe(i + 1)
          advance(HOUR)
        }
      }
      const row = await rowOf(raw, id)
      expect(row.status).toBe("succeeded")
      expect(row.attempts).toBe(3)
      expect(new Set(runAts).size).toBe(2) // two backoffs; the success leaves run_at alone
      expect(failures).toEqual([])
      expect(logs.filter((m) => m.includes("test.flaky"))).toHaveLength(2)
    })

    test("always throwing → dead, last_error truncated, recordFailure once", async () => {
      const { db, raw } = await fresh()
      const fail = defineJob({
        name: "test.fail",
        payload: z.object({}),
        maxAttempts: 2,
        run: async () => {
          throw new Error("x".repeat(5_000))
        },
      })
      const { worker, enqueue, advance, failures } = setup(db, [fail])
      const id = await enqueue(fail, {})
      await worker.drain()
      expect((await rowOf(raw, id)).status).toBe("queued")
      advance(HOUR)
      await worker.drain()
      const row = await rowOf(raw, id)
      expect(row.status).toBe("dead")
      expect(row.attempts).toBe(2)
      expect(row.last_error?.length).toBe(2_000)
      expect(failures).toEqual(["job test.fail died"])
    })

    test("a job that never settles times out, its signal aborts, and the slot is freed", async () => {
      const { db, raw } = await fresh()
      let signal: AbortSignal | undefined
      const hang = defineJob({
        name: "test.hang",
        payload: z.object({}),
        maxAttempts: 2,
        timeoutMs: 50,
        run: (_payload, ctx) => {
          signal = ctx.signal
          return new Promise<void>(() => {})
        },
      })
      let okRan = false
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        run: async () => {
          okRan = true
        },
      })
      const { worker, enqueue, clock } = setup(db, [hang, ok], { concurrency: 1 })
      const hangId = await enqueue(hang, {}, { runAt: new Date(clock.at.getTime() - 1_000) })
      const okId = await enqueue(ok, {})
      await worker.drain()
      expect(signal?.aborted).toBe(true)
      const hung = await rowOf(raw, hangId)
      expect(hung.status).toBe("queued")
      expect(hung.last_error).toBe("timed out after 50 ms")
      expect(okRan).toBe(true)
      expect((await rowOf(raw, okId)).status).toBe("succeeded")
    })

    test("a long job (backup.run) gets its own lock; ordinary jobs keep the short shared one", async () => {
      const { db, raw } = await fresh()
      const hang = () => new Promise<void>(() => {})
      // backup.run's own name and 30-minute timeout, with a run that never finishes.
      const backup = { ...backupRunJob, run: hang }
      const mail = defineJob({ name: "test.mail", payload: z.object({}), run: hang })
      const { worker, enqueue, clock } = setup(db, [backup, mail])
      const mailId = await enqueue(mail, {})
      const backupId = await enqueue(backup, {})
      worker.start()
      await until(async () => (await rowOf(raw, backupId)).locked_until !== null)
      await until(async () => (await rowOf(raw, mailId)).status === "running")
      // The worker "crashes": the rows stay running with whatever lock the claim gave them.
      await worker.stop(0)
      const lockOf = async (id: number) =>
        Date.parse((await rowOf(raw, id)).locked_until ?? "") - clock.at.getTime()
      expect(await lockOf(mailId)).toBe(60_000 + 30_000)
      expect(await lockOf(backupId)).toBe(30 * 60_000 + 30_000)

      const after = (ms: number) => new Date(T0.getTime() + ms).toISOString()
      // 91 s on, only the mail is reclaimable …
      const early = await db.jobs.claim(after(91_000), 10, after(24 * 60 * 60_000))
      expect(early.map((row) => row.id)).toEqual([mailId])
      // … the backup only once its own 30.5 minutes have passed.
      expect(await db.jobs.claim(after(30 * 60_000), 10, after(40 * 60_000))).toEqual([])
      const late = await db.jobs.claim(after(30 * 60_000 + 31_000), 10, after(40 * 60_000))
      expect(late.map((row) => row.id)).toEqual([backupId])
    })

    test("a long job whose lock cannot be extended is not run on the short lock", async () => {
      const { db, raw } = await fresh()
      let backupRan = false
      let mailRan = false
      const backup = {
        ...backupRunJob,
        run: async () => {
          backupRan = true
        },
      }
      const mail = defineJob({
        name: "test.mail",
        payload: z.object({}),
        run: async () => {
          mailRan = true
        },
      })
      const failing = {
        ...db,
        jobs: {
          ...db.jobs,
          extendLock: async () => {
            throw new Error("database went away")
          },
        },
      }
      const { worker, enqueue } = setup(failing as typeof db, [backup, mail])
      const backupId = await enqueue(backup, {})
      const mailId = await enqueue(mail, {})
      await worker.drain()
      expect(mailRan).toBe(true)
      expect((await rowOf(raw, mailId)).status).toBe("succeeded")
      // Still claimed on the short shared lock: reclaimed (and run) once that lock passes.
      expect(backupRan).toBe(false)
      expect((await rowOf(raw, backupId)).status).toBe("running")
    })

    test("unknown name and invalid payload → dead with the reason, run never called", async () => {
      const { db, raw } = await fresh()
      let ran = 0
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({ n: z.number() }),
        run: async () => {
          ran++
        },
      })
      const { worker } = setup(db, [ok])
      const base = { maxAttempts: 3, runAt: T0.toISOString(), createdAt: T0.toISOString() }
      const unknown = await db.jobs.insert({ ...base, name: "test.nope", payload: "{}" })
      const invalid = await db.jobs.insert({ ...base, name: "test.ok", payload: '{"n":"x"}' })
      const notJson = await db.jobs.insert({ ...base, name: "test.ok", payload: "{oops" })
      await worker.drain()
      expect(ran).toBe(0)
      const u = await rowOf(raw, unknown)
      expect(u.status).toBe("dead")
      expect(u.last_error).toBe('unknown job "test.nope"')
      const i = await rowOf(raw, invalid)
      expect(i.status).toBe("dead")
      expect(i.last_error).toStartWith("invalid payload: ")
      expect(i.last_error).toContain("n")
      const j = await rowOf(raw, notJson)
      expect(j.status).toBe("dead")
      expect(j.last_error).toStartWith("invalid payload: ")
    })

    test("a reclaimed row already on its last attempt → dead, worker lost it", async () => {
      const { db, raw } = await fresh()
      let ran = 0
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        maxAttempts: 1,
        run: async () => {
          ran++
        },
      })
      const { worker } = setup(db, [ok])
      const id = await db.jobs.insert({
        name: "test.ok",
        payload: "{}",
        maxAttempts: 1,
        runAt: T0.toISOString(),
        createdAt: T0.toISOString(),
      })
      // A crashed worker's claim: running, attempts 1 of 1, lock already expired.
      await db.jobs.claim(T0.toISOString(), 1, new Date(T0.getTime() - 60_000).toISOString())
      await worker.drain()
      expect(ran).toBe(0)
      const row = await rowOf(raw, id)
      expect(row.status).toBe("dead")
      expect(row.last_error).toBe("worker lost the job on its last attempt")
    })

    test("two workers on one database run each of 20 jobs exactly once", async () => {
      const { db, raw, url } = await fresh()
      // SQLite: two workers in one process share its connection (two processes on one file are
      // db.test.ts's). Postgres: two separate pools.
      let db2 = db
      if (engine === "postgres") {
        db2 = createDb(url)
        cleanups.push(() => db2.close())
      }
      const counts = new Map<number, number>()
      const count = defineJob({
        name: "test.count",
        payload: z.object({ n: z.number() }),
        run: async ({ n }) => {
          counts.set(n, (counts.get(n) ?? 0) + 1)
          await Bun.sleep(2)
        },
      })
      const a = setup(db, [count])
      const b = setup(db2, [count])
      for (let n = 0; n < 20; n++) await a.enqueue(count, { n })
      await Promise.all([a.worker.drain(), b.worker.drain()])
      expect(counts.size).toBe(20)
      expect([...counts.values()].every((c) => c === 1)).toBe(true)
      const rows: { n: number | string }[] =
        await raw`SELECT COUNT(*) AS n FROM jobs WHERE status = 'succeeded'`
      expect(Number(rows[0]?.n)).toBe(20)
    })

    test("tickSchedules twice in one minute enqueues once; the next minute enqueues again", async () => {
      const { db, raw } = await fresh()
      const job = defineJob({ name: "test.tick", payload: z.object({}), run: async () => {} })
      const schedule = defineSchedule({ name: "tick", cron: "* * * * *", job, payload: {} })
      const enqueue = createEnqueue({ db, now: () => T0 })
      await Promise.all([
        tickSchedules(enqueue, [schedule], T0),
        tickSchedules(enqueue, [schedule], new Date(T0.getTime() + 30_000)),
      ])
      const countRows = async () => {
        const rows: { n: number | string }[] =
          await raw`SELECT COUNT(*) AS n FROM jobs WHERE name = 'test.tick'`
        return Number(rows[0]?.n)
      }
      expect(await countRows()).toBe(1)
      await tickSchedules(enqueue, [schedule], new Date(T0.getTime() + 60_000))
      expect(await countRows()).toBe(2)
      const keys: { dedupe_key: string }[] = await raw`SELECT dedupe_key FROM jobs ORDER BY id`
      expect(keys.map((k) => k.dedupe_key)).toEqual([
        "schedule:tick:2026-10-06T12:00",
        "schedule:tick:2026-10-06T12:01",
      ])
    })

    test("a schedule whose run already succeeded is not enqueued again by another worker's tick", async () => {
      const { db, raw, url } = await fresh()
      // A second worker process: its own connection (a separate pool on Postgres; on SQLite a
      // second connection to the same file).
      const db2 = createDb(url)
      cleanups.push(() => db2.close())
      let runs = 0
      const job = defineJob({
        name: "test.tick",
        payload: z.object({}),
        run: async () => {
          runs++
        },
      })
      const schedule = defineSchedule({ name: "tick", cron: "* * * * *", job, payload: {} })
      const a = setup(db, [job])
      await tickSchedules(a.enqueue, [schedule], T0)
      await a.worker.drain()
      expect(runs).toBe(1)
      expect((await rowOf(raw, 1)).status).toBe("succeeded")

      // Worker B ticks the same minute after A's run finished: the key is spent, not free.
      const enqueueB = createEnqueue({ db: db2, now: () => T0 })
      await tickSchedules(enqueueB, [schedule], new Date(T0.getTime() + 45_000))
      const countRows = async () => {
        const rows: { n: number | string }[] =
          await raw`SELECT COUNT(*) AS n FROM jobs WHERE name = 'test.tick'`
        return Number(rows[0]?.n)
      }
      expect(await countRows()).toBe(1)

      await tickSchedules(enqueueB, [schedule], new Date(T0.getTime() + 60_000))
      expect(await countRows()).toBe(2)
    })

    test("concurrency 4 caps in-flight jobs; a due schedule is still enqueued meanwhile", async () => {
      const { db, raw } = await fresh()
      let inFlight = 0
      let maxInFlight = 0
      let done = 0
      const busy = defineJob({
        name: "test.busy",
        payload: z.object({ n: z.number() }),
        run: async () => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          await Bun.sleep(5)
          inFlight--
          done++
        },
      })
      let scheduledRan = 0
      const scheduled = defineJob({
        name: "test.scheduled",
        payload: z.object({}),
        run: async () => {
          scheduledRan++
        },
      })
      const schedule = defineSchedule({
        name: "noon",
        cron: "0 12 * * *",
        job: scheduled,
        payload: {},
      })
      const { worker, enqueue, clock } = setup(db, [busy, scheduled], { schedules: [schedule] })
      // 50 ms before the minute boundary on the injected clock: the scheduler's first tick is due
      // while the 50 jobs keep every slot busy.
      clock.at = new Date(T0.getTime() - 50)
      for (let n = 0; n < 50; n++) await enqueue(busy, { n })
      worker.start()
      await until(() => done === 50 && scheduledRan === 1)
      expect(maxInFlight).toBeLessThanOrEqual(4)
      expect(maxInFlight).toBeGreaterThan(1)
      const keys: { dedupe_key: string | null }[] =
        await raw`SELECT dedupe_key FROM jobs WHERE name = 'test.scheduled'`
      expect(keys).toEqual([{ dedupe_key: "schedule:noon:2026-10-06T12:00" }])
    })

    test("a per-name limit of 1: one webhook job runs at a time, and mail still runs beside it", async () => {
      const { db } = await fresh()
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let webhooksInFlight = 0
      let maxWebhooks = 0
      let webhooksDone = 0
      const webhook = defineJob({
        name: "webhook.deliver",
        payload: z.object({ n: z.number() }),
        run: async () => {
          webhooksInFlight++
          maxWebhooks = Math.max(maxWebhooks, webhooksInFlight)
          await gate
          webhooksInFlight--
          webhooksDone++
        },
      })
      let mailRan = 0
      let webhooksWhileMail = -1
      const mail = defineJob({
        name: "mail.send",
        payload: z.object({}),
        run: async () => {
          webhooksWhileMail = webhooksInFlight
          mailRan++
        },
      })
      const { worker, enqueue } = setup(db, [webhook, mail], {
        nameLimits: { "webhook.deliver": 1 },
      })
      // The two slow webhook jobs are older than the mail, so a plain oldest-first claim would
      // take both of them before it.
      await enqueue(webhook, { n: 1 })
      await enqueue(webhook, { n: 2 })
      await enqueue(mail, {})
      worker.start()
      await until(() => mailRan === 1)
      expect(webhooksWhileMail).toBe(1)
      expect(webhooksInFlight).toBe(1)
      release()
      await until(() => webhooksDone === 2)
      expect(maxWebhooks).toBe(1)
    })

    test("with per-name limits, rows an earlier claim took still run when a later claim fails", async () => {
      const { db } = await fresh()
      const ran: string[] = []
      const webhook = defineJob({
        name: "webhook.deliver",
        payload: z.object({}),
        run: async () => void ran.push("webhook"),
      })
      const mail = defineJob({
        name: "mail.send",
        payload: z.object({}),
        run: async () => void ran.push("mail"),
      })
      const realClaim = db.jobs.claim.bind(db.jobs)
      let failed = false
      db.jobs.claim = async (...args) => {
        if (args[3]?.except && !failed) {
          failed = true
          throw new Error("database went away")
        }
        return realClaim(...args)
      }
      const { worker, enqueue } = setup(db, [webhook, mail], {
        nameLimits: { "webhook.deliver": 1 },
      })
      await enqueue(webhook, {})
      await enqueue(mail, {})
      await expect(worker.drain()).rejects.toThrow("database went away")
      await until(() => ran.includes("webhook"))
      await worker.drain()
      expect(ran.sort()).toEqual(["mail", "webhook"])
    })

    test("drain claims a capped job whose slot frees while an empty claim is in flight", async () => {
      // A claim that runs while every capped slot is busy takes nothing; when those jobs finish
      // during that claim, drain must claim again rather than read "nothing claimed, nothing
      // running" as an empty queue (the Postgres flake in webhook-delivery.test.ts).
      const { db, raw } = await fresh()
      let release = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const ran: number[] = []
      const webhook = defineJob({
        name: "webhook.deliver",
        payload: z.object({ n: z.number() }),
        run: async ({ n }) => {
          if (n === 1) await gate
          ran.push(n)
        },
      })
      const mail = defineJob({ name: "mail.send", payload: z.object({}), run: async () => {} })
      const { worker, enqueue } = setup(db, [webhook, mail], {
        concurrency: 2,
        nameLimits: { "webhook.deliver": 1 },
      })
      const first = await enqueue(webhook, { n: 1 })
      const second = await enqueue(webhook, { n: 2 })
      await enqueue(mail, {})
      const realClaim = db.jobs.claim.bind(db.jobs)
      let exceptClaims = 0
      db.jobs.claim = async (...args) => {
        // The second "every other name" claim runs with the capped slot still busy: let that job
        // finish (its slot settles) before this claim answers, as a slow database would.
        if (args[3]?.except && ++exceptClaims === 2) {
          release()
          await until(async () => (await rowOf(raw, first)).status === "succeeded")
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        return realClaim(...args)
      }
      cleanups.push(async () => {
        db.jobs.claim = realClaim
      })
      await worker.drain()
      expect(ran).toEqual([1, 2])
      expect((await rowOf(raw, second)).status).toBe("succeeded")
    })

    test("stop(1000) waits for a running job, and nothing is claimed after", async () => {
      const { db, raw } = await fresh()
      let started = 0
      let finished = 0
      const slow = defineJob({
        name: "test.slow",
        payload: z.object({}),
        run: async () => {
          started++
          await Bun.sleep(100)
          finished++
        },
      })
      const { worker, enqueue } = setup(db, [slow])
      worker.start()
      const first = await enqueue(slow, {})
      await until(() => started === 1)
      const t = performance.now()
      await worker.stop(1_000)
      expect(finished).toBe(1)
      expect(performance.now() - t).toBeLessThan(1_000)
      expect((await rowOf(raw, first)).status).toBe("succeeded")
      const second = await enqueue(slow, {})
      worker.nudge()
      await Bun.sleep(100)
      expect(started).toBe(1)
      expect((await rowOf(raw, second)).status).toBe("queued")
    })

    test("a failing poll is logged once a minute at most; polling continues", async () => {
      const { db, raw } = await fresh()
      let ran = 0
      const ok = defineJob({
        name: "test.ok",
        payload: z.object({}),
        run: async () => {
          ran++
        },
      })
      const { worker, enqueue, logs } = setup(db, [ok])
      const realClaim = db.jobs.claim
      let failuresLeft = 3
      db.jobs.claim = async (...args) => {
        if (failuresLeft > 0) {
          failuresLeft--
          throw new Error("database down")
        }
        return realClaim(...args)
      }
      cleanups.push(async () => {
        db.jobs.claim = realClaim
      })
      const id = await enqueue(ok, {})
      worker.start()
      await until(() => ran === 1)
      expect(failuresLeft).toBe(0)
      expect(logs.filter((m) => m.startsWith("job poll failed"))).toHaveLength(1)
      await until(async () => (await rowOf(raw, id)).status === "succeeded")
    })

    test("drain rejects when a claim fails instead of reporting an empty queue", async () => {
      const { db, raw } = await fresh()
      const ok = defineJob({ name: "test.ok", payload: z.object({}), run: async () => {} })
      const { worker, enqueue } = setup(db, [ok])
      const realClaim = db.jobs.claim
      db.jobs.claim = async () => {
        db.jobs.claim = realClaim
        throw new Error("database down")
      }
      cleanups.push(async () => {
        db.jobs.claim = realClaim
      })
      const id = await enqueue(ok, {})
      await expect(worker.drain()).rejects.toThrow("database down")
      await worker.drain()
      expect((await rowOf(raw, id)).status).toBe("succeeded")
    })

    test("a scheduler tick that wakes a minute or more late ticks the armed and the current minute", async () => {
      const { db, raw } = await fresh()
      const job = defineJob({ name: "test.tick", payload: z.object({}), run: async () => {} })
      const schedule = defineSchedule({ name: "tick", cron: "* * * * *", job, payload: {} })
      const { worker, clock } = setup(db, [job], { schedules: [schedule] })
      // Armed for 12:00, 50 ms away on the injected clock …
      clock.at = new Date(T0.getTime() - 50)
      worker.start()
      // … but by the time the timer fires, the clock reads 12:01:30.
      clock.at = new Date(T0.getTime() + 90_000)
      const keys = async () => {
        const rows: { dedupe_key: string }[] =
          await raw`SELECT dedupe_key FROM jobs WHERE name = 'test.tick' ORDER BY dedupe_key`
        return rows.map((row) => row.dedupe_key)
      }
      await until(async () => (await keys()).length === 2)
      await worker.stop(1_000)
      expect(await keys()).toEqual([
        "schedule:tick:2026-10-06T12:00",
        "schedule:tick:2026-10-06T12:01",
      ])
    })

    test("stop waits for a scheduler tick in progress", async () => {
      const { db } = await fresh()
      const job = defineJob({ name: "test.tick", payload: z.object({}), run: async () => {} })
      const schedule = defineSchedule({ name: "tick", cron: "* * * * *", job, payload: {} })
      const { worker, clock } = setup(db, [job], { schedules: [schedule] })
      const realInsert = db.jobs.insert
      let inserted = false
      let insertStarted = false
      db.jobs.insert = async (row) => {
        insertStarted = true
        await Bun.sleep(100)
        const id = await realInsert(row)
        inserted = true
        return id
      }
      cleanups.push(async () => {
        db.jobs.insert = realInsert
      })
      clock.at = new Date(T0.getTime() - 20)
      worker.start()
      await until(() => insertStarted)
      await worker.stop(1_000)
      expect(inserted).toBe(true)
    })
  })
}
