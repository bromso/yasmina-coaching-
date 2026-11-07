import type { ApplicationStatus } from "@repo/api-contract"
import type { SQL } from "bun"

export type ApplicationRow = {
  id: number
  job_slug: string
  job_title: string
  name: string
  email: string
  link: string | null
  note: string | null
  cv_key: string
  ip_hash: string | null
  status: ApplicationStatus
  created_at: string
  status_changed_at: string | null
  status_changed_by: number | null
  delete_after: string
}

/** `admin.applications.list`'s rows: the row plus the email of the admin who last set its status. */
export type AdminApplicationRow = ApplicationRow & { status_changed_by_email: string | null }

/** What `privacy.export` lists for an address: never the ip hash, the CV key or the admin. */
export type ExportedApplicationRow = Pick<
  ApplicationRow,
  "id" | "job_slug" | "job_title" | "name" | "email" | "link" | "note" | "status" | "created_at"
>

/** `list`'s default page size (the caller asks for one more to know whether a next page exists). */
export const APPLICATIONS_PAGE_SIZE = 50

const toRow = <T extends ApplicationRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  status_changed_by: row.status_changed_by === null ? null : Number(row.status_changed_by),
})

/** Job applications (`job_applications`, migration 0021). */
export function applicationsQueries(sql: SQL) {
  return {
    /** Stores a new, `new` application and returns its id. */
    async create(input: {
      jobSlug: string
      jobTitle: string
      name: string
      email: string
      link: string | null
      note: string | null
      cvKey: string
      ipHash: string | null
      createdAt: string
      deleteAfter: string
    }): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO job_applications
          (job_slug, job_title, name, email, link, note, cv_key, ip_hash, status, created_at,
            delete_after)
        VALUES (${input.jobSlug}, ${input.jobTitle}, ${input.name}, ${input.email}, ${input.link},
          ${input.note}, ${input.cvKey}, ${input.ipHash}, 'new', ${input.createdAt},
          ${input.deleteAfter})
        RETURNING id
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    async find(id: number): Promise<ApplicationRow | undefined> {
      const [row]: ApplicationRow[] = await sql`SELECT * FROM job_applications WHERE id = ${id}`
      return row && toRow(row)
    },

    /** Newest first, keyset by id desc; `limit` defaults to `APPLICATIONS_PAGE_SIZE`. */
    async list(input: {
      status?: ApplicationStatus
      job?: string
      cursor?: number
      limit?: number
    }): Promise<AdminApplicationRow[]> {
      const rows: AdminApplicationRow[] = await sql`
        SELECT a.*, u.email AS status_changed_by_email
        FROM job_applications a
        LEFT JOIN users u ON u.id = a.status_changed_by
        WHERE 1 = 1
          ${input.status === undefined ? sql`` : sql`AND a.status = ${input.status}`}
          ${input.job === undefined ? sql`` : sql`AND a.job_slug = ${input.job}`}
          ${input.cursor === undefined ? sql`` : sql`AND a.id < ${input.cursor}`}
        ORDER BY a.id DESC LIMIT ${input.limit ?? APPLICATIONS_PAGE_SIZE}
      `
      return rows.map(toRow)
    },

    /**
     * Sets the status, stamped with who and when. Guarded to `status != <new status>`, so setting
     * it to what it already is is a no-op that returns `false` rather than re-stamping who and
     * when (a race between two admins making the same change, or a stale tab resubmitting). `false`
     * either way: the caller (the router) cannot tell an unknown id from an unchanged one from this
     * alone and uses `find` first to tell them apart, like `support.resolve`'s own guard.
     */
    async setStatus(
      id: number,
      status: ApplicationStatus,
      by: number,
      at: string
    ): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE job_applications
        SET status = ${status}, status_changed_at = ${at}, status_changed_by = ${by}
        WHERE id = ${id} AND status != ${status}
        RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes one application, returning its CV key for `storage.delete`; undefined if gone. */
    async delete(id: number): Promise<{ cvKey: string } | undefined> {
      const [row]: Array<{ cv_key: string }> = await sql`
        DELETE FROM job_applications WHERE id = ${id} RETURNING cv_key
      `
      return row && { cvKey: row.cv_key }
    },

    /** Every application whose `delete_after` is before `now`, oldest id first. */
    async expiredBefore(now: string): Promise<Array<{ id: number; cvKey: string }>> {
      const rows: Array<{ id: number; cv_key: string }> = await sql`
        SELECT id, cv_key FROM job_applications WHERE delete_after < ${now} ORDER BY id
      `
      return rows.map((row) => ({ id: Number(row.id), cvKey: row.cv_key }))
    },

    /** The applications sent from `email` (compared case-insensitively), for `privacy.export`. */
    async forEmail(email: string): Promise<ExportedApplicationRow[]> {
      const rows: ExportedApplicationRow[] = await sql`
        SELECT id, job_slug, job_title, name, email, link, note, status, created_at
        FROM job_applications WHERE lower(email) = ${email.toLowerCase()} ORDER BY id
      `
      return rows.map((row) => ({ ...row, id: Number(row.id) }))
    },

    /** Every CV key a row references, for `storage.sweep`: one under `applications/` not in here is an orphan. */
    async liveKeys(): Promise<Set<string>> {
      const rows: Array<{ cv_key: string }> = await sql`SELECT cv_key FROM job_applications`
      return new Set(rows.map((row) => row.cv_key))
    },
  }
}
