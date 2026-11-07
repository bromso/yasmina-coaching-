import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// The job queue (src/jobs/). One table on both engines; the partial unique index lets a dedupe key
// hold only while its job is queued or running, so a finished job's key can be used again.
const jobs: Migration = {
  name: "0015_jobs",
  async up(sql, dialect: Dialect) {
    await sql.unsafe(`
      CREATE TABLE jobs (
        id ${ddl.serialId(dialect)},
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'dead')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        run_at TEXT NOT NULL,
        locked_until TEXT,
        last_error TEXT,
        dedupe_key TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX jobs_status_run_at ON jobs (status, run_at)")
    await sql.unsafe(
      "CREATE UNIQUE INDEX jobs_live_dedupe_key ON jobs (dedupe_key) WHERE status IN ('queued', 'running')"
    )
  },
}

export default jobs
