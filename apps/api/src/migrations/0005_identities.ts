import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// Accounts can now exist without a password (social / magic-link sign-in), one-time tokens gain
// the `magic_link` purpose and may carry an email before a user exists, and `identities` maps a
// provider's user id to ours. SQLite cannot alter constraints, so its tables are rebuilt.
const identities: Migration = {
  name: "0005_identities",
  async up(sql, dialect: Dialect) {
    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL")
      await sql.unsafe("ALTER TABLE tokens DROP CONSTRAINT tokens_purpose_check")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_purpose_check CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link'))"
      )
      await sql.unsafe("ALTER TABLE tokens ALTER COLUMN user_id DROP NOT NULL")
      await sql.unsafe("ALTER TABLE tokens ADD COLUMN email TEXT")
    } else {
      await sql.unsafe(`
        CREATE TABLE users_new (
          id ${ddl.serialId(dialect)},
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          name TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          email_verified_at TEXT
        )
      `)
      // Ids are copied as they are: sessions, tokens and notes point at them.
      await sql.unsafe(`
        INSERT INTO users_new (id, email, password_hash, name, created_at, updated_at, email_verified_at)
        SELECT id, email, password_hash, name, created_at, updated_at, email_verified_at FROM users
      `)
      await keepSequence(sql, "users")
      await sql.unsafe("DROP TABLE users")
      await sql.unsafe("ALTER TABLE users_new RENAME TO users")
      await sql.unsafe(`
        CREATE TABLE tokens_new (
          id ${ddl.serialId(dialect)},
          user_id INTEGER,
          purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link')),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          email TEXT
        )
      `)
      await sql.unsafe(`
        INSERT INTO tokens_new (id, user_id, purpose, token_hash, expires_at, consumed_at, created_at)
        SELECT id, user_id, purpose, token_hash, expires_at, consumed_at, created_at FROM tokens
      `)
      await keepSequence(sql, "tokens")
      await sql.unsafe("DROP TABLE tokens")
      await sql.unsafe("ALTER TABLE tokens_new RENAME TO tokens")
      await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    }
    await sql.unsafe(`
      CREATE TABLE identities (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'apple')),
        provider_user_id TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        UNIQUE (provider, provider_user_id)
      )
    `)
    await sql.unsafe("CREATE INDEX identities_user_id ON identities (user_id)")
  },
}

/**
 * AUTOINCREMENT never reuses an id, even a deleted one's; carry the old table's counter over to
 * the rebuilt one so a dropped user's (or token's) id is not handed out again — also when every row
 * was deleted and the copy left the new table without a counter. `sqlite_sequence` has no unique
 * key on `name`, so the new table's row is replaced by delete + insert, not INSERT OR REPLACE.
 * The old counter is always at least the highest copied id.
 */
async function keepSequence(sql: Parameters<Migration["up"]>[0], table: "users" | "tokens") {
  await sql.unsafe(`
    DELETE FROM sqlite_sequence
    WHERE name = '${table}_new' AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = '${table}')
  `)
  await sql.unsafe(`
    INSERT INTO sqlite_sequence (name, seq)
    SELECT '${table}_new', seq FROM sqlite_sequence WHERE name = '${table}'
  `)
}

export default identities
