import type { Role } from "@repo/api-contract"
import { inviteDomainAllowed } from "@repo/api-contract/invite-domains"
import type { SQL } from "bun"

export type { Role }
export type WorkspaceRow = {
  id: number
  name: string
  slug: string
  created_by: number | null
  created_at: string
  /** The storage key of the workspace logo; null for none. */
  logo_key: string | null
  /** 0/1 as stored (the repo's boolean pattern); read it through `requiresTwoFactor`. */
  require_two_factor: number | string | boolean
  /** A JSON array of A-label domains invitations are limited to; read it through `inviteDomainsOf`. */
  invite_domains: string
}
export type WorkspaceForUserRow = WorkspaceRow & { role: Role; member_count: number }

/** Whether the workspace requires every member to have two-step verification or a passkey. */
export const requiresTwoFactor = (row: Pick<WorkspaceRow, "require_two_factor">): boolean =>
  row.require_two_factor === true || Number(row.require_two_factor) === 1

/**
 * The workspace's invitation domain allowlist (empty = any address), or null when the stored
 * value is not a JSON array of strings — never written by the api, but the column gates who may
 * join, so it fails closed: every enforcing caller treats null as "allow no address" (and records
 * the failure), never as the empty, allow-all list. Only display (`workspaces.security.get`) may
 * show null as an empty list.
 */
export function inviteDomainsOf(row: Pick<WorkspaceRow, "invite_domains">): string[] | null {
  try {
    const value: unknown = JSON.parse(row.invite_domains)
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null
  } catch {
    return null
  }
}

/** `inviteDomainAllowed`, failing closed: an unreadable list (null) allows no address. */
export const inviteDomainAllowedUnder = (domains: string[] | null, address: string): boolean =>
  domains !== null && inviteDomainAllowed(domains, address)

/** The `recordFailure` message for an unreadable list (logged with the workspace id only). */
export const INVITE_DOMAINS_UNREADABLE = "invite_domains unreadable"

export function workspacesQueries(sql: SQL) {
  return {
    async create(input: { name: string; slug: string; createdBy: number }): Promise<WorkspaceRow> {
      const [row]: WorkspaceRow[] = await sql`
        INSERT INTO workspaces (name, slug, created_by, created_at)
        VALUES (${input.name}, ${input.slug}, ${input.createdBy}, ${new Date().toISOString()})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return row
    },
    /**
     * Takes the workspace row's write lock for the rest of the caller's transaction (a no-op
     * update, portable to SQLite, where the transaction already holds the write lock) and says
     * whether the row exists. Every writer that can remove an owner — a leave, a removal, a
     * demotion, a transfer, the account purge — takes it first, so on Postgres (READ COMMITTED)
     * two of them serialise and the second's owner count sees the first's committed result:
     * without it each counts the other's owner as still there and both can leave the workspace
     * ownerless. Lock order: the user row first where a path takes one, then workspaces in
     * ascending id; no path may lock a workspace and then a user row. (`SET name = name`, not
     * `id = id`: Postgres refuses any update of an identity column.)
     */
    async lockForOwnership(id: number): Promise<boolean> {
      const rows: Array<{ id: number }> =
        await sql`UPDATE workspaces SET name = name WHERE id = ${id} RETURNING id`
      return rows.length > 0
    },
    async find(id: number): Promise<WorkspaceRow | undefined> {
      const rows: WorkspaceRow[] = await sql`SELECT * FROM workspaces WHERE id = ${id}`
      return rows[0]
    },
    async slugExists(slug: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`
      return rows.length > 0
    },
    /**
     * Sets the two-step requirement; false (nothing written) when it already had that value. One
     * conditional UPDATE, so of two concurrent identical changes only one writes — and only that
     * one audits and mails.
     */
    async setRequireTwoFactor(id: number, on: boolean): Promise<boolean> {
      const value = on ? 1 : 0
      const rows: Array<{ id: number }> = await sql`
        UPDATE workspaces SET require_two_factor = ${value}
        WHERE id = ${id} AND require_two_factor <> ${value} RETURNING id
      `
      return rows.length > 0
    },
    /** Replaces the invitation domain allowlist (already normalised, as a JSON array). */
    async setInviteDomains(id: number, domains: readonly string[]): Promise<void> {
      await sql`UPDATE workspaces SET invite_domains = ${JSON.stringify(domains)} WHERE id = ${id}`
    },
    async rename(id: number, name: string): Promise<void> {
      await sql`UPDATE workspaces SET name = ${name} WHERE id = ${id}`
    },
    /** Removes the workspace and everything inside it (explicitly — SQLite may not enforce FKs). */
    async delete(id: number): Promise<void> {
      await sql`DELETE FROM notes WHERE workspace_id = ${id}`
      await sql`DELETE FROM invitations WHERE workspace_id = ${id}`
      await sql`DELETE FROM api_keys WHERE workspace_id = ${id}`
      await sql`
        DELETE FROM webhook_deliveries
        WHERE endpoint_id IN (SELECT id FROM webhook_endpoints WHERE workspace_id = ${id})
      `
      await sql`DELETE FROM webhook_endpoints WHERE workspace_id = ${id}`
      await sql`DELETE FROM billing_subscriptions WHERE workspace_id = ${id}`
      await sql`DELETE FROM billing_customers WHERE workspace_id = ${id}`
      await sql`DELETE FROM memberships WHERE workspace_id = ${id}`
      await sql`DELETE FROM workspaces WHERE id = ${id}`
    },
    /**
     * Sets (or clears) the logo key, returning the previous one so the caller can delete it. Run
     * it inside the caller's transaction (the logo routes write the activity row in the same
     * one): the no-op update locks the row first, so two concurrent swaps cannot both read the
     * same previous key.
     */
    async setLogoKey(id: number, key: string | null): Promise<string | null> {
      await sql`UPDATE workspaces SET logo_key = logo_key WHERE id = ${id}`
      const [row] = await sql`SELECT logo_key FROM workspaces WHERE id = ${id}`
      await sql`UPDATE workspaces SET logo_key = ${key} WHERE id = ${id}`
      return (row?.logo_key as string | null) ?? null
    },
    /** Whether any workspace currently holds this logo key. */
    async hasLogoKey(key: string): Promise<boolean> {
      const [row] = await sql`SELECT 1 AS found FROM workspaces WHERE logo_key = ${key} LIMIT 1`
      return row !== undefined
    },
    /** Which of `keys` some workspace holds as its logo: one query for a whole page of keys. */
    async logoKeysIn(keys: readonly string[]): Promise<Set<string>> {
      if (keys.length === 0) return new Set()
      const rows: { logo_key: string }[] =
        await sql`SELECT logo_key FROM workspaces WHERE logo_key IN ${sql(keys as string[])}`
      return new Set(rows.map((row) => row.logo_key))
    },
    async memberCount(id: number): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ${id}`
      return Number(row?.n ?? 0)
    },
    /**
     * Workspaces with other members where the user is the only owner, oldest first: deleting the
     * account would leave them ownerless, so `account.delete` and the purge refuse.
     */
    async soleOwnedShared(userId: number): Promise<Array<{ id: number; name: string }>> {
      const rows: Array<{ id: number; name: string }> = await sql`
        SELECT w.id, w.name FROM workspaces w
        JOIN memberships m ON m.workspace_id = w.id AND m.user_id = ${userId} AND m.role = 'owner'
        WHERE (SELECT COUNT(*) FROM memberships o WHERE o.workspace_id = w.id AND o.role = 'owner') = 1
          AND (SELECT COUNT(*) FROM memberships c WHERE c.workspace_id = w.id) > 1
        ORDER BY w.id
      `
      return rows.map((row) => ({ id: Number(row.id), name: row.name }))
    },
    /**
     * Workspaces with other members where the user is an owner (alone or not), ascending id: the
     * purge locks them (`lockForOwnership`) and re-counts their owners after removing the user,
     * so a concurrent leave cannot orphan one.
     */
    async ownedShared(userId: number): Promise<number[]> {
      const rows: Array<{ id: number }> = await sql`
        SELECT w.id FROM workspaces w
        JOIN memberships m ON m.workspace_id = w.id AND m.user_id = ${userId} AND m.role = 'owner'
        WHERE (SELECT COUNT(*) FROM memberships c WHERE c.workspace_id = w.id) > 1
        ORDER BY w.id
      `
      return rows.map((row) => Number(row.id))
    },
    /** Workspaces whose only member is the user, oldest first: the purge deletes them with it. */
    async soleMember(userId: number): Promise<WorkspaceRow[]> {
      return sql`
        SELECT w.* FROM workspaces w
        JOIN memberships m ON m.workspace_id = w.id AND m.user_id = ${userId}
        WHERE (SELECT COUNT(*) FROM memberships c WHERE c.workspace_id = w.id) = 1
        ORDER BY w.id
      `
    },
    /** The user's workspaces with their role and size, oldest first. */
    async listForUser(userId: number): Promise<WorkspaceForUserRow[]> {
      const rows: Array<WorkspaceRow & { role: Role; member_count: number | string }> = await sql`
        SELECT w.*, m.role,
          (SELECT COUNT(*) FROM memberships c WHERE c.workspace_id = w.id) AS member_count
        FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
        WHERE m.user_id = ${userId} ORDER BY w.id
      `
      return rows.map((r) => ({ ...r, member_count: Number(r.member_count) }))
    },
  }
}
