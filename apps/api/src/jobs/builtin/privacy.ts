import { randomBytes } from "node:crypto"
import { ORPCError } from "@orpc/server"
import {
  EXPORT_REQUEST_INTERVAL_MS,
  EXPORT_TTL_MS,
  jobReference,
  NOTIFICATION_EMAIL,
  NOTIFICATION_EMAIL_DEFAULT,
  supportReference,
} from "@repo/api-contract"
import { DEFAULT_LOCALE, isLocale } from "@repo/i18n/locales"
import { z } from "zod"
import type { Queries } from "../../db"
import { toExportedLead } from "../../leads"
import { notifyUser } from "../../notifications"
import type { ExportData } from "../../queries/exports"
import { emitWebhookEvent } from "../../webhooks/emit"
import { assertOwnerRemains, cancelLiveSubscription, deleteWorkspaceInTx } from "../../workspaces"
import { defineJob, type JobContext } from "../define"
import { enqueueMail } from "./mail"
import { enqueueStorageDelete } from "./storage"

/** A fresh, unguessable key for an export file: `exports/<userId>/<random>.json`. */
export const newExportKey = (userId: number) =>
  `exports/${userId}/${randomBytes(16).toString("base64url")}.json`

/** A stored JSON column (`props`, `metadata`) as a value; kept as the raw text if it is not JSON. */
function parseJson(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * The audit metadata keys the export carries, per action; every other key (an admin's id such as
 * `impersonatedBy`, the acting API key's `apiKeyId`/`apiKeyName`, a key's `prefix`, a webhook's
 * `endpointId`, anything added later) stays out until it is listed here. An action missing from
 * the list (or listed with no keys) exports no metadata.
 *
 * The workspace activity actions (`WORKSPACE_ACTIVITY_ACTIONS`) carry the spec's display keys.
 * Rows written before 0029_audit_workspace (impersonation-time only) stored other keys for a few
 * of the same actions — `name` on a rename, `userId`/`role` on a member change, `workspaceId` on
 * an invitation — and those stay listed so an older row keeps its context.
 */
export const EXPORTED_AUDIT_METADATA: Readonly<Record<string, readonly string[]>> = {
  "impersonation.stopped": ["via"],
  "profile.updated": ["name"],
  "user.locale_set": ["locale"],
  "note.created": ["workspaceId"],
  "note.deleted": ["workspaceId"],
  "workspace.created": ["name"],
  "workspace.renamed": ["from", "to", "name"],
  "workspace.plan_changed": ["plan", "interval", "status"],
  "invitation.accepted": ["role"],
  "member.role_changed": ["from", "to", "userId", "role"],
  "member.removed": ["userId"],
  "invitation.created": ["email", "role", "workspaceId"],
  "invitation.revoked": ["email", "role", "workspaceId"],
  "workspace.api_key_created": ["name", "scopes"],
  "workspace.api_key_revoked": ["name", "scopes"],
  "workspace.webhook_created": ["host", "events"],
  "workspace.webhook_updated": ["host", "events"],
  "workspace.webhook_secret_rotated": ["host"],
  "workspace.webhook_deleted": ["host", "events"],
  "workspace.webhook_disabled": ["host", "events", "reason"],
  "workspace.two_factor_requirement_changed": ["enabled"],
  "workspace.invite_domains_changed": ["added", "removed"],
  "user.notification_email_changed": ["type", "email", "via"],
}

/**
 * Who a row in the export was written by, from the exported user's side: `you` (their own
 * session); `admin` (a platform superadmin — an impersonation, or an admin action on the
 * account); `workspace` (someone else in a workspace they belong to — another member, one of its
 * API keys, or the system on its behalf — acting on them, never platform staff).
 *
 * An impersonated row stays `admin` after the purge of the member it impersonated nulls
 * `impersonated_user_id`: `metadata.bySupport` (stamped by `audit()` on every impersonated row)
 * still marks it as support's, as it does for the workspace's own activity view.
 */
export function exportedAuditBy(
  row: {
    actor_user_id: number | null
    impersonated_user_id: number | null
    workspace_id: number | null
    metadata?: string | null
  },
  userId: number
): "you" | "admin" | "workspace" {
  if (row.impersonated_user_id !== null || bySupport(row.metadata ?? null)) return "admin"
  if (Number(row.actor_user_id) === userId) return "you"
  return row.workspace_id === null ? "admin" : "workspace"
}

/** Whether a row's stored metadata carries the impersonation stamp `bySupport: true`. */
function bySupport(text: string | null): boolean {
  const value = parseJson(text)
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).bySupport === true
  )
}

/** A row's stored metadata reduced to its action's allowlisted keys; null when none is left. */
export function exportedMetadata(
  action: string,
  text: string | null
): Record<string, unknown> | null {
  const allowed = EXPORTED_AUDIT_METADATA[action]
  if (!allowed) return null
  const value = parseJson(text)
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const kept = Object.fromEntries(Object.entries(value).filter(([key]) => allowed.includes(key)))
  return Object.keys(kept).length > 0 ? kept : null
}

/**
 * Audit actions whose own `reason` is never exported — unlike every other admin action's reason
 * (a two-factor reset, say, which is "the user's to see"), a suspension's internal reason must
 * reach neither the mail nor the export.
 */
const REASON_REDACTED_ACTIONS: ReadonlySet<string> = new Set([
  "user.suspended",
  "user.suspension_updated",
  "user.unsuspended",
])

/**
 * The export file's content (`format: 1`). Every field is chosen here by name from rows that were
 * themselves read by explicit column lists (`exports.dataFor`), so no secret can reach the file:
 * no password hash, TOTP secret, recovery-code, session, token or invitation token hash.
 */
export function buildExport(
  data: ExportData,
  {
    exportedAt,
    accountUrl,
    storagePublicUrl,
  }: { exportedAt: string; accountUrl: string; storagePublicUrl: string | null }
) {
  const { profile } = data
  const avatarKey = profile.avatar_key
  return {
    format: 1,
    exportedAt,
    profile: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      locale: isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE,
      createdAt: profile.created_at,
      emailVerified: profile.email_verified_at !== null,
      emailVerifiedAt: profile.email_verified_at,
      twoFactorEnabled: profile.two_factor_enabled_at !== null,
      deletionScheduledAt: profile.deletion_scheduled_at,
      // Status and dates only — never the admin's reason or who suspended the account.
      suspended:
        profile.suspended_at === null
          ? null
          : { at: profile.suspended_at, until: profile.suspended_until },
    },
    // Absolute, so the link works outside the app: the account app serves `/files/<key>` too.
    avatarUrl:
      avatarKey === null
        ? null
        : storagePublicUrl
          ? `${storagePublicUrl}/${avatarKey}`
          : `${accountUrl}/files/${avatarKey}`,
    signInMethods: {
      password: profile.has_password,
      providers: data.identities.map((row) => ({
        provider: row.provider,
        email: row.email,
        connectedAt: row.created_at,
      })),
    },
    sessions: data.sessions.map((row) => ({
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      ip: row.ip,
    })),
    workspaces: data.workspaces.map((row) => ({
      name: row.name,
      slug: row.slug,
      role: row.role,
      joinedAt: row.joined_at,
    })),
    invitationsSent: data.invitationsSent.map((row) => ({
      workspace: row.workspace_name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
    })),
    notes: data.notes.map((row) => ({
      workspace: row.workspace_name,
      title: row.title,
      body: row.body,
      createdAt: row.created_at,
    })),
    // Never the credential id, public key, counter or transports.
    passkeys: data.passkeys.map((row) => ({
      name: row.name,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    })),
    // A row where the user was impersonated, or that targets the user, was written by someone
    // else — a platform admin, or another member of one of their workspaces (`by`, see
    // exportedAuditBy): its ip and user agent are that person's, not the user's, so they stay out. Its reason (the
    // support reason for an impersonation or a 2FA reset) is the user's to see — except a
    // suspension's own reason, which is redacted like `suspended_by` above (REASON_REDACTED_ACTIONS).
    auditLog: data.auditLog.map((row) => {
      const by = exportedAuditBy(row, profile.id)
      const own = by === "you"
      return {
        at: row.at,
        action: row.action,
        by,
        workspaceId: row.workspace_id === null ? null : Number(row.workspace_id),
        targetType: row.target_type,
        targetId: row.target_id,
        reason: REASON_REDACTED_ACTIONS.has(row.action) ? null : row.reason,
        ip: own ? row.ip : null,
        userAgent: own ? row.user_agent : null,
        metadata: exportedMetadata(row.action, row.metadata),
      }
    }),
    analyticsEvents: data.analyticsEvents.map((row) => ({
      name: row.name,
      source: row.source,
      workspaceId: row.workspace_id,
      props: parseJson(row.props),
      day: row.day,
      at: row.created_at,
    })),
    pageviews: data.pageviews.map((row) => ({
      app: row.app,
      path: row.path,
      referrerHost: row.referrer_host,
      workspaceId: row.workspace_id,
      day: row.day,
      at: row.created_at,
    })),
    // The requests sent while signed in (an anonymous one is linked to no account). The ip hash
    // and the admin who resolved it stay out.
    supportRequests: data.supportRequests.map((row) => ({
      reference: supportReference(Number(row.id)),
      topic: row.topic,
      email: row.email,
      name: row.name,
      message: row.message,
      page: row.page,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    // The user's in-app notifications: what happened, when, whether they read it, and its display
    // data (ids and names only — never an address, token or secret).
    notifications: data.notifications.map((row) => ({
      type: row.type,
      createdAt: row.created_at,
      readAt: row.read_at,
      data: parseJson(row.data),
    })),
    // Whether each optional notification type is also emailed, and when the user last changed it
    // (null: never, so the default applies). Locked types are always emailed and not listed.
    notificationPreferences: NOTIFICATION_EMAIL.optional.map((type) => {
      const row = data.notificationPreferences.find((stored) => stored.type === type)
      return {
        type,
        email: row ? row.email_enabled : NOTIFICATION_EMAIL_DEFAULT,
        changedAt: row?.updated_at ?? null,
      }
    }),
    // Applications sent from the account's verified address (address-keyed, not linked to the
    // account). The ip hash, the CV's storage key and the admin who set the status stay out; the
    // CV itself is not included (the applicant sent it and holds the original).
    jobApplications: data.jobApplications.map((row) => ({
      reference: jobReference(row.id),
      job: row.job_slug,
      title: row.job_title,
      name: row.name,
      email: row.email,
      link: row.link,
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
    })),
    // Contact requests sent from the account's verified address (address-keyed, not linked to the
    // account): the visitor's own answers, never the ip hash, Yasmina's notes or the admin.
    leads: data.leads.map(toExportedLead),
  }
}

/**
 * Builds one user's export: collects their data, writes it as one JSON file through the storage
 * seam, marks the row `ready` (expiring `EXPORT_TTL_MS` later) and queues the `dataExportReady`
 * mail in the same transaction, so a ready row always has its mail. Idempotent: a redelivered job
 * whose row is no longer `pending` (or is gone) does nothing. A crash between the file write and
 * the commit leaves an unreferenced file, which `storage.sweep` removes.
 */
export const privacyExportJob = defineJob<{ exportId: number }>({
  name: "privacy.export",
  payload: z.object({ exportId: z.number().int().positive() }),
  run: async ({ exportId }, ctx) => {
    const row = await ctx.db.exports.find(exportId)
    if (row?.status !== "pending") return
    const userId = Number(row.user_id)
    const data = await ctx.db.exports.dataFor(userId)
    if (!data) return
    const now = ctx.now()
    const readyAt = now.toISOString()
    const expiresAt = new Date(now.getTime() + EXPORT_TTL_MS).toISOString()
    const file = buildExport(data, {
      exportedAt: readyAt,
      accountUrl: ctx.accountUrl,
      storagePublicUrl: ctx.storagePublicUrl,
    })
    const key = newExportKey(userId)
    const bytes = new TextEncoder().encode(`${JSON.stringify(file, null, 2)}\n`)
    if (ctx.signal.aborted) return
    await ctx.storage.put(key, bytes, "application/json")
    await ctx.db.transaction(async (tx) => {
      // Re-read inside the transaction: a concurrent run of the same job may have won.
      const current = await tx.exports.find(exportId)
      if (current?.status !== "pending") {
        await enqueueStorageDelete(ctx.enqueue, key, { tx })
        return
      }
      await tx.exports.markReady(exportId, key, readyAt, expiresAt)
      await notifyUser(ctx, userId, "export.ready", {}, { tx })
      await enqueueMail(
        ctx.enqueue,
        "dataExportReady",
        data.profile.email,
        { name: data.profile.name || undefined, link: `${ctx.accountUrl}/data-privacy` },
        {
          tx,
          idempotencyKey: `export-ready:${exportId}`,
          locale: isLocale(data.profile.locale) ? data.profile.locale : DEFAULT_LOCALE,
        }
      )
    })
  },
})

/**
 * Expires every ready export past `expires_at` and queues its file for `storage.delete`, in one
 * transaction (a row is never expired with its file left unqueued). Also expires every export
 * still `pending` `EXPORT_REQUEST_INTERVAL_MS` after its request: its job is dead (its retries
 * take minutes), and `account.export.get` already reports such a row as expired.
 */
export const privacyExportPruneJob = defineJob<Record<string, never>>({
  name: "privacy.export.prune",
  payload: z.object({}),
  run: async (_payload, ctx) => {
    const at = ctx.now()
    const now = at.toISOString()
    const stale = new Date(at.getTime() - EXPORT_REQUEST_INTERVAL_MS).toISOString()
    await ctx.db.transaction(async (tx) => {
      await tx.exports.expirePendingBefore(stale)
      const expired = await tx.exports.expireBefore(now)
      for (const { storageKey } of expired) {
        if (storageKey) await enqueueStorageDelete(ctx.enqueue, storageKey, { tx })
      }
    })
  },
})

/** How many due users `privacy.purge` reads per page (it pages through all of them each run). */
export const PURGE_PAGE_SIZE = 100

const isDue = (scheduledAt: string | null, now: string) =>
  scheduledAt !== null && Date.parse(scheduledAt) <= Date.parse(now)

/** Why a user was not purged this run (each is left scheduled, so the next run tries again). */
type PurgeSkip =
  | { reason: "gone" | "not due" }
  | { reason: "sole owner"; workspaceIds: number[] }
  | { reason: "uncancelled subscription"; workspaceId: number }
  | { reason: "ownerless"; workspaceId: number }
type PurgeOutcome = { purged: true } | ({ purged: false } & PurgeSkip)

/** Thrown inside the purge transaction to roll it back and report the skip. */
class PurgeSkipped extends Error {
  constructor(readonly skip: PurgeSkip) {
    super(`purge skipped: ${skip.reason}`)
  }
}

/** The failure recorded for a skip an operator must act on; null for gone / not due. */
function skipFailure(skip: PurgeSkip): Error | null {
  switch (skip.reason) {
    case "sole owner":
      return new Error(`the only owner of shared workspace(s) ${skip.workspaceIds.join(", ")}`)
    case "uncancelled subscription":
      return new Error(
        `workspace ${skip.workspaceId} has a live subscription that was not cancelled`
      )
    case "ownerless":
      return new Error(`removing the user would leave workspace ${skip.workspaceId} with no owner`)
    default:
      return null
  }
}

/** Test seam: runs inside the purge transaction, right before `users.purge`. */
export type PurgeHooks = { beforePurge?: (tx: Queries) => Promise<void> }

/**
 * Purges one user whose deletion is due. Outside the transaction, first: each workspace the user
 * is the only member of has its live subscription cancelled with the provider (as
 * `workspaces.delete` does); a failed cancel skips the user and deletes nothing. Then, in one
 * transaction: the user row's lock (two workers serialise here), then a lock on every shared
 * workspace the user co-owns (ascending id, after the user row — the lock order), the schedule
 * re-read (a cancellation in between wins), the sole-owner re-check (an invitation accepted since the
 * request must never leave a workspace ownerless), the sole-member workspaces deleted (logos
 * queued), `users.purge`, an owner re-count of every shared workspace the user owned (a safety
 * net: those workspaces are locked right after the user row, so a co-owner's racing leave waits
 * for the purge, or the purge for it, and the re-checks see its result), the `accountDeleted`
 * mail to the address read in the transaction, the avatar and export files queued for
 * `storage.delete`, and the `user.deleted` audit row (actor null: the system). A skip after subscriptions were cancelled
 * names them, so an operator can restore them.
 */
export async function purgeUser(
  userId: number,
  now: string,
  ctx: Pick<JobContext, "db" | "billing" | "enqueue" | "recordFailure">,
  hooks: PurgeHooks = {}
): Promise<PurgeOutcome> {
  const cancelled = new Map<number, string>()
  const skip = (result: PurgeSkip): PurgeOutcome => {
    const failure = skipFailure(result)
    if (failure) ctx.recordFailure(`privacy.purge: user ${userId} skipped`, failure)
    if (cancelled.size > 0) {
      const list = [...cancelled].map(([id, sub]) => `workspace ${id} (${sub})`).join(", ")
      ctx.recordFailure(
        `privacy.purge: user ${userId} skipped after cancelling subscriptions`,
        new Error(`cancelled, workspace kept: ${list}`)
      )
    }
    return { purged: false, ...result }
  }

  const user = await ctx.db.users.find(userId)
  if (!user) return skip({ reason: "gone" })
  if (!isDue(user.deletion_scheduled_at, now)) return skip({ reason: "not due" })
  const blocked = await ctx.db.workspaces.soleOwnedShared(userId)
  if (blocked.length > 0) {
    return skip({ reason: "sole owner", workspaceIds: blocked.map((workspace) => workspace.id) })
  }

  const handled = new Set<number>()
  for (const workspace of await ctx.db.workspaces.soleMember(userId)) {
    try {
      const subscriptionId = await cancelLiveSubscription(ctx.db, ctx.billing, workspace.id)
      if (subscriptionId) cancelled.set(workspace.id, subscriptionId)
    } catch (error) {
      ctx.recordFailure(
        `privacy.purge: user ${userId} skipped: cancelling workspace ${workspace.id}'s subscription failed`,
        error
      )
      return skip({ reason: "uncancelled subscription", workspaceId: workspace.id })
    }
    handled.add(workspace.id)
  }

  try {
    await ctx.db.transaction(async (tx) => {
      const fail = (result: PurgeSkip): never => {
        throw new PurgeSkipped(result)
      }
      if (!(await tx.users.lockForSession(userId))) fail({ reason: "gone" })
      // Shared workspaces the user co-owns, locked before anything else (ascending id, after the
      // user row) so a co-owner's concurrent leave or demotion serialises with this purge; their
      // owners are re-counted after the purge, below.
      const coOwned = await tx.workspaces.ownedShared(userId)
      for (const workspaceId of coOwned) await tx.workspaces.lockForOwnership(workspaceId)
      const row = await tx.users.find(userId)
      if (!row) return fail({ reason: "gone" })
      if (!isDue(row.deletion_scheduled_at, now)) fail({ reason: "not due" })
      const stillBlocked = await tx.workspaces.soleOwnedShared(userId)
      if (stillBlocked.length > 0) {
        fail({ reason: "sole owner", workspaceIds: stillBlocked.map((workspace) => workspace.id) })
      }
      const workspaces = await tx.workspaces.soleMember(userId)
      // One that became sole-member after the cancels above (its last other member left): its
      // subscription was never cancelled, so it waits for the next run.
      for (const workspace of workspaces) {
        if (handled.has(workspace.id)) continue
        const subscription = await tx.billing.subscriptions.latest(workspace.id)
        if (subscription && subscription.status !== "canceled") {
          fail({ reason: "uncancelled subscription", workspaceId: workspace.id })
        }
      }
      for (const workspace of workspaces) await deleteWorkspaceInTx(tx, ctx.enqueue, workspace)

      // Leaving every shared workspace: `member.left` for each, in this transaction, so a purge
      // that rolls back (a skip below, a failure) sends nothing. The name is "": the account is
      // being erased, and a webhook must not carry it on after.
      for (const membership of await tx.memberships.listForUser(userId)) {
        await emitWebhookEvent(
          { db: tx, billing: ctx.billing, enqueue: ctx.enqueue, now: () => new Date(now) },
          membership.workspace_id,
          "member.left",
          {
            userId,
            name: "",
            role: membership.role,
            joinedAt: membership.created_at,
          },
          { tx }
        )
      }

      await hooks.beforePurge?.(tx)
      const { avatarKey, exportKeys } = await tx.users.purge(userId, now)
      // Safety net: the workspace locks above make a co-owner's leave wait (or this purge wait for
      // it), so no co-owned workspace should be left ownerless; re-count after the membership
      // delete anyway, and roll back rather than orphan one.
      for (const workspaceId of coOwned) {
        try {
          await assertOwnerRemains(tx, workspaceId, DEFAULT_LOCALE)
        } catch (error) {
          // Only the ownership refusal is a skip; anything else (a database error) is a failure.
          if (error instanceof ORPCError && error.code === "CONFLICT") {
            fail({ reason: "ownerless", workspaceId })
          }
          throw error
        }
      }
      await enqueueMail(
        ctx.enqueue,
        "accountDeleted",
        row.email,
        { name: row.name || undefined },
        {
          tx,
          idempotencyKey: `account-deleted:${userId}`,
          locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
        }
      )
      for (const key of [avatarKey, ...exportKeys]) {
        if (key) await enqueueStorageDelete(ctx.enqueue, key, { tx })
      }
      await tx.audit.create({
        actorUserId: null,
        impersonatedUserId: null,
        action: "user.deleted",
        targetType: "user",
        targetId: String(userId),
        reason: null,
        ip: null,
        userAgent: null,
        metadata: JSON.stringify({
          workspacesDeleted: workspaces.map((workspace) => workspace.id),
        }),
      })
    })
  } catch (error) {
    if (error instanceof PurgeSkipped) return skip(error.skip)
    throw error
  }
  return { purged: true }
}

/**
 * Hourly (`25 * * * *`): purges every user whose `deletion_scheduled_at` has passed, one
 * transaction each (`purgeUser`), paging through all of them (keyset on date and id, so users
 * skipped for good never hide the ones behind them) until none is left or the run times out. A
 * user that fails or is skipped stays scheduled and is retried on the next run; one user's
 * failure never stops the others. `pageSize` exists for tests.
 */
export const privacyPurgeJob = defineJob<{ pageSize?: number }>({
  name: "privacy.purge",
  payload: z.object({ pageSize: z.number().int().positive().optional() }),
  run: async ({ pageSize = PURGE_PAGE_SIZE }, ctx) => {
    const now = ctx.now().toISOString()
    let after: { scheduledAt: string; id: number } | undefined
    for (;;) {
      const page = await ctx.db.users.dueForDeletion(now, pageSize, after)
      for (const { id } of page) {
        if (ctx.signal.aborted) return
        try {
          await purgeUser(id, now, ctx)
        } catch (error) {
          ctx.recordFailure(`privacy.purge: user ${id} failed`, error)
        }
      }
      after = page.at(-1)
      if (page.length < pageSize || !after) return
    }
  },
})
