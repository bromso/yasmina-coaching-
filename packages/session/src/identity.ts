import type { Me } from "@repo/api-contract"

/**
 * The analytics identity for a signed-in visitor, for a `createAnalyticsRoute` `identity`
 * callback: `null` while signed out *or* while impersonating — an admin browsing as a user is the
 * admin's activity, not the user's, so it must carry no ids at all, the same as a visitor who
 * never consented. Otherwise the user id and the current workspace id (or `null` with none).
 */
export function analyticsIdentity(
  me: Me | null,
  workspaceId: number | null
): { userId: number; workspaceId: number | null } | null {
  if (!me || me.impersonation) return null
  return { userId: me.user.id, workspaceId }
}
