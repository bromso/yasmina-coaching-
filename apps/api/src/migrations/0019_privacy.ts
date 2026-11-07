import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Data & privacy: a scheduled account deletion (null = none; the purge job picks up past dates)
// and the user's data exports. `data_exports.user_id` carries no foreign key, like most user
// columns here: `users.purge` deletes the rows explicitly, so both engines behave alike.
const privacy: Migration = {
  name: "0019_privacy",
  async up(sql, dialect) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN deletion_scheduled_at TEXT")
    await sql.unsafe("CREATE INDEX users_deletion_scheduled_at ON users (deletion_scheduled_at)")
    await sql.unsafe(`
      CREATE TABLE data_exports (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'expired')),
        storage_key TEXT,
        created_at TEXT NOT NULL,
        ready_at TEXT,
        expires_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX data_exports_user_id ON data_exports (user_id, id)")
  },
}

export default privacy
