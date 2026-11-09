import type { SQL } from "bun"
import { applicationsQueries, type ExportedApplicationRow } from "./applications"
import { bookingQueries, type ExportedBookingRow } from "./booking"
import {
  type NotificationPreferenceRow,
  notificationPreferencesQueries,
} from "./notification-preferences"
import { type ExportedNotificationRow, notificationsQueries } from "./notifications"

/**
 * Everything `privacy.export` puts in the file, read with explicit column lists so no secret can
 * ride along: never `password_hash`, `two_factor_secret`, a recovery-code, session, token or
 * invitation token hash. Impersonation sessions are left out (the admin's device, not the user's).
 * The audit log holds the rows the user wrote, those written while they were impersonated and
 * those whose target is the user (an admin's impersonation, session revocation, 2FA reset).
 */
export type ExportData = {
  profile: {
    id: number
    email: string
    name: string
    locale: string | null
    created_at: string
    email_verified_at: string | null
    two_factor_enabled_at: string | null
    has_password: boolean
    avatar_key: string | null
    deletion_scheduled_at: string | null
    /** Never the reason or `suspended_by` — both stay out of the export, admin-internal only. */
    suspended_at: string | null
    suspended_until: string | null
  }
  identities: Array<{ provider: string; email: string | null; created_at: string }>
  sessions: Array<{
    created_at: string
    last_seen_at: string
    expires_at: string
    user_agent: string | null
    ip: string | null
  }>
  workspaces: Array<{ name: string; slug: string; role: string; joined_at: string }>
  invitationsSent: Array<{
    workspace_name: string
    email: string
    role: string
    created_at: string
    expires_at: string
    accepted_at: string | null
  }>
  notes: Array<{ workspace_name: string; title: string; body: string; created_at: string }>
  /** Never the credential id, public key, counter or transports. */
  passkeys: Array<{ name: string; created_at: string; last_used_at: string | null }>
  auditLog: Array<{
    at: string
    action: string
    actor_user_id: number | null
    impersonated_user_id: number | null
    target_type: string | null
    target_id: string | null
    reason: string | null
    ip: string | null
    user_agent: string | null
    metadata: string | null
    /** The workspace the row belongs to (0029_audit_workspace); null for a platform row. */
    workspace_id: number | null
  }>
  analyticsEvents: Array<{
    name: string
    source: string
    workspace_id: number | null
    props: string
    day: string
    created_at: string
  }>
  pageviews: Array<{
    app: string
    path: string
    referrer_host: string | null
    workspace_id: number | null
    day: string
    created_at: string
  }>
  supportRequests: Array<{
    id: number
    topic: string
    email: string
    name: string | null
    message: string
    page: string | null
    status: string
    created_at: string
    resolved_at: string | null
  }>
  /**
   * Job applications sent from the account's address — only once that address is verified, since
   * applications are address-keyed and an unverified account has not proven it owns the address.
   */
  jobApplications: ExportedApplicationRow[]
  /** Coaching bookings made with the account's address — verified addresses only, like applications. */
  bookings: ExportedBookingRow[]
  /** The user's own notifications (type, display data, created and read times). */
  notifications: ExportedNotificationRow[]
  /** The email settings the user changed from their defaults (type, on/off, when). */
  notificationPreferences: NotificationPreferenceRow[]
}

export type ExportStatus = "pending" | "ready" | "expired"

export type ExportRow = {
  id: number
  user_id: number
  status: ExportStatus
  /** `exports/<userId>/<random>.json`; null until the file is written. */
  storage_key: string | null
  created_at: string
  ready_at: string | null
  expires_at: string | null
}

/** A user's data exports (`data_exports`, migration 0019). */
export function exportsQueries(sql: SQL) {
  return {
    /** A new export request, `pending` until the `privacy.export` job writes its file. */
    async create(userId: number, at: string): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO data_exports (user_id, status, created_at)
        VALUES (${userId}, 'pending', ${at})
        RETURNING id
      `
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    /** The user's most recent export, whatever its status. */
    async latest(userId: number): Promise<ExportRow | undefined> {
      const [row]: ExportRow[] = await sql`
        SELECT * FROM data_exports WHERE user_id = ${userId} ORDER BY id DESC LIMIT 1
      `
      return row
    },

    async find(id: number): Promise<ExportRow | undefined> {
      const [row]: ExportRow[] = await sql`SELECT * FROM data_exports WHERE id = ${id}`
      return row
    },

    async markReady(id: number, key: string, readyAt: string, expiresAt: string): Promise<void> {
      await sql`
        UPDATE data_exports
        SET status = 'ready', storage_key = ${key}, ready_at = ${readyAt}, expires_at = ${expiresAt}
        WHERE id = ${id}
      `
    },

    /**
     * Turns every `ready` export whose `expires_at` is before `now` into `expired`, returning each
     * one's key for `storage.delete`. The key stays on the row; `liveKeys` no longer counts it.
     */
    async expireBefore(now: string): Promise<Array<{ id: number; storageKey: string | null }>> {
      const rows: Array<{ id: number; storage_key: string | null }> = await sql`
        UPDATE data_exports SET status = 'expired'
        WHERE status = 'ready' AND expires_at < ${now}
        RETURNING id, storage_key
      `
      return rows
        .map((row) => ({ id: Number(row.id), storageKey: row.storage_key }))
        .sort((a, b) => a.id - b.id)
    },

    /**
     * Turns every `pending` export requested before `before` into `expired`: its job died (or
     * never ran), and leaving it `pending` would hide the request button for good. The job's own
     * status check means a late retry of that job does nothing.
     */
    async expirePendingBefore(before: string): Promise<number> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE data_exports SET status = 'expired'
        WHERE status = 'pending' AND created_at < ${before}
        RETURNING id
      `
      return rows.length
    },

    /** When the user last asked for an export (any status); null for never. */
    async lastRequestedAt(userId: number): Promise<string | null> {
      const [row]: Array<{ at: string | null }> = await sql`
        SELECT MAX(created_at) AS at FROM data_exports WHERE user_id = ${userId}
      `
      return row?.at ?? null
    },

    /**
     * The storage keys of every `ready` export (optionally only those starting with `prefix`), for
     * the `storage.sweep` job: an object under `exports/` that is not in here is an orphan.
     */
    async liveKeys(prefix?: string): Promise<Set<string>> {
      const rows: Array<{ storage_key: string }> =
        prefix === undefined
          ? await sql`
              SELECT storage_key FROM data_exports
              WHERE status = 'ready' AND storage_key IS NOT NULL
            `
          : await sql`
              SELECT storage_key FROM data_exports
              WHERE status = 'ready' AND storage_key IS NOT NULL
                AND substr(storage_key, 1, ${prefix.length}) = ${prefix}
            `
      return new Set(rows.map((row) => row.storage_key))
    },

    /** The user's data for the export file; undefined when the user row is gone. */
    async dataFor(userId: number): Promise<ExportData | undefined> {
      const [user]: Array<Omit<ExportData["profile"], "has_password"> & { has_password: unknown }> =
        await sql`
          SELECT id, email, name, locale, created_at, email_verified_at, two_factor_enabled_at,
            CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS has_password,
            avatar_key, deletion_scheduled_at, suspended_at, suspended_until
          FROM users WHERE id = ${userId}
        `
      if (!user) return undefined
      const identities: ExportData["identities"] = await sql`
        SELECT provider, email, created_at FROM identities WHERE user_id = ${userId} ORDER BY id
      `
      const sessions: ExportData["sessions"] = await sql`
        SELECT created_at, last_seen_at, expires_at, user_agent, ip FROM sessions
        WHERE user_id = ${userId} AND impersonated_by IS NULL ORDER BY id
      `
      const workspaces: ExportData["workspaces"] = await sql`
        SELECT w.name, w.slug, m.role, m.created_at AS joined_at
        FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ${userId} ORDER BY w.id
      `
      const invitationsSent: ExportData["invitationsSent"] = await sql`
        SELECT w.name AS workspace_name, i.email, i.role, i.created_at, i.expires_at, i.accepted_at
        FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
        WHERE i.invited_by = ${userId} ORDER BY i.id
      `
      const notes: ExportData["notes"] = await sql`
        SELECT w.name AS workspace_name, n.title, n.body, n.created_at
        FROM notes n JOIN workspaces w ON w.id = n.workspace_id
        WHERE n.user_id = ${userId} ORDER BY n.id
      `
      // Never the credential id, public key, counter or transports — those columns stay out of
      // the SELECT entirely, like every other secret this export must not carry.
      const passkeys: ExportData["passkeys"] = await sql`
        SELECT name, created_at, last_used_at FROM passkeys WHERE user_id = ${userId} ORDER BY id
      `
      const auditLog: ExportData["auditLog"] = await sql`
        SELECT at, action, actor_user_id, impersonated_user_id, target_type, target_id, reason,
          ip, user_agent, metadata, workspace_id
        FROM audit_log
        WHERE actor_user_id = ${userId} OR impersonated_user_id = ${userId}
          OR (target_type = 'user' AND target_id = ${String(userId)})
        ORDER BY id
      `
      const analyticsEvents: ExportData["analyticsEvents"] = await sql`
        SELECT name, source, workspace_id, props, day, created_at FROM analytics_events
        WHERE user_id = ${userId} ORDER BY id
      `
      const pageviews: ExportData["pageviews"] = await sql`
        SELECT app, path, referrer_host, workspace_id, day, created_at FROM analytics_pageviews
        WHERE user_id = ${userId} ORDER BY id
      `
      const supportRequests: ExportData["supportRequests"] = await sql`
        SELECT id, topic, email, name, message, page, status, created_at, resolved_at
        FROM support_requests WHERE user_id = ${userId} ORDER BY id
      `
      const jobApplications =
        user.email_verified_at === null ? [] : await applicationsQueries(sql).forEmail(user.email)
      const bookings =
        user.email_verified_at === null ? [] : await bookingQueries(sql).forEmail(user.email)
      const notifications = await notificationsQueries(sql).forExport(userId)
      const notificationPreferences = await notificationPreferencesQueries(sql).list(userId)
      return {
        profile: { ...user, id: Number(user.id), has_password: Number(user.has_password) === 1 },
        identities,
        sessions,
        workspaces,
        invitationsSent,
        notes,
        passkeys,
        auditLog,
        analyticsEvents,
        pageviews,
        supportRequests,
        jobApplications,
        bookings,
        notifications,
        notificationPreferences,
      }
    },
  }
}
