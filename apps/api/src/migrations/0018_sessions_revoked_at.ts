import type { Migration } from "../migrate"

// When the user's sessions were last ended (a reset, a password change, "sign out everywhere
// else", an admin revoke or two-step reset). A two-factor challenge created before it can never
// become a session. Null = never.
const sessionsRevokedAt: Migration = {
  name: "0018_sessions_revoked_at",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN sessions_revoked_at TEXT")
  },
}

export default sessionsRevokedAt
