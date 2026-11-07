import type { AdminSupportStatusFilter, SupportStatus, SupportTopic } from "@repo/api-contract"
import type { SQL } from "bun"

export type SupportRequestRow = {
  id: number
  email: string
  name: string | null
  topic: SupportTopic
  message: string
  page: string | null
  user_id: number | null
  ip_hash: string | null
  status: SupportStatus
  created_at: string
  resolved_at: string | null
  resolved_by: number | null
}

/** `admin.support.list`'s rows: the row plus the resolving admin's email, when there is one. */
export type AdminSupportRequestRow = SupportRequestRow & { resolved_by_email: string | null }

const toRow = <T extends SupportRequestRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  user_id: row.user_id === null ? null : Number(row.user_id),
  resolved_by: row.resolved_by === null ? null : Number(row.resolved_by),
})

/** Help-center contact requests (`support_requests`, migration 0020). */
export function supportQueries(sql: SQL) {
  return {
    /** Stores a new, `open` request and returns its id. */
    async create(input: {
      email: string
      name: string | null
      topic: SupportTopic
      message: string
      page: string | null
      userId: number | null
      ipHash: string | null
      createdAt: string
    }): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO support_requests
          (email, name, topic, message, page, user_id, ip_hash, status, created_at)
        VALUES (${input.email}, ${input.name}, ${input.topic}, ${input.message}, ${input.page},
          ${input.userId}, ${input.ipHash}, 'open', ${input.createdAt})
        RETURNING id
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    async find(id: number): Promise<SupportRequestRow | undefined> {
      const [row]: SupportRequestRow[] = await sql`SELECT * FROM support_requests WHERE id = ${id}`
      return row && toRow(row)
    },

    /** `admin.support.list`: keyset by id desc; `limit` is the page size plus one. */
    async list(input: {
      status: AdminSupportStatusFilter
      cursor?: number
      limit: number
    }): Promise<AdminSupportRequestRow[]> {
      const rows: AdminSupportRequestRow[] = await sql`
        SELECT r.*, u.email AS resolved_by_email
        FROM support_requests r
        LEFT JOIN users u ON u.id = r.resolved_by
        WHERE 1 = 1
          ${input.status === "all" ? sql`` : sql`AND r.status = ${input.status}`}
          ${input.cursor === undefined ? sql`` : sql`AND r.id < ${input.cursor}`}
        ORDER BY r.id DESC LIMIT ${input.limit}
      `
      return rows.map(toRow)
    },

    /**
     * open → resolved, stamped with who and when, and the IP hash erased (its abuse-limiting job
     * is done once the request is closed). Guarded to `status = 'open'`, so a request already
     * resolved is a no-op that returns `false` rather than re-stamping and overwriting the first
     * admin's `resolved_by`. `false` either way: the caller (the router) cannot tell an unknown id
     * from an already-resolved one from this alone and uses `find` first to tell them apart.
     */
    async resolve(id: number, resolvedBy: number, resolvedAt: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE support_requests
        SET status = 'resolved', resolved_at = ${resolvedAt}, resolved_by = ${resolvedBy},
          ip_hash = NULL
        WHERE id = ${id} AND status = 'open'
        RETURNING id
      `
      return rows.length > 0
    },

    /**
     * resolved → open, clearing who and when (the IP hash stays null: it was erased on resolve
     * and is not restored). Guarded to `status = 'resolved'`, so reopening an already-open request
     * is a no-op that returns `false`, like `resolve`'s own guard.
     */
    async reopen(id: number): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE support_requests
        SET status = 'open', resolved_at = NULL, resolved_by = NULL
        WHERE id = ${id} AND status = 'resolved'
        RETURNING id
      `
      return rows.length > 0
    },
  }
}
