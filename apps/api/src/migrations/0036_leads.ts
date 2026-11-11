import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Contact requests from the coaching site's `/kontakt` form (see docs/architecture/leads.md).
// Address-keyed and anonymous like `job_applications` (no `user_id`): `privacy.export` lists the
// rows whose email is the account's verified address, `users.purge` leaves them, and
// `leads.prune` deletes each row once `delete_after` passes (twelve months). `consent_at` is when
// the visitor ticked "contact me about this request" (required); `newsletter` is the separate,
// optional box — stored only, since nothing sends a newsletter. `notes` and the status are
// Yasmina's own (`admin.leads.update`); `status_changed_by` is the admin, no foreign key, like
// support's.
const leads: Migration = {
  name: "0036_leads",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE leads (
        id ${ddl.serialId(dialect)},
        audience TEXT NOT NULL CHECK (audience IN ('private', 'organisation')),
        need TEXT NOT NULL,
        timeline TEXT NOT NULL,
        message TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        organisation TEXT,
        role TEXT,
        contact_method TEXT NOT NULL CHECK (contact_method IN ('email', 'phone')),
        consent_at TEXT NOT NULL,
        newsletter INTEGER NOT NULL DEFAULT 0 CHECK (newsletter IN (0, 1)),
        locale TEXT,
        page TEXT,
        ip_hash TEXT,
        status TEXT NOT NULL DEFAULT 'new'
          CHECK (status IN ('new', 'contacted', 'call_booked', 'won', 'lost')),
        notes TEXT,
        created_at TEXT NOT NULL,
        status_changed_at TEXT,
        status_changed_by INTEGER,
        delete_after TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX leads_status ON leads (status, id)")
    // `leads.forEmail` compares `lower(email)`, so the index is on that expression on both engines.
    await sql.unsafe("CREATE INDEX leads_email ON leads (lower(email))")
    await sql.unsafe("CREATE INDEX leads_delete_after ON leads (delete_after)")
  },
}

export default leads
