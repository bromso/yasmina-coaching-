import type { SQL } from "bun"
import { normalizeEmail } from "./users"

export type WaitlistRow = { email: string; source: string; created_at: string }

// SQLite and Postgres word the unique violation differently; both name the column or constraint.
const isDuplicate = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: waitlist\.email|waitlist_email_key/.test(error.message)

export function waitlistQueries(sql: SQL) {
  return {
    /** Adds the email (normalised); `created` is false when it was already on the list. */
    async add(input: { email: string; source: string }): Promise<{ created: boolean }> {
      try {
        await sql`
          INSERT INTO waitlist (email, source, created_at)
          VALUES (${normalizeEmail(input.email)}, ${input.source}, ${new Date().toISOString()})
        `
        return { created: true }
      } catch (error) {
        if (isDuplicate(error)) return { created: false }
        throw error
      }
    },

    async find(email: string): Promise<WaitlistRow | undefined> {
      const [row]: WaitlistRow[] = await sql`
        SELECT email, source, created_at FROM waitlist WHERE email = ${normalizeEmail(email)}
      `
      return row
    },

    async count(): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`SELECT COUNT(*) AS n FROM waitlist`
      return Number(row?.n ?? 0)
    },
  }
}
