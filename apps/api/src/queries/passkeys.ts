import type { SQL } from "bun"

export type PasskeyRow = {
  id: number
  user_id: number
  /** Base64url, unique across every account — the lookup key on sign-in. */
  credential_id: string
  /** Base64url COSE public key; never a private key or any other secret material. */
  public_key: string
  counter: number
  /** JSON array of the authenticator's own transport hints (`"internal"`, `"hybrid"`, …), or
   * null when it reported none. */
  transports: string | null
  name: string
  created_at: string
  last_used_at: string | null
}

/**
 * `counter` is BIGINT on Postgres (the WebAuthn sign count is a uint32, past int4's range), which
 * Bun returns as a string; every row read goes through here so callers always see a number (a
 * `"0"` would otherwise fail `counterAdvances`'s `stored === 0`).
 */
function toRow(row: PasskeyRow): PasskeyRow {
  return { ...row, counter: Number(row.counter) }
}

/** No foreign key on `user_id`, like every other user-owned table here: `users.purge` and
 * `deleteAllForUser` delete the rows explicitly, so both engines end in the same state. */
export function passkeysQueries(sql: SQL) {
  return {
    async create(input: {
      userId: number
      credentialId: string
      publicKey: string
      counter: number
      transports: string | null
      name: string
    }): Promise<PasskeyRow> {
      const [row]: PasskeyRow[] = await sql`
        INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, name, created_at)
        VALUES (${input.userId}, ${input.credentialId}, ${input.publicKey}, ${input.counter}, ${input.transports}, ${input.name}, ${new Date().toISOString()})
        RETURNING *
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return toRow(row)
    },

    /** Oldest first — the order the account's own list shows them in. */
    async listForUser(userId: number): Promise<PasskeyRow[]> {
      const rows: PasskeyRow[] =
        await sql`SELECT * FROM passkeys WHERE user_id = ${userId} ORDER BY created_at, id`
      return rows.map(toRow)
    },

    /** The one way sign-in resolves a credential to its owner — never by user id first. */
    async findByCredentialId(credentialId: string): Promise<PasskeyRow | undefined> {
      const [row]: PasskeyRow[] =
        await sql`SELECT * FROM passkeys WHERE credential_id = ${credentialId}`
      return row && toRow(row)
    },

    async countForUser(userId: number): Promise<number> {
      const [row]: Array<{ n: number | string }> =
        await sql`SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ${userId}`
      return Number(row?.n ?? 0)
    },

    /** Renames one of `userId`'s own passkeys; false for a wrong id or another user's. */
    async rename(id: number, userId: number, name: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE passkeys SET name = ${name} WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `
      return rows.length > 0
    },

    /** Deletes one of `userId`'s own passkeys; false for a wrong id or another user's. */
    async delete(id: number, userId: number): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM passkeys WHERE id = ${id} AND user_id = ${userId} RETURNING id
      `
      return rows.length > 0
    },

    /** Every passkey for a user, unconditionally: admin removal and `users.purge`. */
    async deleteAllForUser(userId: number): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        DELETE FROM passkeys WHERE user_id = ${userId} RETURNING id
      `
      return rows.length
    },

    /**
     * After a verified sign-in: the authenticator's new counter and `last_used_at`, written only
     * while the stored counter is still `expected` (the value the sign-in checked against). A
     * concurrent sign-in that moved it first wins; this one answers false and is refused.
     */
    async recordUse(id: number, expected: number, counter: number, at: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE passkeys SET counter = ${counter}, last_used_at = ${at}
        WHERE id = ${id} AND counter = ${expected}
        RETURNING id
      `
      return rows.length > 0
    },
  }
}
