import type { Migration } from "../migrate"

// Which notifications also arrive by email (Phase 13 B): one row per user and optional type the
// user switched away from its default. No row means the type's default (on), so a new account
// and a new optional type need no backfill. `user_id` carries no foreign key, like every other
// user-owned table here: `users.purge` deletes a user's rows explicitly. `type` has no CHECK, like
// `notifications.type`: the procedures accept only `NOTIFICATION_EMAIL.optional`, so a locked type
// never gets a row. The repo's boolean pattern on both engines: INTEGER 0/1 with a CHECK.
const notificationPreferences: Migration = {
  name: "0033_notification_preferences",
  async up(sql) {
    await sql.unsafe(`
      CREATE TABLE notification_preferences (
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        email_enabled INTEGER NOT NULL CHECK (email_enabled IN (0, 1)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, type)
      )
    `)
  },
}

export default notificationPreferences
