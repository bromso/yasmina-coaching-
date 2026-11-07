import { ddl } from "../dialect"
import type { Migration } from "../migrate"

const auth: Migration = {
  name: "0002_auth",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE users (
        id ${ddl.serialId(dialect)},
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE sessions (
        id ${ddl.serialId(dialect)},
        token_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX sessions_user_id ON sessions (user_id)")
    await sql.unsafe(`
      CREATE TABLE password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      )
    `)
  },
}

export default auth
