import type { Migration } from "../migrate"

// `lastSucceededAt(name)` — read on every metrics scrape for backup_last_success_timestamp_seconds —
// filters on name and status and takes the latest finished_at; the only other index is
// (status, run_at), so without this it scans every succeeded job (one per product event, kept 7
// days).
const jobsNameIndex: Migration = {
  name: "0023_jobs_name_index",
  async up(sql) {
    await sql.unsafe(
      "CREATE INDEX jobs_name_status_finished_at ON jobs (name, status, finished_at)"
    )
  },
}

export default jobsNameIndex
