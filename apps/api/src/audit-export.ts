import type { AuditDetailRow } from "./queries/audit"

/**
 * `admin.audit.export`'s cap when the caller does not override it (`ServerOptions.auditExportMaxRows`
 * in `server.ts`). The handler selects one row past this cap and refuses with a `CONFLICT` rather
 * than returning a truncated file (see `listForExport`'s `limit: cap + 1` in `router.ts`).
 * Measured at the cap: ~100k realistic rows build a ~30 MB CSV in ~110 ms, with ~210 MB peak RSS
 * growth across `toCsv` and the `new File` it is wrapped in — acceptable for a 10-per-hour admin
 * operation (see `docs/guides/operations.md`).
 */
export const AUDIT_EXPORT_MAX_ROWS = 100_000

/** RFC 4180 line ending; every row (including the header) ends with one. */
const CRLF = "\r\n"
/** UTF-8 byte order mark: the documented reason a CSV export carries one is so a spreadsheet opens
 * it as UTF-8 instead of guessing a legacy encoding. */
const BOM = "﻿"

/** The columns `toCsv`/`toJsonl` emit, in the design's own order. */
export const AUDIT_EXPORT_COLUMNS = [
  "id",
  "at",
  "actor_id",
  "actor_email",
  "impersonated_id",
  "impersonated_email",
  "action",
  "target_type",
  "target_id",
  "reason",
  "ip",
  "user_agent",
  "metadata",
] as const
type AuditExportColumn = (typeof AUDIT_EXPORT_COLUMNS)[number]

/** A cell whose first character OWASP's CSV Injection guidance lists as formula-starting (`=`,
 * `+`, `-`, `@`, a tab or a carriage return) gets a leading `'`, so a spreadsheet shows it as text
 * instead of evaluating it as a formula. An empty cell is left alone — nothing to guard. */
export function guardCell(value: string): string {
  if (value.length === 0) return value
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** RFC 4180: quote the (already formula-guarded) value, doubling any `"` inside it. */
function quoteCsv(raw: string): string {
  return `"${guardCell(raw).replace(/"/g, '""')}"`
}

/** `null` renders as an empty string in CSV; `toJsonl` keeps real `null`s instead. */
function cell(value: string | number | null): string {
  return value === null ? "" : String(value)
}

function cellsOf(row: AuditDetailRow): Record<AuditExportColumn, string> {
  return {
    id: cell(row.id),
    at: row.at,
    actor_id: cell(row.actor_user_id),
    actor_email: cell(row.actor_email),
    impersonated_id: cell(row.impersonated_user_id),
    impersonated_email: cell(row.impersonated_email),
    action: row.action,
    target_type: cell(row.target_type),
    target_id: cell(row.target_id),
    reason: cell(row.reason),
    ip: cell(row.ip),
    user_agent: cell(row.user_agent),
    metadata: cell(row.metadata),
  }
}

/**
 * RFC 4180: every field quoted, `"` doubled, CRLF line ends, a UTF-8 BOM and a header row. Every
 * cell — the header included — goes through `guardCell` first: none of the column names
 * themselves trip it, but running the header through the same path as the data keeps there being
 * exactly one quoting/guarding code path in this file.
 */
export function toCsv(rows: readonly AuditDetailRow[]): string {
  // Appended line by line rather than collected into a `lines` array and `.join`ed at the end, so
  // the array of (up to AUDIT_EXPORT_MAX_ROWS + 1) line strings and the final joined string are
  // never both alive in memory at once.
  let out = `${BOM}${AUDIT_EXPORT_COLUMNS.map(quoteCsv).join(",")}${CRLF}`
  for (const row of rows) {
    const cells = cellsOf(row)
    out += `${AUDIT_EXPORT_COLUMNS.map((column) => quoteCsv(cells[column])).join(",")}${CRLF}`
  }
  return out
}

/**
 * One JSON object per line, the same columns `toCsv` uses, with real `null`s rather than empty
 * strings. `metadata` is parsed back to an object when it is valid JSON, else kept as the raw
 * stored string — a `metadata` value that was never valid JSON (or `null`) survives the export
 * exactly as stored.
 */
export function toJsonl(rows: readonly AuditDetailRow[]): string {
  // Appended line by line, like `toCsv`, rather than `.map`+`.join`ed — no intermediate array of
  // every stringified row held alongside the final string.
  let out = ""
  for (const row of rows) {
    let metadata: unknown = row.metadata
    if (row.metadata !== null) {
      try {
        metadata = JSON.parse(row.metadata)
      } catch {
        metadata = row.metadata
      }
    }
    out += `${JSON.stringify({
      id: row.id,
      at: row.at,
      actor_id: row.actor_user_id,
      actor_email: row.actor_email,
      impersonated_id: row.impersonated_user_id,
      impersonated_email: row.impersonated_email,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      reason: row.reason,
      ip: row.ip,
      user_agent: row.user_agent,
      metadata,
    })}\n`
  }
  return out
}

/**
 * `from`/`to` are whole UTC days, inclusive: `fromIso` is `from`'s own midnight, `toExclusiveIso`
 * is the midnight *after* `to`'s day, so a query using `at >= fromIso AND at < toExclusiveIso`
 * includes every row on `to`'s own date regardless of time of day — including rows written later
 * today when `to` is today. Both arguments are already-validated `YYYY-MM-DD` strings
 * (`AuditExportSchema` in `@repo/api-contract`) by the time this runs.
 */
export function auditExportRange(
  from: string,
  to: string
): { fromIso: string; toExclusiveIso: string } {
  const fromIso = `${from}T00:00:00.000Z`
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to)
  if (!match) throw new Error(`auditExportRange: "to" is not YYYY-MM-DD: ${to}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const toExclusiveIso = new Date(Date.UTC(year, month - 1, day + 1)).toISOString()
  return { fromIso, toExclusiveIso }
}

/** `YYYY-MM-DD` for `date`, in UTC. */
function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * `admin.audit.export`'s own clock-dependent bound that `AuditExportSchema`'s `superRefine`
 * cannot enforce (a Zod schema has no injectable server clock, so it cannot know "today"): `to`
 * must not be later than *tomorrow's* UTC date — tomorrow, not today, so an admin whose own local
 * calendar date already reads a day ahead of UTC can still pick it. The router calls this with
 * `context.now()`, the same clock `admin.users.suspend`'s `until` check reads, so a test can pin
 * it the same way.
 */
export function isToWithinBounds(to: string, now: Date): boolean {
  const tomorrow = utcDateString(new Date(now.getTime() + 24 * 60 * 60_000))
  return to <= tomorrow
}
