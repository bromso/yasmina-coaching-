import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// One table for every one-time token; `purpose` keeps resets and verifications apart.
const emailVerification: Migration = {
  name: "0004_email_verification",
  async up(sql, dialect) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN email_verified_at TEXT")
    await sql.unsafe(`
      CREATE TABLE tokens (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    // The old table had no created_at, so migrated rows use expires_at in its place.
    await sql.unsafe(`
      INSERT INTO tokens (user_id, purpose, token_hash, expires_at, consumed_at, created_at)
      SELECT user_id, 'password_reset', token_hash, expires_at, used_at, expires_at
      FROM password_resets
    `)
    await sql.unsafe("DROP TABLE password_resets")
  },
}

export default emailVerification
