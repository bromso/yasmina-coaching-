import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// Organisations, memberships and invitations. Notes move under a workspace in 0009.
const workspaces: Migration = {
  name: "0008_workspaces",
  async up(sql, dialect: Dialect) {
    await sql.unsafe(`
      CREATE TABLE workspaces (
        id ${ddl.serialId(dialect)},
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE memberships (
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        created_at TEXT NOT NULL,
        UNIQUE (workspace_id, user_id)
      )
    `)
    await sql.unsafe("CREATE INDEX memberships_user_id ON memberships (user_id)")
    await sql.unsafe(`
      CREATE TABLE invitations (
        id ${ddl.serialId(dialect)},
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
        token_hash TEXT NOT NULL UNIQUE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    // One pending invitation per address per workspace (both engines support partial indexes).
    await sql.unsafe(
      "CREATE UNIQUE INDEX invitations_pending ON invitations (workspace_id, email) WHERE accepted_at IS NULL"
    )
    await sql.unsafe("CREATE INDEX invitations_email ON invitations (email)")
  },
}

export default workspaces
