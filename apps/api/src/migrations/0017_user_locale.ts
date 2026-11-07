import type { Migration } from "../migrate"

// The user's chosen language (`en`, `sv`, …); null = never chosen, which reads as English.
const userLocale: Migration = {
  name: "0017_user_locale",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN locale TEXT")
  },
}

export default userLocale
