import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// Waitlist sign-ups from the marketing sites. The email is stored normalised and is unique, so a
// repeat join is a no-op the api can tell apart (and not mail twice).
const waitlist: Migration = {
  name: "0007_waitlist",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE waitlist (
        id ${ddl.serialId(dialect)},
        email TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'www',
        created_at TEXT NOT NULL
      )
    `)
  },
}

export default waitlist
