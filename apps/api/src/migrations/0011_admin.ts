import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Impersonation lives on the session row (who issued it, why); the api enforces the limits from
// there. audit_log is append-only: no query ever updates or deletes a row.
const admin: Migration = {
  name: "0011_admin",
  async up(sql, dialect) {
    await sql.unsafe(
      "ALTER TABLE sessions ADD COLUMN impersonated_by INTEGER REFERENCES users(id) ON DELETE CASCADE"
    )
    await sql.unsafe("ALTER TABLE sessions ADD COLUMN reason TEXT")
    await sql.unsafe("CREATE INDEX sessions_impersonated_by ON sessions (impersonated_by)")
    await sql.unsafe(`
      CREATE TABLE audit_log (
        id ${ddl.serialId(dialect)},
        at TEXT NOT NULL,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        impersonated_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        reason TEXT,
        ip TEXT,
        user_agent TEXT,
        metadata TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX audit_log_at ON audit_log (at)")
    await sql.unsafe("CREATE INDEX audit_log_actor ON audit_log (actor_user_id, at)")
    await sql.unsafe("CREATE INDEX audit_log_impersonated ON audit_log (impersonated_user_id, at)")
    await sql.unsafe("CREATE INDEX audit_log_target ON audit_log (target_type, target_id, at)")
  },
}

export default admin
