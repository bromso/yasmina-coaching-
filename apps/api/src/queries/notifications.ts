import type { NotificationType } from "@repo/api-contract"
import type { SQL } from "bun"

/**
 * A notification as `notifications.list` reads it: `workspace_id` already nulled unless the user
 * is still a member of that workspace (the join below), so a caller never sees a link into a
 * workspace they left.
 */
export type NotificationRow = {
  id: number
  type: string
  data: string
  workspace_id: number | null
  created_at: string
  read_at: string | null
}

/** A notification as the privacy export carries it (`exports.dataFor`). */
export type ExportedNotificationRow = {
  type: string
  data: string
  created_at: string
  read_at: string | null
}

/** Per-user notifications (`notifications`, migration 0032). Every read and write is by `user_id`. */
export function notificationsQueries(sql: SQL) {
  return {
    async create(input: {
      userId: number
      workspaceId: number | null
      type: NotificationType
      /** Already validated against the type's data schema and serialised. */
      data: string
      createdAt: string
    }): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO notifications (user_id, workspace_id, type, data, created_at)
        VALUES (${input.userId}, ${input.workspaceId}, ${input.type}, ${input.data},
          ${input.createdAt})
        RETURNING id
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    /**
     * The user's own rows, newest first by `(created_at, id)`, strictly older than `before` when
     * given. `limit` is the page size plus one (the caller tells a last page apart).
     */
    async list(input: {
      userId: number
      before?: { createdAt: string; id: number }
      unreadOnly: boolean
      limit: number
    }): Promise<NotificationRow[]> {
      const { before } = input
      const rows: NotificationRow[] = await sql`
        SELECT n.id, n.type, n.data, n.created_at, n.read_at,
          CASE WHEN m.user_id IS NULL THEN NULL ELSE n.workspace_id END AS workspace_id
        FROM notifications n
        LEFT JOIN memberships m ON m.workspace_id = n.workspace_id AND m.user_id = n.user_id
        WHERE n.user_id = ${input.userId}
          ${input.unreadOnly ? sql`AND n.read_at IS NULL` : sql``}
          ${
            before === undefined
              ? sql``
              : sql`AND (n.created_at < ${before.createdAt}
                  OR (n.created_at = ${before.createdAt} AND n.id < ${before.id}))`
          }
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${input.limit}
      `
      return rows.map((row) => ({
        ...row,
        id: Number(row.id),
        workspace_id: row.workspace_id === null ? null : Number(row.workspace_id),
      }))
    },

    /** The user's unread rows, counted no further than `cap` (a badge needs no exact backlog). */
    async unreadCount(userId: number, cap: number): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`
        SELECT COUNT(*) AS n FROM (
          SELECT 1 FROM notifications WHERE user_id = ${userId} AND read_at IS NULL LIMIT ${cap}
        ) unread
      `
      return Number(row?.n ?? 0)
    },

    /**
     * Marks the user's own unread rows among `ids` read; an id that is not theirs (or already
     * read) matches nothing. Returns how many rows changed.
     */
    async markRead(userId: number, ids: readonly number[], at: string): Promise<number> {
      if (ids.length === 0) return 0
      const rows: Array<{ id: number }> = await sql`
        UPDATE notifications SET read_at = ${at}
        WHERE user_id = ${userId} AND read_at IS NULL AND id IN ${sql(ids as number[])}
        RETURNING id
      `
      return rows.length
    },

    /** Marks every unread row of the user read. Returns how many rows changed. */
    async markAllRead(userId: number, at: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE notifications SET read_at = ${at}
        WHERE user_id = ${userId} AND read_at IS NULL
        RETURNING id
      `
      return rows.length
    },

    /**
     * `notifications.prune`: deletes read rows created before `readBefore` and any row created
     * before `anyBefore` (`anyBefore` ≤ `readBefore`). Written as one `created_at` range, so it
     * runs on `notifications_created_at` rather than scanning the table. Returns how many went.
     */
    async prune(readBefore: string, anyBefore: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM notifications
        WHERE created_at < ${readBefore}
          AND (read_at IS NOT NULL OR created_at < ${anyBefore})
        RETURNING id
      `
      return rows.length
    },

    /** The user's rows for the privacy export, oldest first; never another user's. */
    async forExport(userId: number): Promise<ExportedNotificationRow[]> {
      return sql`
        SELECT type, data, created_at, read_at FROM notifications
        WHERE user_id = ${userId} ORDER BY created_at, id
      `
    },
  }
}
