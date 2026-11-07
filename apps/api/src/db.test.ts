import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import { createDb, type Db, gateTimeoutMessage, serialiseSqlite } from "./db"

// SQLite-specific behaviour of createDb: the connection pragmas, the transaction gate and two
// processes sharing one file. Postgres has none of these concerns (a real pool, MVCC, row locks).
describe("createDb on SQLite", () => {
  const cleanups: Array<() => Promise<void> | void> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
  })

  async function fileDb(): Promise<{ db: Db; url: string; file: string }> {
    const dir = mkdtempSync(join(tmpdir(), "db-test-"))
    const file = join(dir, "t.db")
    const url = `sqlite://${file}`
    const db = createDb(url)
    await db.migrate()
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    cleanups.push(() => db.close())
    return { db, url, file }
  }

  const job = (n: number, at = new Date().toISOString()) => ({
    name: "test.db",
    payload: JSON.stringify({ n }),
    maxAttempts: 3,
    runAt: at,
    createdAt: at,
  })

  test("exposes the dialect it picked from the URL", async () => {
    const { db } = await fileDb()
    expect(db.dialect).toBe("sqlite")
  })

  test("a statement failing inside a transaction rejects only the transaction", async () => {
    // Bun's `sql.begin` calls `finally` on each statement and drops the promise it returns; with
    // the gate's own `finally`, that dropped promise was an unhandled rejection, which exits a Bun
    // process outright (an anonymous `jobs.apply` racing the same CV key would take the api down).
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)
    cleanups.push(() => {
      process.off("unhandledRejection", onUnhandled)
    })
    const db = createDb("sqlite://:memory:")
    cleanups.push(() => db.close())
    await db.migrate()
    const row = {
      jobSlug: "role",
      jobTitle: "Role",
      name: "Ada",
      email: "ada@example.com",
      link: null,
      note: null,
      cvKey: "applications/aaaaaaaaaaaaaaaaaaaaaa.pdf",
      ipHash: null,
      createdAt: new Date().toISOString(),
      deleteAfter: new Date().toISOString(),
    }
    const attempt = db.transaction(async (tx) => {
      await tx.applications.create(row)
      await tx.applications.create(row) // the unique cv_key index refuses this one
    })
    await expect(attempt).rejects.toThrow(/UNIQUE/)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(unhandled).toEqual([])
    expect(await db.applications.liveKeys()).toEqual(new Set())
  })

  test("a file database runs in WAL mode", async () => {
    // journal_mode is a property of the file, so a second connection reads it back. (busy_timeout
    // is per connection; the two-process test below is what proves it.)
    const { url } = await fileDb()
    const raw = new SQL(url)
    cleanups.push(() => raw.close())
    const [mode]: { journal_mode: string }[] = await raw.unsafe("PRAGMA journal_mode")
    expect(mode?.journal_mode).toBe("wal")
  })

  test("a statement outside an open transaction is not rolled back with it", async () => {
    const { db, url } = await fileDb()
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = () => {}
    const inside = new Promise<void>((resolve) => {
      entered = resolve
    })

    const rolledBack = db
      .transaction(async (tx) => {
        await tx.jobs.insert(job(1))
        entered()
        await held
        throw new Error("roll back")
      })
      .then(
        () => "committed",
        (error: Error) => error.message
      )

    await inside
    // Issued while the transaction is open, on the pool: it must wait for the transaction to end,
    // not join it.
    const outside = db.jobs.insert(job(2))
    await Bun.sleep(20)
    release()

    expect(await rolledBack).toBe("roll back")
    await outside
    const raw = new SQL(url)
    cleanups.push(() => raw.close())
    const rows: { payload: string }[] = await raw`SELECT payload FROM jobs ORDER BY id`
    expect(rows.map((r) => r.payload)).toEqual([JSON.stringify({ n: 2 })])
  })

  test("a pool statement inside its own transaction's callback still runs (no deadlock)", async () => {
    const { db } = await fileDb()
    const result = await Promise.race([
      db.transaction(async (tx) => {
        await tx.jobs.insert(job(1))
        // Not recommended — use `tx` — but it must not hang.
        return db.jobs.counts()
      }),
      Bun.sleep(2_000).then(() => "timed out"),
    ])
    expect(result).toEqual({ queued: 1, running: 0, succeeded: 0, dead: 0 })
  })

  test("a pool query started before a transaction and awaited inside it runs before it", async () => {
    const { db } = await fileDb()
    // `pending`'s statement is started (its `then` queued) before the transaction asks for the
    // lock, so it takes the shared lock first and runs outside, before the transaction's insert.
    const pending = db.jobs.counts()
    const result = await Promise.race([
      db.transaction(async (tx) => {
        await tx.jobs.insert(job(1))
        return await pending
      }),
      Bun.sleep(3_000).then(() => "hung"),
    ])
    expect(result).toEqual({ queued: 0, running: 0, succeeded: 0, dead: 0 })
    expect(await db.jobs.counts()).toEqual({ queued: 1, running: 0, succeeded: 0, dead: 0 })
  })

  test("a multi-statement pool helper started before a transaction finishes before it", async () => {
    const { db } = await fileDb()
    const pending = (async () => {
      await db.jobs.insert(job(1))
      await db.jobs.insert(job(2))
      return db.jobs.counts()
    })()
    const result = await Promise.race([
      db.transaction(async (tx) => {
        await tx.jobs.insert(job(3))
        return await pending
      }),
      Bun.sleep(3_000).then(() => "hung"),
    ])
    expect(result).toEqual({ queued: 2, running: 0, succeeded: 0, dead: 0 })
  })

  /** A serialised in-memory client with a short gate wait, and a `jobs`-like table. */
  async function serialised(waitMs = 200) {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    const sql = serialiseSqlite(raw, Promise.resolve(), waitMs)
    await sql`CREATE TABLE t (n INTEGER)`
    return { raw, sql }
  }

  test("a transaction awaiting a statement queued behind it fails loudly instead of hanging", async () => {
    const { sql } = await serialised()
    let open = () => {}
    const opened = new Promise<void>((resolve) => {
      open = resolve
    })
    // Issued from outside the transaction's async context, after the transaction opened: it must
    // wait for the transaction, which waits for it — a cycle. It fails; it never runs inside.
    const outside = (async () => {
      await opened
      return await sql`INSERT INTO t (n) VALUES (2) RETURNING n`
    })()
    const result = await Promise.race([
      sql
        .begin(async (tx) => {
          await tx`INSERT INTO t (n) VALUES (1)`
          open()
          return await outside
        })
        .then(
          () => "committed",
          (error: Error) => error.message
        ),
      Bun.sleep(3_000).then(() => "hung"),
    ])
    expect(result).toBe(gateTimeoutMessage(false, 200))
    expect(result).toStartWith("db: a statement waited 200 ms behind an open SQLite transaction")
    const rows: { n: number }[] = await sql`SELECT n FROM t`
    expect(rows).toEqual([])
  })

  test("a waiter behind a slow transaction that keeps running statements is never timed out", async () => {
    const { sql } = await serialised(100)
    let entered = () => {}
    const inside = new Promise<void>((resolve) => {
      entered = resolve
    })
    // Holds the lock ~4x the bound, running a statement every 60 ms, then commits.
    const slow = sql.begin(async (tx) => {
      entered()
      for (let i = 0; i < 7; i++) {
        // Half of them through a savepoint, whose statements count as the transaction's too.
        if (i % 2) await tx.savepoint((sp) => sp`INSERT INTO t (n) VALUES (${i})`)
        else await tx`INSERT INTO t (n) VALUES (${i})`
        await Bun.sleep(60)
      }
    })
    await inside
    const queuedAt = performance.now()
    const rows = await sql`SELECT COUNT(*) AS c FROM t`.finally(() => slow)
    const waited = performance.now() - queuedAt
    // It waited for the whole transaction, well past the bound, and saw it committed.
    expect(waited).toBeGreaterThan(300)
    expect(rows).toEqual([{ c: 7 }])
  })

  test("a waiter behind a transaction still in a slow BEGIN is never timed out", async () => {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    await raw`CREATE TABLE t (n INTEGER)`
    // BEGIN IMMEDIATE waiting 300 ms for another process (3x the bound) while the in-process
    // exclusive lock is held: the callback has not started, so nothing is watched yet.
    const slowBegin = new Proxy(raw, {
      get(target, prop) {
        if (prop === "begin") {
          return async (...args: Parameters<SQL["begin"]>) => {
            await Bun.sleep(300)
            return target.begin(...args)
          }
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const sql = serialiseSqlite(slowBegin, Promise.resolve(), 100)
    const committed = sql.begin(async (tx) => {
      await tx`INSERT INTO t (n) VALUES (1)`
    })
    await Bun.sleep(20)
    const rows = await sql`SELECT n FROM t`.finally(() => committed)
    expect(rows).toEqual([{ n: 1 }])
  })

  test("a waiter behind the pragma run is never timed out", async () => {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    const sql = serialiseSqlite(raw, Bun.sleep(300), 50)
    const queuedAt = performance.now()
    const [row]: { one: number }[] = await sql`SELECT 1 AS one`
    expect(performance.now() - queuedAt).toBeGreaterThan(250)
    expect(row?.one).toBe(1)
  })

  test("sql.transaction is gated exactly like sql.begin", async () => {
    const { sql } = await serialised(5_000)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = () => {}
    const inside = new Promise<void>((resolve) => {
      entered = resolve
    })
    const rolledBack = sql
      .transaction(async (tx) => {
        await tx`INSERT INTO t (n) VALUES (1)`
        entered()
        await held
        throw new Error("roll back")
      })
      .catch((error: Error) => error.message)
    await inside
    const outside = sql`INSERT INTO t (n) VALUES (2)`.then(() => "done")
    await Bun.sleep(20)
    release()
    expect(await rolledBack).toBe("roll back")
    expect(await outside).toBe("done")
    const rows: { n: number }[] = await sql`SELECT n FROM t`
    expect(rows).toEqual([{ n: 2 }])
  })

  test("a pool statement's catch and finally wait on the gate like then", async () => {
    const { sql } = await serialised(5_000)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = () => {}
    const inside = new Promise<void>((resolve) => {
      entered = resolve
    })
    const rolledBack = sql
      .begin(async (tx) => {
        await tx`INSERT INTO t (n) VALUES (1)`
        entered()
        await held
        throw new Error("roll back")
      })
      .catch((error: Error) => error.message)
    await inside
    // Bun's own catch/finally would run these at once, inside the open transaction.
    const viaCatch = sql`INSERT INTO t (n) VALUES (2)`.catch(() => "failed")
    const viaFinally = sql`INSERT INTO t (n) VALUES (3)`.finally(() => {})
    await Bun.sleep(20)
    release()
    expect(await rolledBack).toBe("roll back")
    await viaCatch
    await viaFinally
    const rows: { n: number }[] = await sql`SELECT n FROM t ORDER BY n`
    expect(rows).toEqual([{ n: 2 }, { n: 3 }])
  })

  test("calls that would bypass the gate are refused on the serialised client", async () => {
    const { sql } = await serialised()
    expect(() => sql.file("x.sql")).toThrow(
      "sql.file is not supported on the serialised SQLite client"
    )
    expect(() => sql.reserve()).toThrow(
      "sql.reserve is not supported on the serialised SQLite client"
    )
    expect(() => sql.beginDistributed("d", async () => {})).toThrow(
      "sql.beginDistributed is not supported on the serialised SQLite client"
    )
    expect(() => sql.distributed("d", async () => {})).toThrow(
      "sql.distributed is not supported on the serialised SQLite client"
    )
  })

  test("a failing pragma is reported, not swallowed, and statements still run", async () => {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    const reported: unknown[] = []
    const failure = new Error("pragma refused")
    const sql = serialiseSqlite(raw, Promise.reject(failure), undefined, (error) =>
      reported.push(error)
    )
    const [row]: { one: number }[] = await sql`SELECT 1 AS one`
    expect(row?.one).toBe(1)
    expect(reported).toEqual([failure])
  })

  test("without a reporter a pragma failure is one structured error line", async () => {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    const logged = spyOn(console, "error").mockImplementation(() => {})
    cleanups.push(() => logged.mockRestore())
    const sql = serialiseSqlite(raw, Promise.reject(new Error("pragma refused")))
    await sql`SELECT 1 AS one`
    expect(logged).toHaveBeenCalledTimes(1)
    const line = String(logged.mock.calls[0]?.[0])
    expect(line).toContain("SQLite pragmas failed")
    expect(line).toContain("pragma refused")
    expect(line).not.toContain("[db]")
  })

  test("two processes on one file: no 'database is locked' while one claims and the other writes", async () => {
    const { db, file } = await fileDb()
    const dbModule = join(import.meta.dir, "db.ts")
    const writer = `
      import { createDb } from ${JSON.stringify(dbModule)}
      const db = createDb(${JSON.stringify(`sqlite://${file}`)})
      const at = () => new Date().toISOString()
      const row = (n) => ({ name: "test.other", payload: JSON.stringify({ n }), maxAttempts: 3,
        runAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: at() })
      let failures = 0
      for (let n = 0; n < 300; n++) {
        try {
          if (n % 3 === 0) {
            await db.transaction(async (tx) => {
              await tx.jobs.insert(row(n))
              await tx.jobs.counts()
              await tx.jobs.insert(row(n + 0.5))
            })
          } else {
            await db.jobs.insert(row(n))
          }
        } catch (error) {
          failures++
          console.error("writer:", error.message)
        }
      }
      await db.close()
      console.log("writer failures " + failures)
    `
    const child = Bun.spawn(["bun", "-e", writer], { stdout: "pipe", stderr: "pipe" })
    // Read both pipes as they fill, so a chatty child never blocks on a full pipe.
    const stdoutText = new Response(child.stdout).text()
    const stderrText = new Response(child.stderr).text()

    const errors: string[] = []
    let claimed = 0
    const done = child.exited
    let finished = false
    void done.then(() => {
      finished = true
    })
    while (!finished) {
      try {
        await db.jobs.insert(job(claimed))
        const now = new Date().toISOString()
        const rows = await db.jobs.claim(now, 5, new Date(Date.now() + 60_000).toISOString())
        for (const row of rows.filter((r) => r.name === "test.db")) {
          await db.jobs.succeed(row.id, row.attempts, now)
          claimed++
        }
      } catch (error) {
        errors.push((error as Error).message)
      }
      // SQLite queries settle as microtasks: yield so the child's exit can be observed.
      await Bun.sleep(1)
    }

    const stdout = await stdoutText
    const stderr = await stderrText
    expect(await done).toBe(0)
    expect(stderr).not.toContain("database is locked")
    expect(stdout).toContain("writer failures 0")
    expect(errors).toEqual([])
    expect(claimed).toBeGreaterThan(0)
    const counts = await db.jobs.counts()
    expect(counts.queued).toBe(400)
  }, 30_000)
})
