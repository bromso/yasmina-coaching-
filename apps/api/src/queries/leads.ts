import type {
  LeadAudience,
  LeadContactMethod,
  LeadNeed,
  LeadStatus,
  LeadTimeline,
} from "@repo/api-contract"
import { LEAD_STATUSES } from "@repo/api-contract"
import type { SQL } from "bun"

export type LeadRow = {
  id: number
  audience: LeadAudience
  need: LeadNeed
  timeline: LeadTimeline
  message: string | null
  name: string
  email: string
  phone: string | null
  organisation: string | null
  role: string | null
  contact_method: LeadContactMethod
  consent_at: string
  newsletter: boolean
  locale: string | null
  page: string | null
  ip_hash: string | null
  status: LeadStatus
  notes: string | null
  created_at: string
  status_changed_at: string | null
  status_changed_by: number | null
  delete_after: string
}

/** `admin.leads.*`'s rows: the row plus the email of the admin who last set its status. */
export type AdminLeadRow = LeadRow & { status_changed_by_email: string | null }

/** What `privacy.export` lists for an address: never the ip hash, the admin or Yasmina's notes. */
export type ExportedLeadRow = Pick<
  LeadRow,
  | "id"
  | "audience"
  | "need"
  | "timeline"
  | "message"
  | "name"
  | "email"
  | "phone"
  | "organisation"
  | "role"
  | "contact_method"
  | "consent_at"
  | "newsletter"
  | "status"
  | "created_at"
>

const toRow = <T extends LeadRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  newsletter: Number(row.newsletter) === 1,
  status_changed_by: row.status_changed_by === null ? null : Number(row.status_changed_by),
})

/** Contact requests from the coaching site (`leads`, migration 0036). */
export function leadsQueries(sql: SQL) {
  return {
    /** Stores a new, `new` lead and returns its id. */
    async create(input: {
      audience: LeadAudience
      need: LeadNeed
      timeline: LeadTimeline
      message: string | null
      name: string
      email: string
      phone: string | null
      organisation: string | null
      role: string | null
      contactMethod: LeadContactMethod
      newsletter: boolean
      locale: string | null
      page: string | null
      ipHash: string | null
      createdAt: string
      deleteAfter: string
    }): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO leads
          (audience, need, timeline, message, name, email, phone, organisation, role,
            contact_method, consent_at, newsletter, locale, page, ip_hash, status, created_at,
            delete_after)
        VALUES (${input.audience}, ${input.need}, ${input.timeline}, ${input.message},
          ${input.name}, ${input.email}, ${input.phone}, ${input.organisation}, ${input.role},
          ${input.contactMethod}, ${input.createdAt}, ${input.newsletter ? 1 : 0}, ${input.locale},
          ${input.page}, ${input.ipHash}, 'new', ${input.createdAt}, ${input.deleteAfter})
        RETURNING id
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    async find(id: number): Promise<AdminLeadRow | undefined> {
      const [row]: AdminLeadRow[] = await sql`
        SELECT l.*, u.email AS status_changed_by_email
        FROM leads l LEFT JOIN users u ON u.id = l.status_changed_by
        WHERE l.id = ${id}
      `
      return row && toRow(row)
    },

    /** Newest first, keyset by id desc; `limit` is the page size plus one. */
    async list(input: {
      status?: LeadStatus
      cursor?: number
      limit: number
    }): Promise<AdminLeadRow[]> {
      const rows: AdminLeadRow[] = await sql`
        SELECT l.*, u.email AS status_changed_by_email
        FROM leads l
        LEFT JOIN users u ON u.id = l.status_changed_by
        WHERE 1 = 1
          ${input.status === undefined ? sql`` : sql`AND l.status = ${input.status}`}
          ${input.cursor === undefined ? sql`` : sql`AND l.id < ${input.cursor}`}
        ORDER BY l.id DESC LIMIT ${input.limit}
      `
      return rows.map(toRow)
    },

    /** How many leads there are in each status (zero for a status with none). */
    async counts(): Promise<Record<LeadStatus, number>> {
      const rows: Array<{ status: LeadStatus; n: number }> = await sql`
        SELECT status, COUNT(*) AS n FROM leads GROUP BY status
      `
      const counts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<
        LeadStatus,
        number
      >
      for (const row of rows) if (row.status in counts) counts[row.status] = Number(row.n)
      return counts
    },

    /**
     * Sets the status, stamped with who and when. Guarded to `status != <new status>`, so setting
     * it to what it already is returns `false` without re-stamping (a stale tab, two admins making
     * the same change), like `applications.setStatus`. Leaving `new` also erases the ip hash: its
     * abuse-limiting job is done once Yasmina has picked the lead up (like a resolved support
     * request's), and moving back to `new` never restores it.
     */
    async setStatus(id: number, status: LeadStatus, by: number, at: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE leads
        SET status = ${status}, status_changed_at = ${at}, status_changed_by = ${by},
          ip_hash = CASE WHEN ${status} = 'new' THEN ip_hash ELSE NULL END
        WHERE id = ${id} AND status != ${status}
        RETURNING id
      `
      return rows.length > 0
    },

    /** Replaces Yasmina's notes (empty → null). */
    async setNotes(id: number, notes: string | null): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE leads SET notes = ${notes} WHERE id = ${id} RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes one lead (on request, from admin); false when it is already gone. */
    async delete(id: number): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`DELETE FROM leads WHERE id = ${id} RETURNING id`
      return rows.length > 0
    },

    /** Deletes every lead whose `delete_after` is before `now`; returns how many went. */
    async deleteExpired(now: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM leads WHERE delete_after < ${now} RETURNING id
      `
      return rows.length
    },

    /** The leads sent from `email` (compared case-insensitively), for `privacy.export`. */
    async forEmail(email: string): Promise<ExportedLeadRow[]> {
      const rows: ExportedLeadRow[] = await sql`
        SELECT id, audience, need, timeline, message, name, email, phone, organisation, role,
          contact_method, consent_at, newsletter, status, created_at
        FROM leads WHERE lower(email) = ${email.toLowerCase()} ORDER BY id
      `
      return rows.map((row) => ({
        ...row,
        id: Number(row.id),
        newsletter: Number(row.newsletter) === 1,
      }))
    },
  }
}
