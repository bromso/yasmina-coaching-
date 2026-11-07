import { describe, expect, test } from "bun:test"
import { SQL } from "bun"
import { ddl, dialectOf } from "./dialect"
import { engines, testDatabase } from "./test-db"

describe("dialectOf", () => {
  test("reads the adapter Bun.sql chose from the URL", async () => {
    const sqlite = new SQL("sqlite://:memory:")
    expect(dialectOf(sqlite)).toBe("sqlite")
    await sqlite.close()
    if (engines.includes("postgres")) {
      const db = await testDatabase("postgres")
      const pg = new SQL(db.url)
      expect(dialectOf(pg)).toBe("postgres")
      await pg.close()
      await db.cleanup()
    }
  })

  test("anything else is refused with the supported list", () => {
    const fake = { options: { adapter: "mysql" } } as unknown as Pick<SQL, "options">
    expect(() => dialectOf(fake)).toThrow(
      "Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://"
    )
  })
})

describe("ddl.serialId", () => {
  test("is the one line of DDL that differs per engine", () => {
    expect(ddl.serialId("sqlite")).toBe("INTEGER PRIMARY KEY AUTOINCREMENT")
    expect(ddl.serialId("postgres")).toBe("INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY")
  })
})

describe("testDatabase", () => {
  test("sqlite is private per connection and needs no cleanup", async () => {
    const db = await testDatabase("sqlite")
    expect(db.url).toBe("sqlite://:memory:")
    await db.cleanup()
  })

  test("postgres databases are created fresh and dropped on cleanup", async () => {
    if (!engines.includes("postgres")) return
    const db = await testDatabase("postgres")
    const sql = new SQL(db.url)
    const [current] = await sql`SELECT current_database() AS name`
    expect(current.name).toMatch(/^t_[0-9a-f]{32}$/)
    await sql.close()
    await db.cleanup()
    const admin = new SQL(process.env.TEST_DATABASE_URL as string)
    const left = await admin`SELECT 1 AS one FROM pg_database WHERE datname = ${current.name}`
    expect(left.length).toBe(0)
    await admin.close()
  })
})
