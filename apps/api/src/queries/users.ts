import type { SQL } from "bun"

export type UserRow = {
  id: number
  email: string
  /** Null for an account that signs in only with a provider or a magic link. */
  password_hash: string | null
  name: string
  created_at: string
  updated_at: string
  email_verified_at: string | null
  /** The TOTP secret, encrypted at rest (`v1:<iv b64>:<ciphertext b64>`); null until setup starts. */
  two_factor_secret: string | null
  /** Null = 2FA off; every sign-in path checks this, not the secret. */
  two_factor_enabled_at: string | null
  /** Last accepted TOTP time step, for replay protection. */
  two_factor_last_step: number | null
  /** The storage key of the profile avatar; null for none. */
  avatar_key: string | null
  /** The chosen language (`en`, `sv`, …); null = never chosen, read as English. */
  locale: string | null
  /** When the user's sessions were last ended; a two-factor challenge older than it is dead. */
  sessions_revoked_at: string | null
  /** When the account is purged (a requested deletion's grace period ends); null = not scheduled. */
  deletion_scheduled_at: string | null
  /** When an admin suspended the account; null = not suspended. See `isSuspended`. */
  suspended_at: string | null
  /** When the suspension lifts itself; null = indefinite. Ignored while `suspended_at` is null. */
  suspended_until: string | null
  /** The admin's internal reason; never shown to the suspended user or exported. */
  suspension_reason: string | null
  /** The admin who suspended the account; null once that admin's own account is purged. */
  suspended_by: number | null
}

/**
 * Whether `user` is suspended right now: `suspended_at` is set, and `suspended_until` is either
 * null (indefinite) or strictly later than `now` — at exactly `until`, the suspension has lifted.
 * Pure and never written back: nothing clears an expired suspension's columns on its own, so a row
 * can read as "not suspended" here while `admin.users.unsuspend` still has columns to clear.
 */
export function isSuspended(
  user: Pick<UserRow, "suspended_at" | "suspended_until">,
  now: Date | string
): boolean {
  if (user.suspended_at === null) return false
  if (user.suspended_until === null) return true
  const nowMs = typeof now === "string" ? Date.parse(now) : now.getTime()
  return Date.parse(user.suspended_until) > nowMs
}

/** The email is already registered: the unique index caught what a pre-check could race past. */
export class EmailTakenError extends Error {
  constructor() {
    super("email already registered")
    this.name = "EmailTakenError"
  }
}

// SQLite: "UNIQUE constraint failed: users.email". Postgres: duplicate key … "users_email_key"
// (Bun's PostgresError carries SQLSTATE 23505 in `errno`, not `code`, so match the message).
const isEmailTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: users\.email|users_email_key/.test(error.message)

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Stamps `sessions_revoked_at`, ends every open two-step challenge, then deletes the sessions
 * (all, or all but `except`) — user row first, the lock order every session writer shares. */
async function endSessions(
  sql: SQL,
  userId: number,
  at: string,
  opts: { except?: number }
): Promise<void> {
  await sql`UPDATE users SET sessions_revoked_at = ${at} WHERE id = ${userId}`
  await sql`
    UPDATE tokens SET consumed_at = ${at}
    WHERE user_id = ${userId} AND purpose = 'two_factor_challenge' AND consumed_at IS NULL
  `
  if (opts.except === undefined) await sql`DELETE FROM sessions WHERE user_id = ${userId}`
  else await sql`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${opts.except}`
}

export function usersQueries(sql: SQL) {
  return {
    async create(input: {
      email: string
      passwordHash: string | null
      name: string
      emailVerifiedAt?: string
      /** The language the request named, stored as the new user's choice; null leaves it unset. */
      locale?: string | null
    }): Promise<UserRow> {
      const now = new Date().toISOString()
      let rows: UserRow[]
      try {
        rows = await sql`
          INSERT INTO users (email, password_hash, name, created_at, updated_at, email_verified_at, locale)
          VALUES (${normalizeEmail(input.email)}, ${input.passwordHash}, ${input.name}, ${now}, ${now}, ${input.emailVerifiedAt ?? null}, ${input.locale ?? null})
          RETURNING *
        `
      } catch (error) {
        throw isEmailTaken(error) ? new EmailTakenError() : error
      }
      const [row] = rows
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return row
    },

    async findByEmail(email: string): Promise<UserRow | undefined> {
      const [row]: UserRow[] = await sql`SELECT * FROM users WHERE email = ${normalizeEmail(email)}`
      return row
    },

    async find(id: number): Promise<UserRow | undefined> {
      const [row]: UserRow[] = await sql`SELECT * FROM users WHERE id = ${id}`
      return row
    },

    /** `passwordHash: null` clears the password (the account becomes passwordless). */
    async update(
      id: number,
      patch: { name?: string; passwordHash?: string | null }
    ): Promise<void> {
      const now = new Date().toISOString()
      if (patch.name !== undefined) {
        await sql`UPDATE users SET name = ${patch.name}, updated_at = ${now} WHERE id = ${id}`
      }
      if (patch.passwordHash !== undefined) {
        await sql`UPDATE users SET password_hash = ${patch.passwordHash}, updated_at = ${now} WHERE id = ${id}`
      }
    },

    /**
     * Sets a confirmed new address and marks it verified (the confirm link proved the mailbox).
     * The unique index is the last word: an address another account took meanwhile — including
     * one a concurrent transaction is writing — throws `EmailTakenError` (on Postgres the caller's
     * transaction is then aborted, so it must roll back).
     */
    async changeEmail(id: number, email: string, at: string): Promise<void> {
      try {
        await sql`
          UPDATE users SET email = ${normalizeEmail(email)}, email_verified_at = ${at}, updated_at = ${at}
          WHERE id = ${id}
        `
      } catch (error) {
        throw isEmailTaken(error) ? new EmailTakenError() : error
      }
    },

    async setLocale(id: number, locale: string): Promise<void> {
      const now = new Date().toISOString()
      await sql`UPDATE users SET locale = ${locale}, updated_at = ${now} WHERE id = ${id}`
    },

    /**
     * Marks the email verified, only if it was not already — the `WHERE` and the `RETURNING` run
     * as one atomic statement, so two concurrent calls for the same user can never both see
     * `true`: the loser's `UPDATE` matches zero rows. Callers that only need the row changed (the
     * unverified-account purge, always running on an account that was never verified) may ignore
     * the result.
     */
    async markEmailVerified(id: number, at: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE users SET email_verified_at = ${at}, updated_at = ${at}
        WHERE id = ${id} AND email_verified_at IS NULL
        RETURNING id
      `
      return rows.length > 0
    },

    /**
     * Ends the user's sessions (all, or all but `except`) and every open two-step challenge, and
     * stamps `sessions_revoked_at` — in one transaction, stamp first, so a concurrent
     * `auth.twoFactor.verify` either commits its session before this deletes it or sees the stamp.
     * Opens its own transaction: never call it from inside another (use `stampSessionsRevoked`).
     */
    async revokeSessions(
      userId: number,
      at: string,
      opts: { except?: number } = {}
    ): Promise<void> {
      await sql.begin((tx) => endSessions(tx, userId, at, opts))
    },

    /**
     * `revokeSessions`'s statements without its own transaction, for a caller already inside one
     * (on `tx`) that has locked the user row first — the stamp is the same row, so the order is
     * unchanged: user row, then tokens, then sessions.
     */
    async revokeSessionsInTransaction(
      userId: number,
      at: string,
      opts: { except?: number } = {}
    ): Promise<void> {
      await endSessions(sql, userId, at, opts)
    },

    /** Only the stamp, for callers already inside a transaction or that end no session. */
    async stampSessionsRevoked(userId: number, at: string): Promise<void> {
      await sql`UPDATE users SET sessions_revoked_at = ${at} WHERE id = ${userId}`
    },

    /** Takes the user row's write lock for the rest of the caller's transaction (a no-op update,
     * portable to SQLite) and returns the revocation stamp it guards. */
    async lockForSession(
      userId: number
    ): Promise<{ sessionsRevokedAt: string | null } | undefined> {
      const [row]: Array<{ sessions_revoked_at: string | null }> = await sql`
        UPDATE users SET sessions_revoked_at = sessions_revoked_at WHERE id = ${userId}
        RETURNING sessions_revoked_at
      `
      return row && { sessionsRevokedAt: row.sessions_revoked_at }
    },

    /**
     * Sets (or, on an already-suspended account, replaces) every suspension column. Call on `tx`
     * after `lockForSession` has taken the row's write lock in the same transaction.
     *
     * `suspended_at` is always bumped to `input.at`, even on a re-suspend that only changes the
     * reason: it is when the *current* terms (this reason, this `until`) took effect, not when the
     * account was first suspended — so it moves together with whichever of the two actually changed.
     */
    async suspend(
      id: number,
      input: { at: string; until: string | null; reason: string; by: number }
    ): Promise<void> {
      await sql`
        UPDATE users SET suspended_at = ${input.at}, suspended_until = ${input.until},
          suspension_reason = ${input.reason}, suspended_by = ${input.by}
        WHERE id = ${id}
      `
    },

    /** Clears every suspension column. A no-op write on an account that was never suspended. */
    async unsuspend(id: number): Promise<void> {
      await sql`
        UPDATE users SET suspended_at = NULL, suspended_until = NULL,
          suspension_reason = NULL, suspended_by = NULL
        WHERE id = ${id}
      `
    },

    /**
     * Schedules the account's deletion for `at`, only when none is scheduled, and returns the date
     * stored either way — a second request keeps (and returns) the first date.
     */
    async scheduleDeletion(id: number, at: string): Promise<string> {
      await sql`
        UPDATE users SET deletion_scheduled_at = ${at}
        WHERE id = ${id} AND deletion_scheduled_at IS NULL
      `
      const [row]: Array<{ deletion_scheduled_at: string | null }> =
        await sql`SELECT deletion_scheduled_at FROM users WHERE id = ${id}`
      if (!row?.deletion_scheduled_at) throw new Error(`no user ${id} to schedule for deletion`)
      return row.deletion_scheduled_at
    },

    async cancelDeletion(id: number): Promise<void> {
      await sql`UPDATE users SET deletion_scheduled_at = NULL WHERE id = ${id}`
    },

    /**
     * Users whose scheduled deletion is at or before `now`, oldest first (by date, then id), up
     * to `limit`. `after` is the last row of the previous page: keyset pagination, so a caller
     * that skips some users still reaches every one behind them.
     */
    async dueForDeletion(
      now: string,
      limit = 50,
      after?: { scheduledAt: string; id: number }
    ): Promise<Array<{ id: number; scheduledAt: string }>> {
      const rows: Array<{ id: number; deletion_scheduled_at: string }> =
        after === undefined
          ? await sql`
              SELECT id, deletion_scheduled_at FROM users
              WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= ${now}
              ORDER BY deletion_scheduled_at, id
              LIMIT ${limit}
            `
          : await sql`
              SELECT id, deletion_scheduled_at FROM users
              WHERE deletion_scheduled_at IS NOT NULL AND deletion_scheduled_at <= ${now}
                AND (deletion_scheduled_at > ${after.scheduledAt}
                  OR (deletion_scheduled_at = ${after.scheduledAt} AND id > ${after.id}))
              ORDER BY deletion_scheduled_at, id
              LIMIT ${limit}
            `
      return rows.map((row) => ({ id: Number(row.id), scheduledAt: row.deletion_scheduled_at }))
    },

    /*
     * Every column that references a user, from a grep of src/migrations (`user_id`, `*_by`,
     * `*_user_id`), and what `purge` does with it. Most carry no foreign key, and SQLite enforces
     * none here (no `PRAGMA foreign_keys`), so every action is an explicit statement rather than a
     * cascade — both engines end in the same state.
     *
     *   sessions.user_id                        DELETE (no FK)
     *   sessions.impersonated_by                DELETE the row (FK CASCADE on Postgres only)
     *   tokens.user_id                          DELETE (no FK); also tokens whose `email` is the
     *                                           user's (a magic link sent before the account existed)
     *   identities.user_id                      DELETE (no FK)
     *   memberships.user_id                     DELETE (FK CASCADE)
     *   two_factor_recovery_codes.user_id       DELETE (FK CASCADE)
     *   passkeys.user_id                        DELETE (no FK); the credential is useless without
     *                                           the account — any export the user requested reads
     *                                           what it needs (name, created, last used) before
     *                                           this runs, never the credential id or public key
     *   data_exports.user_id                    DELETE (no FK); keys returned for storage.delete
     *   notifications.user_id                   DELETE (no FK); the user's own inbox
     *   notification_preferences.user_id        DELETE (no FK); the user's email settings
     *   invitations.invited_by                  SET NULL (FK SET NULL); the invitation stays valid
     *   invitations.email (accepted)            DELETE where it is the user's address and
     *                                           `accepted_at` is set: a record that this address
     *                                           joined the workspace. A pending one stays valid
     *                                           (the address may still sign up and accept it)
     *   workspaces.created_by                   SET NULL (FK SET NULL); the workspace stays
     *   audit_log.actor_user_id                 SET NULL (FK SET NULL); the row is append-only
     *   audit_log.impersonated_user_id          SET NULL (FK SET NULL)
     *   analytics_pageviews.user_id             SET NULL (no FK); counts survive, de-linked
     *   analytics_events.user_id                SET NULL (no FK)
     *   support_requests.user_id                SET NULL (no FK); the request stays for support,
     *                                           de-linked
     *   support_requests.resolved_by            SET NULL (no FK); the admin who resolved it
     *   job_applications.status_changed_by      SET NULL (no FK); the admin who last set a status
     *   notes.user_id                           KEPT — the note belongs to its workspace; the
     *                                           author id then points at no user
     *   users.avatar_key                        returned for storage.delete; the row is deleted
     *   users.suspended_by (another user's row) SET NULL (no FK); a suspension this admin issued
     *                                           stays on the suspended account, just unattributed
     *   billing_customers.email                 SET NULL where it is the user's address: checkout
     *                                           stores the paying owner's own email, and the
     *                                           workspace (and its customer row) may outlive them
     *
     * Checked and holding no user reference: billing_subscriptions (keyed by workspace),
     * billing_events, telemetry_errors / telemetry_vitals (never a user id — see Telemetry),
     * jobs (no user column; a `mail.send` payload holds an address until it succeeds, then `{}`,
     * and `jobs.prune` deletes dead rows after 30 days), analytics_daily / analytics_daily_salts
     * (aggregates and salts only).
     *
     * Deliberately kept:
     *   audit_log.target_id (target_type 'user') the id as text, so the trail of what was done to
     *                                           the account (impersonations, resets) stays legible
     *   audit_log.metadata / ip / user_agent    the record of the action itself (ip/user_agent
     *                                           until `audit.prune` strips them, the row until it
     *                                           deletes it); no column links it to a user once
     *                                           the ids are nulled
     *   waitlist                                an address-keyed marketing sign-up, not the
     *                                           account; kept by ruling (it has its own lifecycle)
     *   support_requests.email / name / message the typed address and text of a request support
     *                                           may still be answering; kept like the waitlist
     *   job_applications                        address-keyed, never linked to an account id;
     *                                           `applications.prune` deletes each one (and its
     *                                           CV) six months after it was sent
     *
     * Concurrent inserts: a request racing the purge can write a row for the id after it commits.
     * A session is inert without its user row (every lookup joins or re-reads the user); an
     * identity would block its provider account, so `auth.oauth.callback` treats an identity
     * whose user is gone as unknown and deletes it.
     */
    /**
     * Deletes the user and everything linked to their id, per the inventory above, and returns the
     * storage keys it read first (the avatar, every export file) for `storage.delete`. Call it on
     * `tx.users` inside the caller's transaction, so all of it commits or none does.
     */
    async purge(
      id: number,
      _at: string
    ): Promise<{ avatarKey: string | null; exportKeys: string[] }> {
      const [user]: Array<{ email: string; avatar_key: string | null }> =
        await sql`SELECT email, avatar_key FROM users WHERE id = ${id}`
      const exports: Array<{ storage_key: string }> = await sql`
        SELECT storage_key FROM data_exports
        WHERE user_id = ${id} AND storage_key IS NOT NULL
        ORDER BY id
      `

      await sql`DELETE FROM sessions WHERE user_id = ${id} OR impersonated_by = ${id}`
      await sql`DELETE FROM tokens WHERE user_id = ${id}`
      if (user) await sql`DELETE FROM tokens WHERE email = ${user.email}`
      await sql`DELETE FROM identities WHERE user_id = ${id}`
      await sql`DELETE FROM memberships WHERE user_id = ${id}`
      await sql`DELETE FROM two_factor_recovery_codes WHERE user_id = ${id}`
      await sql`DELETE FROM passkeys WHERE user_id = ${id}`
      await sql`DELETE FROM data_exports WHERE user_id = ${id}`
      await sql`DELETE FROM notifications WHERE user_id = ${id}`
      await sql`DELETE FROM notification_preferences WHERE user_id = ${id}`
      await sql`UPDATE invitations SET invited_by = NULL WHERE invited_by = ${id}`
      // Stored normalised, like users.email, so plain equality matches every case.
      if (user)
        await sql`DELETE FROM invitations WHERE email = ${user.email} AND accepted_at IS NOT NULL`
      await sql`UPDATE workspaces SET created_by = NULL WHERE created_by = ${id}`
      await sql`UPDATE users SET suspended_by = NULL WHERE suspended_by = ${id}`
      await sql`UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = ${id}`
      await sql`UPDATE audit_log SET impersonated_user_id = NULL WHERE impersonated_user_id = ${id}`
      await sql`UPDATE analytics_pageviews SET user_id = NULL WHERE user_id = ${id}`
      await sql`UPDATE analytics_events SET user_id = NULL WHERE user_id = ${id}`
      await sql`UPDATE support_requests SET user_id = NULL WHERE user_id = ${id}`
      await sql`UPDATE support_requests SET resolved_by = NULL WHERE resolved_by = ${id}`
      await sql`UPDATE job_applications SET status_changed_by = NULL WHERE status_changed_by = ${id}`
      // Stored as the provider reported it (any case); users.email is normalised already.
      if (user)
        await sql`UPDATE billing_customers SET email = NULL WHERE lower(email) = ${user.email}`
      await sql`DELETE FROM users WHERE id = ${id}`

      return {
        avatarKey: user?.avatar_key ?? null,
        exportKeys: exports.map((row) => row.storage_key),
      }
    },

    /** Sets (or clears) the avatar key, returning the previous one so the caller can delete it. */
    async setAvatarKey(id: number, key: string | null): Promise<string | null> {
      return sql.begin(async (tx) => {
        const [row] = await tx`SELECT avatar_key FROM users WHERE id = ${id}`
        await tx`UPDATE users SET avatar_key = ${key} WHERE id = ${id}`
        return (row?.avatar_key as string | null) ?? null
      })
    },

    /** Whether any user currently holds this avatar key (a storage key is never guessed, only read back). */
    async hasAvatarKey(key: string): Promise<boolean> {
      const [row] = await sql`SELECT 1 AS found FROM users WHERE avatar_key = ${key} LIMIT 1`
      return row !== undefined
    },

    /** Which of `keys` some user holds as their avatar: one query for a whole page of keys. */
    async avatarKeysIn(keys: readonly string[]): Promise<Set<string>> {
      if (keys.length === 0) return new Set()
      const rows: { avatar_key: string }[] =
        await sql`SELECT avatar_key FROM users WHERE avatar_key IN ${sql(keys as string[])}`
      return new Set(rows.map((row) => row.avatar_key))
    },
  }
}
