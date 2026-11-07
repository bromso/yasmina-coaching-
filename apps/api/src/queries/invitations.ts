import type { SQL } from "bun"
import { normalizeEmail } from "./users"
import type { Role } from "./workspaces"

export type InvitationRow = {
  id: number
  workspace_id: number
  email: string
  role: Exclude<Role, "owner">
  token_hash: string
  invited_by: number | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}
/** An invitation with what the pages show next to it. */
export type InvitationDetailRow = InvitationRow & {
  workspace_name: string
  inviter_name: string
  /** The workspace's `require_two_factor`, as stored; read it through `requiresTwoFactor`. */
  workspace_require_two_factor: number | string | boolean
  /** The workspace's `invite_domains`, as stored; read it through `inviteDomainsOf`. */
  workspace_invite_domains: string
}

const DETAIL = `
  i.*, w.name AS workspace_name, w.require_two_factor AS workspace_require_two_factor, w.invite_domains AS workspace_invite_domains,
  COALESCE(u.name, '') AS inviter_name
  FROM invitations i
  JOIN workspaces w ON w.id = i.workspace_id
  LEFT JOIN users u ON u.id = i.invited_by`

export function invitationsQueries(sql: SQL) {
  return {
    /** Replaces any pending invitation for the address in this workspace, then inserts. */
    async create(input: {
      workspaceId: number
      email: string
      role: Exclude<Role, "owner">
      tokenHash: string
      invitedBy: number
      expiresAt: string
    }): Promise<InvitationRow> {
      const email = normalizeEmail(input.email)
      await sql`DELETE FROM invitations WHERE workspace_id = ${input.workspaceId} AND email = ${email} AND accepted_at IS NULL`
      const [row]: InvitationRow[] = await sql`
        INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at, created_at)
        VALUES (${input.workspaceId}, ${email}, ${input.role}, ${input.tokenHash}, ${input.invitedBy}, ${input.expiresAt}, ${new Date().toISOString()})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return row
    },
    async findByTokenHash(tokenHash: string): Promise<InvitationDetailRow | undefined> {
      const rows: InvitationDetailRow[] = await sql.unsafe(
        `SELECT ${DETAIL} WHERE i.token_hash = $1`,
        [tokenHash]
      )
      return rows[0]
    },
    async find(id: number): Promise<InvitationDetailRow | undefined> {
      const rows: InvitationDetailRow[] = await sql.unsafe(`SELECT ${DETAIL} WHERE i.id = $1`, [id])
      return rows[0]
    },
    async listPending(workspaceId: number, now: string): Promise<InvitationDetailRow[]> {
      return sql.unsafe(
        `SELECT ${DETAIL} WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.expires_at > $2 ORDER BY i.id`,
        [workspaceId, now]
      )
    },
    async listPendingForEmail(email: string, now: string): Promise<InvitationDetailRow[]> {
      return sql.unsafe(
        `SELECT ${DETAIL} WHERE i.email = $1 AND i.accepted_at IS NULL AND i.expires_at > $2 ORDER BY i.id`,
        [normalizeEmail(email), now]
      )
    },
    /** Marks it accepted; returns false when it was already used or has expired. */
    async accept(id: number, at: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE invitations SET accepted_at = ${at}
        WHERE id = ${id} AND accepted_at IS NULL AND expires_at > ${at} RETURNING id
      `
      return rows.length > 0
    },
    /** The row it deleted (what the activity log names), or undefined when there was none. */
    async delete(id: number, workspaceId: number): Promise<InvitationRow | undefined> {
      const [row]: InvitationRow[] =
        await sql`DELETE FROM invitations WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING *`
      return row
    },
  }
}
