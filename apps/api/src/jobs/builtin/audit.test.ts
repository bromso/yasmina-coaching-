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
import { DEFAULT_TIMEOUT_MS, type JobContext } from "../define"
import {
  AUDIT_PRUNE_BATCH,
  AUDIT_PRUNE_BUDGET_MS,
  auditPruneJob,
  createAuditPruneJob,
  pruneAudit,
} from "./audit"

const DAY_MS = 24 * 60 * 60 * 1000
const T0 = new Date("2026-10-18T00:00:00.000Z")

for (const engine of engines) {
  describe(`audit.prune on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0).reverse()) await c()
    })

    /** A tempfile SQLite database (not `:memory:`) so the raw second connection sees what the queries layer wrote — same pattern as `analytics.test.ts`. */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "audit-job-test-")) : null
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
      options: {
        piiDays?: number
        rowDays?: number
        signal?: AbortSignal
        log?: JobContext["log"]
      } = {}
    ): JobContext {
      const {
        piiDays = 90,
        rowDays = 365,
        signal = new AbortController().signal,
        log = () => {},
      } = options
      return {
        db,
        mailer: captureMailer(),
        storage: localStorage(join(tmpdir(), "audit-job-test-storage-unused")),
        log,
        recordFailure: () => {},
        telemetry: storeProvider,
        analyticsRetentionDays: 90,
        backupRetentionDays: 14,
        broadcaster: memoryBroadcaster(() => {}),
        auditPiiRetentionDays: piiDays,
        auditRetentionDays: rowDays,
        analytics: storeAnalyticsProvider,
        accountUrl: "http://account.example.com",
        storagePublicUrl: null,
        billing: { kind: "mock" as const, cancelSubscription: async () => {} },
        twoFactorKey: "unused",
        webhookResolve: async () => [],
        webhookAllowLocalhostHttp: false,
        enqueue: async () => 0,
        signal,
        attempt: 1,
        maxAttempts: 5,
        now: () => now,
      }
    }

    /** Inserts one audit_log row with an explicit `at`, bypassing `db.audit.create` (which always
     * stamps `new Date().toISOString()`) so tests can place rows at exact ages. */
    async function insertRow(
      raw: SQL,
      {
        at,
        ip = "203.0.113.1",
        userAgent = "ua",
      }: { at: string; ip?: string | null; userAgent?: string | null }
    ): Promise<number> {
      const [row]: { id: number }[] = await raw`
        INSERT INTO audit_log (at, actor_user_id, impersonated_user_id, action, target_type, target_id, reason, ip, user_agent, metadata)
        VALUES (${at}, NULL, NULL, 'test.action', NULL, NULL, NULL, ${ip}, ${userAgent}, NULL)
        RETURNING id
      `
      // biome-ignore lint/style/noNonNullAssertion: INSERT ... RETURNING always produces a row
      return row!.id
    }

    async function rowOf(
      raw: SQL,
      id: number
    ): Promise<{ ip: string | null; user_agent: string | null } | undefined> {
      const [row]: { ip: string | null; user_agent: string | null }[] =
        await raw`SELECT ip, user_agent FROM audit_log WHERE id = ${id}`
      return row
    }

    async function exists(raw: SQL, id: number): Promise<boolean> {
      const rows = await raw`SELECT id FROM audit_log WHERE id = ${id}`
      return rows.length > 0
    }

    /** Wraps `db.audit.stripNetworkBetween`/`deleteBefore` to count calls, record each call's
     * `afterId` (the keyset cursor) and let a test react after each one resolves (e.g. abort the
     * signal after the first batch). */
    function countingAudit(
      db: Db,
      hooks: { onStrip?: (calls: number) => void; onDelete?: (calls: number) => void } = {}
    ) {
      const stripAfter: number[] = []
      const deleteAfter: number[] = []
      const order: string[] = []
      const audit = {
        ...db.audit,
        async stripNetworkBetween(from: string, to: string, afterId: number, limit: number) {
          const r = await db.audit.stripNetworkBetween(from, to, afterId, limit)
          stripAfter.push(afterId)
          order.push("strip")
          hooks.onStrip?.(stripAfter.length)
          return r
        },
        async deleteBefore(cutoff: string, afterId: number, limit: number) {
          const r = await db.audit.deleteBefore(cutoff, afterId, limit)
          deleteAfter.push(afterId)
          order.push("delete")
          hooks.onDelete?.(deleteAfter.length)
          return r
        },
      }
      return {
        db: { ...db, audit } as Db,
        stripCalls: () => stripAfter.length,
        deleteCalls: () => deleteAfter.length,
        stripAfter,
        deleteAfter,
        order,
      }
    }

    test("a row exactly at the pii cutoff keeps its ip/user_agent; just before it is stripped", async () => {
      const { db, raw } = await fresh()
      const piiCutoff = new Date(T0.getTime() - 90 * DAY_MS).toISOString()
      const atCutoff = await insertRow(raw, { at: piiCutoff })
      const justBefore = await insertRow(raw, {
        at: new Date(T0.getTime() - 90 * DAY_MS - 1).toISOString(),
      })

      // rowDays huge so the delete stage never reaches either row in this test.
      const result = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 10_000 }))
      expect(result).toEqual({ stripped: 1, deleted: 0, partial: false })

      expect(await rowOf(raw, atCutoff)).toEqual({ ip: "203.0.113.1", user_agent: "ua" })
      expect(await rowOf(raw, justBefore)).toEqual({ ip: null, user_agent: null })
    })

    test("a row exactly at the row cutoff is kept; just before it is deleted", async () => {
      const { db, raw } = await fresh()
      const rowCutoff = new Date(T0.getTime() - 365 * DAY_MS).toISOString()
      const atCutoff = await insertRow(raw, { at: rowCutoff })
      const justBefore = await insertRow(raw, {
        at: new Date(T0.getTime() - 365 * DAY_MS - 1).toISOString(),
      })

      // piiDays 1: the row just before the cutoff is deleted (never stripped first); the row at
      // the cutoff survives the delete stage and is then stripped like any other kept row.
      const result = await pruneAudit(ctx(db, T0, { piiDays: 1, rowDays: 365 }))
      expect(result).toEqual({ stripped: 1, deleted: 1, partial: false })

      expect(await exists(raw, atCutoff)).toBe(true)
      expect(await exists(raw, justBefore)).toBe(false)
    })

    test("stripping without deleting: a row past the pii cutoff but not the row cutoff loses its network details but survives", async () => {
      const { db, raw } = await fresh()
      const id = await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS).toISOString() })

      const result = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 365 }))
      expect(result).toEqual({ stripped: 1, deleted: 0, partial: false })
      expect(await exists(raw, id)).toBe(true)
      expect(await rowOf(raw, id)).toEqual({ ip: null, user_agent: null })
    })

    test("deleting: a row past the row cutoff is gone, whether or not it still held network details", async () => {
      const { db, raw } = await fresh()
      const alreadyStripped = await insertRow(raw, {
        at: new Date(T0.getTime() - 400 * DAY_MS).toISOString(),
        ip: null,
        userAgent: null,
      })
      const stillHoldingIt = await insertRow(raw, {
        at: new Date(T0.getTime() - 400 * DAY_MS).toISOString(),
      })

      const { db: counted, stripCalls, order } = countingAudit(db)
      const result = await pruneAudit(ctx(counted, T0, { piiDays: 90, rowDays: 365 }))
      // The delete stage runs first, and the strip stage is bounded below by the row cutoff, so a
      // row about to be deleted is never stripped first (one write per row, not two).
      expect(result).toEqual({ stripped: 0, deleted: 2, partial: false })
      expect(order[0]).toBe("delete")
      expect(stripCalls()).toBe(1)
      expect(await exists(raw, alreadyStripped)).toBe(false)
      expect(await exists(raw, stillHoldingIt)).toBe(false)
    })

    test("the batching loop drains a strip backlog over several batches, by id", async () => {
      const { db, raw } = await fresh()
      const ids: number[] = []
      for (let i = 0; i < 7; i++) {
        ids.push(
          await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS - i).toISOString() })
        )
      }
      const { db: counted, stripCalls, stripAfter } = countingAudit(db)

      const result = await pruneAudit(ctx(counted, T0, { piiDays: 90, rowDays: 10_000 }), {
        batchSize: 3,
      })
      expect(result.stripped).toBe(7)
      // 3 + 3 + 1: the loop keeps going while a batch is full and stops once one comes back short.
      expect(stripCalls()).toBe(3)
      // Keyset by id: each batch starts after the last id the previous one touched, rather than
      // rescanning rows earlier batches already stripped.
      const sorted = [...ids].sort((a, b) => a - b)
      expect(stripAfter).toEqual([0, sorted[2] as number, sorted[5] as number])
      for (const id of ids) expect(await rowOf(raw, id)).toEqual({ ip: null, user_agent: null })
    })

    test("the batching loop drains a delete backlog over several batches, by id", async () => {
      const { db, raw } = await fresh()
      const ids: number[] = []
      for (let i = 0; i < 7; i++) {
        ids.push(
          await insertRow(raw, {
            at: new Date(T0.getTime() - 400 * DAY_MS - i).toISOString(),
            ip: null,
            userAgent: null,
          })
        )
      }
      const { db: counted, deleteCalls, deleteAfter } = countingAudit(db)

      const result = await pruneAudit(ctx(counted, T0, { piiDays: 90, rowDays: 365 }), {
        batchSize: 3,
      })
      expect(result.deleted).toBe(7)
      expect(deleteCalls()).toBe(3)
      const sorted = [...ids].sort((a, b) => a - b)
      expect(deleteAfter).toEqual([0, sorted[2] as number, sorted[5] as number])
      for (const id of ids) expect(await exists(raw, id)).toBe(false)
    })

    test("stops when the signal aborts: the backlog is left for the next run", async () => {
      const { db, raw } = await fresh()
      const ids: number[] = []
      for (let i = 0; i < 5; i++) {
        ids.push(
          await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS - i).toISOString() })
        )
      }
      const controller = new AbortController()
      const { db: counted, stripCalls } = countingAudit(db, {
        onStrip: (calls) => {
          if (calls === 1) controller.abort()
        },
      })

      const result = await pruneAudit(
        ctx(counted, T0, { piiDays: 90, rowDays: 10_000, signal: controller.signal }),
        { batchSize: 2 }
      )
      // Only the first strip batch ran before the abort was observed (the delete stage, first,
      // found nothing); the run stopped there.
      expect(stripCalls()).toBe(1)
      expect(result).toEqual({ stripped: 2, deleted: 0, partial: true })
      // 2 of the 5 were stripped by the one batch that ran; the other 3 are left for next time.
      const remaining = await raw`SELECT COUNT(*) AS n FROM audit_log WHERE ip IS NOT NULL`
      expect(Number((remaining[0] as { n: number | string }).n)).toBe(3)

      // The next run (no abort) picks up exactly where this one left off.
      const next = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 10_000 }), { batchSize: 2 })
      expect(next.stripped).toBe(3)
      for (const id of ids) expect(await rowOf(raw, id)).toEqual({ ip: null, user_agent: null })
    })

    test("idempotent: a second run with nothing new to touch strips and deletes nothing", async () => {
      const { db, raw } = await fresh()
      await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS).toISOString() })
      await insertRow(raw, { at: new Date(T0.getTime() - 400 * DAY_MS).toISOString() })

      const first = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 365 }))
      expect(first).toEqual({ stripped: 1, deleted: 1, partial: false })

      const second = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 365 }))
      expect(second).toEqual({ stripped: 0, deleted: 0, partial: false })
    })

    test("auditPruneJob.run reads the retention from the job context and logs the counts", async () => {
      const { db, raw } = await fresh()
      await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS).toISOString() })
      await insertRow(raw, { at: new Date(T0.getTime() - 400 * DAY_MS).toISOString() })

      const logs: string[] = []
      await auditPruneJob.run(
        {},
        ctx(db, T0, { piiDays: 90, rowDays: 365, log: (m) => logs.push(m) })
      )
      expect(logs).toEqual(["audit pruned: 1 stripped, 1 deleted"])
    })

    test("auditPruneJob.run with a different context's retention days prunes to that boundary instead", async () => {
      const { db, raw } = await fresh()
      // 200 days old: pruned at piiDays 90/rowDays 365 (stripped only), untouched at piiDays
      // 300/rowDays 1000.
      const id = await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS).toISOString() })

      await auditPruneJob.run({}, ctx(db, T0, { piiDays: 300, rowDays: 1000 }))
      expect(await rowOf(raw, id)).toEqual({ ip: "203.0.113.1", user_agent: "ua" })

      await auditPruneJob.run({}, ctx(db, T0, { piiDays: 90, rowDays: 365 }))
      expect(await rowOf(raw, id)).toEqual({ ip: null, user_agent: null })
    })

    test("a row inserted out of id order is still reached: the keyset never skips a matching row", async () => {
      const { db, raw } = await fresh()
      // A newer id carrying an older `at` (a restore, a clock step): the strip stage walks ids, so
      // it is found wherever it sits.
      const recent = await insertRow(raw, { at: new Date(T0.getTime() - 1 * DAY_MS).toISOString() })
      const old = await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS).toISOString() })
      const result = await pruneAudit(ctx(db, T0, { piiDays: 90, rowDays: 365 }), { batchSize: 1 })
      expect(result).toEqual({ stripped: 1, deleted: 0, partial: false })
      expect(await rowOf(raw, recent)).toEqual({ ip: "203.0.113.1", user_agent: "ua" })
      expect(await rowOf(raw, old)).toEqual({ ip: null, user_agent: null })
    })

    test("the job stops at its time budget: it logs a partial run, returns normally, and the next run continues", async () => {
      const { db, raw } = await fresh()
      for (let i = 0; i < 4; i++) {
        await insertRow(raw, { at: new Date(T0.getTime() - 400 * DAY_MS - i).toISOString() })
      }
      for (let i = 0; i < 4; i++) {
        await insertRow(raw, { at: new Date(T0.getTime() - 200 * DAY_MS - i).toISOString() })
      }
      // A fake clock that advances 10 ms per read, against a 25 ms budget: the start read (0),
      // then a check before each batch (10, 20, 30) — two delete batches run, the third is refused.
      let t = 0
      const clock = () => {
        const now = t
        t += 10
        return now
      }
      const job = createAuditPruneJob({ batchSize: 2, budgetMs: 25, clock })
      const logs: string[] = []
      // Resolves (no throw): the worker records a success, not a failed attempt.
      await job.run({}, ctx(db, T0, { piiDays: 90, rowDays: 365, log: (m) => logs.push(m) }))
      expect(logs).toEqual([
        "audit pruned (partial: time budget reached, the next run continues): 0 stripped, 4 deleted",
      ])
      const held = await raw`SELECT COUNT(*) AS n FROM audit_log WHERE ip IS NOT NULL`
      expect(Number((held[0] as { n: number | string }).n)).toBe(4)

      // The next night (an unbounded budget here) drains the rest.
      const logs2: string[] = []
      await createAuditPruneJob({ batchSize: 2 }).run(
        {},
        ctx(db, T0, { piiDays: 90, rowDays: 365, log: (m) => logs2.push(m) })
      )
      expect(logs2).toEqual(["audit pruned: 4 stripped, 0 deleted"])
    })

    test("auditPruneJob keeps the default job timeout (60 s), with a budget of 80 % of it", () => {
      expect(auditPruneJob.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
      expect(DEFAULT_TIMEOUT_MS).toBe(60_000)
      expect(AUDIT_PRUNE_BUDGET_MS).toBe(48_000)
    })

    test("AUDIT_PRUNE_BATCH is the batch size the job itself runs with (1000, per the design)", () => {
      expect(AUDIT_PRUNE_BATCH).toBe(1000)
    })
  })
}
