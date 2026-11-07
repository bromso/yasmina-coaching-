import { ddl } from "../dialect"
import type { Migration } from "../migrate"

const notes: Migration = {
  name: "0001_notes",
  async up(sql, dialect) {
    // IF NOT EXISTS: adopts the identical table the pre-migration boilerplate created.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS notes (
        id ${ddl.serialId(dialect)},
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )
    `)
  },
}

export default notes
