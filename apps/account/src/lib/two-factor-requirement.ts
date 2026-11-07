import type { WorkspaceSummary } from "@repo/api-contract"

/**
 * The Security page's warnings before a change that would leave the account with no second
 * factor while one of its workspaces requires it (Phase 12 B). A workspace counts the account as
 * satisfying its requirement with two-step verification on **or** at least one passkey, so:
 *
 * - `twoFactorOff`: turning two-step verification off, when the account has no passkey;
 * - `lastPasskey`: removing the only passkey, when two-step verification is off.
 *
 * Each is the names of the workspaces that require it (in `workspaces.list` order), or empty when
 * that action would block nothing. The action itself stays allowed — the api never refuses it;
 * this only says what it will do. Computed server-side and passed down as plain strings.
 */
export type RequirementWarnings = { twoFactorOff: string[]; lastPasskey: string[] }

export function requirementWarnings({
  twoFactorEnabled,
  passkeyCount,
  workspaces,
}: {
  twoFactorEnabled: boolean
  passkeyCount: number
  workspaces: Pick<WorkspaceSummary, "name" | "requireTwoFactor">[]
}): RequirementWarnings {
  const requiring = workspaces.filter((w) => w.requireTwoFactor).map((w) => w.name)
  return {
    twoFactorOff: twoFactorEnabled && passkeyCount === 0 ? requiring : [],
    lastPasskey: !twoFactorEnabled && passkeyCount === 1 ? requiring : [],
  }
}
