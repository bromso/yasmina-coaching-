import type { SQL } from "bun"
import type { Dialect } from "../dialect"
import { quoteIdent } from "./format"
import type { TableInfo } from "./tables"

// Ids are never reused here: a purged user's id stays in `notes.user_id` and `audit_log.target_id`
// (see `keepSequence` in migrations/0005_identities.ts). A restore that reset each counter to
// MAX(id) would hand the id of a row deleted before the dump to the next sign-up. So the backup
// carries each counter, and the restore sets it to max(backup counter, MAX(restored id)).

/** The last id each table's counter handed out, read inside the dump's transaction. */
export async function readCounters(
  tx: SQL,
  dialect: Dialect,
  tables: readonly TableInfo[]
): Promise<Record<string, number>> {
  const wanted = new Set(tables.map((t) => t.name))
  const counters: Record<string, number> = {}
  if (dialect === "sqlite") {
    const [exists]: unknown[] =
      await tx`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`
    if (!exists) return counters
    const rows: Array<{ name: string; seq: number }> =
      await tx`SELECT name, seq FROM sqlite_sequence ORDER BY name`
    for (const { name, seq } of rows) {
      if (wanted.has(name) && Number(seq) > 0) counters[name] = Number(seq)
    }
    return counters
  }
  for (const table of tables) {
    if (!table.columns.includes("id")) continue
    // NULL when `id` has no sequence (`billing_events.id` is text) or it never handed one out.
    const [row]: Array<{ last: number | string | null }> = await tx`
      SELECT pg_sequence_last_value(pg_get_serial_sequence(${quoteIdent(table.name)}, 'id')::regclass)
        AS last
    `
    if (row?.last != null && Number(row.last) > 0) counters[table.name] = Number(row.last)
  }
  return counters
}

/**
 * Sets every table's counter to max(the backup's counter, MAX(id)), inside the restore's
 * transaction. `tables` are the target's (excluded tables already left out).
 */
export async function restoreCounters(
  tx: SQL,
  dialect: Dialect,
  tables: readonly TableInfo[],
  counters: Record<string, number> = {}
) {
  const withId = tables.filter((t) => t.columns.includes("id"))
  if (dialect === "sqlite") {
    const auto: Array<{ name: string }> = await tx`
      SELECT name FROM sqlite_master WHERE type = 'table' AND sql LIKE '%AUTOINCREMENT%'
    `
    const autoNames = new Set(auto.map((a) => a.name))
    for (const table of withId) {
      if (!autoNames.has(table.name)) continue
      const [row]: Array<{ top: number | null }> = await tx.unsafe(
        `SELECT MAX(id) AS top FROM ${quoteIdent(table.name)}`
      )
      const next = Math.max(counters[table.name] ?? 0, Number(row?.top ?? 0))
      await tx`DELETE FROM sqlite_sequence WHERE name = ${table.name}`
      if (next > 0) {
        await tx`INSERT INTO sqlite_sequence (name, seq) VALUES (${table.name}, ${next})`
      }
    }
    return
  }
  for (const table of withId) {
    const name = quoteIdent(table.name)
    // Only an identity/serial `id` has a sequence (`billing_events.id` is text).
    const [found]: Array<{ seq: string | null }> =
      await tx`SELECT pg_get_serial_sequence(${name}, 'id') AS seq`
    if (!found?.seq) continue
    const counter = counters[table.name] ?? 0
    // setval(seq, n, true): the next id is n + 1; setval(seq, 1, false): the next id is 1.
    await tx.unsafe(
      `SELECT setval(pg_get_serial_sequence('${name}', 'id'), ` +
        `GREATEST(COALESCE(MAX(id), 0), $1::bigint, 1), ` +
        `GREATEST(COALESCE(MAX(id), 0), $1::bigint) > 0) FROM ${name}`,
      [counter]
    )
  }
}
