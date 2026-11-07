import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Help-center contact requests. `user_id` links a request sent from a signed-in browser (null
// otherwise, and nulled by `users.purge`); the typed `email` is what support replies to and stays,
// like the waitlist's. `resolved_by` is the admin who resolved it. No foreign keys, like most user
// columns here: `users.purge` nulls them explicitly, so both engines behave alike.
const support: Migration = {
  name: "0020_support",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE support_requests (
        id ${ddl.serialId(dialect)},
        email TEXT NOT NULL,
        name TEXT,
        topic TEXT NOT NULL,
        message TEXT NOT NULL,
        page TEXT,
        user_id INTEGER,
        ip_hash TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by INTEGER
      )
    `)
    await sql.unsafe("CREATE INDEX support_requests_status ON support_requests (status, id)")
    await sql.unsafe("CREATE INDEX support_requests_user_id ON support_requests (user_id)")
  },
}

export default support
