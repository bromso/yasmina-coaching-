import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Workspace API keys for /v1 (Phase 11 A). One row per key: `prefix` (8 base62 characters, unique)
// is the lookup key, `secret_hash` the SHA-256 hex of the whole key — the key itself is never
// stored. `scopes` is a JSON array of `API_SCOPES` values. `created_by` names the creating user
// and carries no foreign key, like `audit_log.actor_user_id`: the key belongs to the workspace and
// outlives its creator leaving or being purged. `expires_at` null = no expiry; status (active,
// expired, revoked) is computed at read time. `workspace_id` cascades on Postgres;
// `workspaces.delete` also deletes the rows explicitly, since SQLite may not enforce it.
//
// `notes.api_key_id` names the key a note was created with through /v1 (Task 2), null for a note a
// person wrote. No foreign key: revoking or deleting a key leaves its notes.
const apiKeys: Migration = {
  name: "0027_api_keys",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE api_keys (
        id ${ddl.serialId(dialect)},
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
        prefix TEXT NOT NULL UNIQUE CHECK (length(prefix) = 8),
        secret_hash TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        last_used_at TEXT,
        revoked_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX api_keys_workspace_id ON api_keys (workspace_id)")
    await sql.unsafe("ALTER TABLE notes ADD COLUMN api_key_id INTEGER")
  },
}

export default apiKeys
