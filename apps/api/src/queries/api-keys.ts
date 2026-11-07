import type { SQL } from "bun"

/** One `api_keys` row. `secret_hash` never leaves the api: `toApiKeySummary` drops it. */
export type ApiKeyRow = {
  id: number
  workspace_id: number
  name: string
  /** The 8 base62 characters after `bb_live_`: the lookup key, unique across every workspace. */
  prefix: string
  /** SHA-256 hex of the whole key. */
  secret_hash: string
  /** JSON array text of `API_SCOPES` values. */
  scopes: string
  /** No foreign key: may name a user who left the workspace or whose account was purged. */
  created_by: number | null
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

/** A row for the workspace's own list: the creator's current name (null once the account is gone)
 * and whether they are still a member. */
export type ApiKeyListRow = ApiKeyRow & {
  creator_name: string | null
  creator_is_member: number | string | boolean
}

/** `INTEGER` ids come back as strings from Postgres in some shapes; keep callers on numbers. */
const toRow = <T extends ApiKeyRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  workspace_id: Number(row.workspace_id),
  created_by: row.created_by === null ? null : Number(row.created_by),
})

export function apiKeysQueries(sql: SQL) {
  return {
    async create(input: {
      workspaceId: number
      name: string
      prefix: string
      secretHash: string
      scopes: readonly string[]
      createdBy: number
      createdAt: string
      expiresAt: string | null
    }): Promise<ApiKeyRow> {
      const [row]: ApiKeyRow[] = await sql`
        INSERT INTO api_keys (workspace_id, name, prefix, secret_hash, scopes, created_by, created_at, expires_at)
        VALUES (${input.workspaceId}, ${input.name}, ${input.prefix}, ${input.secretHash},
          ${JSON.stringify(input.scopes)}, ${input.createdBy}, ${input.createdAt}, ${input.expiresAt})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return toRow(row)
    },

    /** Every key of the workspace, newest first, revoked and expired ones included. */
    async listForWorkspace(workspaceId: number): Promise<ApiKeyListRow[]> {
      const rows: ApiKeyListRow[] = await sql`
        SELECT k.*, u.name AS creator_name,
          CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS creator_is_member
        FROM api_keys k
        LEFT JOIN users u ON u.id = k.created_by
        LEFT JOIN memberships m ON m.workspace_id = k.workspace_id AND m.user_id = k.created_by
        WHERE k.workspace_id = ${workspaceId}
        ORDER BY k.created_at DESC, k.id DESC
      `
      return rows.map(toRow)
    },

    /** One of the workspace's own keys, with its creator — undefined for another workspace's id. */
    async findInWorkspace(id: number, workspaceId: number): Promise<ApiKeyListRow | undefined> {
      const [row]: ApiKeyListRow[] = await sql`
        SELECT k.*, u.name AS creator_name,
          CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END AS creator_is_member
        FROM api_keys k
        LEFT JOIN users u ON u.id = k.created_by
        LEFT JOIN memberships m ON m.workspace_id = k.workspace_id AND m.user_id = k.created_by
        WHERE k.id = ${id} AND k.workspace_id = ${workspaceId}
      `
      return row && toRow(row)
    },

    /** The one way `/v1` resolves a presented key: by its prefix, then a constant-time hash
     * compare (`verifyApiKey`) on the row this returns. */
    async findByPrefix(prefix: string): Promise<ApiKeyRow | undefined> {
      const [row]: ApiKeyRow[] = await sql`SELECT * FROM api_keys WHERE prefix = ${prefix}`
      return row && toRow(row)
    },

    /** Keys that are neither revoked nor expired at `now` (ISO): what the cap counts. */
    async countLive(workspaceId: number, now: string): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`
        SELECT COUNT(*) AS n FROM api_keys
        WHERE workspace_id = ${workspaceId} AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ${now})
      `
      return Number(row?.n ?? 0)
    },

    /** Stamps `revoked_at` on one of the workspace's own keys that is not revoked yet; false when
     * there is no such key or it already was (its first `revoked_at` is kept). */
    async revoke(id: number, workspaceId: number, at: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE api_keys SET revoked_at = ${at}
        WHERE id = ${id} AND workspace_id = ${workspaceId} AND revoked_at IS NULL
        RETURNING id
      `
      return rows.length > 0
    },

    /** `/v1`'s use stamp (throttled by the caller). */
    async touchLastUsed(id: number, at: string): Promise<void> {
      await sql`UPDATE api_keys SET last_used_at = ${at} WHERE id = ${id}`
    },
  }
}
