import type { Migration } from "../migrate"

// One image per owner: a nullable storage key on each row is enough (no files table).
const files: Migration = {
  name: "0014_files",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN avatar_key TEXT")
    await sql.unsafe("ALTER TABLE workspaces ADD COLUMN logo_key TEXT")
    // files.get runs hasAvatarKey/hasLogoKey on every image request.
    await sql.unsafe("CREATE INDEX users_avatar_key ON users (avatar_key)")
    await sql.unsafe("CREATE INDEX workspaces_logo_key ON workspaces (logo_key)")
  },
}

export default files
