import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Errors are one row per (fingerprint, day) with a count; vitals are one row per sample. Both are
// pruned on ingest (30 / 7 days), so neither needs a retention job.
const telemetry: Migration = {
  name: "0012_telemetry",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE telemetry_errors (
        id ${ddl.serialId(dialect)},
        fingerprint TEXT NOT NULL,
        day TEXT NOT NULL,
        app TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('boundary', 'unhandled', 'server')),
        message TEXT NOT NULL,
        stack TEXT,
        digest TEXT,
        route TEXT,
        user_agent TEXT,
        count INTEGER NOT NULL DEFAULT 1,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        UNIQUE (fingerprint, day)
      )
    `)
    await sql.unsafe("CREATE INDEX telemetry_errors_last_seen ON telemetry_errors (last_seen)")
    await sql.unsafe(`
      CREATE TABLE telemetry_vitals (
        id ${ddl.serialId(dialect)},
        app TEXT NOT NULL,
        route TEXT NOT NULL,
        name TEXT NOT NULL CHECK (name IN ('CLS', 'INP', 'LCP', 'FCP', 'TTFB')),
        value REAL NOT NULL,
        rating TEXT NOT NULL,
        navigation_type TEXT,
        at TEXT NOT NULL
      )
    `)
    await sql.unsafe(
      "CREATE INDEX telemetry_vitals_app_name_at ON telemetry_vitals (app, name, at)"
    )
    // The prune's `WHERE at < ?` runs on every ingest; without this it scans the table.
    await sql.unsafe("CREATE INDEX telemetry_vitals_at ON telemetry_vitals (at)")
  },
}

export default telemetry
