import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// Two-factor authentication: an encrypted TOTP secret and the replay-guard step live on `users`
// (plain ADD COLUMN on both engines, nothing else on that table changes shape); recovery codes get
// their own table; `tokens.purpose` gains `two_factor_challenge`, extended the same way 0005 last
// extended that CHECK — Postgres can ALTER the constraint in place, SQLite rebuilds the table.
const twoFactor: Migration = {
  name: "0013_two_factor",
  async up(sql, dialect: Dialect) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN two_factor_secret TEXT")
    await sql.unsafe("ALTER TABLE users ADD COLUMN two_factor_enabled_at TEXT")
    await sql.unsafe("ALTER TABLE users ADD COLUMN two_factor_last_step INTEGER")

    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE tokens DROP CONSTRAINT tokens_purpose_check")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_purpose_check CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge'))"
      )
    } else {
      await sql.unsafe(`
        CREATE TABLE tokens_new (
          id ${ddl.serialId(dialect)},
          user_id INTEGER,
          purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge')),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          email TEXT
        )
      `)
      await sql.unsafe(`
        INSERT INTO tokens_new (id, user_id, purpose, token_hash, expires_at, consumed_at, created_at, email)
        SELECT id, user_id, purpose, token_hash, expires_at, consumed_at, created_at, email FROM tokens
      `)
      await keepSequence(sql)
      await sql.unsafe("DROP TABLE tokens")
      await sql.unsafe("ALTER TABLE tokens_new RENAME TO tokens")
      await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    }

    await sql.unsafe(`
      CREATE TABLE two_factor_recovery_codes (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(
      "CREATE INDEX two_factor_recovery_codes_user_id ON two_factor_recovery_codes (user_id)"
    )
  },
}

/** Same AUTOINCREMENT-preserving dance 0005 uses for its own tokens rebuild. */
async function keepSequence(sql: Parameters<Migration["up"]>[0]) {
  await sql.unsafe(`
    DELETE FROM sqlite_sequence
    WHERE name = 'tokens_new' AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'tokens')
  `)
  await sql.unsafe(`
    INSERT INTO sqlite_sequence (name, seq)
    SELECT 'tokens_new', seq FROM sqlite_sequence WHERE name = 'tokens'
  `)
}

export default twoFactor
