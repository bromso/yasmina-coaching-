import type { SQL } from "bun"
import { normalizeEmail } from "./users"

export type TokenPurpose =
  | "password_reset"
  | "email_verify"
  | "magic_link"
  | "two_factor_challenge"
  | "passkey_challenge"
  | "email_change"
  | "email_change_cancel"
  | "email_change_revert"

/** A passkey challenge's flow: `register` is bound to `userId` (the signed-in caller);
 * `authenticate` is not — the credential, once looked up, names the user. Every other purpose
 * leaves this null. */
export type PasskeyCeremony = "register" | "authenticate"

export function tokensQueries(sql: SQL) {
  return {
    async create(input: {
      /** Null for a magic link to an email that has no account yet, or a passkey_challenge for
       * `authenticate` (discoverable: no user is known until the credential is looked up). */
      userId: number | null
      purpose: TokenPurpose
      tokenHash: string
      expiresAt: string
      /** The address this token carries: a magic link's pre-account address, `email_change`'s new
       * address, or `email_change_revert`'s old one. Null for every other purpose, including
       * `email_change_cancel` (bound to `userId` alone). */
      email?: string | null
      /** Only meaningful for `passkey_challenge`; left null for every other purpose. */
      ceremony?: PasskeyCeremony | null
      /** Only `email_change_revert`: when the change it undoes was requested (its rollback's
       * cutoff). Null for every other purpose. */
      requestedAt?: string | null
    }): Promise<void> {
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, email, ceremony, requested_at)
        VALUES (${input.userId}, ${input.purpose}, ${input.tokenHash}, ${input.expiresAt}, ${new Date().toISOString()}, ${input.email == null ? null : normalizeEmail(input.email)}, ${input.ceremony ?? null}, ${input.requestedAt ?? null})
      `
    },

    /**
     * Marks the token consumed and returns its owner, email, creation time, (for a
     * `passkey_challenge`) ceremony and (for an `email_change_revert`) the change's request time,
     * only if it matches the purpose, is unused and unexpired.
     */
    async consume(
      tokenHash: string,
      purpose: TokenPurpose,
      at: string
    ): Promise<
      | {
          userId: number | null
          email: string | null
          createdAt: string
          ceremony: PasskeyCeremony | null
          requestedAt: string | null
        }
      | undefined
    > {
      const rows: Array<{
        user_id: number | null
        email: string | null
        created_at: string
        ceremony: PasskeyCeremony | null
        requested_at: string | null
      }> = await sql`
          UPDATE tokens SET consumed_at = ${at}
          WHERE token_hash = ${tokenHash} AND purpose = ${purpose} AND consumed_at IS NULL AND expires_at > ${at}
          RETURNING user_id, email, created_at, ceremony, requested_at
        `
      return (
        rows[0] && {
          userId: rows[0].user_id,
          email: rows[0].email,
          createdAt: rows[0].created_at,
          ceremony: rows[0].ceremony,
          requestedAt: rows[0].requested_at,
        }
      )
    },

    /**
     * Like `consume`, but leaves the token alone: for a 2FA challenge, a wrong code must not burn
     * the attempt before the limiter has had its say.
     */
    async peek(
      tokenHash: string,
      purpose: TokenPurpose,
      at: string
    ): Promise<{ userId: number | null } | undefined> {
      const [row]: Array<{ user_id: number | null }> = await sql`
        SELECT user_id FROM tokens
        WHERE token_hash = ${tokenHash} AND purpose = ${purpose} AND consumed_at IS NULL AND expires_at > ${at}
      `
      return row && { userId: row.user_id }
    },

    /** The user's newest live token of `purpose` (unused, unexpired): its address and expiry. */
    async latestLive(
      userId: number,
      purpose: TokenPurpose,
      at: string
    ): Promise<{ email: string | null; expiresAt: string } | undefined> {
      const [row]: Array<{ email: string | null; expires_at: string }> = await sql`
        SELECT email, expires_at FROM tokens
        WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL AND expires_at > ${at}
        ORDER BY id DESC LIMIT 1
      `
      return row && { email: row.email, expiresAt: row.expires_at }
    },

    /** Burns every outstanding token of one purpose for a user. */
    async invalidateForUser(userId: number, purpose: TokenPurpose, at: string): Promise<void> {
      await sql`
        UPDATE tokens SET consumed_at = ${at}
        WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
      `
    },

    /**
     * Burns the user's outstanding tokens of one purpose issued after the token `tokenHash` (by
     * row id, so one issued in the same millisecond is still ordered). Older ones are left alone.
     */
    async invalidateForUserAfter(
      userId: number,
      purpose: TokenPurpose,
      tokenHash: string,
      at: string
    ): Promise<void> {
      await sql`
        UPDATE tokens SET consumed_at = ${at}
        WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
          AND id > (SELECT id FROM tokens WHERE token_hash = ${tokenHash})
      `
    },

    /** Burns every outstanding token of one purpose addressed to an email (no account yet). */
    async invalidateForEmail(email: string, purpose: TokenPurpose, at: string): Promise<void> {
      await sql`
        UPDATE tokens SET consumed_at = ${at}
        WHERE email = ${normalizeEmail(email)} AND purpose = ${purpose} AND consumed_at IS NULL
      `
    },

    /** Drops rows that can never be consumed again: used or expired, any purpose. */
    async deleteStale(now: string): Promise<void> {
      await sql`DELETE FROM tokens WHERE consumed_at IS NOT NULL OR expires_at <= ${now}`
    },
  }
}
