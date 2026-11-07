import type { OptionalNotificationEmailType } from "@repo/api-contract"
import type { SQL } from "bun"

/** A stored email setting (`notification_preferences`, migration 0033). */
export type NotificationPreferenceRow = {
  type: string
  email_enabled: boolean
  updated_at: string
}

/**
 * Per-user email settings for the optional notification types. No row means the type's default;
 * a row exists only once the user switched a type away from it. Every read and write is by
 * `user_id`.
 */
export function notificationPreferencesQueries(sql: SQL) {
  return {
    /** The user's stored settings, by type; a type with no row is absent. */
    async list(userId: number): Promise<NotificationPreferenceRow[]> {
      const rows: Array<{ type: string; email_enabled: number | string; updated_at: string }> =
        await sql`
          SELECT type, email_enabled, updated_at FROM notification_preferences
          WHERE user_id = ${userId} ORDER BY type
        `
      return rows.map((row) => ({ ...row, email_enabled: Number(row.email_enabled) === 1 }))
    },

    /** Whether `type` is emailed to the user: the stored setting, else `fallback` (the default). */
    async emailEnabled(
      userId: number,
      type: OptionalNotificationEmailType,
      fallback: boolean
    ): Promise<boolean> {
      const [row]: Array<{ email_enabled: number | string }> = await sql`
        SELECT email_enabled FROM notification_preferences
        WHERE user_id = ${userId} AND type = ${type}
      `
      return row ? Number(row.email_enabled) === 1 : fallback
    },

    /**
     * Sets the user's email setting for `type`; resolves whether anything changed. A value equal
     * to what is in effect (the stored row, else `fallback`) writes nothing, so a repeat — or two
     * concurrent identical writes — changes the row (and is audited by the caller) at most once:
     * the update matches only a differing row, and the insert (for a type with no row yet) only
     * lands for a value that differs from the default, the loser of a race hitting the key.
     */
    async set(input: {
      userId: number
      type: OptionalNotificationEmailType
      email: boolean
      fallback: boolean
      at: string
    }): Promise<boolean> {
      const value = input.email ? 1 : 0
      const updated: Array<{ user_id: number }> = await sql`
        UPDATE notification_preferences SET email_enabled = ${value}, updated_at = ${input.at}
        WHERE user_id = ${input.userId} AND type = ${input.type} AND email_enabled <> ${value}
        RETURNING user_id
      `
      if (updated.length > 0) return true
      if (input.email === input.fallback) return false
      const inserted: Array<{ user_id: number }> = await sql`
        INSERT INTO notification_preferences (user_id, type, email_enabled, updated_at)
        VALUES (${input.userId}, ${input.type}, ${value}, ${input.at})
        ON CONFLICT (user_id, type) DO NOTHING
        RETURNING user_id
      `
      return inserted.length > 0
    },
  }
}
