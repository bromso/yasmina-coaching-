import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { invitationSubject } from "@repo/email"
import { createDb, type Db } from "../db"
import type { Dialect } from "../dialect"
import { migrate } from "../migrate"
import { migrations } from "../migrations"
import { TINY_PDF } from "../storage/fixtures"
import { testDatabase } from "../test-db"
import {
  clientFor,
  mailsTo,
  signedIn,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "../test-server"
import { dumpDatabase, dumpToBytes } from "./dump"
import { BackupFormatError, EXCLUDED_TABLES, quoteIdent, RestoreTargetNotEmpty } from "./format"
import { restoreDatabase } from "./restore"
import { listTables, orderParentsFirst } from "./tables"

type App = Awaited<ReturnType<typeof start>>
const PASSWORD = "correct horse battery"
/** Tables the seed must fill. */
const SEEDED = ["users", "workspaces", "memberships", "notes"]

/** A database with nothing in it — not even migrations — to restore into. */
async function freshTarget(engine: Dialect) {
  if (engine === "postgres") {
    const pg = await testDatabase("postgres")
    const db = createDb(pg.url)
    return {
      url: pg.url,
      db,
      cleanup: async () => {
        await db.close()
        await pg.cleanup()
      },
    }
  }
  const dir = await mkdtemp(join(tmpdir(), "backup-"))
  const url = `sqlite://${join(dir, "t.db")}`
  const db = createDb(url)
  return {
    url,
    db,
    cleanup: async () => {
      await db.close()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/** Real data through the api: two members, notes, a pending invitation, an application, analytics. */
async function seed(app: App) {
  const owner = await signUpWithWorkspace(app)
  const member = await signUpVerified(app)
  const { name } = await owner.client.workspaces.get({ workspaceId: owner.workspaceId })
  await owner.client.workspaces.invitations.create({
    workspaceId: owner.workspaceId,
    email: member.email,
    role: "member",
  })
  const [mail] = await mailsTo(app, member.email, invitationSubject(name))
  const token = mail?.text.match(/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""
  await member.client.invitations.accept({ token })
  for (let i = 1; i <= 5; i++) {
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: `Note ${i}` })
  }
  await owner.client.workspaces.invitations.create({
    workspaceId: owner.workspaceId,
    email: "pending@example.com",
    role: "viewer",
  })
  await clientFor(app).jobs.apply({
    job: "senior-engineer",
    title: "Senior Engineer",
    name: "Ada Lovelace",
    email: "ada@example.com",
    link: "https://ada.example/portfolio",
    note: "Hello",
    cv: new File([TINY_PDF], "cv.pdf", { type: "application/pdf" }),
  })
  await clientFor(app).analytics.ingest({
    app: "www",
    kind: "pageview",
    path: "/pricing",
    ip: "203.0.113.5",
    userAgent: "Backup/1.0",
  })
  await clientFor(app).telemetry.ingest({
    app: "app",
    errors: [{ kind: "boundary", message: "Backup boom", stack: "Error: x", route: "/notes" }],
    vitals: [{ name: "LCP", value: 1234.5678, rating: "good", route: "/notes" }],
  })
  await app.drain()
  return { owner }
}

const dataTables = async (db: Db) =>
  (await listTables(db)).filter((t) => !EXCLUDED_TABLES.has(t.name))

async function counts(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const table of await dataTables(db)) {
    const [row] = await db.sql.unsafe(`SELECT COUNT(*) AS n FROM ${quoteIdent(table.name)}`)
    out[table.name] = Number(row.n)
  }
  return out
}

/**
 * A table's rows, columns by name, sorted in JS by key (every column when it has none) — not by
 * the engine, whose text collation differs between SQLite and Postgres. `omit` drops columns.
 */
async function rowsOf(db: Db, name: string, omit: string[] = []) {
  const table = (await listTables(db)).find((t) => t.name === name)
  if (!table) throw new Error(`no table ${name}`)
  const key = table.primaryKey.length > 0 ? table.primaryKey : [...table.columns].sort()
  const cols = [...table.columns].filter((c) => !omit.includes(c)).sort()
  const rows: Array<Record<string, unknown>> = await db.sql.unsafe(
    `SELECT ${table.columns.map(quoteIdent).join(", ")} FROM ${quoteIdent(name)}`
  )
  const sortKey = (row: Record<string, unknown>) => JSON.stringify(key.map((k) => row[k]))
  return rows
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0))
    .map((row) => Object.fromEntries(cols.map((c) => [c, row[c]])))
}

/** Every data table's rows in `target` equal `source`'s, `except` columns compared on their own. */
async function expectSameRows(target: Db, source: Db, omit: Record<string, string[]> = {}) {
  for (const { name } of await dataTables(source)) {
    expect({ name, rows: await rowsOf(target, name, omit[name]) }).toEqual({
      name,
      rows: await rowsOf(source, name, omit[name]),
    })
  }
}

async function decode(bytes: Uint8Array) {
  const text = new TextDecoder().decode(Bun.gunzipSync(bytes as Uint8Array<ArrayBuffer>))
  return text.split("\n").filter(Boolean)
}

/**
 * The rejection `promise` ends with. Not `expect(…).rejects`: it waits on the promise in a nested
 * loop that starves the SQLite gate's `setImmediate`, stalling each restore for seconds.
 */
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => new Error("expected a rejection"),
    (error: unknown) => error
  )

const gzip = (lines: string[]) => Bun.gzipSync(`${lines.join("\n")}\n`)

/** Signs the seeded owner in against the restored database and writes a note: ids must not clash. */
async function writeAfterRestore(url: string, email: string) {
  const app = await start({ databaseUrl: url })
  try {
    const result = signedIn(await clientFor(app).auth.signIn({ email, password: PASSWORD }))
    const client = clientFor(app, result.session.token)
    const [workspace] = (await client.workspaces.list()).items
    const note = await client.notes.create({ workspaceId: workspace?.id ?? 0, title: "After" })
    expect(note.title).toBe("After")
  } finally {
    await app.stop()
  }
}

let app: App
let seeded: Awaited<ReturnType<typeof seed>>
let backup: Uint8Array

beforeAll(async () => {
  app = await start({ hiringEmail: "hiring@example.com" })
  seeded = await seed(app)
  backup = await dumpToBytes(app.db)
})
afterAll(() => app.stop())

describe("dump", () => {
  test("the header names exactly the applied migrations; jobs is left out", async () => {
    const lines = await decode(backup)
    const header = JSON.parse(lines[0] as string)
    expect(header).toMatchObject({
      format: "boilerplate-backup",
      version: 1,
      engine: app.db.dialect,
    })
    expect(header.migrations).toEqual(migrations.map((m) => m.name))
    const tables = lines.slice(1).flatMap((line) => {
      const value = JSON.parse(line)
      return Array.isArray(value) ? [] : [value.table as string]
    })
    expect(tables).not.toContain("jobs")
    expect(tables).not.toContain("schema_migrations")
    // Parents first: a membership never precedes its workspace or user.
    expect(tables.indexOf("users")).toBeLessThan(tables.indexOf("memberships"))
    expect(tables.indexOf("workspaces")).toBeLessThan(tables.indexOf("memberships"))
  })

  test("pages through a table: 5 notes at page size 2 take 3 queries", async () => {
    const pages: Record<string, number> = {}
    await dumpToBytes(app.db, {
      pageSize: 2,
      onPage: (table) => {
        pages[table] = (pages[table] ?? 0) + 1
      },
    })
    expect(pages.notes).toBe(3)
  })

  // On Postgres this proves the snapshot; on SQLite the write waits behind the gate until the dump
  // ends, so it proves the serialisation instead.
  test("a write committed after the dump began is not in it", async () => {
    let began!: () => void
    const started = new Promise<void>((resolve) => {
      began = resolve
    })
    const dump = dumpToBytes(app.db, { pageSize: 1, onPage: () => began() })
    await started
    const note = await seeded.owner.client.notes.create({
      workspaceId: seeded.owner.workspaceId,
      title: "Written during the dump",
    })
    const lines = await decode(await dump)
    expect(lines.some((line) => line.includes("Written during the dump"))).toBe(false)
    await seeded.owner.client.notes.delete({ workspaceId: seeded.owner.workspaceId, id: note.id })
  })

  test("building the stream touches nothing: a db call before the first read runs at once", async () => {
    const stream = dumpDatabase(app.db)
    // Before the fix this queued behind the dump's gate lock for 30 s and then failed.
    const before = performance.now()
    await app.db.ping()
    expect(performance.now() - before).toBeLessThan(1_000)
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
    expect((await decode(bytes)).length).toBeGreaterThan(1)
  })

  test("the header carries each table's id counter", async () => {
    const header = JSON.parse((await decode(backup))[0] as string)
    const [{ top }] = await app.db.sql`SELECT MAX(id) AS top FROM users`
    expect(header.counters.users).toBeGreaterThanOrEqual(Number(top))
    expect(header.counters.jobs).toBeUndefined()
  })

  test("a cancelled dump ends its transaction", async () => {
    const reader = dumpDatabase(app.db, { pageSize: 1 }).getReader()
    await reader.read()
    await reader.cancel()
    // The database still answers (on SQLite, the gate's lock was released).
    await app.db.ping()
  })

  test("orderParentsFirst puts parents first and survives a cycle", () => {
    const order = orderParentsFirst([
      { name: "c", parents: ["b"] },
      { name: "b", parents: ["a"] },
      { name: "a", parents: [] },
    ])
    expect(order.map((t) => t.name)).toEqual(["a", "b", "c"])
    const warnings: string[] = []
    const cycle = orderParentsFirst(
      [
        { name: "y", parents: ["x"] },
        { name: "x", parents: ["y"] },
        { name: "z", parents: [] },
      ],
      { warn: (message) => warnings.push(message) }
    )
    expect(cycle.map((t) => t.name)).toEqual(["z", "x", "y"])
    expect(warnings).toHaveLength(1)
  })

  test("quoteIdent refuses anything but a plain name", () => {
    expect(quoteIdent("notes")).toBe('"notes"')
    for (const bad of ['no"tes', "Notes", "notes; DROP", "1notes", ""]) {
      expect(() => quoteIdent(bad)).toThrow(BackupFormatError)
    }
  })
})

describe("restore", () => {
  test("round trip into an empty database reproduces every table", async () => {
    const target = await freshTarget(app.db.dialect)
    try {
      const result = await restoreDatabase(target.db, backup)
      expect(result.migrationsAfter).toEqual([])
      const before = await counts(app.db)
      expect(await counts(target.db)).toEqual(before)
      for (const table of [...SEEDED, "invitations", "job_applications", "analytics_pageviews"]) {
        expect(before[table]).toBeGreaterThan(0)
      }
      expect(result.rows).toBe(Object.values(before).reduce((a, b) => a + b, 0))
      for (const table of ["telemetry_vitals", "telemetry_errors", "analytics_events"]) {
        expect(before[table]).toBeGreaterThan(0)
      }
      await expectSameRows(target.db, app.db)
      await writeAfterRestore(target.url, seeded.owner.email)
    } finally {
      await target.cleanup()
    }
  })

  test("lines cut across chunks restore the same", async () => {
    const target = await freshTarget(app.db.dialect)
    try {
      let at = 0
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (at >= backup.length) return controller.close()
          controller.enqueue(backup.slice(at, at + 7))
          at += 7
        },
      })
      await restoreDatabase(target.db, source)
      expect(await counts(target.db)).toEqual(await counts(app.db))
    } finally {
      await target.cleanup()
    }
  })

  test("refuses a database with a user unless forced, then matches", async () => {
    const other = await start()
    try {
      await signUpVerified(other)
      expect(await failure(restoreDatabase(other.db, backup))).toBeInstanceOf(RestoreTargetNotEmpty)
      await restoreDatabase(other.db, backup, { force: true })
      expect(await counts(other.db)).toEqual(await counts(app.db))
      await expectSameRows(other.db, app.db)
      const [{ n }] = await other.db.sql`SELECT COUNT(*) AS n FROM jobs`
      expect(Number(n)).toBe(0)
    } finally {
      await other.stop()
    }
  })

  test("a backup naming an unknown or out-of-order migration writes nothing", async () => {
    const [headerLine, ...rest] = await decode(backup)
    const header = JSON.parse(headerLine as string)
    const variants = [
      [...header.migrations, "9999_from_the_future"],
      [header.migrations[1], header.migrations[0], ...header.migrations.slice(2)],
    ]
    for (const list of variants) {
      const target = await freshTarget(app.db.dialect)
      try {
        const bad = gzip([JSON.stringify({ ...header, migrations: list }), ...rest])
        expect(await failure(restoreDatabase(target.db, bad))).toBeInstanceOf(BackupFormatError)
        expect(await listTables(target.db)).toEqual([])
      } finally {
        await target.cleanup()
      }
    }
  })

  test("a bad header or a malformed line is a BackupFormatError; no row is left behind", async () => {
    const lines = await decode(backup)
    const target = await freshTarget(app.db.dialect)
    try {
      expect(
        await failure(restoreDatabase(target.db, gzip(['{"format":"other"}'])))
      ).toBeInstanceOf(BackupFormatError)
      expect(
        await failure(restoreDatabase(target.db, gzip([...lines, "not json"])))
      ).toBeInstanceOf(BackupFormatError)
      expect(
        await failure(
          restoreDatabase(target.db, gzip([...lines, '{"table":"jobs","columns":["id"]}']))
        )
      ).toBeInstanceOf(BackupFormatError)
      expect(
        await failure(
          restoreDatabase(target.db, gzip([...lines, '{"table":"x\\"y","columns":[]}']))
        )
      ).toBeInstanceOf(BackupFormatError)
      expect(Object.values(await counts(target.db)).every((n) => n === 0)).toBe(true)
    } finally {
      await target.cleanup()
    }
  })
})

describe("dump of a SQLite file", () => {
  test("reads through its own connection: the api's statements run while it is paused", async () => {
    const target = await freshTarget("sqlite")
    try {
      const db = target.db
      await db.migrate()
      const ROWS = 2_000
      const at = new Date().toISOString()
      for (let i = 0; i < ROWS; i += 100) {
        const values = Array.from({ length: 100 }, (_, j) => ({
          email: `${crypto.randomUUID()}-${i + j}@example.com`,
          source: crypto.randomUUID(),
          created_at: at,
        }))
        await db.sql`INSERT INTO waitlist ${db.sql(values)}`
      }
      let pages = 0
      let began!: () => void
      const started = new Promise<void>((resolve) => {
        began = resolve
      })
      const reader = dumpDatabase(db, {
        pageSize: 10,
        onPage: (table) => {
          if (table === "waitlist") pages++
          began()
        },
      }).getReader()
      const chunks: Uint8Array[] = []
      const first = await reader.read()
      if (first.value) chunks.push(first.value)
      await started
      // The dump is open and paused (nobody reads): the api's own connection still answers.
      const before = performance.now()
      await db.sql`INSERT INTO waitlist (email, source, created_at) VALUES ('during@example.com', 'test', ${at})`
      await db.ping()
      expect(performance.now() - before).toBeLessThan(1_000)
      expect(pages).toBeLessThan(ROWS / 10)
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      const lines = await decode(new Uint8Array(await new Blob(chunks).arrayBuffer()))
      // One snapshot: every row from before, none from during.
      expect(lines.filter((line) => line.includes("@example.com")).length).toBe(ROWS)
      expect(lines.some((line) => line.includes("during@example.com"))).toBe(false)
    } finally {
      await target.cleanup()
    }
  })

  test("a cancelled file dump closes its connection; the file is not left locked", async () => {
    const target = await freshTarget("sqlite")
    try {
      await target.db.migrate()
      const reader = dumpDatabase(target.db, { pageSize: 1 }).getReader()
      await reader.read()
      await reader.cancel()
      await target.db.transaction((tx) =>
        tx.waitlist.add({ email: "x@example.com", source: "www" })
      )
      await target.db.ping()
    } finally {
      await target.cleanup()
    }
  })
})

describe("restore keeps ids and migrates forward", () => {
  test("an id deleted before the dump is never handed out again", async () => {
    const source = await start()
    const target = await freshTarget(source.db.dialect)
    try {
      await signUp(source)
      const newest = await signUp(source)
      const id = newest.user.id
      for (const table of ["sessions", "tokens", "identities"]) {
        await source.db.sql.unsafe(`DELETE FROM ${quoteIdent(table)} WHERE user_id = $1`, [id])
      }
      await source.db.sql`DELETE FROM users WHERE id = ${id}`
      await restoreDatabase(target.db, await dumpToBytes(source.db))
      const restored = await start({ databaseUrl: target.url })
      try {
        const again = await signUp(restored)
        expect(again.user.id).toBeGreaterThan(id)
      } finally {
        await restored.stop()
      }
    } finally {
      await source.stop()
      await target.cleanup()
    }
  })

  test("a backup from an older schema restores, then the newer migrations run", async () => {
    const older = migrations.slice(0, -2)
    const source = await freshTarget(app.db.dialect)
    const target = await freshTarget(app.db.dialect)
    try {
      await migrate(source.db.sql, older)
      await source.db.sql`
        INSERT INTO waitlist (email, source, created_at)
        VALUES ('old@example.com', 'www', '2026-01-01T00:00:00.000Z')
      `
      const bytes = await dumpToBytes(source.db)
      expect(JSON.parse((await decode(bytes))[0] as string).migrations).toEqual(
        older.map((m) => m.name)
      )
      const result = await restoreDatabase(target.db, bytes)
      expect(result.migrationsAfter).toEqual(migrations.slice(-2).map((m) => m.name))
      const rows = await target.db.sql`SELECT email FROM waitlist`
      expect(rows.map((r: { email: string }) => r.email)).toEqual(["old@example.com"])
      const applied = await target.db.sql`SELECT name FROM schema_migrations ORDER BY name`
      expect(applied.map((r: { name: string }) => r.name)).toEqual(migrations.map((m) => m.name))
    } finally {
      await source.cleanup()
      await target.cleanup()
    }
  })
})

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("Postgres to SQLite", () => {
  test("a Postgres backup restores into SQLite", async () => {
    // start() picks Postgres when TEST_DATABASE_URL is set.
    const source = await start({ hiringEmail: "h@example.com" })
    const target = await freshTarget("sqlite")
    try {
      expect(source.db.dialect).toBe("postgres")
      const { owner } = await seed(source)
      await restoreDatabase(target.db, await dumpToBytes(source.db))
      expect(await counts(target.db)).toEqual(await counts(source.db))
      await expectSameRows(target.db, source.db)
      await writeAfterRestore(target.url, owner.email)
    } finally {
      await source.stop()
      await target.cleanup()
    }
  })
})

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("SQLite to Postgres", () => {
  test("a SQLite backup restores into Postgres", async () => {
    const source = await start({ databaseUrl: "sqlite://:memory:", hiringEmail: "h@example.com" })
    const target = await freshTarget("postgres")
    try {
      const { owner } = await seed(source)
      await restoreDatabase(target.db, await dumpToBytes(source.db))
      expect(await counts(target.db)).toEqual(await counts(source.db))
      // The one deliberate difference: REAL is float4 on Postgres, so a vital's value narrows.
      await expectSameRows(target.db, source.db, { telemetry_vitals: ["value"] })
      const values = async (db: Db) =>
        (await db.sql`SELECT value FROM telemetry_vitals ORDER BY id`).map(
          (r: { value: number }) => r.value
        )
      const [narrowed] = await values(target.db)
      const [original] = await values(source.db)
      expect(narrowed).toBeCloseTo(original, 2)
      await writeAfterRestore(target.url, owner.email)
    } finally {
      await source.stop()
      await target.cleanup()
    }
  })
})
