import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Email change: three new `tokens` purposes, the same CHECK-constraint dance 0013/0024 used for
// their own new purposes, and one nullable column. No new table — `tokens.email` (added by 0005
// for a magic link's pre-account address) already holds exactly one address per row:
// `email_change` holds the new address (bound to `user_id`, 24 h), `email_change_cancel` holds
// nothing but `user_id` (24 h — the request-time cancel link), and `email_change_revert` holds the
// old address (bound to `user_id`, 7 days). `requested_at` is new and only `email_change_revert`
// sets it: when the change it undoes was requested, the cutoff its rollback uses. `ceremony` stays
// null for all three, like every purpose but passkeys'.
const emailChange: Migration = {
  name: "0025_email_change",
  async up(sql, dialect) {
    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE tokens ADD COLUMN requested_at TEXT")
      await sql.unsafe("ALTER TABLE tokens DROP CONSTRAINT tokens_purpose_check")
      await sql.unsafe(
        "ALTER TABLE tokens ADD CONSTRAINT tokens_purpose_check CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge', 'passkey_challenge', 'email_change', 'email_change_cancel', 'email_change_revert'))"
      )
    } else {
      await sql.unsafe(`
        CREATE TABLE tokens_new (
          id ${ddl.serialId(dialect)},
          user_id INTEGER,
          purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify', 'magic_link', 'two_factor_challenge', 'passkey_challenge', 'email_change', 'email_change_cancel', 'email_change_revert')),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          created_at TEXT NOT NULL,
          email TEXT,
          ceremony TEXT CHECK (ceremony IS NULL OR ceremony IN ('register', 'authenticate')),
          requested_at TEXT
        )
      `)
      await sql.unsafe(`
        INSERT INTO tokens_new (id, user_id, purpose, token_hash, expires_at, consumed_at, created_at, email, ceremony)
        SELECT id, user_id, purpose, token_hash, expires_at, consumed_at, created_at, email, ceremony FROM tokens
      `)
      await keepSequence(sql)
      await sql.unsafe("DROP TABLE tokens")
      await sql.unsafe("ALTER TABLE tokens_new RENAME TO tokens")
      await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    }
  },
}

/** Same AUTOINCREMENT-preserving dance 0005, 0013 and 0024 use for their own tokens rebuilds. */
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

export default emailChange
