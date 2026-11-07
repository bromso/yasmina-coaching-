import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Passkeys: one row per credential. `credential_id` and `public_key` are stored base64url (never
// raw key material in any other form); `transports` is the authenticator's own hint, JSON text,
// used for `excludeCredentials` on registration and the UI's default name. No foreign key on
// `user_id` — `users.purge` deletes the rows explicitly, like every other user-owned table here.
// `counter` is BIGINT: the WebAuthn sign count is a uint32, which overflows Postgres's int4 past
// 2^31 (SQLite's INTEGER is 64-bit either way); queries/passkeys.ts reads it back with Number().
//
// `tokens.purpose` gains `passkey_challenge` — the same CHECK-constraint dance 0013 used for
// `two_factor_challenge` — plus a new `ceremony` column (`register` | `authenticate`, nullable:
// every other purpose leaves it null) so a registration challenge (bound to `user_id`) can never
// be redeemed by the sign-in path, or vice versa, even though both share one purpose value.
const passkeys: Migration = {
  name: "0024_passkeys",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE passkeys (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL,
        counter BIGINT NOT NULL,
        transports TEXT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX passkeys_user_id ON passkeys (user_id)")

    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE tokens DROP CONSTRAINT tokens_purpose_check")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_purpose_check CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge', 'passkey_challenge'))"
      )
      await sql.unsafe("ALTER TABLE tokens ADD COLUMN ceremony TEXT")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_ceremony_check CHECK (ceremony IS NULL OR ceremony IN ('register', 'authenticate'))"
      )
    } else {
      await sql.unsafe(`
        CREATE TABLE tokens_new (
          id ${ddl.serialId(dialect)},
          user_id INTEGER,
          purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge', 'passkey_challenge')),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          email TEXT,
          ceremony TEXT CHECK (ceremony IS NULL OR ceremony IN ('register', 'authenticate'))
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
  },
}

/** Same AUTOINCREMENT-preserving dance 0005 and 0013 use for their own tokens rebuilds. */
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

export default passkeys
