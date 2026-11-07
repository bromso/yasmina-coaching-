import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { withRequestContext } from "@repo/log/context"
import { SQL } from "bun"
import { z } from "zod"
import { createDb } from "../db"
import type { JobRow } from "../queries/jobs"
import { engines, testDatabase } from "../test-db"
import { defineJob } from "./define"
import { createEnqueue } from "./enqueue"

const testJob = defineJob({
  name: "test.echo",
  payload: z.object({ n: z.number() }),
  run: async () => {},
})

for (const engine of engines) {
  describe(`job queue on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0)) await c()
    })

    /**
     * A tempfile SQLite database (not `:memory:`, which is private per connection) so the raw
     * second connection below can see what the queries layer wrote — the same pattern
     * queries.test.ts uses for "the raw schema holds no plaintext secrets".
     */
    async function fresh() {
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "jobs-test-")) : null
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

    const now = () => new Date().toISOString()
    const future = () => new Date(Date.now() + 3_600_000).toISOString()
    const isoInMs = (ms: number) => new Date(Date.now() + ms).toISOString()
    const findById = async (raw: SQL, id: number) => {
      const [row]: JobRow[] = await raw`SELECT * FROM jobs WHERE id = ${id}`
      if (!row) throw new Error(`no job row for id ${id}`)
      return row
    }

    test("enqueue: an invalid payload throws in the caller; nothing is inserted", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const bad = { n: "nope" } as unknown as { n: number }
      await expect(enqueue(testJob, bad)).rejects.toThrow()
      expect(await db.jobs.counts()).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
    })

    test("enqueue: returns an id; the row is queued, attempts 0, max_attempts from the definition, run_at = now", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const before = now()
      const id = await enqueue(testJob, { n: 1 })
      expect(typeof id).toBe("number")

      const row = await findById(raw, id)
      expect(row.status).toBe("queued")
      expect(row.attempts).toBe(0)
      expect(row.max_attempts).toBe(testJob.maxAttempts)
      expect(row.run_at >= before).toBe(true)
      expect(row.run_at <= now()).toBe(true)
    })

    test("enqueue: an explicit runAt overrides now", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const runAt = isoInMs(3_600_000)
      const id = await enqueue(testJob, { n: 1 }, { runAt: new Date(runAt) })
      const row = await findById(raw, id)
      expect(row.run_at).toBe(runAt)
    })

    test("enqueue: inside a request context, the row stores that request id", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await withRequestContext({ requestId: "req-abcdefgh" }, () =>
        enqueue(testJob, { n: 1 })
      )
      const row = await findById(raw, id)
      expect(row.request_id).toBe("req-abcdefgh")
    })

    test("enqueue: outside a request context, the row stores null", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })
      const row = await findById(raw, id)
      expect(row.request_id).toBeNull()
    })

    test("enqueue: the same dedupeKey while queued returns the same id, one row; a new row after it succeeds", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const id1 = await enqueue(testJob, { n: 1 }, { dedupeKey: "k1" })
      const id2 = await enqueue(testJob, { n: 2 }, { dedupeKey: "k1" })
      expect(id2).toBe(id1)
      expect(await db.jobs.counts()).toMatchObject({ queued: 1 })

      const [claimed] = await db.jobs.claim(now(), 1, future())
      if (!claimed) throw new Error("expected a claimed row")
      expect(claimed.id).toBe(id1)
      expect(await db.jobs.succeed(id1, claimed.attempts, now())).toBe(true)

      const id3 = await enqueue(testJob, { n: 3 }, { dedupeKey: "k1" })
      expect(id3).not.toBe(id1)
      expect(await db.jobs.counts()).toMatchObject({ queued: 1, succeeded: 1 })
    })

    test("enqueue: the same dedupeKey twice inside one transaction resolves to the same id and commits (regression: the collision must never raise inside a tx)", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const [id1, id2] = await db.transaction(async (tx) => {
        const first = await enqueue(testJob, { n: 1 }, { dedupeKey: "tx-dupe", tx })
        const second = await enqueue(testJob, { n: 2 }, { dedupeKey: "tx-dupe", tx })
        return [first, second]
      })
      expect(id2).toBe(id1)
      expect(await db.jobs.counts()).toEqual({ queued: 1, running: 0, succeeded: 0, dead: 0 })
    })

    test("enqueue(..., { tx }) inside a transaction that then throws inserts no row", async () => {
      const { db } = await fresh()
      await expect(
        db.transaction(async (tx) => {
          const enqueue = createEnqueue({ db })
          await enqueue(testJob, { n: 1 }, { tx })
          throw new Error("rollback")
        })
      ).rejects.toThrow("rollback")
      expect(await db.jobs.counts()).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
    })

    test("claim: due queued rows oldest run_at first, up to limit; a future run_at is not claimed", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const idOld = await enqueue(testJob, { n: 1 }, { runAt: new Date(isoInMs(-2000)) })
      const idNew = await enqueue(testJob, { n: 2 }, { runAt: new Date(isoInMs(-1000)) })
      const idFuture = await enqueue(testJob, { n: 3 }, { runAt: new Date(isoInMs(3_600_000)) })

      const firstPage = await db.jobs.claim(now(), 1, future())
      expect(firstPage.map((r) => r.id)).toEqual([idOld])
      expect(firstPage[0]?.status).toBe("running")
      expect(firstPage[0]?.attempts).toBe(1)
      expect(firstPage[0]?.locked_until).not.toBeNull()

      const secondPage = await db.jobs.claim(now(), 10, future())
      expect(secondPage.map((r) => r.id)).toEqual([idNew])
      expect(secondPage.some((r) => r.id === idFuture)).toBe(false)

      expect(await db.jobs.claim(now(), 10, future())).toEqual([])
    })

    test("two concurrent claims over 10 due rows never claim the same row twice", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const ids: number[] = []
      for (let i = 0; i < 10; i++) ids.push(await enqueue(testJob, { n: i }))

      const [a, b] = await Promise.all([
        db.jobs.claim(now(), 10, future()),
        db.jobs.claim(now(), 10, future()),
      ])
      const claimedIds = [...a, ...b].map((r) => r.id)
      expect(claimedIds.length).toBe(10)
      expect(new Set(claimedIds).size).toBe(10)
      expect([...claimedIds].sort((x, y) => x - y)).toEqual([...ids].sort((x, y) => x - y))
    })

    test("a running row whose locked_until passed is claimed again, attempts incremented again", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })

      // Lock it with an already-past lockedUntil, as if the worker crashed mid-run.
      const [claimed1] = await db.jobs.claim(now(), 1, isoInMs(-1000))
      expect(claimed1?.id).toBe(id)
      expect(claimed1?.attempts).toBe(1)

      const [claimed2] = await db.jobs.claim(now(), 1, future())
      expect(claimed2?.id).toBe(id)
      expect(claimed2?.attempts).toBe(2)
    })

    test("succeed: sets succeeded, payload '{}', finished_at; a stale attempts count is a no-op", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })
      const [claimed] = await db.jobs.claim(now(), 1, future())
      if (!claimed) throw new Error("expected a claimed row")

      expect(await db.jobs.succeed(id, claimed.attempts - 1, now())).toBe(false)
      const at = now()
      expect(await db.jobs.succeed(id, claimed.attempts, at)).toBe(true)

      const row = await findById(raw, id)
      expect(row.status).toBe("succeeded")
      expect(row.payload).toBe("{}")
      expect(row.finished_at).toBe(at)

      // Already succeeded: `status = 'running'` no longer matches, so a repeat is also a no-op.
      expect(await db.jobs.succeed(id, claimed.attempts, now())).toBe(false)
    })

    test("retry: requeues with the given run_at and last_error; a stale attempts count is a no-op", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })
      const [claimed] = await db.jobs.claim(now(), 1, future())
      if (!claimed) throw new Error("expected a claimed row")

      expect(await db.jobs.retry(id, claimed.attempts - 1, future(), "nope")).toBe(false)
      const runAt = future()
      expect(await db.jobs.retry(id, claimed.attempts, runAt, "boom")).toBe(true)

      const row = await findById(raw, id)
      expect(row.status).toBe("queued")
      expect(row.run_at).toBe(runAt)
      expect(row.last_error).toBe("boom")
      expect(row.locked_until).toBeNull()
    })

    test("kill: sets dead with last_error and finished_at; a stale attempts count is a no-op", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })
      const [claimed] = await db.jobs.claim(now(), 1, future())
      if (!claimed) throw new Error("expected a claimed row")

      expect(await db.jobs.kill(id, claimed.attempts - 1, now(), "nope")).toBe(false)
      const at = now()
      expect(await db.jobs.kill(id, claimed.attempts, at, "fatal")).toBe(true)

      const row = await findById(raw, id)
      expect(row.status).toBe("dead")
      expect(row.finished_at).toBe(at)
      expect(row.last_error).toBe("fatal")
    })

    test("retry and kill both truncate last_error to 2000 chars", async () => {
      const { db, raw } = await fresh()
      const enqueue = createEnqueue({ db })
      const longError = "x".repeat(3000)

      const retriedId = await enqueue(testJob, { n: 1 })
      const [claimedForRetry] = await db.jobs.claim(now(), 1, future())
      if (!claimedForRetry) throw new Error("expected a claimed row")
      await db.jobs.retry(retriedId, claimedForRetry.attempts, future(), longError)
      const retriedRow = await findById(raw, retriedId)
      expect(retriedRow.last_error).toBe(longError.slice(0, 2000))
      expect(retriedRow.last_error?.length).toBe(2000)

      const killedId = await enqueue(testJob, { n: 2 })
      const [claimedForKill] = await db.jobs.claim(now(), 1, future())
      if (!claimedForKill) throw new Error("expected a claimed row")
      await db.jobs.kill(killedId, claimedForKill.attempts, now(), longError)
      const killedRow = await findById(raw, killedId)
      expect(killedRow.last_error).toBe(longError.slice(0, 2000))
      expect(killedRow.last_error?.length).toBe(2000)
    })

    test("listDead, resurrect and discard", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const id = await enqueue(testJob, { n: 1 })
      const [claimed] = await db.jobs.claim(now(), 1, future())
      if (!claimed) throw new Error("expected a claimed row")
      await db.jobs.kill(id, claimed.attempts, now(), "fatal")

      const dead = await db.jobs.listDead(10)
      expect(dead.map((r) => r.id)).toEqual([id])
      expect(dead[0] && "payload" in dead[0]).toBe(false)

      expect(await db.jobs.resurrect(id, now())).toBe(true)
      expect(await db.jobs.counts()).toMatchObject({ queued: 1, dead: 0 })
      expect(await db.jobs.resurrect(id, now())).toBe(false) // no longer dead

      const [reclaimed] = await db.jobs.claim(now(), 1, future())
      if (!reclaimed) throw new Error("expected a reclaimed row")
      expect(reclaimed.attempts).toBe(1) // resurrect reset attempts to 0
      await db.jobs.kill(id, reclaimed.attempts, now(), "fatal again")

      expect(await db.jobs.discard(id)).toBe(true)
      expect(await db.jobs.counts()).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
      expect(await db.jobs.discard(id)).toBe(false)
    })

    test("prune deletes old succeeded/dead rows only", async () => {
      const { db } = await fresh()
      const enqueue = createEnqueue({ db })
      const claimOne = async () => {
        const [row] = await db.jobs.claim(now(), 1, future())
        if (!row) throw new Error("expected a claimed row")
        return row
      }

      const oldSucceededId = await enqueue(testJob, { n: 1 })
      await db.jobs.succeed(oldSucceededId, (await claimOne()).attempts, isoInMs(-10 * 86_400_000))

      const recentSucceededId = await enqueue(testJob, { n: 2 })
      await db.jobs.succeed(recentSucceededId, (await claimOne()).attempts, now())

      const oldDeadId = await enqueue(testJob, { n: 3 })
      await db.jobs.kill(oldDeadId, (await claimOne()).attempts, isoInMs(-40 * 86_400_000), "boom")

      const recentDeadId = await enqueue(testJob, { n: 4 })
      await db.jobs.kill(recentDeadId, (await claimOne()).attempts, now(), "boom")

      await enqueue(testJob, { n: 5 }) // stays queued throughout

      const deleted = await db.jobs.prune(isoInMs(-7 * 86_400_000), isoInMs(-30 * 86_400_000))
      expect(deleted).toBe(2)
      expect(await db.jobs.counts()).toEqual({ queued: 1, running: 0, succeeded: 1, dead: 1 })
    })
  })
}
