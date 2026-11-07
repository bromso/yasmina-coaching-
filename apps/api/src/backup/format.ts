import type { Dialect } from "../dialect"

/**
 * The backup file: gzip of UTF-8 JSON lines. Line 1 is the header; then, per table, a
 * `{ table, columns }` line followed by one JSON array per row in that column order. A
 * `Uint8Array` value is written as `{ "$b64": … }`. Nothing else.
 */
export const BACKUP_FORMAT = "boilerplate-backup"
export const BACKUP_VERSION = 1

export type BackupHeader = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  engine: Dialect
  createdAt: string
  /** The applied migrations, in applied order. */
  migrations: string[]
  /**
   * The last id each table's counter handed out (Postgres: the `id` sequence; SQLite: the
   * `sqlite_sequence` row of an AUTOINCREMENT table), so a restore never hands out the id of a row
   * deleted before the dump. Optional: a file without it falls back to `MAX(id)`.
   */
  counters?: Record<string, number>
}

export type TableLine = { table: string; columns: string[] }

/** Left out of every backup: queued work would re-run on restore; the header carries migrations. */
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set(["jobs", "schema_migrations"])

/**
 * `backups/<YYYY-MM-DD>/<engine>-<HHMMSS>.jsonl.gz`, written by `backup.run` (apps/api, not the
 * contract — no client ever sees one). `local` storage's `list` must accept it so retention can
 * find them; `storage.sweep` never lists `backups/` at all.
 */
export const BACKUP_KEY_PATTERN = /^backups\/\d{4}-\d{2}-\d{2}\/(sqlite|postgres)-\d{6}\.jsonl\.gz$/

/** A backup this code cannot read: bad header, unknown or out-of-order migration, bad line. */
export class BackupFormatError extends Error {
  override name = "BackupFormatError"
}

/** The target already holds rows in a table the restore would write, and `force` was not given. */
export class RestoreTargetNotEmpty extends Error {
  override name = "RestoreTargetNotEmpty"
  constructor(readonly tables: string[]) {
    super(
      `the target database is not empty (rows in ${tables.join(", ")}): ` +
        "restore into an empty database, or pass force to delete its rows first"
    )
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/

/**
 * The only way an identifier reaches query text: refuses anything but a plain lower-case name, so
 * a table or column named in a backup file can never inject SQL.
 */
export function quoteIdent(name: string): string {
  if (!IDENTIFIER.test(name))
    throw new BackupFormatError(`unsafe identifier ${JSON.stringify(name)}`)
  return `"${name}"`
}

/** One database value as JSON. */
export function encodeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $b64: Buffer.from(value).toString("base64") }
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString()
  }
  if (value instanceof Date) return value.toISOString()
  return value
}

/** The inverse of `encodeValue` for what restore inserts. */
export function decodeValue(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const b64 = (value as { $b64?: unknown }).$b64
    if (typeof b64 === "string" && Object.keys(value).length === 1) {
      return new Uint8Array(Buffer.from(b64, "base64"))
    }
    throw new BackupFormatError("a row value is an object that is not { $b64 }")
  }
  if (Array.isArray(value)) throw new BackupFormatError("a row value is an array")
  return value
}

/** Parses and checks line 1. */
export function parseHeader(line: string | undefined): BackupHeader {
  if (line === undefined) throw new BackupFormatError("the backup is empty")
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw new BackupFormatError("the header is not JSON")
  }
  const header = value as Partial<BackupHeader> | null
  if (!header || typeof header !== "object" || header.format !== BACKUP_FORMAT) {
    throw new BackupFormatError("not a boilerplate backup")
  }
  if (header.version !== BACKUP_VERSION) {
    throw new BackupFormatError(`unsupported backup version ${String(header.version)}`)
  }
  if (header.engine !== "sqlite" && header.engine !== "postgres") {
    throw new BackupFormatError("the header names no known engine")
  }
  if (typeof header.createdAt !== "string")
    throw new BackupFormatError("the header has no createdAt")
  if (
    !Array.isArray(header.migrations) ||
    !header.migrations.every((name) => typeof name === "string")
  ) {
    throw new BackupFormatError("the header's migrations are not a list of names")
  }
  if (header.counters !== undefined) {
    const counters = header.counters as unknown
    if (
      !counters ||
      typeof counters !== "object" ||
      Array.isArray(counters) ||
      !Object.values(counters).every((n) => Number.isSafeInteger(n) && (n as number) >= 0)
    ) {
      throw new BackupFormatError("the header's counters are not a map of table to id")
    }
  }
  return header as BackupHeader
}

/**
 * Checks the backup's migrations against this code's list: every name known, in the same order
 * (applied migrations are always a prefix of the list).
 */
export function checkMigrations(backup: readonly string[], known: readonly string[]) {
  const names = new Set(known)
  for (const name of backup) {
    if (!names.has(name)) {
      throw new BackupFormatError(`the backup names migration "${name}", unknown to this build`)
    }
  }
  backup.forEach((name, index) => {
    if (known[index] !== name) {
      throw new BackupFormatError(
        `the backup's migrations are out of order at "${name}" (expected "${known[index]}")`
      )
    }
  })
}
