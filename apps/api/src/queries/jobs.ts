import type { SQL } from "bun"
import { dialectOf } from "../dialect"

export type JobStatus = "queued" | "running" | "succeeded" | "dead"

export type JobRow = {
  id: number
  name: string
  payload: string
  status: JobStatus
  attempts: number
  max_attempts: number
  run_at: string
  locked_until: string | null
  last_error: string | null
  dedupe_key: string | null
  created_at: string
  finished_at: string | null
  /** The request id that enqueued this job, or null (a schedule's own tick, or outside a request). */
  request_id: string | null
}

const MAX_ERROR_LENGTH = 2000
const truncateError = (message: string) => message.slice(0, MAX_ERROR_LENGTH)
const MAX_INSERT_ATTEMPTS = 2

// SQLite: "UNIQUE constraint failed: jobs.dedupe_key". Postgres: duplicate key … constraint
// "jobs_live_dedupe_key" (the partial unique index doubles as the constraint name). Raised only by
// an UPDATE that would move a row back onto a dedupe key a newer queued/running row still holds —
// `insert` above never raises it, by design. `admin.jobs.retry` is the one caller that needs to
// tell this apart from any other failure.
export const isDedupeConflict = (error: unknown): boolean =>
  error instanceof Error &&
  /UNIQUE constraint failed: jobs\.dedupe_key|jobs_live_dedupe_key/.test(error.message)

export function jobsQueries(sql: SQL) {
  // The only piece of DDL-adjacent SQL that differs between the two engines here: Postgres can
  // skip rows another connection's claim is mid-way through; SQLite has no row locks (one writer
  // at a time per file, and the claim is a single statement).
  const forUpdateSkipLocked = dialectOf(sql) === "postgres" ? " FOR UPDATE SKIP LOCKED" : ""

  return {
    /**
     * Inserts a queued job. A live dedupe key (queued or running) returns that row's id instead —
     * via `ON CONFLICT … DO NOTHING` (both engines accept a conflict target scoped to the partial
     * index's own WHERE clause), never by catching the unique-violation error: inside a caller's
     * `tx`, Postgres aborts the whole transaction on an unhandled constraint error (SQLSTATE
     * 25P02 on anything after), so catching it here would still break the caller once the insert
     * runs inside `db.transaction`. If the conflicting row finishes between our insert and the
     * follow-up SELECT (so it no longer holds the key), retry the insert once instead of raising.
     */
    async insert(row: {
      name: string
      payload: string
      maxAttempts: number
      runAt: string
      dedupeKey?: string
      /** With `dedupeKey`: any row holding the key (finished too) makes this a no-op. */
      dedupeAnyStatus?: boolean
      createdAt: string
      /** The request id that enqueued this job; omitted or null when there is none. */
      requestId?: string | null
    }): Promise<number> {
      const anyStatus = row.dedupeAnyStatus === true && row.dedupeKey !== undefined
      const requestId = row.requestId ?? null
      for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
        // `NOT EXISTS` sees committed rows of any status (a schedule's run that already finished);
        // `ON CONFLICT` still covers two inserts racing before either commits. The casts keep
        // Postgres from typing the bare SELECT parameters as text.
        const [inserted]: { id: number }[] = anyStatus
          ? await sql`
              INSERT INTO jobs (name, payload, status, max_attempts, run_at, dedupe_key, created_at, request_id)
              SELECT CAST(${row.name} AS TEXT), CAST(${row.payload} AS TEXT), 'queued',
                CAST(${row.maxAttempts} AS INTEGER), CAST(${row.runAt} AS TEXT),
                CAST(${row.dedupeKey} AS TEXT), CAST(${row.createdAt} AS TEXT), CAST(${requestId} AS TEXT)
              WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE dedupe_key = ${row.dedupeKey})
              ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO NOTHING
              RETURNING id
            `
          : await sql`
              INSERT INTO jobs (name, payload, status, max_attempts, run_at, dedupe_key, created_at, request_id)
              VALUES (${row.name}, ${row.payload}, 'queued', ${row.maxAttempts}, ${row.runAt}, ${row.dedupeKey ?? null}, ${row.createdAt}, ${requestId})
              ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') DO NOTHING
              RETURNING id
            `
        if (inserted) return inserted.id
        if (!row.dedupeKey) throw new Error("INSERT … RETURNING produced no row")
        const [existing]: { id: number }[] = anyStatus
          ? await sql`
              SELECT id FROM jobs WHERE dedupe_key = ${row.dedupeKey} ORDER BY id DESC LIMIT 1
            `
          : await sql`
              SELECT id FROM jobs WHERE dedupe_key = ${row.dedupeKey} AND status IN ('queued', 'running')
            `
        if (existing) return existing.id
        // The row that held the key finished (or, with `dedupeAnyStatus`, was deleted) between our
        // insert and this select: the next attempt's insert succeeds instead of conflicting again.
      }
      throw new Error(`insert: dedupe key "${row.dedupeKey}" churned through every retry`)
    },

    /**
     * Claims up to `limit` due rows (queued and due, or running past `locked_until`), oldest
     * `run_at` first: sets `running`, `attempts + 1` and one shared `lockedUntil` for the whole
     * batch (the worker enforces each job's own timeout — see jobs/define.ts `JobDefinition.timeoutMs`).
     * `filter` narrows the claim to one job name (`only`) or to every name but some (`except`) —
     * the worker's per-name concurrency caps. Still one statement either way, so the SQLite claim
     * stays atomic and Postgres keeps `FOR UPDATE SKIP LOCKED`.
     */
    async claim(
      now: string,
      limit: number,
      lockedUntil: string,
      filter: { only?: string; except?: readonly string[] } = {}
    ): Promise<JobRow[]> {
      // Placeholders are numbered in the order they appear in the text: bun:sqlite binds `$n`
      // by first appearance, not by `n`, so the LIMIT's must come after the names'.
      const params: (string | number)[] = [lockedUntil, now]
      const next = (value: string | number) => {
        params.push(value)
        return `$${params.length}`
      }
      let byName = ""
      if (filter.only !== undefined) byName = ` AND name = ${next(filter.only)}`
      else if (filter.except && filter.except.length > 0) {
        byName = ` AND name NOT IN (${filter.except.map(next).join(", ")})`
      }
      const rows: JobRow[] = await sql.unsafe(
        `UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = $1
         WHERE id IN (
           SELECT id FROM jobs
           WHERE ((status = 'queued' AND run_at <= $2) OR (status = 'running' AND locked_until < $2))${byName}
           ORDER BY run_at
           LIMIT ${next(limit)}${forUpdateSkipLocked}
         )
         RETURNING *`,
        params
      )
      return rows
    },

    /**
     * Pushes a just-claimed batch's lock out for the rows whose job runs longer than the batch's
     * shared lock (`backup.run`). Same stale-attempt guard as `succeed`, per row.
     */
    async extendLock(rows: { id: number; attempts: number }[], lockedUntil: string): Promise<void> {
      for (const row of rows) {
        await sql`
          UPDATE jobs SET locked_until = ${lockedUntil}
          WHERE id = ${row.id} AND attempts = ${row.attempts} AND status = 'running'
        `
      }
    },

    /**
     * Matches on `id AND attempts AND status = 'running'`, so a late result from a run the worker
     * already timed out (and reclaimed, bumping `attempts` again) cannot overwrite a newer attempt.
     */
    async succeed(id: number, attempts: number, at: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE jobs SET status = 'succeeded', payload = '{}', finished_at = ${at}
        WHERE id = ${id} AND attempts = ${attempts} AND status = 'running'
        RETURNING id
      `
      return rows.length > 0
    },

    /** Same stale-attempt guard as `succeed`. */
    async retry(id: number, attempts: number, runAt: string, error: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE jobs SET status = 'queued', run_at = ${runAt}, locked_until = NULL,
          last_error = ${truncateError(error)}
        WHERE id = ${id} AND attempts = ${attempts} AND status = 'running'
        RETURNING id
      `
      return rows.length > 0
    },

    /** Same stale-attempt guard as `succeed`. */
    async kill(id: number, attempts: number, at: string, error: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE jobs SET status = 'dead', finished_at = ${at}, last_error = ${truncateError(error)}
        WHERE id = ${id} AND attempts = ${attempts} AND status = 'running'
        RETURNING id
      `
      return rows.length > 0
    },

    /** When a job of `name` last succeeded, or null if none has. Read fresh on every metrics scrape. */
    async lastSucceededAt(name: string): Promise<Date | null> {
      const [row]: { finished_at: string | null }[] = await sql`
        SELECT finished_at FROM jobs WHERE name = ${name} AND status = 'succeeded'
        ORDER BY finished_at DESC LIMIT 1
      `
      return row?.finished_at ? new Date(row.finished_at) : null
    },

    async counts(): Promise<Record<JobStatus, number>> {
      const rows: { status: JobStatus; n: number | string }[] = await sql`
        SELECT status, COUNT(*) AS n FROM jobs GROUP BY status
      `
      const out: Record<JobStatus, number> = { queued: 0, running: 0, succeeded: 0, dead: 0 }
      for (const row of rows) out[row.status] = Number(row.n)
      return out
    },

    async listDead(limit: number): Promise<Omit<JobRow, "payload">[]> {
      return sql`
        SELECT id, name, status, attempts, max_attempts, run_at, locked_until, last_error,
          dedupe_key, created_at, finished_at
        FROM jobs WHERE status = 'dead' ORDER BY finished_at DESC, id DESC LIMIT ${limit}
      `
    },

    /** dead → queued, attempts reset to 0, a fresh `run_at`; false if the row was not dead. */
    async resurrect(id: number, now: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE jobs SET status = 'queued', attempts = 0, run_at = ${now}, locked_until = NULL,
          finished_at = NULL
        WHERE id = ${id} AND status = 'dead'
        RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes a dead row; false if it was not dead (or did not exist). */
    async discard(id: number): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        DELETE FROM jobs WHERE id = ${id} AND status = 'dead' RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes old `succeeded` / `dead` rows only; returns how many. */
    async prune(succeededBefore: string, deadBefore: string): Promise<number> {
      const rows: { id: number }[] = await sql`
        DELETE FROM jobs
        WHERE (status = 'succeeded' AND finished_at < ${succeededBefore})
           OR (status = 'dead' AND finished_at < ${deadBefore})
        RETURNING id
      `
      return rows.length
    },
  }
}
