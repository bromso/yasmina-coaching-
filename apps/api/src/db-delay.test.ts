import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import { createDb, delayStatements } from "./db"

// The test-only slow-query hook (`API_TEST_QUERY_DELAY_MS`): every statement waits first, on the
// pool and inside transactions, and on SQLite the transaction gate keeps its semantics.
const DELAY = 60

const elapsed = async (fn: () => Promise<unknown>) => {
  const start = performance.now()
  await fn()
  return performance.now() - start
}

describe("delayStatements", () => {
  const cleanups: Array<() => Promise<void> | void> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
  })

  function memory() {
    const raw = new SQL("sqlite://:memory:")
    cleanups.push(() => raw.close())
    return { raw, sql: delayStatements(raw, DELAY) }
  }

  test("a tagged statement and an unsafe one each wait the delay first", async () => {
    const { sql } = memory()
    expect(await elapsed(() => sql`SELECT 1`)).toBeGreaterThanOrEqual(DELAY - 5)
    expect(await elapsed(() => sql.unsafe("SELECT 1"))).toBeGreaterThanOrEqual(DELAY - 5)
    const [row] = await sql`SELECT ${2} AS n`
    expect(row).toEqual({ n: 2 })
  })

  test("statements on a transaction's tx are delayed too, and the transaction commits", async () => {
    const { raw, sql } = memory()
    await raw`CREATE TABLE t (n INTEGER)`
    const took = await elapsed(() =>
      sql.begin(async (tx) => {
        await tx`INSERT INTO t (n) VALUES (1)`
        await tx`INSERT INTO t (n) VALUES (2)`
      })
    )
    expect(took).toBeGreaterThanOrEqual(2 * DELAY - 10)
    const rows = await raw`SELECT n FROM t ORDER BY n`
    expect(rows.map((r: { n: number }) => r.n)).toEqual([1, 2])
  })

  test("a fragment embedded in a statement is not awaited on its own", async () => {
    const { raw, sql } = memory()
    await raw`CREATE TABLE t (n INTEGER)`
    await sql`INSERT INTO t ${sql({ n: 7 })}`
    const [row] = await raw`SELECT n FROM t`
    expect(row).toEqual({ n: 7 })
  })

  test("a failing statement still rejects (catch goes through the delay)", async () => {
    const { sql } = memory()
    // (bun:test's `expect(…).rejects` takes native promises only; a query is a thenable.)
    let rejected: unknown
    try {
      await sql`SELECT * FROM missing`
    } catch (error) {
      rejected = error
    }
    expect(rejected).toBeInstanceOf(Error)
    let caught: unknown
    await sql`SELECT * FROM missing`.catch((error: unknown) => {
      caught = error
    })
    expect(caught).toBeInstanceOf(Error)
  })
})

describe("createDb with queryDelayMs", () => {
  const cleanups: Array<() => Promise<void> | void> = []
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c()
  })

  function fileDb(queryDelayMs?: number) {
    const dir = mkdtempSync(join(tmpdir(), "db-delay-"))
    const db = createDb(`sqlite://${join(dir, "t.db")}`, { queryDelayMs })
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    cleanups.push(() => db.close())
    return db
  }

  test("off by default: no statement waits", async () => {
    const db = fileDb()
    await db.migrate()
    expect(await elapsed(() => db.ping())).toBeLessThan(DELAY)
  })

  test("migrations run undelayed; product statements and transactions are delayed", async () => {
    const db = fileDb(DELAY)
    // Dozens of migration statements: delayed, this would take seconds.
    expect(await elapsed(() => db.migrate())).toBeLessThan(DELAY * 20)
    expect(await elapsed(() => db.ping())).toBeGreaterThanOrEqual(DELAY - 5)
    const took = await elapsed(() =>
      db.transaction(async (tx) => {
        await tx.waitlist.add({ email: "a@example.com", source: "www" })
      })
    )
    expect(took).toBeGreaterThanOrEqual(DELAY - 5)
  })

  test("the SQLite gate still holds: a pool statement waits for an open transaction", async () => {
    const db = fileDb(DELAY)
    await db.migrate()
    const order: string[] = []
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const tx = db.transaction(async (t) => {
      await t.waitlist.add({ email: "b@example.com", source: "www" })
      order.push("tx statement")
      await held
      order.push("tx end")
    })
    // Let the transaction open (it asks for the lock on the next macrotask) and run its statement.
    await Bun.sleep(DELAY * 3)
    const outside = db.ping().then(() => order.push("pool statement"))
    await Bun.sleep(DELAY * 3)
    expect(order).toEqual(["tx statement"])
    release()
    await Promise.all([tx, outside])
    expect(order).toEqual(["tx statement", "tx end", "pool statement"])
  })
})
