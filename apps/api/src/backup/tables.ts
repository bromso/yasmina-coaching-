import type { Logger } from "@repo/log"
import type { SQL } from "bun"
import type { Db } from "../db"
import type { Dialect } from "../dialect"

export type TableInfo = {
  name: string
  /** In the table's own column order. */
  columns: string[]
  /** In key order; empty when the table has none. */
  primaryKey: string[]
  /** Tables this one references by foreign key (itself excluded), sorted. */
  parents: string[]
}

/** Every table in the database (or the current Postgres schema), sorted by name. */
export function listTables(db: Pick<Db, "sql" | "dialect">): Promise<TableInfo[]> {
  return introspect(db.sql, db.dialect)
}

/** `listTables` on a given client — the pool, or an open transaction. */
export async function introspect(sql: SQL, dialect: Dialect): Promise<TableInfo[]> {
  return dialect === "sqlite" ? introspectSqlite(sql) : introspectPostgres(sql)
}

async function introspectSqlite(sql: SQL): Promise<TableInfo[]> {
  const names: Array<{ name: string }> = await sql`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `
  const tables: TableInfo[] = []
  for (const { name } of names) {
    // The table-valued pragma functions take the name as a bound parameter: no interpolation.
    const columns: Array<{ name: string; pk: number }> =
      await sql`SELECT name, pk FROM pragma_table_info(${name}) ORDER BY cid`
    const parents: Array<{ table: string }> =
      await sql`SELECT DISTINCT "table" FROM pragma_foreign_key_list(${name})`
    tables.push({
      name,
      columns: columns.map((c) => c.name),
      primaryKey: columns
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name),
      parents: [...new Set(parents.map((p) => p.table).filter((p) => p !== name))].sort(),
    })
  }
  return tables
}

async function introspectPostgres(sql: SQL): Promise<TableInfo[]> {
  const names: Array<{ table_name: string }> = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  const columns: Array<{ table_name: string; column_name: string }> = await sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
    ORDER BY table_name, ordinal_position
  `
  const keys: Array<{ table_name: string; column_name: string }> = await sql`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = current_schema()
    ORDER BY tc.table_name, kcu.ordinal_position
  `
  const foreign: Array<{ child: string; parent: string }> = await sql`
    SELECT child.relname AS child, parent.relname AS parent
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace
  `
  return names.map(({ table_name: name }) => ({
    name,
    columns: columns.filter((c) => c.table_name === name).map((c) => c.column_name),
    primaryKey: keys.filter((k) => k.table_name === name).map((k) => k.column_name),
    parents: [
      ...new Set(foreign.filter((f) => f.child === name && f.parent !== name).map((f) => f.parent)),
    ].sort(),
  }))
}

/**
 * Parents before children by foreign key, ties alphabetical. A cycle cannot be ordered: the tables
 * left in it follow alphabetically, with one warning.
 */
export function orderParentsFirst<T extends Pick<TableInfo, "name" | "parents">>(
  tables: readonly T[],
  log?: Pick<Logger, "warn">
): T[] {
  const byName = new Map(tables.map((t) => [t.name, t]))
  const placed = new Set<string>()
  const ordered: T[] = []
  let pending = [...tables].sort((a, b) => a.name.localeCompare(b.name))
  while (pending.length > 0) {
    // Parents outside the set (an excluded table) never hold anything back.
    const ready = pending.filter((t) => t.parents.every((p) => placed.has(p) || !byName.has(p)))
    if (ready.length === 0) {
      log?.warn("backup: foreign keys form a cycle; ordering those tables alphabetically", {
        tables: pending.map((t) => t.name),
      })
      ordered.push(...pending)
      break
    }
    for (const t of ready) {
      ordered.push(t)
      placed.add(t.name)
    }
    pending = pending.filter((t) => !placed.has(t.name))
  }
  return ordered
}
