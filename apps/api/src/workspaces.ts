import { ORPCError } from "@orpc/server"
import {
  type Entitlements,
  INVITE_DOMAIN_REASON,
  type Role,
  type WorkspaceSummary,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { auditWorkspace, type WorkspaceAuditContext } from "./admin"
import { noopEvents, type RecordEventContext, recordEvent } from "./analytics/record"
import { assertSeatAvailable, entitlementsForWorkspace } from "./billing/entitlements"
import type { BillingProvider } from "./billing/provider"
import type { Db, Queries } from "./db"
import { apiMessage } from "./i18n"
import { enqueueStorageDelete } from "./jobs/builtin/storage"
import type { Enqueue } from "./jobs/enqueue"
import { maskEmail } from "./mail/mailer"
import type { InvitationDetailRow } from "./queries/invitations"
import type { MembershipRow } from "./queries/memberships"
import { normalizeEmail, type UserRow } from "./queries/users"
import {
  INVITE_DOMAINS_UNREADABLE,
  inviteDomainAllowedUnder,
  inviteDomainsOf,
  requiresTwoFactor,
  type WorkspaceRow,
} from "./queries/workspaces"
import { uniqueSlug as pickSlug } from "./slug"
import { memberData } from "./webhooks/data"
import { emitWebhookEvent } from "./webhooks/emit"

/** The English text of `lastOwner` (the api catalog's own test anchors on it). */
export const LAST_OWNER_MESSAGE = "Transfer ownership before leaving."

/** `fileUrl` is overloaded: null in, null out — see `Context["fileUrl"]`. */
type FileUrl = { (key: string): string; (key: string | null): string | null }

export const toWorkspace = (
  row: WorkspaceRow,
  role: Role,
  memberCount: number,
  entitlements: Entitlements,
  fileUrl: FileUrl
): WorkspaceSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: row.created_at,
  role,
  memberCount,
  entitlements,
  logoUrl: fileUrl(row.logo_key),
  requireTwoFactor: requiresTwoFactor(row),
})

/**
 * Cancels the workspace's live subscription with the provider (a canceled one is left alone), so
 * deleting the workspace never leaves a subscription billing that nobody can see. Resolves to the
 * id it cancelled (null when there was none to cancel). Throws when the provider cannot cancel:
 * the caller then deletes nothing.
 */
export async function cancelLiveSubscription(
  db: Pick<Db, "billing">,
  billing: Pick<BillingProvider, "cancelSubscription">,
  workspaceId: number
): Promise<string | null> {
  const subscription = await db.billing.subscriptions.latest(workspaceId)
  if (!subscription || subscription.status === "canceled") return null
  await billing.cancelSubscription(subscription.subscription_id)
  return subscription.subscription_id
}

/**
 * Deletes the workspace and everything in it, and queues its logo for `storage.delete`, inside the
 * caller's transaction: the row delete and the enqueue commit together, so a workspace is never
 * gone with its logo left unqueued. Cancel its subscription first (`cancelLiveSubscription`).
 */
export async function deleteWorkspaceInTx(
  tx: Queries,
  enqueue: Enqueue,
  workspace: Pick<WorkspaceRow, "id" | "logo_key">
): Promise<void> {
  // The workspace row first, like every workspace writer (after any user row the caller holds):
  // `workspaces.delete` removes the invitations before the workspace row itself, and an accept
  // locks this row before its invitation, so without this the two could deadlock on Postgres.
  await tx.workspaces.lockForOwnership(workspace.id)
  await tx.workspaces.delete(workspace.id)
  if (workspace.logo_key) await enqueueStorageDelete(enqueue, workspace.logo_key, { tx })
}

/** The first slug for `name` that no workspace holds. */
export const uniqueSlug = (db: Pick<Db, "workspaces">, name: string) =>
  pickSlug(name, (slug) => db.workspaces.slugExists(slug))

/** Refuses to let the only owner go: call inside the transaction that changes the membership. */
export async function assertNotLastOwner(
  tx: Queries,
  workspaceId: number,
  userId: number,
  locale: Locale
) {
  const membership = await tx.memberships.find(workspaceId, userId)
  if (membership?.role !== "owner") return
  if ((await tx.memberships.ownerCount(workspaceId)) <= 1) {
    throw new ORPCError("CONFLICT", { message: apiMessage({ locale }, "lastOwner") })
  }
}

/**
 * Re-counts owners after a membership write, still inside its transaction: a safety net. Every
 * writer that can remove an owner first locks the workspace row (`workspaces.lockForOwnership`),
 * which closes the Postgres write skew — two overlapping leaves or demotions serialise, and the
 * second's `assertNotLastOwner` sees the first's committed result — so this should never fire.
 */
export async function assertOwnerRemains(tx: Queries, workspaceId: number, locale: Locale) {
  if ((await tx.memberships.ownerCount(workspaceId)) === 0) {
    throw new ORPCError("CONFLICT", { message: apiMessage({ locale }, "lastOwner") })
  }
}

/** Test seam: runs inside the transaction, after the last-owner check and before the write. */
export type OwnershipHooks = { afterCheck?: () => Promise<void> }

/**
 * Removes `userId` from the workspace (a leave or a removal), unless that would leave it without
 * an owner. Call inside a transaction: the workspace-row lock comes first. Resolves to the
 * membership it removed, read under that lock (undefined when there was none).
 */
export async function removeMemberInTx(
  tx: Queries,
  workspaceId: number,
  userId: number,
  locale: Locale,
  hooks: OwnershipHooks = {}
): Promise<MembershipRow | undefined> {
  // A missing workspace needs no special case: the membership queries below find nothing.
  await tx.workspaces.lockForOwnership(workspaceId)
  const membership = await tx.memberships.find(workspaceId, userId)
  await assertNotLastOwner(tx, workspaceId, userId, locale)
  await hooks.afterCheck?.()
  const removed = await tx.memberships.remove(workspaceId, userId)
  await assertOwnerRemains(tx, workspaceId, locale)
  return removed ? membership : undefined
}

/**
 * Sets a member's role, unless it demotes the last owner. Call inside a transaction. Resolves to
 * the membership as it was before, read under the workspace lock (undefined when there was none).
 */
export async function setRoleInTx(
  tx: Queries,
  workspaceId: number,
  userId: number,
  role: Role,
  locale: Locale,
  hooks: OwnershipHooks = {}
): Promise<MembershipRow | undefined> {
  await tx.workspaces.lockForOwnership(workspaceId)
  const before = await tx.memberships.find(workspaceId, userId)
  await assertNotLastOwner(tx, workspaceId, userId, locale)
  await hooks.afterCheck?.()
  const changed = await tx.memberships.setRole(workspaceId, userId, role)
  await assertOwnerRemains(tx, workspaceId, locale)
  return changed ? before : undefined
}

/**
 * Makes `toUserId` an owner and the caller (`fromUserId`) an admin. Promotes first and only
 * demotes the caller if the target is still a member: a target who left after the request began
 * must not leave the workspace with no owner. Resolves to false (nothing written) when the target
 * is not a member, else to both memberships as they were before (read under the workspace lock).
 * Call inside a transaction.
 */
export async function transferOwnershipInTx(
  tx: Queries,
  workspaceId: number,
  fromUserId: number,
  toUserId: number,
  hooks: OwnershipHooks = {}
): Promise<false | { from: MembershipRow | undefined; to: MembershipRow }> {
  await tx.workspaces.lockForOwnership(workspaceId)
  const to = await tx.memberships.find(workspaceId, toUserId)
  const from = await tx.memberships.find(workspaceId, fromUserId)
  await hooks.afterCheck?.()
  const promoted = await tx.memberships.setRole(workspaceId, toUserId, "owner")
  if (!promoted || !to) return false
  await tx.memberships.setRole(workspaceId, fromUserId, "admin")
  return { from, to }
}

// SQLite: "UNIQUE constraint failed: workspaces.slug". Postgres: "workspaces_slug_key".
export const isSlugTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: workspaces\.slug|workspaces_slug_key/.test(error.message)

// A concurrent invite to the same address committed between our delete and insert. SQLite:
// "UNIQUE constraint failed: invitations.workspace_id, invitations.email". Postgres: the
// partial index's name, "invitations_pending".
export const isPendingInviteTaken = (error: unknown) =>
  error instanceof Error &&
  /UNIQUE constraint failed: invitations\.workspace_id, invitations\.email|invitations_pending/.test(
    error.message
  )

/** The two declared errors `invitations.accept` and `invitations.acceptById` share. */
type AcceptErrors = {
  NOT_FOUND: (options: { message: string }) => Error
  FORBIDDEN: (options: { message: string; data?: { reason: typeof INVITE_DOMAIN_REASON } }) => Error
}

/**
 * Accepts `row` for `user`: it must be pending and unexpired, addressed to the user's email, and
 * the user's email verified. A caller who is already a member keeps their role; the invitation is
 * used up either way. The accept and the membership are one transaction, and so is the seat check
 * for a new member: a workspace at its plan's limit refuses, rolling the accept back so the
 * invitation stays pending until an upgrade.
 *
 * `mismatch` decides what a row addressed to someone else answers: `forbidden` (the token path:
 * the caller holds the link, so naming its masked address leaks nothing) or `not_found` (the id
 * path: ids are guessable, so a foreign invitation must look exactly like a missing one).
 *
 * The workspace's invitation domain list is re-checked inside the transaction, against the list
 * read under the workspace row's lock (so a concurrent `setInviteDomains` either commits first and
 * is seen, or waits for this accept): an address the current non-empty list no longer allows is
 * refused (`FORBIDDEN` `data.reason: "invite_domain"`), before the invitation is consumed, so it
 * stays pending. The order of the refusals is fixed: not found / expired, then the address
 * mismatch, then an unverified email, then the domain list, then — for a new member only — the
 * seat limit. The domain check applies to a caller who is already a member too: an invitation
 * outside the list is never consumed. An unreadable stored list fails closed (refused the same
 * way, the failure recorded with the workspace id only).
 *
 * The workspace lock is held for the whole accept, so concurrent accepts into one workspace run
 * one at a time. That is deliberate: it also makes the seat check race-free (two accepts at one
 * seat left can no longer both pass it). Do not drop it as overhead.
 *
 * A real join (not a caller who was already a member) records `invitation.accepted` in the same
 * transaction, actored by `actor` (the caller's session: the user, or the impersonator as them).
 */
export async function acceptInvitation(
  db: Db,
  billing: Pick<BillingProvider, "kind">,
  user: UserRow,
  row: InvitationDetailRow | undefined,
  errors: AcceptErrors,
  mismatch: "forbidden" | "not_found",
  locale: Locale,
  fileUrl: FileUrl,
  events: RecordEventContext = noopEvents,
  actor: Omit<WorkspaceAuditContext, "db"> = { user }
) {
  const now = new Date().toISOString()
  const invalid = () => errors.NOT_FOUND({ message: apiMessage({ locale }, "invitationInvalid") })
  if (!row || row.accepted_at || row.expires_at <= now) throw invalid()
  if (normalizeEmail(user.email) !== row.email) {
    if (mismatch === "not_found") throw invalid()
    throw errors.FORBIDDEN({
      message: apiMessage({ locale }, "invitationSentTo", { email: maskEmail(row.email) }),
    })
  }
  if (!user.email_verified_at) {
    throw errors.FORBIDDEN({ message: apiMessage({ locale }, "invitationVerifyEmail") })
  }
  return db.transaction(async (tx) => {
    // The workspace row first, then the invitation: the order every workspace writer takes
    // (`deleteWorkspaceInTx` included, which locks it before deleting the invitations). Then the
    // list as it stands under that lock.
    if (!(await tx.workspaces.lockForOwnership(row.workspace_id))) throw invalid()
    const locked = await tx.workspaces.find(row.workspace_id)
    if (!locked) throw invalid()
    const domains = inviteDomainsOf(locked)
    if (domains === null) {
      events.recordFailure(INVITE_DOMAINS_UNREADABLE, { workspaceId: row.workspace_id })
    }
    if (!inviteDomainAllowedUnder(domains, row.email)) {
      throw errors.FORBIDDEN({
        message: apiMessage({ locale }, "inviteDomainNoLongerAllowed"),
        data: { reason: INVITE_DOMAIN_REASON },
      })
    }
    // A concurrent accept (or a revoke) got there first.
    if (!(await tx.invitations.accept(row.id, now))) throw invalid()
    const existing = await tx.memberships.find(row.workspace_id, user.id)
    if (!existing) {
      assertSeatAvailable(await entitlementsForWorkspace(tx, row.workspace_id, billing), locale)
      await tx.memberships.add({ workspaceId: row.workspace_id, userId: user.id, role: row.role })
      await recordEvent(
        events,
        "invitation_accepted",
        { userId: user.id, workspaceId: row.workspace_id },
        {},
        { tx }
      )
      await emitWebhookEvent(
        { db: tx, billing, enqueue: events.enqueue },
        row.workspace_id,
        "member.joined",
        async () => {
          const joined = await tx.memberships.find(row.workspace_id, user.id)
          return joined ? memberData(tx, joined) : null
        },
        { tx }
      )
      await auditWorkspace({ ...actor, db: tx }, row.workspace_id, {
        action: "invitation.accepted",
        targetType: "user",
        targetId: user.id,
        metadata: { role: row.role },
      })
    }
    const workspace = await tx.workspaces.find(row.workspace_id)
    if (!workspace) throw invalid()
    const entitlements = await entitlementsForWorkspace(tx, workspace.id, billing)
    return {
      workspace: toWorkspace(
        workspace,
        existing?.role ?? row.role,
        entitlements.seatsUsed,
        entitlements,
        fileUrl
      ),
    }
  })
}
