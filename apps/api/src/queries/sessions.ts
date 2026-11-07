import type { SQL } from "bun"

export type SessionRow = {
  id: number
  token_hash: string
  user_id: number
  created_at: string
  last_seen_at: string
  expires_at: string
  user_agent: string | null
  ip: string | null
  /** The superadmin who issued this session to act as `user_id`; null for the user's own sessions. */
  impersonated_by: number | null
  reason: string | null
}

export function sessionsQueries(sql: SQL) {
  return {
    async create(input: {
      userId: number
      tokenHash: string
      expiresAt: string
      userAgent: string | null
      ip: string | null
      impersonatedBy?: number | null
      reason?: string | null
    }): Promise<SessionRow> {
      const now = new Date().toISOString()
      const [row]: SessionRow[] = await sql`
        INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent, ip, impersonated_by, reason)
        VALUES (${input.tokenHash}, ${input.userId}, ${now}, ${now}, ${input.expiresAt}, ${input.userAgent}, ${input.ip}, ${input.impersonatedBy ?? null}, ${input.reason ?? null})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return row
    },

    /** Live sessions only: an expired row never authenticates. */
    async findByToken(tokenHash: string): Promise<SessionRow | undefined> {
      const now = new Date().toISOString()
      const [row]: SessionRow[] =
        await sql`SELECT * FROM sessions WHERE token_hash = ${tokenHash} AND expires_at > ${now}`
      return row
    },

    async touch(id: number, at: string): Promise<void> {
      await sql`UPDATE sessions SET last_seen_at = ${at} WHERE id = ${id}`
    },

    /** The user's live sessions, oldest first; expired rows are not listed. */
    async listForUser(userId: number, now: string): Promise<SessionRow[]> {
      const rows: SessionRow[] = await sql`
        SELECT * FROM sessions WHERE user_id = ${userId} AND expires_at > ${now} ORDER BY id
      `
      return rows
    },

    async deleteExpired(userId: number, now: string): Promise<void> {
      await sql`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at <= ${now}`
    },

    /** True when a row was deleted; scoping by owner makes a foreign id a no-op. */
    async delete({ id, userId }: { id: number; userId: number }): Promise<boolean> {
      const rows: SessionRow[] =
        await sql`DELETE FROM sessions WHERE id = ${id} AND user_id = ${userId} RETURNING id`
      return rows.length > 0
    },

    async deleteForUser(userId: number, { except }: { except?: number } = {}): Promise<void> {
      if (except === undefined) await sql`DELETE FROM sessions WHERE user_id = ${userId}`
      else await sql`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${except}`
    },

    /** Live impersonation sessions acting as this user, and the admin driving each. */
    async listImpersonationsOf(
      userId: number,
      now: string
    ): Promise<{ id: number; impersonated_by: number }[]> {
      const rows: { id: number; impersonated_by: number }[] = await sql`
        SELECT id, impersonated_by FROM sessions
        WHERE user_id = ${userId} AND impersonated_by IS NOT NULL AND expires_at > ${now}
        ORDER BY id
      `
      return rows
    },

    /** Ends every live impersonation this admin holds; returns who was being impersonated. */
    async deleteImpersonationsBy(adminId: number): Promise<{ id: number; user_id: number }[]> {
      const now = new Date().toISOString()
      const rows: { id: number; user_id: number }[] = await sql`
        DELETE FROM sessions WHERE impersonated_by = ${adminId} AND expires_at > ${now}
        RETURNING id, user_id
      `
      return rows
    },

    async countLiveForUser(userId: number, now: string): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ${userId} AND expires_at > ${now}`
      return Number(row?.n ?? 0)
    },

    /** When the user was last seen on a session of their own (impersonations do not count). */
    async lastSeenForUser(userId: number): Promise<string | null> {
      const [row]: { last: string | null }[] = await sql`
        SELECT MAX(last_seen_at) AS last FROM sessions
        WHERE user_id = ${userId} AND impersonated_by IS NULL
      `
      return row?.last ?? null
    },

    async countLive(now: string): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ${now}`
      return Number(row?.n ?? 0)
    },
  }
}
