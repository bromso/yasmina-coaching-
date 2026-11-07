import type { BillingStatus, PlanKey, Role } from "@repo/api-contract"
import type { SQL } from "bun"
import type { ProviderId } from "./identities"
import type { UserRow } from "./users"
import type { WorkspaceRow } from "./workspaces"

/** `%` and `_` in a search term match themselves, not anything. Pair with `ESCAPE '\'`. */
export const likePattern = (q: string) => q.replace(/[\\%_]/g, "\\$&")

export type AdminUserRow = UserRow & {
  workspace_count: number | string
  passkey_count: number | string
  /** The admin named by `suspended_by`'s own email, or null (never suspended, or that admin was
   * purged — `suspended_by` itself tells the two apart). */
  suspended_by_email: string | null
}
export type AdminWorkspaceRow = WorkspaceRow & {
  member_count: number | string
  sub_plan: Exclude<PlanKey, "free"> | null
  sub_status: BillingStatus | null
}
export type MembershipWithPlanRow = {
  workspace_id: number
  name: string
  slug: string
  role: Role
  sub_plan: Exclude<PlanKey, "free"> | null
  sub_status: BillingStatus | null
}

export function adminQueries(sql: SQL) {
  // The subscription that decides a workspace's plan — the same ORDER BY as
  // billingQueries.subscriptions.latest(), so admin and entitlements never disagree.
  const latestSubscription = sql`
    LEFT JOIN billing_subscriptions s ON s.id = (
      SELECT x.id FROM billing_subscriptions x WHERE x.workspace_id = w.id
      ORDER BY CASE WHEN x.status IN ('active', 'trialing', 'past_due') THEN 0 ELSE 1 END,
        x.source_updated_at DESC, x.updated_at DESC, x.id DESC
      LIMIT 1
    )
  `
  const count = async (rows: Promise<{ n: number | string }[]>) => Number((await rows)[0]?.n ?? 0)
  return {
    async counts(now: string, since7d: string, since30d: string) {
      // Sequential on purpose (see entitlementsForWorkspace): never Promise.all on Bun.sql.
      const users = await count(sql`SELECT COUNT(*) AS n FROM users`)
      const verifiedUsers = await count(
        sql`SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL`
      )
      const signUps7d = await count(
        sql`SELECT COUNT(*) AS n FROM users WHERE created_at >= ${since7d}`
      )
      const signUps30d = await count(
        sql`SELECT COUNT(*) AS n FROM users WHERE created_at >= ${since30d}`
      )
      const workspaces = await count(sql`SELECT COUNT(*) AS n FROM workspaces`)
      const pendingInvitations = await count(
        sql`SELECT COUNT(*) AS n FROM invitations WHERE accepted_at IS NULL AND expires_at > ${now}`
      )
      return { users, verifiedUsers, signUps7d, signUps30d, workspaces, pendingInvitations }
    },

    /** Workspaces per effective plan, and how many of them are past due. */
    async planCounts(): Promise<{ plan: string; n: number | string; past_due: number | string }[]> {
      return sql`
        SELECT
          CASE WHEN s.status IN ('active', 'trialing', 'past_due') THEN s.plan ELSE 'free' END AS plan,
          SUM(CASE WHEN s.status = 'past_due' THEN 1 ELSE 0 END) AS past_due,
          COUNT(*) AS n
        FROM workspaces w ${latestSubscription}
        GROUP BY 1
      `
    },

    /** Keyset by id desc; `limit` is the page size plus one. */
    async listUsers(input: {
      q?: string
      cursor?: number
      /** `true` to show only accounts currently suspended — in force right now
       * (`isSuspended`'s own rule, not merely holding a suspension record: an expired-but-uncleared
       * one is excluded). Compared against `now`, both engines. */
      suspended?: boolean
      /** The request's own clock, ISO — only read when `suspended` is `true`. */
      now?: string
      limit: number
    }): Promise<AdminUserRow[]> {
      const prefix = input.q ? `${likePattern(input.q.toLowerCase())}%` : undefined
      const anywhere = input.q ? `%${likePattern(input.q.toLowerCase())}%` : undefined
      return sql`
        SELECT u.*, (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS workspace_count,
          (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkey_count,
          (SELECT email FROM users su WHERE su.id = u.suspended_by) AS suspended_by_email
        FROM users u
        WHERE 1 = 1
          ${input.cursor === undefined ? sql`` : sql`AND u.id < ${input.cursor}`}
          ${prefix === undefined ? sql`` : sql`AND (u.email LIKE ${prefix} ESCAPE '\\' OR lower(u.name) LIKE ${anywhere} ESCAPE '\\')`}
          ${
            input.suspended
              ? sql`AND u.suspended_at IS NOT NULL AND (u.suspended_until IS NULL OR u.suspended_until > ${input.now})`
              : sql``
          }
        ORDER BY u.id DESC LIMIT ${input.limit}
      `
    },

    async findUser(id: number): Promise<AdminUserRow | undefined> {
      const rows: AdminUserRow[] = await sql`
        SELECT u.*, (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS workspace_count,
          (SELECT COUNT(*) FROM passkeys p WHERE p.user_id = u.id) AS passkey_count,
          (SELECT email FROM users su WHERE su.id = u.suspended_by) AS suspended_by_email
        FROM users u WHERE u.id = ${id}
      `
      return rows[0]
    },

    /** Which providers each of these users signed in with (never the provider user ids). */
    async providersFor(userIds: number[]): Promise<{ user_id: number; provider: ProviderId }[]> {
      if (userIds.length === 0) return []
      return sql`
        SELECT user_id, provider FROM identities WHERE user_id IN ${sql(userIds)} ORDER BY id
      `
    },

    async membershipsForUser(userId: number): Promise<MembershipWithPlanRow[]> {
      return sql`
        SELECT w.id AS workspace_id, w.name, w.slug, m.role, s.plan AS sub_plan, s.status AS sub_status
        FROM memberships m JOIN workspaces w ON w.id = m.workspace_id ${latestSubscription}
        WHERE m.user_id = ${userId} ORDER BY w.id
      `
    },

    async listWorkspaces(input: {
      q?: string
      cursor?: number
      limit: number
    }): Promise<AdminWorkspaceRow[]> {
      const anywhere = input.q ? `%${likePattern(input.q.toLowerCase())}%` : undefined
      return sql`
        SELECT w.*, s.plan AS sub_plan, s.status AS sub_status,
          (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = w.id) AS member_count
        FROM workspaces w ${latestSubscription}
        WHERE 1 = 1
          ${input.cursor === undefined ? sql`` : sql`AND w.id < ${input.cursor}`}
          ${anywhere === undefined ? sql`` : sql`AND (lower(w.name) LIKE ${anywhere} ESCAPE '\\' OR w.slug LIKE ${anywhere} ESCAPE '\\')`}
        ORDER BY w.id DESC LIMIT ${input.limit}
      `
    },

    async findWorkspace(id: number): Promise<AdminWorkspaceRow | undefined> {
      const rows: AdminWorkspaceRow[] = await sql`
        SELECT w.*, s.plan AS sub_plan, s.status AS sub_status,
          (SELECT COUNT(*) FROM memberships m WHERE m.workspace_id = w.id) AS member_count
        FROM workspaces w ${latestSubscription}
        WHERE w.id = ${id}
      `
      return rows[0]
    },

    async ownersFor(
      workspaceIds: number[]
    ): Promise<{ workspace_id: number; id: number; email: string }[]> {
      if (workspaceIds.length === 0) return []
      return sql`
        SELECT m.workspace_id, u.id, u.email FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.role = 'owner' AND m.workspace_id IN ${sql(workspaceIds)}
        ORDER BY m.workspace_id, u.id
      `
    },
  }
}
