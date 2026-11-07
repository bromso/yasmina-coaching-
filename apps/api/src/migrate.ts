import type { SQL } from "bun"
import { type Dialect, dialectOf } from "./dialect"

/**
 * One schema step. It gets everything it needs as arguments and must never import application
 * code, so it keeps working when the app changes. A merged migration is never edited: fix forward.
 */
export type Migration = {
  /** `NNNN_snake_case`; also the file name under src/migrations/. */
  name: string
  up(sql: SQL, dialect: Dialect): Promise<void>
}

// Any constant works; every replica must use the same one.
const POSTGRES_LOCK_KEY = 726_574_637

/**
 * One transaction that, on Postgres, first takes the migration lock: two replicas starting
 * together run these blocks one after the other. (Even `CREATE TABLE IF NOT EXISTS` races on
 * Postgres without it.) A second writer on the same SQLite file waits on `busy_timeout` (see
 * `db.ts`) and then finds the migration already applied, rather than double-applying.
 */
function locked<T>(sql: SQL, dialect: Dialect, run: (tx: SQL) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    if (dialect === "postgres") await tx`SELECT pg_advisory_xact_lock(${POSTGRES_LOCK_KEY})`
    return run(tx)
  })
}

/**
 * Applies the migrations not yet recorded in `schema_migrations`, in list order, each with its
 * record in one transaction. Forward-only. Returns the names it applied.
 */
export async function migrate(
  sql: SQL,
  migrations: readonly Migration[],
  { log = () => {} }: { log?: (message: string) => void } = {}
): Promise<string[]> {
  const dialect = dialectOf(sql)
  const known = new Set<string>()
  for (const { name } of migrations) {
    if (known.has(name)) throw new Error(`duplicate migration name "${name}"`)
    known.add(name)
  }

  const recorded = await locked(sql, dialect, async (tx) => {
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `
    const rows: Array<{ name: string }> = await tx`SELECT name FROM schema_migrations`
    return rows
  })
  for (const { name } of recorded) {
    if (!known.has(name)) {
      throw new Error(`unknown migration "${name}": this build is older than the database`)
    }
  }

  const applied: string[] = []
  const done = new Set(recorded.map((r) => r.name))
  for (const migration of migrations) {
    if (done.has(migration.name)) continue
    const ran = await locked(sql, dialect, async (tx) => {
      // The replica that waited on the lock finds the work already done here.
      const [again]: Array<{ name: string }> =
        await tx`SELECT name FROM schema_migrations WHERE name = ${migration.name}`
      if (again) return false
      await migration.up(tx, dialect)
      await tx`
        INSERT INTO schema_migrations (name, applied_at)
        VALUES (${migration.name}, ${new Date().toISOString()})
      `
      return true
    })
    if (ran) {
      applied.push(migration.name)
      log(`applied migration ${migration.name}`)
    }
  }
  return applied
}
