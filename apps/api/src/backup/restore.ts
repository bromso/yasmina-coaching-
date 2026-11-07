import type { Logger } from "@repo/log"
import type { SQL } from "bun"
import type { Db } from "../db"
import { migrate } from "../migrate"
import { migrations as allMigrations } from "../migrations"
import { restoreCounters } from "./counters"
import {
  BackupFormatError,
  checkMigrations,
  decodeValue,
  EXCLUDED_TABLES,
  parseHeader,
  quoteIdent,
  RestoreTargetNotEmpty,
} from "./format"
import { introspect, orderParentsFirst, type TableInfo } from "./tables"

/** Rows per INSERT (fewer for a wide table, to stay under either engine's parameter limit). */
export const RESTORE_BATCH_ROWS = 500
const MAX_PARAMS = 30_000

export type RestoreOptions = {
  /** Delete every row in the target first (children first) instead of refusing a non-empty one. */
  force?: boolean
  log?: Pick<Logger, "info" | "warn">
}

export type RestoreResult = {
  /** Table sections restored. */
  tables: number
  rows: number
  /** The migrations run after the data went in (the ones this build has beyond the backup). */
  migrationsAfter: string[]
}

/**
 * Loads a backup into `db`: checks the header, migrates the target to exactly the backup's
 * migrations, refuses a target holding rows (unless `force`, which empties it children-first,
 * `jobs` included), inserts every section in one transaction, sets every id counter to
 * max(the backup's counter, MAX(id)) so no id is ever handed out twice, then runs the rest of this build's migrations. A failure inside the transaction
 * leaves the target's tables empty, never half-filled.
 */
export async function restoreDatabase(
  db: Pick<Db, "sql" | "dialect">,
  source: ReadableStream<Uint8Array> | Uint8Array,
  options: RestoreOptions = {}
): Promise<RestoreResult> {
  const { log } = options
  const lines = readLines(source)
  try {
    const first = await lines.next()
    const header = parseHeader(first.done ? undefined : first.value)
    const known = allMigrations.map((m) => m.name)
    checkMigrations(header.migrations, known)

    const recorded = await recordedMigrations(db)
    if (recorded.length > header.migrations.length) {
      throw new Error(
        `the target database has ${recorded.length} migrations applied, the backup ` +
          `${header.migrations.length} — probably the api migrated it when it started: restore ` +
          "into a database with no migrations applied (a new SQLite file or Postgres database, " +
          "before any api or worker has run against it)"
      )
    }
    checkMigrations(recorded, header.migrations)
    await migrate(db.sql, allMigrations.slice(0, header.migrations.length))

    const tables = (await introspect(db.sql, db.dialect)).filter(
      (t) => !EXCLUDED_TABLES.has(t.name)
    )
    const byName = new Map(tables.map((t) => [t.name, t]))
    const occupied = await nonEmpty(db.sql, tables)
    if (occupied.length > 0 && !options.force) throw new RestoreTargetNotEmpty(occupied)

    const counts = await db.sql.begin(async (tx) => {
      if (occupied.length > 0) {
        log?.warn("restore: deleting the target's rows (force)", { tables: occupied })
        const all = await introspect(tx, db.dialect)
        const order = orderParentsFirst(
          all.filter((t) => t.name !== "schema_migrations"),
          log
        ).reverse()
        for (const table of order) await tx.unsafe(`DELETE FROM ${quoteIdent(table.name)}`)
      }
      const counts = await insertAll(tx, db.dialect, lines, byName, log)
      await restoreCounters(tx, db.dialect, tables, header.counters)
      return counts
    })

    const migrationsAfter = await migrate(db.sql, allMigrations)
    log?.info("restore: done", { ...counts, migrationsAfter })
    return { ...counts, migrationsAfter }
  } finally {
    await lines.return(undefined)
  }
}

async function recordedMigrations(db: Pick<Db, "sql" | "dialect">): Promise<string[]> {
  const tables = await introspect(db.sql, db.dialect)
  if (!tables.some((t) => t.name === "schema_migrations")) return []
  const rows: Array<{ name: string }> =
    await db.sql`SELECT name FROM schema_migrations ORDER BY name`
  return rows.map((r) => r.name)
}

async function nonEmpty(sql: SQL, tables: TableInfo[]): Promise<string[]> {
  const occupied: string[] = []
  for (const table of tables) {
    const rows: unknown[] = await sql.unsafe(`SELECT 1 FROM ${quoteIdent(table.name)} LIMIT 1`)
    if (rows.length > 0) occupied.push(table.name)
  }
  return occupied
}

async function insertAll(
  tx: SQL,
  dialect: Db["dialect"],
  lines: AsyncGenerator<string>,
  byName: Map<string, TableInfo>,
  log: RestoreOptions["log"]
): Promise<{ tables: number; rows: number }> {
  const seen = new Set<string>()
  let section: { table: string; columns: string[]; batch: unknown[][]; size: number } | undefined
  let rows = 0
  let lineNo = 1

  const flush = async () => {
    if (!section || section.batch.length === 0) return
    const { table, columns, batch } = section
    const width = columns.length
    const values = batch
      .map((_, r) => `(${columns.map((_, c) => `$${r * width + c + 1}`).join(", ")})`)
      .join(", ")
    // Explicit ids go into Postgres identity columns as they are; the counters are set afterwards.
    const overriding = dialect === "postgres" ? " OVERRIDING SYSTEM VALUE" : ""
    await tx.unsafe(
      `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})${overriding} ` +
        `VALUES ${values}`,
      batch.flat()
    )
    rows += batch.length
    section.batch = []
  }

  for await (const line of lines) {
    lineNo++
    if (line === "") continue
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      throw new BackupFormatError(`line ${lineNo} is not JSON`)
    }
    if (Array.isArray(value)) {
      if (!section) throw new BackupFormatError(`line ${lineNo}: a row before any table`)
      if (value.length !== section.columns.length) {
        throw new BackupFormatError(`line ${lineNo}: the row does not match its columns`)
      }
      section.batch.push(value.map(decodeValue))
      if (section.batch.length >= section.size) await flush()
      continue
    }
    const next = value as { table?: unknown; columns?: unknown } | null
    if (
      !next ||
      typeof next.table !== "string" ||
      !Array.isArray(next.columns) ||
      !next.columns.every((c) => typeof c === "string")
    ) {
      throw new BackupFormatError(`line ${lineNo} is neither a table nor a row`)
    }
    await flush()
    const columns = next.columns as string[]
    quoteIdent(next.table)
    columns.forEach(quoteIdent)
    const target = byName.get(next.table)
    if (!target || seen.has(next.table)) {
      throw new BackupFormatError(`line ${lineNo}: unexpected table "${next.table}"`)
    }
    const missing = columns.filter((c) => !target.columns.includes(c))
    if (missing.length > 0 || new Set(columns).size !== columns.length) {
      throw new BackupFormatError(
        `line ${lineNo}: table "${next.table}" has columns the target does not (${missing.join(", ")})`
      )
    }
    seen.add(next.table)
    log?.info("restore: table", { table: next.table })
    section = {
      table: next.table,
      columns,
      batch: [],
      size: Math.max(
        1,
        Math.min(RESTORE_BATCH_ROWS, Math.floor(MAX_PARAMS / Math.max(1, columns.length)))
      ),
    }
  }
  await flush()

  return { tables: seen.size, rows }
}

/** The decompressed lines of a backup, one at a time, whatever the chunks cut. */
async function* readLines(source: ReadableStream<Uint8Array> | Uint8Array): AsyncGenerator<string> {
  const stream =
    source instanceof Uint8Array ? new Blob([source as Uint8Array<ArrayBuffer>]).stream() : source
  const text = stream
    .pipeThrough(
      new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>
    )
    .pipeThrough(new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>)
  let buffer = ""
  try {
    for await (const chunk of text) {
      buffer += chunk
      // Only the new chunk can hold the next newline: a long line is not re-scanned per chunk.
      if (!chunk.includes("\n")) continue
      const parts = buffer.split("\n")
      buffer = parts.pop() ?? ""
      for (const part of parts) yield part
    }
  } catch (error) {
    if (error instanceof BackupFormatError) throw error
    throw new BackupFormatError(`the backup is not readable gzip: ${String(error)}`)
  }
  if (buffer !== "") yield buffer
}
