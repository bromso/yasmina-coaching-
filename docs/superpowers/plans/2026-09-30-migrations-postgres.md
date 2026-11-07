# Versioned migrations and Postgres (Phase 3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/api` gets forward-only, versioned migrations over `Bun.sql`, runs its whole test
suite on SQLite and on a real Postgres, and CI checks Postgres whenever the API changes.

**Architecture:** A small runner (`migrate.ts`) applies an explicit ordered list of migration
modules (`migrations/index.ts`), each inside a transaction and recorded in `schema_migrations`;
on Postgres it holds an advisory lock. Engine differences live in `dialect.ts`
(`dialectOf`, `ddl.serialId`). A test helper (`test-db.ts`) hands each test server an in-memory
SQLite database, or a throwaway Postgres database when `TEST_DATABASE_URL` is set.

**Tech Stack:** Bun 1.3/1.4 (`Bun.sql`, `bun test`), SQLite, Postgres 17, GitHub Actions service
containers, Docker for local Postgres.

**Spec:** `docs/superpowers/specs/2026-09-30-migrations-postgres-design.md`

## Global Constraints

- Engines: SQLite and Postgres only. Anything else fails at startup with
  `Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://`.
- Migrations are forward-only, named `NNNN_snake_case`, listed explicitly in `migrations/index.ts`, and never import application code.
- Unknown recorded migration → `unknown migration "<name>": this build is older than the database`.
- `schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`; each migration's `up` and its record are one transaction; Postgres takes `pg_advisory_xact_lock` in that transaction.
- `ddl.serialId`: SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`; Postgres `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`.
- `DATABASE_URL` default stays `sqlite://.data/api.db`; no new env variables except `TEST_DATABASE_URL` (tests only).
- CI cannot run until 2026-10-01 (Actions minutes exhausted). Postgres is verified locally with Docker: `docker run -d --rm --name pg-test -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`; stop it with `docker stop pg-test` when done. `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres`.
- The repo pins Bun 1.3.14 (CI, Docker); the machine has 1.4.2. Run the api tests under both: `bun --filter @repo/api test` and `cd apps/api && bunx bun@1.3.14 test`.
- Biome at 0 errors and 0 warnings (`bunx biome check --write` on touched files). Commits: Conventional Commits ending with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **Two replicas migrating the same Postgres at once** must apply each migration once — Task 2's parallel-migrate test (Postgres only).
2. **A migration file added under `migrations/` but not listed in `index.ts`** would silently never run — Task 2's directory-vs-list test.
3. **A `DATABASE_URL` for an unsupported engine (`mysql://…`)** must fail at startup with the clear message, not with a query error later — Task 1's `dialectOf` test and Task 2's `createDb` test.
4. **`db:migrate` against an unreachable database** must print one clear line and exit 1, not a stack trace — Task 2's CLI test.
5. **A migration that fails halfway** must leave no partial schema behind on either engine — Task 2's rollback test (asserts the half-created table is gone).

---

### Task 1: `dialect.ts` and the test-database helper

**Files:**
- Create: `apps/api/src/dialect.ts`, `apps/api/src/dialect.test.ts`, `apps/api/src/test-db.ts`

**Interfaces:**
- Produces:
  - `type Dialect = "sqlite" | "postgres"`
  - `dialectOf(sql: Pick<SQL, "options">): Dialect`
  - `ddl.serialId(dialect: Dialect): string`
  - `type TestDatabase = { url: string; cleanup(): Promise<void> }`
  - `testDatabase(engine?: Dialect): Promise<TestDatabase>` — default engine: `"postgres"` when `TEST_DATABASE_URL` is set, else `"sqlite"`
  - `engines: readonly Dialect[]` — `["sqlite", "postgres"]` when `TEST_DATABASE_URL` is set, else `["sqlite"]`

- [ ] **Step 1: Write the failing tests**

`apps/api/src/dialect.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/api test src/dialect.test.ts`
Expected: FAIL — `Cannot find module './dialect'`.

- [ ] **Step 3: Implement**

`apps/api/src/dialect.ts`:

```ts
import type { SQL } from "bun"

export type Dialect = "sqlite" | "postgres"

/** The engine Bun.sql chose from DATABASE_URL. Only SQLite and Postgres have tested DDL here. */
export function dialectOf(sql: Pick<SQL, "options">): Dialect {
  const adapter = sql.options.adapter
  if (adapter === "sqlite" || adapter === "postgres") return adapter
  throw new Error("Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://")
}

/** The one piece of DDL that differs between the two engines. */
export const ddl = {
  serialId: (dialect: Dialect) =>
    dialect === "sqlite"
      ? "INTEGER PRIMARY KEY AUTOINCREMENT"
      : "INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
}
```

`apps/api/src/test-db.ts`:

```ts
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
  if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is not set: cannot create a Postgres test database")

  const name = `t_${crypto.randomUUID().replaceAll("-", "")}`
  const admin = new SQL(ADMIN_URL)
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  const url = new URL(ADMIN_URL)
  url.pathname = `/${name}`
  return {
    url: url.href,
    async cleanup() {
      await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`)
      await admin.close()
    },
  }
}
```

- [ ] **Step 4: Run on SQLite, then on Postgres**

Run: `bunx biome check --write apps/api/src && bun --filter @repo/api test src/dialect.test.ts`
Expected: 5 pass (the two Postgres branches skip).

Start Postgres (Global Constraints), then:
Run: `cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bun test src/dialect.test.ts`
Expected: 5 pass, now exercising the Postgres branches.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/dialect.ts apps/api/src/dialect.test.ts apps/api/src/test-db.ts
git commit -m "feat(api): dialect detection and a per-test database helper for SQLite and Postgres"
```

---

### Task 2: The migration runner, the first migration, and `db:migrate`

**Files:**
- Create: `apps/api/src/migrate.ts`, `apps/api/src/migrate.test.ts`, `apps/api/src/migrations/0001_notes.ts`, `apps/api/src/migrations/index.ts`, `apps/api/src/migrate-cli.ts`
- Modify: `apps/api/src/db.ts` (`createDb`), `apps/api/src/env.ts` (export the default URL), `apps/api/package.json` (`db:migrate` script)

**Interfaces:**
- Consumes: `Dialect`, `dialectOf`, `ddl` (Task 1); `testDatabase`, `engines` (Task 1).
- Produces:
  - `type Migration = { name: string; up(sql: SQL, dialect: Dialect): Promise<void> }`
  - `migrate(sql: SQL, migrations: readonly Migration[], options?: { log?: (message: string) => void }): Promise<string[]>` — names applied, in order
  - `migrations: readonly Migration[]` from `./migrations`
  - `DEFAULT_DATABASE_URL = "sqlite://.data/api.db"` from `./env`
  - `createDb(url).migrate(): Promise<string[]>`; `createDb` throws the unsupported-URL error synchronously

- [ ] **Step 1: Write the failing tests**

`apps/api/src/migrate.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import { createDb } from "./db"
import { ddl } from "./dialect"
import { type Migration, migrate } from "./migrate"
import { migrations } from "./migrations"
import notes from "./migrations/0001_notes"
import { engines, testDatabase } from "./test-db"

const noop: Migration["up"] = async () => {}
const step = (name: string, up: Migration["up"] = noop): Migration => ({ name, up })
const createsTable = (name: string): Migration => ({
  name,
  up: async (sql) => {
    await sql.unsafe(`CREATE TABLE ${name} (id INTEGER)`)
  },
})
const names = async (sql: SQL) =>
  (await sql`SELECT name FROM schema_migrations ORDER BY name`).map((r: { name: string }) => r.name)

for (const engine of engines) {
  describe(`migrate on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup()
    })
    async function fresh() {
      const db = await testDatabase(engine)
      const sql = new SQL(db.url)
      cleanups.push(async () => {
        await sql.close()
        await db.cleanup()
      })
      return { sql, url: db.url }
    }

    test("applies pending migrations in order and records them; a second run applies nothing", async () => {
      const { sql } = await fresh()
      const order: string[] = []
      const list = [
        step("0001_a", async () => {
          order.push("a")
        }),
        step("0002_b", async () => {
          order.push("b")
        }),
      ]
      expect(await migrate(sql, list)).toEqual(["0001_a", "0002_b"])
      expect(order).toEqual(["a", "b"])
      expect(await migrate(sql, list)).toEqual([])
      expect(await names(sql)).toEqual(["0001_a", "0002_b"])
    })

    test("a new migration added later applies alone", async () => {
      const { sql } = await fresh()
      await migrate(sql, [step("0001_a")])
      expect(await migrate(sql, [step("0001_a"), step("0002_b")])).toEqual(["0002_b"])
    })

    test("a failing migration is rolled back entirely; earlier ones stay applied", async () => {
      const { sql } = await fresh()
      const list = [
        createsTable("t_first"),
        step("0002_boom", async (s) => {
          await s.unsafe("CREATE TABLE t_partial (id INTEGER)")
          throw new Error("boom")
        }),
      ]
      await expect(migrate(sql, list)).rejects.toThrow("boom")
      expect(await names(sql)).toEqual(["t_first"])
      await sql`SELECT * FROM t_first`
      await expect(sql`SELECT * FROM t_partial`).rejects.toThrow()
    })

    test("a recorded migration this build does not know stops it", async () => {
      const { sql } = await fresh()
      await migrate(sql, [step("0001_a"), step("0002_future")])
      await expect(migrate(sql, [step("0001_a")])).rejects.toThrow(
        'unknown migration "0002_future": this build is older than the database'
      )
    })

    test("duplicate names in the list are a programming error", async () => {
      const { sql } = await fresh()
      await expect(migrate(sql, [step("0001_a"), step("0001_a")])).rejects.toThrow(
        'duplicate migration name "0001_a"'
      )
    })

    test("adopts a notes table created by the old CREATE TABLE IF NOT EXISTS", async () => {
      const { sql } = await fresh()
      await sql.unsafe(`
        CREATE TABLE notes (
          id ${ddl.serialId(engine)},
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `)
      await sql`INSERT INTO notes (title, body, created_at) VALUES ('old', '', '2026-01-01T00:00:00.000Z')`
      expect(await migrate(sql, [notes])).toEqual(["0001_notes"])
      const titles = (await sql`SELECT title FROM notes`).map((r: { title: string }) => r.title)
      expect(titles).toEqual(["old"])
      expect(await migrate(sql, [notes])).toEqual([])
    })

    test("the shipped list migrates a fresh database and notes accept inserts", async () => {
      const { sql } = await fresh()
      expect(await migrate(sql, migrations)).toEqual(["0001_notes"])
      const [row] = await sql`
        INSERT INTO notes (title, body, created_at) VALUES ('t', 'b', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      expect(row).toMatchObject({ id: 1, title: "t", body: "b" })
    })

    if (engine === "postgres") {
      test("two processes migrating at once apply each migration once", async () => {
        const { url } = await fresh()
        const a = new SQL(url)
        const b = new SQL(url)
        cleanups.push(async () => {
          await a.close()
          await b.close()
        })
        let runs = 0
        const list = [
          step("0001_slow", async () => {
            runs++
            await Bun.sleep(300)
          }),
        ]
        const [ra, rb] = await Promise.all([migrate(a, list), migrate(b, list)])
        expect([...ra, ...rb]).toEqual(["0001_slow"])
        expect(runs).toBe(1)
        expect(await names(a)).toEqual(["0001_slow"])
      })
    }
  })
}

describe("the migrations directory", () => {
  test("every file in src/migrations/ is in the list, in order", async () => {
    const files = [...new Bun.Glob("[0-9][0-9][0-9][0-9]_*.ts").scanSync(`${import.meta.dir}/migrations`)]
      .map((f) => f.replace(/\.ts$/, ""))
      .sort()
    expect(migrations.map((m) => m.name)).toEqual(files)
    expect(files.length).toBeGreaterThan(0)
  })
})

describe("createDb", () => {
  test("an unsupported engine fails at creation, before any query", () => {
    expect(() => createDb("mysql://root@localhost/app")).toThrow(
      "Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://"
    )
  })
})

describe("db:migrate", () => {
  test("an unreachable database is one clear line and exit 1", async () => {
    const child = Bun.spawn([process.execPath, `${import.meta.dir}/migrate-cli.ts`], {
      env: { ...process.env, DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:1/none" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(code).toBe(1)
    expect(stderr).toContain("[api] migration failed:")
    expect(stderr).not.toContain("    at ")
  })

  test("a fresh SQLite file is migrated and reported; a second run reports nothing", async () => {
    // The same relative form `bun dev` uses (DATABASE_URL=sqlite://.data/api.db), from apps/api.
    const cwd = `${import.meta.dir}/..`
    const dir = `.data/test-${crypto.randomUUID()}`
    const env = { ...process.env, DATABASE_URL: `sqlite://${dir}/api.db` }
    const run = async () => {
      const child = Bun.spawn([process.execPath, "src/migrate-cli.ts"], {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
      return { code: await child.exited, out: await new Response(child.stdout).text() }
    }
    expect(await run()).toMatchObject({ code: 0, out: expect.stringContaining("applied 0001_notes") })
    expect(await run()).toMatchObject({ code: 0, out: expect.stringContaining("nothing to apply") })
    await Bun.$`rm -rf ${cwd}/${dir}`
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/api test src/migrate.test.ts`
Expected: FAIL — `Cannot find module './migrate'`.

- [ ] **Step 3: Implement the runner and the first migration**

`apps/api/src/migrate.ts`:

```ts
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
 * Postgres without it.) A SQLite write transaction is exclusive on its own.
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

  await locked(sql, dialect, async (tx) => {
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `
  })
  const recorded: Array<{ name: string }> = await sql`SELECT name FROM schema_migrations`
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
```

`sql.begin`'s callback receives a `TransactionSQL`, which extends `SQL`, so the `(tx: SQL)`
parameter type above is correct; if the typecheck disagrees on this Bun version, type it as
`Parameters<Parameters<SQL["begin"]>[0]>[0]` instead of loosening anything.

`apps/api/src/migrations/0001_notes.ts`:

```ts
import { ddl } from "../dialect"
import type { Migration } from "../migrate"

const notes: Migration = {
  name: "0001_notes",
  async up(sql, dialect) {
    // IF NOT EXISTS: adopts the identical table the pre-migration boilerplate created.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS notes (
        id ${ddl.serialId(dialect)},
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    `)
  },
}

export default notes
```

`apps/api/src/migrations/index.ts`:

```ts
import type { Migration } from "../migrate"
import notes from "./0001_notes"

/** Every migration, in order. A new file goes here too — nothing is picked up by accident. */
export const migrations: readonly Migration[] = [notes]
```

- [ ] **Step 4: Wire `db.ts`, `env.ts`, the CLI and the script**

`apps/api/src/env.ts`: add `export const DEFAULT_DATABASE_URL = "sqlite://.data/api.db"` above
`EnvSchema` and use it: `DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),`. The comment
above it becomes `// Bun.sql reads the engine from the URL: sqlite:// and postgres:// are the tested ones.`
(`loadEnv` parses on call, not on import, so the CLI can import the constant without loading env.)

`apps/api/src/db.ts`: replace the imports and the top of `createDb`, and the `migrate` method:

```ts
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { Note, NotePage } from "@repo/api-contract"
import { SQL } from "bun"
import { dialectOf } from "./dialect"
import { migrate } from "./migrate"
import { migrations } from "./migrations"
```

```ts
export function createDb(url: string) {
  const file = url.match(/^sqlite:\/\/(?!:memory:)(.+)$/)?.[1]
  // SQLite creates the file but not its directory.
  if (file) mkdirSync(dirname(file), { recursive: true })

  const sql = new SQL(url)
  // Fail at startup, not on the first query, for an engine without tested DDL.
  dialectOf(sql)

  return {
    /** Applies the migrations in src/migrations/ that this database has not seen. */
    migrate: () => migrate(sql, migrations),
```

(the `notes`, `ping` and `close` members are unchanged; the old inline `CREATE TABLE` is gone.)

`apps/api/src/migrate-cli.ts`:

```ts
#!/usr/bin/env bun
/**
 * `bun run --filter @repo/api db:migrate` — applies pending migrations to DATABASE_URL and says
 * what it did. The service also migrates at startup; this is for deploy steps and CI.
 */

import { createDb } from "./db"
import { DEFAULT_DATABASE_URL } from "./env"

const url = Bun.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL

async function main() {
  const db = createDb(url)
  try {
    const applied = await db.migrate()
    console.info(applied.length ? applied.map((n) => `applied ${n}`).join("\n") : "nothing to apply")
  } finally {
    db.close()
  }
}

main().catch((error: unknown) => {
  console.error(`[api] migration failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
```

`apps/api/package.json` scripts: add `"db:migrate": "bun src/migrate-cli.ts",` after `"start"`.

- [ ] **Step 5: Run on both engines and both Bun versions**

Run: `bunx biome check --write apps/api && bun --filter @repo/api test && bun --filter @repo/api typecheck`
Expected: all pass (dialect 5 + migrate 11 + env + server suites), typecheck exit 0.

With Postgres running:
Run: `cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bun test src/migrate.test.ts src/dialect.test.ts && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bunx bun@1.3.14 test src/migrate.test.ts src/dialect.test.ts`
Expected: all pass on both versions, including the Postgres-only parallel test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/package.json
git commit -m "feat(api): versioned, forward-only migrations over Bun.sql with a db:migrate command"
```

---

### Task 3: The whole api suite on Postgres

**Files:**
- Modify: `apps/api/src/server.test.ts` (the `start` helper and `afterAll`)
- Modify: `apps/api/package.json` (`test:postgres` script)

**Interfaces:**
- Consumes: `testDatabase` (Task 1).
- Produces: `bun run --filter @repo/api test:postgres`.

- [ ] **Step 1: Make every test server use `testDatabase()`**

In `apps/api/src/server.test.ts` replace the imports' `createServer` line and the `start` helper:

```ts
import { createServer } from "./server"
import { testDatabase } from "./test-db"
```

```ts
// A real Bun.serve on an ephemeral port. The database is in-memory SQLite, or a throwaway
// Postgres database when TEST_DATABASE_URL is set — either way private to this server.
async function start(overrides: Partial<Parameters<typeof createServer>[0]> = {}) {
  const db = await testDatabase()
  const app = await createServer({
    hostname: "127.0.0.1",
    port: 0,
    databaseUrl: db.url,
    token: TOKEN,
    allowedOrigins: ["https://app.example.com"],
    allowLocalhostOrigins: false,
    rateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    maxBodyBytes: 262_144,
    drainMs: 500,
    log: () => {},
    ...overrides,
  })
  const stop = app.stop
  return {
    ...app,
    stop: async () => {
      await stop()
      await db.cleanup()
    },
  }
}
```

Every existing call site already awaits `start()` and calls `stop()` in `finally`/`afterAll`, so
nothing else changes. Add to `apps/api/package.json` scripts:

```json
"test:postgres": "TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bun test",
```

- [ ] **Step 2: Run the suite on SQLite, then Postgres, on both Bun versions**

Run: `bunx biome check --write apps/api && bun --filter @repo/api test`
Expected: all pass on SQLite (same counts as before plus Task 1–2's tests).

With Postgres running:
Run: `bun run --filter @repo/api test:postgres && cd apps/api && TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bunx bun@1.3.14 test`
Expected: all pass, twice. Report the counts. Afterwards
`docker exec pg-test psql -U postgres -tc "SELECT count(*) FROM pg_database WHERE datname LIKE 't_%'"` → `0` (every throwaway database was dropped).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/server.test.ts apps/api/package.json
git commit -m "test(api): run the whole suite on Postgres with a throwaway database per server"
```

---

### Task 4: CI job, Compose, docs

**Files:**
- Modify: `scripts/ci-plan.ts`, `scripts/ci-plan-run.ts`, `scripts/ci-plan.test.ts`, `.github/workflows/ci.yml`
- Modify: `docker-compose.dev.yml`, `apps/api/.env.example`, `apps/api/README.md`, `README.md`, `CLAUDE.md`, `docs/ROADMAP.md`

**Interfaces:**
- Produces: planner output `postgres` (`"true"` when `@repo/api` is affected and the change is not docs-only); CI job `api-postgres`.

- [ ] **Step 1: Write the failing planner tests**

In `scripts/ci-plan.test.ts`:
- in `"an api change checks api alone and builds its image"` add `expect(p.postgres).toBe(true)`;
- in `"a packages/ui change reaches every Next app and Storybook, not the services"` add `expect(p.postgres).toBe(false)`;
- in `"a README-only change skips everything"` add `postgres: false` to the `toMatchObject`;
- in `"a service-kit change reaches both services and their images"` add `expect(p.postgres).toBe(true)`.

Run: `bun test scripts` — Expected: FAIL (`postgres` undefined).

- [ ] **Step 2: Planner and workflow**

`scripts/ci-plan.ts`: add `postgres: boolean` to `Plan` (after `storybook`), with the doc comment
`/** Run apps/api's tests against a real Postgres too. */`, and in the returned object
`postgres: !docsOnly && has("@repo/api"),`.

`scripts/ci-plan-run.ts`: add `postgres: String(final.postgres),` to `outputs` and
`` `- **Postgres tests:** ${final.postgres ? "yes" : "skipped"}`, `` to the summary after Storybook.

`.github/workflows/ci.yml`:
- `changes` outputs: add `postgres: ${{ steps.plan.outputs.postgres }}`.
- After the `storybook` job add:

```yaml
  api-postgres:
    # apps/api's suite again, against a real Postgres: the verify job's run uses in-memory SQLite.
    runs-on: ubuntu-latest
    needs: changes
    if: needs.changes.outputs.postgres == 'true'
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v7

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.14

      - name: Cache Bun dependencies
        uses: actions/cache@v6
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: |
            bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Test apps/api on Postgres
        env:
          TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
        run: bun --filter @repo/api test
```

- `ci` job: `needs: [changes, verify, storybook, api-postgres, docker]`.

Run: `bunx biome check --write scripts && bun test scripts && ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'`
Expected: 22 pass; YAML parses.

- [ ] **Step 3: Compose and docs**

`docker-compose.dev.yml`: uncomment the `postgres` service and the `volumes:` block (keep the
"Optional: … set on the dev service: DATABASE_URL=…" comment above it, reworded: "Opt-in local
Postgres for apps/api. It starts with the stack; to use it, set on the dev service:").

`apps/api/.env.example`, the `DATABASE_URL` comment becomes:

```bash
# Bun.sql picks the engine from the URL. Supported and tested: sqlite:// (default) and
# postgres://. Migrations in src/migrations/ run at startup and via `bun run db:migrate`.
# DATABASE_URL=sqlite://.data/api.db
```

`apps/api/README.md` **Data** bullet becomes:

```markdown
- **Data** — `src/db.ts`, over Bun's native `Bun.sql`. `DATABASE_URL` picks the engine:
  `sqlite://…` (default, `.data/api.db`) or `postgres://…`; both are tested. Schema changes are
  forward-only migrations in `src/migrations/`: add `NNNN_name.ts` exporting `{ name, up }` and
  list it in `migrations/index.ts`. They run at startup and on demand with
  `bun run --filter @repo/api db:migrate`. Engine differences live in `src/dialect.ts`.
  Postgres locally: `docker run -d --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`,
  then `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun --filter @repo/api dev`
  — and `bun run --filter @repo/api test:postgres` runs the suite against it.
```

`README.md` "What's inside" API row: `(SQLite by default, Postgres by URL)` instead of `Postgres/MySQL by URL`.

`CLAUDE.md` **Adding an API endpoint**: add step `4. A schema change is a new file in \`apps/api/src/migrations/\` (forward-only; list it in \`migrations/index.ts\`), never an edit to a merged one` and, in step 3, replace `createServer({ port: 0, databaseUrl: "sqlite://:memory:" })` with `the \`start()\` helper in \`server.test.ts\`, which runs on SQLite or Postgres`.

`docs/ROADMAP.md` Phase 3: tick "Versioned migrations instead of `CREATE TABLE IF NOT EXISTS`; Postgres actually works".

- [ ] **Step 4: Full local gate**

Run: `docker compose -f docker-compose.dev.yml config -q && bun run ci`
Expected: both exit 0. Stop the test Postgres: `docker stop pg-test`.

- [ ] **Step 5: Commit**

```bash
git add scripts .github/workflows/ci.yml docker-compose.dev.yml apps/api/.env.example apps/api/README.md README.md CLAUDE.md docs/ROADMAP.md
git commit -m "ci(api): test against Postgres when the API changes; document migrations and the two engines"
```
