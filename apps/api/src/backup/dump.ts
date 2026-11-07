import type { Logger } from "@repo/log"
import { SQL } from "bun"
import { type Db, SQLITE_BUSY_TIMEOUT_MS } from "../db"
import { readCounters } from "./counters"
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupHeader,
  EXCLUDED_TABLES,
  encodeValue,
  quoteIdent,
} from "./format"
import { introspect, orderParentsFirst, type TableInfo } from "./tables"

export const DUMP_PAGE_SIZE = 1_000

export type DumpOptions = {
  /** Rows per query (default 1 000). */
  pageSize?: number
  now?: () => Date
  log?: Pick<Logger, "warn">
  /** Called once per page read, inside the dump's transaction (tests count pages with it). */
  onPage?: (table: string, rows: number) => void
}

type Row = Record<string, unknown>

/** What the dump reads: the client, its engine and, for a SQLite file, that file's path. */
export type DumpSource = Pick<Db, "sql" | "dialect"> & Partial<Pick<Db, "sqliteFile">>

/**
 * A gzipped backup of every table but `jobs` and `schema_migrations`, read in one transaction, a
 * page at a time, produced only as fast as the reader consumes it. Nothing touches the database
 * until the first read: creating the stream is free.
 *
 * Postgres reads in `REPEATABLE READ READ ONLY`, so every table comes from one snapshot and writers
 * are never blocked. A SQLite file is read through its own read-only connection, opened on the
 * first read and closed when the dump ends, is cancelled or fails, in a `DEFERRED` transaction: in
 * WAL mode that is a snapshot, and this process's own statements (on `db.sql`, behind the gate in
 * `db.ts`) carry on during the dump, as do other processes'.
 *
 * Only a SQLite database with no file (`:memory:`, tests) is dumped on `db.sql` itself, where the
 * gate holds every other statement back until the dump ends. For that case:
 * - read promptly: a reader that stalls longer than `SQLITE_GATE_WAIT_MS` (30 s) while statements
 *   are queued behind the dump fails them all;
 * - never await a database call between reads while the dump is open — it waits behind the dump,
 *   which waits for the next read: a deadlock the gate breaks only by failing the call after 30 s.
 */
export function dumpDatabase(
  db: DumpSource,
  options: DumpOptions = {}
): ReadableStream<Uint8Array> {
  let reader:
    | {
        read(): Promise<{ done: boolean; value?: Uint8Array }>
        cancel(reason?: unknown): Promise<void>
      }
    | undefined
  // A high-water mark of 0: `pull` runs only when someone reads, so the transaction (and, on
  // SQLite, the gate) is taken on the first read rather than when the stream is built.
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        reader ??= produce(db, options).pipeThrough(gzipStream()).getReader()
        const { done, value } = await reader.read()
        if (done || !value) controller.close()
        else controller.enqueue(value)
      },
      async cancel(reason) {
        await reader?.cancel(reason)
      },
    },
    { highWaterMark: 0 }
  )
}

/** The uncompressed lines, from one transaction opened as soon as this is called. */
function produce(db: DumpSource, options: DumpOptions) {
  const encoder = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let resume: (() => void) | undefined
  let cancelled = false

  // Waits until the reader wants more: the transaction stays open, but nothing piles up in memory.
  const push = async (text: string) => {
    if (cancelled) throw new Error("backup: the reader cancelled the dump")
    controller.enqueue(encoder.encode(text))
    while ((controller.desiredSize ?? 1) <= 0 && !cancelled) {
      await new Promise<void>((resolve) => {
        resume = resolve
      })
    }
  }

  const run = async () => {
    const read = (tx: SQL) => writeDump(tx, db.dialect, push, options)
    if (db.dialect === "postgres") {
      await db.sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", read)
      return
    }
    if (!db.sqliteFile) {
      await db.sql.begin("DEFERRED", read)
      return
    }
    // Its own connection, so the dump never holds the api's gate: WAL gives it a snapshot.
    const own = new SQL({ adapter: "sqlite", filename: db.sqliteFile, readonly: true })
    try {
      await own.unsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`)
      await own.begin("DEFERRED", read)
    } finally {
      await own.close()
    }
  }

  return new ReadableStream<Uint8Array>(
    {
      start(c) {
        controller = c
        run().then(
          () => controller.close(),
          (error) => {
            if (!cancelled) controller.error(error)
          }
        )
      },
      pull() {
        resume?.()
        resume = undefined
      },
      cancel() {
        cancelled = true
        resume?.()
        resume = undefined
      },
    },
    { highWaterMark: 4 }
  )
}

/** `CompressionStream` typed as the byte transform it is (lib.dom types its input as BufferSource). */
const gzipStream = () =>
  new CompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>

/** The whole dump in memory — for tests and small databases. */
export async function dumpToBytes(db: DumpSource, options?: DumpOptions): Promise<Uint8Array> {
  return new Uint8Array(await new Response(dumpDatabase(db, options)).arrayBuffer())
}

async function writeDump(
  tx: SQL,
  dialect: Db["dialect"],
  push: (text: string) => Promise<void>,
  options: DumpOptions
) {
  const pageSize = options.pageSize ?? DUMP_PAGE_SIZE
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("backup: bad page size")

  const applied: Array<{ name: string }> =
    await tx`SELECT name FROM schema_migrations ORDER BY name`
  const tables = orderParentsFirst(
    (await introspect(tx, dialect)).filter((t) => !EXCLUDED_TABLES.has(t.name)),
    options.log
  )
  const header: BackupHeader = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    engine: dialect,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
    // `NNNN_` names sort in applied order.
    migrations: applied.map((m) => m.name),
    counters: await readCounters(tx, dialect, tables),
  }
  await push(`${JSON.stringify(header)}\n`)

  for (const table of tables) {
    await push(`${JSON.stringify({ table: table.name, columns: table.columns })}\n`)
    for await (const rows of pages(tx, dialect, table, pageSize)) {
      options.onPage?.(table.name, rows.length)
      let text = ""
      for (const row of rows) {
        text += `${JSON.stringify(table.columns.map((c) => encodeValue(row[c])))}\n`
      }
      if (text) await push(text)
    }
  }
}

/**
 * The table's rows in pages ordered by its primary key, each page starting after the last key read
 * (keyset, so every page costs the same). A SQLite table with no key pages by `rowid`; a Postgres
 * table with no key falls back to OFFSET over every column (none exists today).
 */
async function* pages(
  tx: SQL,
  dialect: Db["dialect"],
  table: TableInfo,
  pageSize: number
): AsyncGenerator<Row[]> {
  const name = quoteIdent(table.name)
  const columns = table.columns.map(quoteIdent).join(", ")
  const ROWID = "__backup_rowid"
  let key: string[]
  let select: string
  if (table.primaryKey.length > 0) {
    key = table.primaryKey
    select = columns
  } else if (dialect === "sqlite") {
    key = [ROWID]
    select = `rowid AS ${ROWID}, ${columns}`
  } else {
    const order = table.columns.map(quoteIdent).join(", ")
    for (let offset = 0; ; offset += pageSize) {
      const rows: Row[] = await tx.unsafe(
        `SELECT ${columns} FROM ${name} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${offset}`
      )
      if (rows.length > 0) yield rows
      if (rows.length < pageSize) return
    }
  }
  const order = key.map((k) => (k === ROWID ? "rowid" : quoteIdent(k))).join(", ")
  const keyColumns = key.map((k) => (k === ROWID ? "rowid" : quoteIdent(k)))
  const tuple = (xs: string[]) => (xs.length === 1 ? xs[0] : `(${xs.join(", ")})`)
  let last: unknown[] | undefined
  for (;;) {
    const where = last
      ? `WHERE ${tuple(keyColumns)} > ${tuple(key.map((_, i) => `$${i + 1}`))}`
      : ""
    const rows: Row[] = await tx.unsafe(
      `SELECT ${select} FROM ${name} ${where} ORDER BY ${order} LIMIT ${pageSize}`,
      last ?? []
    )
    if (rows.length > 0) yield rows
    if (rows.length < pageSize) return
    const end = rows[rows.length - 1] as Row
    last = key.map((k) => end[k])
  }
}
