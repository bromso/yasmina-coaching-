import type { Migration } from "../migrate"

// Notes written before accounts existed keep their rows but no longer list for anyone.
const notesOwner: Migration = {
  name: "0003_notes_owner",
  async up(sql) {
    await sql.unsafe("ALTER TABLE notes ADD COLUMN user_id INTEGER")
    await sql.unsafe("CREATE INDEX notes_user_id ON notes (user_id, id)")
  },
}

export default notesOwner
