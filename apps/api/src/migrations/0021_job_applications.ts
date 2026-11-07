import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Applications sent from the jobs site's apply form. Address-keyed and anonymous (no `user_id`):
// `privacy.export` lists the rows whose email is the account's (verified) address, and the purge
// leaves them — `applications.prune` deletes each row and its CV once `delete_after` passes (six
// months). `cv_key` is the private PDF (`CV_KEY_PATTERN`), never served by `files.get`.
// `status_changed_by` is the admin who last set the status; no foreign key, like support's.
const jobApplications: Migration = {
  name: "0021_job_applications",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE job_applications (
        id ${ddl.serialId(dialect)},
        job_slug TEXT NOT NULL,
        job_title TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        link TEXT,
        note TEXT,
        cv_key TEXT NOT NULL,
        ip_hash TEXT,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'reviewing', 'rejected', 'hired')),
        created_at TEXT NOT NULL,
        status_changed_at TEXT,
        status_changed_by INTEGER,
        delete_after TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX job_applications_status ON job_applications (status, id)")
    await sql.unsafe("CREATE INDEX job_applications_job_slug ON job_applications (job_slug, id)")
    // `applications.forEmail` compares `lower(email)`, so the index is on that expression, not
    // the plain column, on both engines.
    await sql.unsafe("CREATE INDEX job_applications_email ON job_applications (lower(email))")
    await sql.unsafe(
      "CREATE INDEX job_applications_delete_after ON job_applications (delete_after)"
    )
    await sql.unsafe("CREATE UNIQUE INDEX job_applications_cv_key ON job_applications (cv_key)")
  },
}

export default jobApplications
