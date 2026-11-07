import { isSuperadmin } from "./admin"
import { tokenHash } from "./credentials"
import type { Db } from "./db"
import type { MembershipRow } from "./queries/memberships"
import type { SessionRow } from "./queries/sessions"
import { isSuspended, type UserRow } from "./queries/users"
import { requiresTwoFactor, type WorkspaceRow } from "./queries/workspaces"

/**
 * Who a forwarded session token acts as, or null when it is missing, unknown or expired. An
 * impersonation session also needs its admin to still exist and still be a superadmin: removing
 * an address from SUPERADMIN_EMAILS ends their impersonations at the next check.
 *
 * A suspended user's session (`isSuspended` at `now`) is dead too, impersonation sessions of them
 * included, and is deleted on sight. Suspending ends every session in its own transaction, so the
 * only ones left are those a sign-in created while it raced the suspension. One presented while
 * the suspension holds is deleted; one never presented until a timed suspension has run out works
 * again, as a fresh sign-in by the same credential holder would.
 *
 * The one rule both oRPC's `requireSession` and the realtime stream (on connect and on every
 * recheck) apply, so a new session rule reaches both.
 */
export async function resolveSession(
  db: Db,
  token: string | null,
  superadminEmails: ReadonlySet<string>,
  now: Date
): Promise<{ session: SessionRow; user: UserRow; impersonator: UserRow | null } | null> {
  const session = token ? await db.sessions.findByToken(tokenHash(token)) : undefined
  const user = session ? await db.users.find(session.user_id) : undefined
  if (!session || !user) return null
  if (isSuspended(user, now)) {
    await db.sessions.delete({ id: session.id, userId: user.id })
    return null
  }
  let impersonator: UserRow | null = null
  if (session.impersonated_by !== null) {
    const admin = await db.users.find(session.impersonated_by)
    if (!admin || !isSuperadmin(admin, superadminEmails)) return null
    impersonator = admin
  }
  return { session, user, impersonator }
}

/**
 * The user's membership of an existing workspace, or null — the caller answers both "not a
 * member" and "no such workspace" with the same NOT_FOUND (no existence oracle). Shared by the
 * `member(min)` middleware and the realtime stream.
 */
export async function findMembership(
  db: Db,
  workspaceId: number,
  userId: number
): Promise<{ membership: MembershipRow; workspace: WorkspaceRow } | null> {
  const membership = await db.memberships.find(workspaceId, userId)
  const workspace = membership && (await db.workspaces.find(workspaceId))
  if (!membership || !workspace) return null
  return { membership, workspace }
}

/**
 * Whether an account satisfies a workspace's two-step requirement: two-step verification (TOTP)
 * on, or at least one passkey. Judged from the account's current state — the row this request
 * just read — never from how the session signed in.
 */
export const satisfiesTwoFactor = (
  user: Pick<UserRow, "two_factor_enabled_at">,
  passkeyCount: number
): boolean => user.two_factor_enabled_at !== null || passkeyCount > 0

/**
 * Whether `workspace` requires two-step verification and `user` does not satisfy it — the one
 * rule the `member(min)` middleware and the realtime stream (on connect and on every recheck)
 * apply. Reads the passkey count only when the workspace requires it and two-step is off.
 */
export async function blockedByTwoFactor(
  db: Pick<Db, "passkeys">,
  workspace: Pick<WorkspaceRow, "require_two_factor">,
  user: Pick<UserRow, "id" | "two_factor_enabled_at">
): Promise<boolean> {
  if (!requiresTwoFactor(workspace)) return false
  if (user.two_factor_enabled_at !== null) return false
  return !satisfiesTwoFactor(user, await db.passkeys.countForUser(user.id))
}
