import { WORKSPACE_ACTIVITY_ACTIONS } from "@repo/api-contract/workspace-activity"
import type { SQL } from "bun"

export type AuditRow = {
  id: number
  at: string
  actor_user_id: number | null
  impersonated_user_id: number | null
  action: string
  target_type: string | null
  target_id: string | null
  reason: string | null
  ip: string | null
  user_agent: string | null
  /** JSON text, or null. */
  metadata: string | null
  /** The workspace the action belongs to (0029_audit_workspace); null for platform rows. */
  workspace_id: number | null
}
export type AuditDetailRow = AuditRow & {
  actor_email: string | null
  impersonated_email: string | null
}

/**
 * One row of a workspace's activity log, read by an explicit column list: never `ip`,
 * `user_agent` or `reason`.
 */
export type WorkspaceActivityRow = {
  id: number
  at: string
  actor_user_id: number | null
  impersonated_user_id: number | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: string | null
}

/** Highest id in a batch's `RETURNING id`, or `afterId` when the batch touched nothing. */
function batchResult(rows: { id: number }[], afterId: number): { count: number; lastId: number } {
  let lastId = afterId
  for (const { id } of rows) if (Number(id) > lastId) lastId = Number(id)
  return { count: rows.length, lastId }
}

/**
 * Append-only except for `audit.prune` (apps/api/src/jobs/builtin/audit.ts): apart from the
 * privacy purge nulling user ids (`users.purge` in queries/users.ts), it is the only code that
 * updates or deletes a row — every other query below only reads or inserts. The `0011_admin`
 * migration's own comment ("no query ever updates or deletes a row") predates retention and
 * cannot change; these are the documented exceptions.
 */
export function auditQueries(sql: SQL) {
  /**
   * The admin pages' target filter. A workspace target also matches every row recorded *for* that
   * workspace (`workspace_id`): its activity rows target the member, key or endpoint they changed,
   * yet a superadmin looking at the workspace still expects to see them. Only an id a workspace
   * could have (a positive 32-bit integer) is compared with the integer column.
   */
  const targetFilter = (targetType: string | undefined, targetId: string | undefined) => {
    const workspaceId =
      targetType === "workspace" && targetId !== undefined && /^[1-9]\d{0,9}$/.test(targetId)
        ? Number(targetId)
        : undefined
    if (workspaceId !== undefined && workspaceId <= 2_147_483_647)
      return sql`AND (a.workspace_id = ${workspaceId}
        OR (a.target_type = 'workspace' AND a.target_id = ${targetId}))`
    return sql`
      ${targetType === undefined ? sql`` : sql`AND a.target_type = ${targetType}`}
      ${targetId === undefined ? sql`` : sql`AND a.target_id = ${targetId}`}
    `
  }
  const detail = (where: SQL.Query<unknown>, limit: number) => sql`
    SELECT a.*, actor.email AS actor_email, imp.email AS impersonated_email
    FROM audit_log a
    LEFT JOIN users actor ON actor.id = a.actor_user_id
    LEFT JOIN users imp ON imp.id = a.impersonated_user_id
    WHERE 1 = 1 ${where}
    ORDER BY a.id DESC LIMIT ${limit}
  `
  return {
    async create(input: {
      actorUserId: number | null
      impersonatedUserId: number | null
      action: string
      targetType: string | null
      targetId: string | null
      reason: string | null
      ip: string | null
      userAgent: string | null
      metadata: string | null
      /** Omitted (or null) for a platform row that belongs to no workspace. */
      workspaceId?: number | null
    }): Promise<AuditRow> {
      const [row]: AuditRow[] = await sql`
        INSERT INTO audit_log (at, actor_user_id, impersonated_user_id, action, target_type, target_id, reason, ip, user_agent, metadata, workspace_id)
        VALUES (${new Date().toISOString()}, ${input.actorUserId}, ${input.impersonatedUserId}, ${input.action}, ${input.targetType}, ${input.targetId}, ${input.reason}, ${input.ip}, ${input.userAgent}, ${input.metadata}, ${input.workspaceId ?? null})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return row
    },

    /** Newest first, keyset on id; `limit` is the caller's page size plus one. */
    async list(input: {
      cursor?: number
      limit: number
      actorId?: number
      targetType?: string
      targetId?: string
    }): Promise<AuditDetailRow[]> {
      const rows: AuditDetailRow[] = await detail(
        sql`
          ${input.cursor === undefined ? sql`` : sql`AND a.id < ${input.cursor}`}
          ${input.actorId === undefined ? sql`` : sql`AND a.actor_user_id = ${input.actorId}`}
          ${targetFilter(input.targetType, input.targetId)}
        `,
        input.limit
      )
      return rows
    },

    /** Rows where the user acted, was acted as, or was the target (an impersonation start). */
    async listForUser(userId: number, limit: number): Promise<AuditDetailRow[]> {
      const rows: AuditDetailRow[] = await detail(
        sql`AND (a.actor_user_id = ${userId} OR a.impersonated_user_id = ${userId}
          OR (a.target_type = 'user' AND a.target_id = ${String(userId)}))`,
        limit
      )
      return rows
    },

    async listForTarget(
      targetType: string,
      targetId: string,
      limit: number
    ): Promise<AuditDetailRow[]> {
      const rows: AuditDetailRow[] = await detail(targetFilter(targetType, targetId), limit)
      return rows
    },

    /**
     * `workspaces.activity.list`'s rows: always scoped to `workspaceId` (a platform row has none,
     * so it never matches) and to the activity actions, at or after `sinceIso`, newest first by
     * `(at, id)`, strictly older than `before` when given. `limit` is the page size plus one.
     */
    async listForWorkspace(input: {
      workspaceId: number
      sinceIso: string
      before?: { at: string; id: number }
      action?: string
      limit: number
    }): Promise<WorkspaceActivityRow[]> {
      const { before } = input
      const rows: WorkspaceActivityRow[] = await sql`
        SELECT a.id, a.at, a.actor_user_id, a.impersonated_user_id, a.action, a.target_type,
          a.target_id, a.metadata
        FROM audit_log a
        WHERE a.workspace_id = ${input.workspaceId}
          AND a.at >= ${input.sinceIso}
          AND a.action IN ${sql(WORKSPACE_ACTIVITY_ACTIONS as unknown as string[])}
          ${input.action === undefined ? sql`` : sql`AND a.action = ${input.action}`}
          ${
            before === undefined
              ? sql``
              : sql`AND (a.at < ${before.at} OR (a.at = ${before.at} AND a.id < ${before.id}))`
          }
        ORDER BY a.at DESC, a.id DESC
        LIMIT ${input.limit}
      `
      return rows.map((row) => ({
        ...row,
        id: Number(row.id),
        actor_user_id: row.actor_user_id === null ? null : Number(row.actor_user_id),
        impersonated_user_id:
          row.impersonated_user_id === null ? null : Number(row.impersonated_user_id),
      }))
    },

    /**
     * Names of the users `ids` name that still exist, with the address only of those still a
     * member of `workspaceId` (one query for a page): a former member keeps their name, never
     * their current address.
     */
    async peopleIn(
      workspaceId: number,
      ids: readonly number[]
    ): Promise<Map<number, { name: string; email: string | null }>> {
      if (ids.length === 0) return new Map()
      const rows: { id: number; name: string; email: string | null }[] = await sql`
        SELECT u.id, u.name, CASE WHEN m.user_id IS NULL THEN NULL ELSE u.email END AS email
        FROM users u
        LEFT JOIN memberships m ON m.workspace_id = ${workspaceId} AND m.user_id = u.id
        WHERE u.id IN ${sql(ids as number[])}
      `
      return new Map(rows.map((row) => [Number(row.id), { name: row.name, email: row.email }]))
    },

    /** Names of the workspace's own API keys among `ids` that still exist. */
    async apiKeyNamesIn(workspaceId: number, ids: readonly number[]): Promise<Map<number, string>> {
      if (ids.length === 0) return new Map()
      const rows: { id: number; name: string }[] = await sql`
        SELECT id, name FROM api_keys
        WHERE workspace_id = ${workspaceId} AND id IN ${sql(ids as number[])}
      `
      return new Map(rows.map((row) => [Number(row.id), row.name]))
    },

    async countImpersonationsOf(userId: number): Promise<number> {
      const [row]: { n: number | string }[] = await sql`
        SELECT COUNT(*) AS n FROM audit_log
        WHERE action = 'impersonation.started' AND target_type = 'user' AND target_id = ${String(userId)}
      `
      return Number(row?.n ?? 0)
    },

    /**
     * Deletes up to `limit` rows older than `cutoff` (strict `<`: a row exactly at the boundary is
     * kept) with an id above `afterId`, lowest ids first. One statement, no wrapping transaction —
     * `audit.prune` (apps/api/src/jobs/builtin/audit.ts) calls it in a loop, passing the last
     * batch's `lastId` back as `afterId` (a keyset cursor), so each batch starts where the last
     * one stopped rather than rescanning from the first id. Returns how many rows the batch
     * touched and the highest id among them (`afterId` when none).
     */
    async deleteBefore(
      cutoff: string,
      afterId: number,
      limit: number
    ): Promise<{ count: number; lastId: number }> {
      const rows: { id: number }[] = await sql`
        DELETE FROM audit_log
        WHERE id IN (
          SELECT id FROM audit_log
          WHERE id > ${afterId} AND at < ${cutoff}
          ORDER BY id LIMIT ${limit}
        )
        RETURNING id
      `
      return batchResult(rows, afterId)
    },

    /**
     * Nulls `ip`/`user_agent` on up to `limit` rows with `from <= at < to` that still hold either,
     * with an id above `afterId`, lowest ids first. `audit.prune` passes the row cutoff as `from`
     * (it has just deleted everything older, so nothing below it is stripped first) and the
     * network-detail cutoff as `to`. Same keyset and batching contract as `deleteBefore`.
     */
    async stripNetworkBetween(
      from: string,
      to: string,
      afterId: number,
      limit: number
    ): Promise<{ count: number; lastId: number }> {
      const rows: { id: number }[] = await sql`
        UPDATE audit_log SET ip = NULL, user_agent = NULL
        WHERE id IN (
          SELECT id FROM audit_log
          WHERE id > ${afterId} AND at >= ${from} AND at < ${to}
            AND (ip IS NOT NULL OR user_agent IS NOT NULL)
          ORDER BY id LIMIT ${limit}
        )
        RETURNING id
      `
      return batchResult(rows, afterId)
    },

    /**
     * Oldest first (`at`, then `id` to break ties), emails joined as of now —
     * `admin.audit.export`'s own rows, read-only like every query here but
     * `deleteBefore`/`stripNetworkBetween`. The handler passes `limit: cap + 1`: a result over the
     * cap means the range matched too many rows (one query rather than a `COUNT(*)` first and a
     * second, separate select — which could otherwise disagree if a row landed in between).
     */
    async listForExport(input: {
      fromIso: string
      toExclusiveIso: string
      actorId?: number
      targetType?: string
      targetId?: string
      limit: number
    }): Promise<AuditDetailRow[]> {
      const rows: AuditDetailRow[] = await sql`
        SELECT a.*, actor.email AS actor_email, imp.email AS impersonated_email
        FROM audit_log a
        LEFT JOIN users actor ON actor.id = a.actor_user_id
        LEFT JOIN users imp ON imp.id = a.impersonated_user_id
        WHERE a.at >= ${input.fromIso} AND a.at < ${input.toExclusiveIso}
        ${input.actorId === undefined ? sql`` : sql`AND a.actor_user_id = ${input.actorId}`}
        ${targetFilter(input.targetType, input.targetId)}
        ORDER BY a.at ASC, a.id ASC
        LIMIT ${input.limit}
      `
      return rows
    },
  }
}
