import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// The in-app notification centre (Phase 13 A): one row per notification for one user. `user_id`
// and `workspace_id` carry no foreign key, like every other user-owned table here: `users.purge`
// deletes a user's rows explicitly, and a notification about a workspace outlives the workspace
// (`notifications.list` returns its `workspace_id` only while the user is still a member). `data`
// is a JSON object of ids and display names — never an email address, token or secret.
// `type` has no CHECK: a later type is then a code change, not a table rebuild on SQLite —
// `notifyUser` validates every type and its `data` against the contract before it writes.
// `read_at` is null until the user marks it read. The first index serves the list (newest
// first per user), the second the unread count, the third the nightly retention prune.
const notifications: Migration = {
  name: "0032_notifications",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE notifications (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        workspace_id INTEGER,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        read_at TEXT
      )
    `)
    await sql.unsafe(
      "CREATE INDEX notifications_user_created ON notifications (user_id, created_at)"
    )
    await sql.unsafe("CREATE INDEX notifications_user_read ON notifications (user_id, read_at)")
    // notifications.prune's nightly `DELETE … WHERE created_at < ?` across every user.
    await sql.unsafe("CREATE INDEX notifications_created_at ON notifications (created_at)")
  },
}

export default notifications
