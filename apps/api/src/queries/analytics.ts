import type { SQL } from "bun"

export type PageviewRow = {
  id: number
  app: string
  path: string
  referrer_host: string | null
  visitor_id: string | null
  user_id: number | null
  workspace_id: number | null
  day: string
  created_at: string
}

export type EventRow = {
  id: number
  name: string
  source: string
  user_id: number | null
  workspace_id: number | null
  /** JSON-encoded; the caller parses it (as `jobs.payload` and friends already do). */
  props: string
  visitor_id: string | null
  day: string
  created_at: string
}

export type PageviewInsert = {
  app: string
  path: string
  referrerHost: string | null
  visitorId: string | null
  userId: number | null
  workspaceId: number | null
  day: string
  createdAt: string
}

export type EventInsert = {
  name: string
  source: string
  props: Record<string, unknown>
  visitorId: string | null
  userId: number | null
  workspaceId: number | null
  day: string
  createdAt: string
}

/** 32 random bytes, hex-encoded: the day's salt, never derived from anything predictable. */
function randomSalt(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** One `analytics_daily` row's shape, keyed by `app` and `key` (a path for `kind: "page"`, an
 * event name for `kind: "event"`) — before `day` and `kind` are known to the caller. */
export type DailyAgg = { app: string; key: string; count: number; visitors: number }

/**
 * Pageview counts and distinct visitors per (app, path), for one day — the aggregation `rollup`
 * writes into `analytics_daily`. Also used live, unwritten, for "today" (the admin dashboard's
 * current day, which has no `analytics_daily` row yet) and for a past day whose rollup never
 * ran: the one definition of "how a day's pageviews collapse by page" for all three. Visitors
 * here are distinct *per page*, not per app — the admin dashboard's top pages, never its
 * visitor totals (see `pageviewAppAgg`, whose distinct count is the one that matters there).
 */
async function pageviewAgg(sql: SQL, day: string): Promise<DailyAgg[]> {
  const rows: { app: string; key: string; count: number | string; visitors: number | string }[] =
    await sql`
      SELECT app, path AS key, COUNT(*) AS count, COUNT(DISTINCT visitor_id) AS visitors
      FROM analytics_pageviews
      WHERE day = ${day}
      GROUP BY app, path
    `
  return rows.map((r) => ({
    app: r.app,
    key: r.key,
    count: Number(r.count),
    visitors: Number(r.visitors),
  }))
}

/**
 * Pageview count and *distinct visitors of that app's day as a whole* (never per page), keyed
 * "*" — a path always starts with "/", so "*" never collides with a real one. This is the
 * aggregation the admin dashboard's visitor totals need: summing `pageviewAgg`'s per-page
 * distinct counts would double-count a visitor who viewed two pages of the same app on the same
 * day, which is exactly the bug this fixes. `rollup` writes one such row per app alongside its
 * per-page rows (both `kind: "page"`); the admin dashboard reads it live for today and for any
 * past day whose rollup never ran.
 */
async function pageviewAppAgg(sql: SQL, day: string): Promise<DailyAgg[]> {
  const rows: { app: string; count: number | string; visitors: number | string }[] = await sql`
    SELECT app, COUNT(*) AS count, COUNT(DISTINCT visitor_id) AS visitors
    FROM analytics_pageviews
    WHERE day = ${day}
    GROUP BY app
  `
  return rows.map((r) => ({
    app: r.app,
    key: "*",
    count: Number(r.count),
    visitors: Number(r.visitors),
  }))
}

/**
 * Event counts and distinct "visitors" per (source, name), for one day — see `pageviewAgg`.
 * "Visitors" is `visitor_id` else `user_id` (product events never carry a `visitor_id`), exactly
 * as `rollup` defines it.
 */
async function eventAgg(sql: SQL, day: string): Promise<DailyAgg[]> {
  const rows: { app: string; key: string; count: number | string; visitors: number | string }[] =
    await sql`
      SELECT source AS app, name AS key, COUNT(*) AS count,
        COUNT(DISTINCT CASE
          WHEN visitor_id IS NOT NULL THEN 'v:' || visitor_id
          WHEN user_id IS NOT NULL THEN 'u:' || CAST(user_id AS TEXT)
          ELSE NULL
        END) AS visitors
      FROM analytics_events
      WHERE day = ${day}
      GROUP BY source, name
    `
  return rows.map((r) => ({
    app: r.app,
    key: r.key,
    count: Number(r.count),
    visitors: Number(r.visitors),
  }))
}

export function analyticsQueries(sql: SQL) {
  return {
    /**
     * `day`'s salt (`YYYY-MM-DD`), creating it on first use. Concurrency-safe on both engines
     * without a transaction: the insert is idempotent (`ON CONFLICT … DO NOTHING` on the `day`
     * primary key), so whichever of several concurrent callers' inserts wins, every caller's
     * follow-up `SELECT` reads that one committed row.
     */
    async saltFor(day: string): Promise<string> {
      await sql`
        INSERT INTO analytics_daily_salts (day, salt)
        VALUES (${day}, ${randomSalt()})
        ON CONFLICT (day) DO NOTHING
      `
      const [row]: { salt: string }[] = await sql`
        SELECT salt FROM analytics_daily_salts WHERE day = ${day}
      `
      if (!row) throw new Error("analytics_daily_salts: insert-then-select produced no row")
      return row.salt
    },

    async insertPageview(row: PageviewInsert): Promise<void> {
      await sql`
        INSERT INTO analytics_pageviews
          (app, path, referrer_host, visitor_id, user_id, workspace_id, day, created_at)
        VALUES
          (${row.app}, ${row.path}, ${row.referrerHost}, ${row.visitorId}, ${row.userId},
           ${row.workspaceId}, ${row.day}, ${row.createdAt})
      `
    },

    async insertEvent(row: EventInsert): Promise<void> {
      await sql`
        INSERT INTO analytics_events
          (name, source, user_id, workspace_id, props, visitor_id, day, created_at)
        VALUES
          (${row.name}, ${row.source}, ${row.userId}, ${row.workspaceId},
           ${JSON.stringify(row.props)}, ${row.visitorId}, ${row.day}, ${row.createdAt})
      `
    },

    /** Every column, for one day — what the rollup (Task 2) and tests both need to read back. */
    async pageviewsForDay(day: string): Promise<PageviewRow[]> {
      return sql`SELECT * FROM analytics_pageviews WHERE day = ${day} ORDER BY id`
    },

    /** Every column, for one day — see `pageviewsForDay`. */
    async eventsForDay(day: string): Promise<EventRow[]> {
      return sql`SELECT * FROM analytics_events WHERE day = ${day} ORDER BY id`
    },

    /**
     * Rebuilds `day`'s `analytics_daily` rows from the raw tables: read-then-delete-then-insert in
     * one transaction, so a redelivery or a manual re-run always lands on the same rows (as long as
     * the raw rows for that day have not changed since) — idempotent, because the delete and the
     * insert both cover the whole day every time. "Visitors" is the distinct count of whoever is
     * identifiable on each row — `visitor_id` for a pageview, `visitor_id` else `user_id` for an
     * event (product events never carry a `visitor_id`) — rows with neither are simply not
     * counted as a visitor. Every row of one `kind` goes in with one multi-row `INSERT` (Bun's
     * `sql(rows, ...columns)` helper), not one round trip per row — on SQLite this keeps the
     * transaction (which holds every other statement back, see `createDb`) brief. The three
     * aggregations (`pageviewAgg`, `pageviewAppAgg`, `eventAgg`) are shared with the admin
     * dashboard's live reads, for today and for any past day whose rollup never ran. A day with no
     * raw rows left (past `ANALYTICS_RETENTION_DAYS`) is skipped, never wiped: `{ rebuilt: false }`.
     */
    async rollup(day: string): Promise<{ rebuilt: boolean }> {
      return sql.begin(async (tx) => {
        const pageRows = [...(await pageviewAgg(tx, day)), ...(await pageviewAppAgg(tx, day))]
        const eventRows = await eventAgg(tx, day)
        // No raw rows at all: the day is past retention (`analytics.prune` took them) or never
        // had traffic. Rewriting would replace the rows an earlier rollup kept — the only record
        // left of that day — with nothing, so leave whatever `analytics_daily` holds alone.
        if (pageRows.length === 0 && eventRows.length === 0) return { rebuilt: false }
        await tx`DELETE FROM analytics_daily WHERE day = ${day}`
        if (pageRows.length > 0) {
          const rows = pageRows.map((r) => ({ day, kind: "page", ...r }))
          await tx`
            INSERT INTO analytics_daily ${tx(rows, "day", "kind", "app", "key", "count", "visitors")}
          `
        }
        if (eventRows.length > 0) {
          const rows = eventRows.map((r) => ({ day, kind: "event", ...r }))
          await tx`
            INSERT INTO analytics_daily ${tx(rows, "day", "kind", "app", "key", "count", "visitors")}
          `
        }
        return { rebuilt: true }
      })
    },

    /** Today's live pageview rollup, by page (raw rows, not yet in `analytics_daily`) — see
     * `pageviewAgg`. Also used for a past day whose rollup never ran. */
    pageviewAggForDay: (day: string): Promise<DailyAgg[]> => pageviewAgg(sql, day),

    /** Today's live pageview rollup, by app (key "*", raw rows) — see `pageviewAppAgg`. Also
     * used for a past day whose rollup never ran. */
    pageviewAppAggForDay: (day: string): Promise<DailyAgg[]> => pageviewAppAgg(sql, day),

    /** Today's live event rollup (raw rows, not yet in `analytics_daily`) — see `eventAgg`. Also
     * used for a past day whose rollup never ran. */
    eventAggForDay: (day: string): Promise<DailyAgg[]> => eventAgg(sql, day),

    /**
     * Per-day pageview and visitor totals, from `analytics_daily`'s per-app "*" rows (never the
     * per-page ones — summing those would double-count a visitor across their own app's pages),
     * summed across every app, `start` through the day before `end` (so a caller passing today as
     * `end` reads only past, already-rolled-up days). The admin dashboard's days chart for days
     * before today; a day with no "*" rows at all (its rollup never ran) is this query's silent
     * zero — the caller falls back to `pageviewAppAggForDay` for it.
     */
    async dailyPageTotals(
      start: string,
      end: string
    ): Promise<{ day: string; pageviews: number; visitors: number }[]> {
      const rows: { day: string; pageviews: number | string; visitors: number | string }[] =
        await sql`
          SELECT day, SUM(count) AS pageviews, SUM(visitors) AS visitors
          FROM analytics_daily
          WHERE kind = 'page' AND key = '*' AND day >= ${start} AND day < ${end}
          GROUP BY day
        `
      return rows.map((r) => ({
        day: r.day,
        pageviews: Number(r.pageviews),
        visitors: Number(r.visitors),
      }))
    },

    /**
     * Per (app, path) pageview totals from `analytics_daily`'s per-page rows (the "*" app-total
     * rows excluded — `dailyPageTotals` is their reader), `start` through the day before `end`.
     * The admin dashboard merges this with today's live `pageviewAggForDay` for its top pages, so
     * this alone only covers days before today whose rollup already ran.
     */
    async pageTotalsByKey(
      start: string,
      end: string
    ): Promise<{ app: string; path: string; pageviews: number }[]> {
      const rows: { app: string; path: string; pageviews: number | string }[] = await sql`
        SELECT app, key AS path, SUM(count) AS pageviews
        FROM analytics_daily
        WHERE kind = 'page' AND key != '*' AND day >= ${start} AND day < ${end}
        GROUP BY app, key
      `
      return rows.map((r) => ({ app: r.app, path: r.path, pageviews: Number(r.pageviews) }))
    },

    /**
     * Per (day, event name) counts from `analytics_daily`, summed across every source (a client
     * event tracked from two apps on the same day is one row here, one count), `start` through
     * the day before `end`. The admin dashboard merges this with today's live, source-merged
     * `eventAggForDay` for its events table, so this alone only covers days before today whose
     * rollup already ran.
     */
    async eventTotalsByDay(
      start: string,
      end: string
    ): Promise<{ day: string; name: string; count: number }[]> {
      const rows: { day: string; name: string; count: number | string }[] = await sql`
        SELECT day, key AS name, SUM(count) AS count
        FROM analytics_daily
        WHERE kind = 'event' AND day >= ${start} AND day < ${end}
        GROUP BY day, key
        ORDER BY day, key
      `
      return rows.map((r) => ({ day: r.day, name: r.name, count: Number(r.count) }))
    },

    /**
     * Every day in `start`..`end` (`end` exclusive) with at least one `analytics_daily` row of
     * either kind — i.e. a day the nightly rollup has already rebuilt. A past day missing from
     * this set (yesterday before the 00:10 UTC rollup runs, or a dead rollup job) has no rows to
     * read for `dailyPageTotals`, `pageTotalsByKey` or `eventTotalsByDay`: the admin dashboard
     * falls back to the same live aggregation it uses for today, for that day specifically.
     */
    async rolledUpDays(start: string, end: string): Promise<Set<string>> {
      const rows: { day: string }[] = await sql`
        SELECT DISTINCT day FROM analytics_daily WHERE day >= ${start} AND day < ${end}
      `
      return new Set(rows.map((r) => r.day))
    },

    /**
     * Top referrer hosts by pageviews, `start` through `end` inclusive — from the raw rows, since
     * `analytics_daily` keeps no breakdown by referrer. Covers today too (raw rows always do), so
     * the admin dashboard needs no separate "today" merge for this one, unlike pages and events.
     */
    async topReferrers(
      start: string,
      end: string,
      limit: number
    ): Promise<{ host: string; pageviews: number }[]> {
      const rows: { host: string; pageviews: number | string }[] = await sql`
        SELECT referrer_host AS host, COUNT(*) AS pageviews
        FROM analytics_pageviews
        WHERE day >= ${start} AND day <= ${end} AND referrer_host IS NOT NULL
        GROUP BY referrer_host
        ORDER BY pageviews DESC
        LIMIT ${limit}
      `
      return rows.map((r) => ({ host: r.host, pageviews: Number(r.pageviews) }))
    },

    /**
     * Distinct `user_id`s with any of `names` in `start`..`end` (inclusive), from the raw events —
     * the admin dashboard's funnel, one call per step, each intersected in memory with the step
     * before it.
     */
    async userIdsForEvents(names: string[], start: string, end: string): Promise<Set<number>> {
      const rows: { user_id: number }[] = await sql`
        SELECT DISTINCT user_id FROM analytics_events
        WHERE name IN ${sql(names)} AND user_id IS NOT NULL AND day >= ${start} AND day <= ${end}
      `
      return new Set(rows.map((r) => r.user_id))
    },

    /**
     * Deletes raw `analytics_pageviews` / `analytics_events` rows older than `before` and
     * `analytics_daily_salts` rows older than `saltsBefore` (never `analytics_daily`, the rollup's
     * own output, kept indefinitely). Returns how many of each were removed, for the job's log
     * line and for tests.
     */
    async prune(
      before: string,
      saltsBefore: string
    ): Promise<{ pageviews: number; events: number; salts: number }> {
      const pageviews: { id: number }[] = await sql`
        DELETE FROM analytics_pageviews WHERE day < ${before} RETURNING id
      `
      const events: { id: number }[] = await sql`
        DELETE FROM analytics_events WHERE day < ${before} RETURNING id
      `
      const salts: { day: string }[] = await sql`
        DELETE FROM analytics_daily_salts WHERE day < ${saltsBefore} RETURNING day
      `
      return { pageviews: pageviews.length, events: events.length, salts: salts.length }
    },
  }
}
