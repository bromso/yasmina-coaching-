import { type Entitlements, hasFeature, type Role, roleAtLeast } from "@repo/api-contract"

/**
 * What the Workspace page's "API keys" section shows, from the same two inputs
 * `page.tsx` (whether to fetch the list) and `workspace-view.tsx` (what to render) both already
 * hold — one function, so the two can never disagree about who gets the card:
 * - `"membersOnly"`: below admin — the short explanation, never the list or the upsell.
 * - `"upsell"`: admin or owner, but the plan lacks the `api` feature — the upgrade notice in place
 *   of the create form, plus any keys the workspace still holds (from before a downgrade), each
 *   revocable: the api lists and revokes on every plan, only `create` needs the feature.
 * - `"manage"`: admin or owner on a plan with the `api` feature — the full card.
 *
 * Server-only (`page.tsx` and `workspace-view.tsx`, neither a client component): it imports
 * `hasFeature` / `roleAtLeast` from the root of `@repo/api-contract`, which a client component may
 * never do (`scripts/client-imports.test.ts`) — that's why the show-once panel's focus helper
 * lives in the separate, dependency-free `./api-keys-focus` instead of here.
 */
export type ApiKeysGate = "membersOnly" | "upsell" | "manage"

export function apiKeysGate(role: Role, entitlements: Entitlements): ApiKeysGate {
  if (!roleAtLeast(role, "admin")) return "membersOnly"
  if (!hasFeature(entitlements, "api")) return "upsell"
  return "manage"
}

/** Whether `page.tsx` fetches `workspaces.apiKeys.list`: for an admin or owner on every plan, so a
 * downgraded workspace's keys stay visible and revocable. Below admin the api would refuse it. */
export const listsApiKeys = (gate: ApiKeysGate): boolean => gate !== "membersOnly"
