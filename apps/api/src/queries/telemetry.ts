import type { ErrorEvent, TelemetryApp, VitalEvent } from "@repo/api-contract"
import type { SQL } from "bun"

export type ErrorRow = {
  id: number
  fingerprint: string
  day: string
  app: TelemetryApp
  kind: ErrorEvent["kind"]
  message: string
  stack: string | null
  digest: string | null
  route: string | null
  user_agent: string | null
  count: number | string
  first_seen: string
  last_seen: string
}
export type ErrorSummaryRow = {
  fingerprint: string
  app: TelemetryApp
  kind: ErrorEvent["kind"]
  message: string
  route: string | null
  digest: string | null
  count: number | string
  first_seen: string
  last_seen: string
}
export type VitalP75Row = {
  app: TelemetryApp
  name: "LCP" | "INP" | "CLS"
  samples: number
  p75: number | null
}

export function telemetryQueries(sql: SQL) {
  return {
    /**
     * One row per fingerprint and UTC day: a repeat counts up and moves `last_seen`. Returns the
     * row and whether this call created it (the provider forwards only new rows).
     */
    async upsertError(input: {
      fingerprint: string
      app: TelemetryApp
      event: ErrorEvent
      now: string
    }): Promise<{ row: ErrorRow; created: boolean }> {
      const day = input.now.slice(0, 10)
      const e = input.event
      const [row]: ErrorRow[] = await sql`
        INSERT INTO telemetry_errors (fingerprint, day, app, kind, message, stack, digest, route, user_agent, count, first_seen, last_seen)
        VALUES (${input.fingerprint}, ${day}, ${input.app}, ${e.kind}, ${e.message}, ${e.stack ?? null}, ${e.digest ?? null}, ${e.route ?? null}, ${e.userAgent ?? null}, 1, ${input.now}, ${input.now})
        ON CONFLICT (fingerprint, day) DO UPDATE
          SET count = telemetry_errors.count + 1, last_seen = excluded.last_seen
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { row, created: Number(row.count) === 1 }
    },

    async insertVitals(app: TelemetryApp, vitals: VitalEvent[], now: string): Promise<void> {
      // Sequential: this may run on a shared connection and the batch is at most 20 rows.
      for (const v of vitals) {
        await sql`
          INSERT INTO telemetry_vitals (app, route, name, value, rating, navigation_type, at)
          VALUES (${app}, ${v.route}, ${v.name}, ${v.value}, ${v.rating}, ${v.navigationType ?? null}, ${now})
        `
      }
    },

    async errorTotals(since: string): Promise<{ distinct: number; total: number }> {
      const [row]: { distinct_n: number | string; total: number | string | null }[] = await sql`
        SELECT COUNT(DISTINCT fingerprint) AS distinct_n, SUM(count) AS total
        FROM telemetry_errors WHERE last_seen >= ${since}
      `
      return { distinct: Number(row?.distinct_n ?? 0), total: Number(row?.total ?? 0) }
    },

    /**
     * The busiest fingerprints since `since`, each with the message/route/digest first recorded
     * on its latest day (a repeat only counts up; it never rewrites those columns).
     */
    async errorSummary(since: string, limit: number): Promise<ErrorSummaryRow[]> {
      return sql`
        SELECT e.fingerprint, e.app, e.kind, e.message, e.route, e.digest,
          t.count, t.first_seen, t.last_seen
        FROM (
          SELECT fingerprint, SUM(count) AS count, MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen
          FROM telemetry_errors WHERE last_seen >= ${since}
          GROUP BY fingerprint ORDER BY SUM(count) DESC, MAX(last_seen) DESC LIMIT ${limit}
        ) t
        JOIN telemetry_errors e ON e.fingerprint = t.fingerprint AND e.last_seen = t.last_seen
        ORDER BY t.count DESC, t.last_seen DESC
      `
    },

    /**
     * The nearest-rank p75 of LCP/INP/CLS per app since `since`, picked in SQL (SQLite has no
     * percentile function): one grouped count, then per (app, metric) the value at offset
     * ceil(0.75 · n) − 1. Sequential, and at most 9 apps × 3 metrics, each on the
     * (app, name, at) index — never every sample in memory.
     */
    async vitalP75(since: string): Promise<VitalP75Row[]> {
      const counts: { app: TelemetryApp; name: VitalP75Row["name"]; n: number | string }[] =
        await sql`
          SELECT app, name, COUNT(*) AS n FROM telemetry_vitals
          WHERE at >= ${since} AND name IN ('LCP', 'INP', 'CLS')
          GROUP BY app, name ORDER BY app, name
        `
      const rows: VitalP75Row[] = []
      for (const { app, name, n } of counts) {
        const samples = Number(n)
        const offset = Math.ceil(0.75 * samples) - 1
        const [pick]: { value: number | string }[] = await sql`
          SELECT value FROM telemetry_vitals
          WHERE app = ${app} AND name = ${name} AND at >= ${since}
          ORDER BY value LIMIT 1 OFFSET ${offset}
        `
        rows.push({ app, name, samples, p75: pick ? Number(pick.value) : null })
      }
      return rows
    },

    /** The one row `telemetry.forward` needs to re-render its event for the provider. */
    async findById(id: number): Promise<ErrorRow | null> {
      const [row]: ErrorRow[] = await sql`SELECT * FROM telemetry_errors WHERE id = ${id}`
      return row ?? null
    },

    async prune(errorsBefore: string, vitalsBefore: string): Promise<void> {
      await sql`DELETE FROM telemetry_errors WHERE last_seen < ${errorsBefore}`
      await sql`DELETE FROM telemetry_vitals WHERE at < ${vitalsBefore}`
    },
  }
}
