import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"
import { uniqueSlug } from "../slug"

type Sql = Parameters<Migration["up"]>[0]

const slugExists = (sql: Sql) => async (slug: string) => {
  const rows: { id: number }[] = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`
  return rows.length > 0
}

// Notes move under a workspace. Every user who owns notes gets a workspace of their own so nothing
// they wrote disappears; notes with no owner (from before accounts) cannot be placed and go.
const notesWorkspace: Migration = {
  name: "0009_notes_workspace",
  async up(sql, dialect: Dialect) {
    await sql.unsafe("ALTER TABLE notes ADD COLUMN workspace_id INTEGER")
    await sql.unsafe("DELETE FROM notes WHERE user_id IS NULL")
    const owners: { id: number; name: string; email: string }[] = await sql.unsafe(
      "SELECT DISTINCT u.id, u.name, u.email FROM notes n JOIN users u ON u.id = n.user_id ORDER BY u.id"
    )
    const now = new Date().toISOString()
    for (const owner of owners) {
      // The name, or the address's local part — never the full address. No control characters:
      // the name reaches mail subjects, and the create/rename inputs refuse them too.
      const label = (owner.name || owner.email.split("@")[0] || "").replace(/\p{Cc}/gu, "") || "My"
      const name = `${label}'s workspace`.slice(0, 100)
      const slug = await uniqueSlug(name, slugExists(sql))
      const [workspace]: { id: number }[] = await sql`
        INSERT INTO workspaces (name, slug, created_by, created_at)
        VALUES (${name}, ${slug}, ${owner.id}, ${now}) RETURNING id
      `
      if (!workspace) throw new Error("INSERT … RETURNING produced no row")
      await sql`
        INSERT INTO memberships (workspace_id, user_id, role, created_at)
        VALUES (${workspace.id}, ${owner.id}, 'owner', ${now})
      `
      await sql`UPDATE notes SET workspace_id = ${workspace.id} WHERE user_id = ${owner.id}`
    }
    // A note whose user_id points at no user cannot be placed either.
    await sql.unsafe("DELETE FROM notes WHERE workspace_id IS NULL")
    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE notes ALTER COLUMN workspace_id SET NOT NULL")
      await sql.unsafe(
        "ALTER TABLE notes ADD CONSTRAINT notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE"
      )
      // Notes no longer list per user; SQLite's rebuild drops this index along with the old table.
      await sql.unsafe("DROP INDEX notes_user_id")
    } else {
      // SQLite cannot add NOT NULL to an existing column: rebuild, keeping ids and the id counter.
      await sql.unsafe(`
        CREATE TABLE notes_new (
          id ${ddl.serialId(dialect)},
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          user_id INTEGER,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `)
      await sql.unsafe(`
        INSERT INTO notes_new (id, title, body, created_at, user_id, workspace_id)
        SELECT id, title, body, created_at, user_id, workspace_id FROM notes
      `)
      // AUTOINCREMENT never reuses an id: carry the old counter over (see 0005's keepSequence).
      await sql.unsafe(`
        DELETE FROM sqlite_sequence
        WHERE name = 'notes_new' AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'notes')
      `)
      await sql.unsafe(
        "INSERT INTO sqlite_sequence (name, seq) SELECT 'notes_new', seq FROM sqlite_sequence WHERE name = 'notes'"
      )
      await sql.unsafe("DROP TABLE notes")
      await sql.unsafe("ALTER TABLE notes_new RENAME TO notes")
    }
    await sql.unsafe("CREATE INDEX notes_workspace_id ON notes (workspace_id, id)")
  },
}

export default notesWorkspace
