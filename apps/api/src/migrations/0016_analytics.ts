import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Pageviews and product events, cookieless: `visitor_id` is a daily hash (see
// src/analytics/visitor.ts), never a cookie. Raw rows are pruned past ANALYTICS_RETENTION_DAYS
// (Task 2); `analytics_daily` — the rollup Task 2 builds from them — is kept indefinitely, so its
// own index only needs the unique constraint below, not a `day` index for pruning.
const analytics: Migration = {
  name: "0016_analytics",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE analytics_pageviews (
        id ${ddl.serialId(dialect)},
        app TEXT NOT NULL,
        path TEXT NOT NULL,
        referrer_host TEXT,
        visitor_id TEXT,
        user_id INTEGER,
        workspace_id INTEGER,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX analytics_pageviews_day ON analytics_pageviews (day)")

    await sql.unsafe(`
      CREATE TABLE analytics_events (
        id ${ddl.serialId(dialect)},
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        user_id INTEGER,
        workspace_id INTEGER,
        props TEXT NOT NULL,
        visitor_id TEXT,
        day TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX analytics_events_day ON analytics_events (day)")
    await sql.unsafe("CREATE INDEX analytics_events_name_day ON analytics_events (name, day)")

    // One salt per UTC day, created on first use (analyticsQueries.saltFor) and deleted the day
    // after by the prune job (Task 2) — never read back once its day is gone.
    await sql.unsafe(`
      CREATE TABLE analytics_daily_salts (
        day TEXT PRIMARY KEY,
        salt TEXT NOT NULL
      )
    `)

    // The rollup's output (Task 2): one row per day/kind/app/key, rebuilt idempotently.
    await sql.unsafe(`
      CREATE TABLE analytics_daily (
        id ${ddl.serialId(dialect)},
        day TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('page', 'event')),
        app TEXT NOT NULL,
        key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        visitors INTEGER NOT NULL DEFAULT 0,
        UNIQUE (day, kind, app, key)
      )
    `)
  },
}

export default analytics
