import type { SQL } from "bun"
import type { Role } from "./workspaces"

export type MembershipRow = {
  workspace_id: number
  user_id: number
  role: Role
  created_at: string
}
export type MemberRow = MembershipRow & { name: string; email: string }
/**
 * A member with what the two-step requirement needs: their saved locale (for its mail) and
 * `two_factor`, 1 when the account satisfies it — the SQL twin of `satisfiesTwoFactor` in
 * access.ts (two-step on, or at least one passkey).
 */
export type MemberTwoFactorRow = MemberRow & { locale: string | null; two_factor: number | string }
/** A member as `/v1` lists them: no email. */
export type MemberPageRow = { user_id: number; role: Role; created_at: string; name: string }

export function membershipsQueries(sql: SQL) {
  return {
    async find(workspaceId: number, userId: number): Promise<MembershipRow | undefined> {
      const rows: MembershipRow[] =
        await sql`SELECT * FROM memberships WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`
      return rows[0]
    },
    async add(input: { workspaceId: number; userId: number; role: Role }): Promise<void> {
      await sql`
        INSERT INTO memberships (workspace_id, user_id, role, created_at)
        VALUES (${input.workspaceId}, ${input.userId}, ${input.role}, ${new Date().toISOString()})
      `
    },
    /** Returns false when the user is not a member (nothing was updated). */
    async setRole(workspaceId: number, userId: number, role: Role): Promise<boolean> {
      const rows: { user_id: number }[] = await sql`
        UPDATE memberships SET role = ${role}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId} RETURNING user_id
      `
      return rows.length > 0
    },
    async remove(workspaceId: number, userId: number): Promise<boolean> {
      const rows: { user_id: number }[] = await sql`
        DELETE FROM memberships WHERE workspace_id = ${workspaceId} AND user_id = ${userId} RETURNING user_id
      `
      return rows.length > 0
    },
    /** Every membership the user holds, by workspace id. */
    async listForUser(userId: number): Promise<MembershipRow[]> {
      return sql`SELECT * FROM memberships WHERE user_id = ${userId} ORDER BY workspace_id`
    },
    async ownerCount(workspaceId: number): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ${workspaceId} AND role = 'owner'`
      return Number(row?.n ?? 0)
    },
    /** Members with their names and emails, owners first then by join date. */
    async list(workspaceId: number): Promise<MemberRow[]> {
      return sql`
        SELECT m.*, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ${workspaceId}
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, m.created_at, m.user_id
      `
    },

    /** `list`, each member with their locale and whether they satisfy a two-step requirement. */
    async listWithTwoFactor(workspaceId: number): Promise<MemberTwoFactorRow[]> {
      return sql`
        SELECT m.*, u.name, u.email, u.locale,
          CASE WHEN u.two_factor_enabled_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id) THEN 1 ELSE 0 END AS two_factor
        FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ${workspaceId}
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, m.created_at, m.user_id
      `
    },

    /**
     * `/v1/members`: keyset pagination on user id within one workspace, ascending, one row past
     * `limit` telling whether more exist. Selects no email: `/v1` never returns one.
     */
    async page({
      workspaceId,
      cursor,
      limit,
    }: {
      workspaceId: number
      cursor?: number
      limit: number
    }): Promise<{ rows: MemberPageRow[]; nextCursor: number | null }> {
      const rows: MemberPageRow[] =
        cursor === undefined
          ? await sql`
              SELECT m.user_id, m.role, m.created_at, u.name
              FROM memberships m JOIN users u ON u.id = m.user_id
              WHERE m.workspace_id = ${workspaceId}
              ORDER BY m.user_id LIMIT ${limit + 1}
            `
          : await sql`
              SELECT m.user_id, m.role, m.created_at, u.name
              FROM memberships m JOIN users u ON u.id = m.user_id
              WHERE m.workspace_id = ${workspaceId} AND m.user_id > ${cursor}
              ORDER BY m.user_id LIMIT ${limit + 1}
            `
      const items = rows.slice(0, limit).map((row) => ({ ...row, user_id: Number(row.user_id) }))
      const last = items.at(-1)
      return { rows: items, nextCursor: rows.length > limit && last ? last.user_id : null }
    },
  }
}
