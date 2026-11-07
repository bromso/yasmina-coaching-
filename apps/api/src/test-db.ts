import { SQL } from "bun"
import type { Dialect } from "./dialect"

// Test support only: nothing under src/index.ts imports this, so it is not bundled.
const ADMIN_URL = Bun.env.TEST_DATABASE_URL

/** The engines this run can test: Postgres joins in when TEST_DATABASE_URL points at one. */
export const engines: readonly Dialect[] = ADMIN_URL ? ["sqlite", "postgres"] : ["sqlite"]

export type TestDatabase = { url: string; cleanup(): Promise<void> }

/**
 * A database for one test server. SQLite: in memory, private to the connection, nothing to clean
 * up. Postgres: a throwaway database created now and dropped by cleanup, so tests stay as isolated
 * as they are on SQLite.
 */
export async function testDatabase(
  engine: Dialect = ADMIN_URL ? "postgres" : "sqlite"
): Promise<TestDatabase> {
  if (engine === "sqlite") return { url: "sqlite://:memory:", cleanup: async () => {} }
  if (!ADMIN_URL)
    throw new Error("TEST_DATABASE_URL is not set: cannot create a Postgres test database")

  const name = `t_${crypto.randomUUID().replaceAll("-", "")}`
  const admin = new SQL(ADMIN_URL)
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`)
  } catch (error) {
    await admin.close()
    throw error
  }
  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  return {
    url: url.href,
    async cleanup() {
      // WITH (FORCE) needs Postgres 13+: it ends sessions the app's pool may still hold.
      await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`)
      await admin.close()
    },
  }
}
