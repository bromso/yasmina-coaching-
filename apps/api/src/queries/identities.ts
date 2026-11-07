import type { SQL } from "bun"

export type ProviderId = "google" | "github" | "apple"

export type IdentityRow = {
  id: number
  user_id: number
  provider: ProviderId
  provider_user_id: string
  email: string | null
  created_at: string
}

/**
 * A provider's user id linked to one of ours; (provider, provider_user_id) is unique, and so is
 * (user_id, provider): one identity per provider per user.
 */
export function identitiesQueries(sql: SQL) {
  return {
    async create(input: {
      userId: number
      provider: ProviderId
      providerUserId: string
      email: string | null
    }): Promise<void> {
      await sql`
        INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
        VALUES (${input.userId}, ${input.provider}, ${input.providerUserId}, ${input.email}, ${new Date().toISOString()})
      `
    },

    async findByProviderUser(
      provider: ProviderId,
      providerUserId: string
    ): Promise<IdentityRow | undefined> {
      const [row]: IdentityRow[] = await sql`
        SELECT * FROM identities WHERE provider = ${provider} AND provider_user_id = ${providerUserId}
      `
      return row
    },

    /** The user's identity for `provider`, if any; (user_id, provider) is unique. */
    async findForUserProvider(
      userId: number,
      provider: ProviderId
    ): Promise<IdentityRow | undefined> {
      const [row]: IdentityRow[] = await sql`
        SELECT * FROM identities WHERE user_id = ${userId} AND provider = ${provider}
      `
      return row
    },

    async listForUser(userId: number): Promise<IdentityRow[]> {
      return sql`SELECT * FROM identities WHERE user_id = ${userId} ORDER BY created_at, id`
    },

    async countForUser(userId: number): Promise<number> {
      const [row]: Array<{ n: number | string }> =
        await sql`SELECT COUNT(*) AS n FROM identities WHERE user_id = ${userId}`
      return Number(row?.n ?? 0)
    },

    /** Removes every identity linked to the user. */
    async deleteAllForUser(userId: number): Promise<void> {
      await sql`DELETE FROM identities WHERE user_id = ${userId}`
    },

    /** Removes the identities linked at or after `since` (an ISO time); returns how many. */
    async deleteForUserSince(userId: number, since: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM identities WHERE user_id = ${userId} AND created_at >= ${since} RETURNING id
      `
      return rows.length
    },

    /** True when a row was removed. */
    async deleteForUser(userId: number, provider: ProviderId): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM identities WHERE user_id = ${userId} AND provider = ${provider} RETURNING id
      `
      return rows.length > 0
    },
  }
}
