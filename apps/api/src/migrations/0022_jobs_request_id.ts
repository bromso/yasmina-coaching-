import type { Migration } from "../migrate"

// The request id of whatever enqueued the job (null for a schedule's own tick, or an enqueue made
// outside a request context) — so a job's logs can be tied back to the request that queued it.
const jobsRequestId: Migration = {
  name: "0022_jobs_request_id",
  async up(sql) {
    await sql.unsafe("ALTER TABLE jobs ADD COLUMN request_id TEXT")
  },
}

export default jobsRequestId
