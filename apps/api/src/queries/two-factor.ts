import type { SQL } from "bun"

export type RecoveryCodeRow = {
  id: number
  user_id: number
  code_hash: string
  used_at: string | null
  created_at: string
}

/**
 * The TOTP secret and its enabled flag live on `users` (see `UserRow`); recovery codes are their
 * own table, one row per code, `code_hash` = SHA-256 like other tokens. Callers pass only hashes
 * and timestamps — this module never sees a plaintext code or the base32 secret.
 */
/** Turns 2FA off: the secret, the enabled flag, the replay step and every recovery code. */
async function clearTwoFactor(sql: SQL, userId: number): Promise<void> {
  await sql`
    UPDATE users
    SET two_factor_secret = NULL, two_factor_enabled_at = NULL, two_factor_last_step = NULL
    WHERE id = ${userId}
  `
  await sql`DELETE FROM two_factor_recovery_codes WHERE user_id = ${userId}`
}

export function twoFactorQueries(sql: SQL) {
  return {
    /**
     * Stores a freshly-generated, unconfirmed secret: `enabled_at` and `last_step` are reset to
     * null, so an abandoned setup (or replacing one) cannot leave the account half-protected. Any
     * recovery codes from an earlier enablement go too — a pending secret has not been confirmed,
     * so codes for a secret that may never be enabled must not keep working.
     */
    async setPendingSecret(userId: number, encrypted: string): Promise<void> {
      await sql.begin(async (tx) => {
        await tx`
          UPDATE users
          SET two_factor_secret = ${encrypted}, two_factor_enabled_at = NULL, two_factor_last_step = NULL
          WHERE id = ${userId}
        `
        await tx`DELETE FROM two_factor_recovery_codes WHERE user_id = ${userId}`
      })
    },

    /**
     * Turns 2FA on and replaces the recovery codes, atomically — the caller has already verified
     * the first code against `expectedSecret`; this only records the outcome, and only if the
     * stored secret is still the one checked and the account is still not enabled (`false` means
     * a concurrent `setup` or `enable` won the race, and this one must not proceed).
     *
     * `at: null` stamps the time only once the user row is locked, so the stamp follows every
     * transaction that held the row before this one — an email change requested concurrently is
     * then always ordered before it, and its undo sees this factor as added since. (Each process
     * reads its own clock: replicas must keep theirs in sync.)
     */
    async enable(
      userId: number,
      expectedSecret: string,
      at: string | null,
      recoveryCodeHashes: string[]
    ): Promise<boolean> {
      return sql.begin(async (tx) => {
        let stamp = at
        if (stamp === null) {
          await tx`UPDATE users SET two_factor_enabled_at = two_factor_enabled_at WHERE id = ${userId}`
          stamp = new Date().toISOString()
        }
        const rows: Array<{ id: number }> = await tx`
          UPDATE users SET two_factor_enabled_at = ${stamp}
          WHERE id = ${userId}
            AND two_factor_secret = ${expectedSecret}
            AND two_factor_enabled_at IS NULL
          RETURNING id
        `
        if (rows.length === 0) return false
        await replaceCodes(tx, userId, recoveryCodeHashes)
        return true
      })
    },

    /** Clears the secret, the enabled flag, the replay step and every recovery code. */
    async disable(userId: number): Promise<void> {
      await sql.begin((tx) => clearTwoFactor(tx, userId))
    },

    /** `disable`'s statements without its own transaction, for a caller already inside one (on
     * `tx`) that has locked the user row first. */
    async disableInTransaction(userId: number): Promise<void> {
      await clearTwoFactor(sql, userId)
    },

    /**
     * The replay guard: accepts a step only when it is strictly greater than the last one
     * accepted. `false` means another request already advanced past it — treat the code as wrong.
     */
    async setLastStep(userId: number, step: number): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE users SET two_factor_last_step = ${step}
        WHERE id = ${userId} AND (two_factor_last_step IS NULL OR two_factor_last_step < ${step})
        RETURNING id
      `
      return rows.length > 0
    },

    /** Replaces the whole set of recovery codes (regeneration), atomically. */
    async replaceRecoveryCodes(userId: number, hashes: string[]): Promise<void> {
      await sql.begin(async (tx) => {
        await replaceCodes(tx, userId, hashes)
      })
    },

    /** Read-only: whether `hash` is one of the user's unused recovery codes. */
    async findUnusedRecoveryCode(userId: number, hash: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        SELECT id FROM two_factor_recovery_codes
        WHERE user_id = ${userId} AND code_hash = ${hash} AND used_at IS NULL
      `
      return rows.length > 0
    },

    /** Single-use: marks a code consumed only if it was still unused. `false` means it was not. */
    async useRecoveryCode(userId: number, hash: string, at: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE two_factor_recovery_codes SET used_at = ${at}
        WHERE user_id = ${userId} AND code_hash = ${hash} AND used_at IS NULL
        RETURNING id
      `
      return rows.length > 0
    },

    async recoveryCodesLeft(userId: number): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`
        SELECT COUNT(*) AS n FROM two_factor_recovery_codes
        WHERE user_id = ${userId} AND used_at IS NULL
      `
      return Number(row?.n ?? 0)
    },
  }
}

/** Delete-then-insert in one transaction, shared by `enable` and `replaceRecoveryCodes`. */
async function replaceCodes(tx: SQL, userId: number, hashes: string[]): Promise<void> {
  await tx`DELETE FROM two_factor_recovery_codes WHERE user_id = ${userId}`
  const createdAt = new Date().toISOString()
  for (const hash of hashes) {
    await tx`
      INSERT INTO two_factor_recovery_codes (user_id, code_hash, created_at)
      VALUES (${userId}, ${hash}, ${createdAt})
    `
  }
}
