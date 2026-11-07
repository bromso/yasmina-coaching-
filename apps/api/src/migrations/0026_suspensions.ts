import type { Migration } from "../migrate"

// Suspending an account (Phase 10 B): four nullable columns on `users`, ISO UTC strings like every
// other timestamp. `suspended_at` null means not suspended; `suspended_until` null means an
// indefinite suspension; `suspension_reason` is for admins only, never shown to the suspended user
// or exported; `suspended_by` names the admin and carries no foreign key — it is set to NULL, not
// cascaded, when that admin's own account is purged (`users.purge`), the same pattern
// `audit_log.actor_user_id` uses.
const suspensions: Migration = {
  name: "0026_suspensions",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN suspended_at TEXT")
    await sql.unsafe("ALTER TABLE users ADD COLUMN suspended_until TEXT")
    await sql.unsafe("ALTER TABLE users ADD COLUMN suspension_reason TEXT")
    await sql.unsafe("ALTER TABLE users ADD COLUMN suspended_by INTEGER")
  },
}

export default suspensions
