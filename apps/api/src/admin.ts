import { ORPCError } from "@orpc/server"
import type { Locale } from "@repo/i18n/locales"
import type { Queries } from "./db"
import { apiMessage } from "./i18n"
import { normalizeEmail, type UserRow } from "./queries/users"

/** Impersonation sessions are short and never extended: an hour, then the admin starts again. */
export const IMPERSONATION_TTL_MS = 60 * 60_000

export const parseSuperadminEmails = (list: readonly string[]): Set<string> =>
  new Set(list.map(normalizeEmail).filter(Boolean))

/** Superadmin is configuration, not data: a listed address, once its email is verified. */
export function isSuperadmin(
  user: Pick<UserRow, "email" | "email_verified_at">,
  emails: ReadonlySet<string>
): boolean {
  return user.email_verified_at !== null && emails.has(normalizeEmail(user.email))
}

/** First line of every security or money mutation: an impersonator may look, not touch. */
export function refuseWhileImpersonating(context: {
  impersonating: boolean
  locale: Locale
}): void {
  if (context.impersonating) {
    throw new ORPCError("FORBIDDEN", { message: apiMessage(context, "impersonating") })
  }
}

export type ClientInfo = { userAgent?: string; ip?: string } | undefined
/** `db` may be a transaction's queries, so the row commits (or rolls back) with the write. */
export type AuditContext = {
  db: Pick<Queries, "audit">
  user: UserRow
  impersonator: UserRow | null
}
export type AuditInput = {
  action: string
  targetType?: string
  targetId?: string | number
  reason?: string
  metadata?: Record<string, unknown>
  /** The workspace the action belongs to; omitted for platform rows (suspensions, job retries…). */
  workspaceId?: number
}

/**
 * One audit row: the actor is the session's user, or the admin when the session is an
 * impersonation (then the user is recorded as `impersonated`). Awaited: a write that could not be
 * recorded is a failure the caller sees, not a silent gap.
 */
export async function audit(context: AuditContext, input: AuditInput, client?: ClientInfo) {
  const actor = context.impersonator ?? context.user
  await context.db.audit.create({
    actorUserId: actor.id,
    impersonatedUserId: context.impersonator ? context.user.id : null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId === undefined ? null : String(input.targetId),
    reason: input.reason ?? null,
    ip: client?.ip ?? null,
    userAgent: client?.userAgent ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    workspaceId: input.workspaceId ?? null,
  })
}

/** For the ordinary mutations an impersonator may make: a row only when impersonating. */
export async function auditWhileImpersonating(
  context: AuditContext & { impersonating: boolean },
  input: AuditInput,
  client?: ClientInfo
) {
  if (context.impersonating) await audit(context, input, client)
}

/**
 * Who a workspace activity row names. A signed-in caller (`user`, plus `impersonator` when the
 * session is an impersonation); an API-key caller (`apiKey`, no user); or nobody at all — the
 * system (a webhook endpoint disabled by the delivery job, a plan change a provider webhook
 * reported).
 */
export type WorkspaceAuditContext = {
  /** May be a transaction's queries: the row then commits, or rolls back, with the change. */
  db: Pick<Queries, "audit">
  user?: UserRow | null
  impersonator?: UserRow | null
  apiKey?: { id: number; name: string } | null
}

/**
 * One workspace activity row (`workspaces.activity.list` reads them back), always written —
 * unlike `auditWhileImpersonating`. The actor is the session's user, or the impersonator with the
 * user recorded as `impersonated`, exactly as `audit()`; with no user (an API key, the system) the
 * actor is null, and an API key is named in `metadata.apiKeyId` / `metadata.apiKeyName` so the row
 * still renders once the key itself is gone; an impersonated row carries `metadata.bySupport`.
 * Pass the change's own transaction as `db` wherever
 * there is one, so a rolled-back change records nothing.
 */
export async function auditWorkspace(
  context: WorkspaceAuditContext,
  workspaceId: number,
  input: Omit<AuditInput, "workspaceId">,
  client?: ClientInfo
) {
  const user = context.user ?? null
  const impersonator = user ? (context.impersonator ?? null) : null
  const apiKey = user ? null : (context.apiKey ?? null)
  // `bySupport` marks an impersonated row for good: the purge nulls `impersonated_user_id` with the
  // member's account, and without the mark the impersonator left as actor would read as the one
  // who acted. The activity log then shows the row as by a deleted account, never naming staff.
  const metadata = apiKey
    ? { ...input.metadata, apiKeyId: apiKey.id, apiKeyName: apiKey.name }
    : impersonator
      ? { ...input.metadata, bySupport: true }
      : input.metadata
  await context.db.audit.create({
    actorUserId: impersonator?.id ?? user?.id ?? null,
    impersonatedUserId: impersonator && user ? user.id : null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId === undefined ? null : String(input.targetId),
    reason: input.reason ?? null,
    ip: client?.ip ?? null,
    userAgent: client?.userAgent ?? null,
    metadata: metadata ? JSON.stringify(metadata) : null,
    workspaceId,
  })
}
