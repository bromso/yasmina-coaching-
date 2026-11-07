import {
  type Entitlements,
  hasFeature,
  type Role,
  roleAtLeast,
  type WebhookDelivery,
} from "@repo/api-contract"

/**
 * What the Workspace page's "Webhooks" section shows — the same three outcomes as
 * `apiKeysGate` (`./api-keys`), for the same reason: `page.tsx` (whether to fetch the list and its
 * deliveries) and `workspace-view.tsx` (what to render) both call this, so the two can never
 * disagree about who gets the card.
 * - `"membersOnly"`: below admin — the short explanation, never the list or the upsell.
 * - `"upsell"`: admin or owner, but the plan lacks the `api` feature — the upgrade notice in place
 *   of **Add endpoint**, plus any endpoints the workspace still holds (from before a downgrade),
 *   each still listed, its recent deliveries still visible, and still deletable: the api lists,
 *   reads deliveries and deletes on every plan. Editing, enabling/disabling, rotating the secret
 *   and sending a test event all need the `api` feature too, same as `create` — `WebhooksCard`
 *   hides those controls per row (an "Upgrade to change webhooks" note in their place) whenever
 *   this gate is not `"manage"`, never just disables them while leaving them on screen.
 * - `"manage"`: admin or owner on a plan with the `api` feature — the full card.
 *
 * Server-only (`page.tsx` and `workspace-view.tsx`, neither a client component): it imports
 * `hasFeature` / `roleAtLeast` from the root of `@repo/api-contract`, which a client component may
 * never do (`scripts/client-imports.test.ts`) — that's why the show-once panel's focus helper lives
 * in the separate, dependency-free `./webhooks-focus` instead of here.
 */
export type WebhooksGate = "membersOnly" | "upsell" | "manage"

export function webhooksGate(role: Role, entitlements: Entitlements): WebhooksGate {
  if (!roleAtLeast(role, "admin")) return "membersOnly"
  if (!hasFeature(entitlements, "api")) return "upsell"
  return "manage"
}

/** Whether `page.tsx` fetches `workspaces.webhooks.list` (and each endpoint's `deliveries`): for
 * an admin or owner on every plan, so a downgraded workspace's endpoints stay listed and
 * deletable. Below admin the api would refuse them anyway. */
export const listsWebhooks = (gate: WebhooksGate): boolean => gate !== "membersOnly"

/**
 * Each endpoint's recent deliveries, keyed by its id, for `page.tsx` to pre-fetch (so the card's
 * disclosure works without JavaScript). One endpoint's failure — typically another admin deleting
 * it between the list and this read, a `NOT_FOUND` — leaves that endpoint with no deliveries
 * rather than failing the whole Workspace page into its error boundary.
 */
export async function deliveriesByEndpoint(
  endpoints: readonly { id: number }[],
  fetchDeliveries: (id: number) => Promise<{ items: WebhookDelivery[] }>
): Promise<Record<number, WebhookDelivery[]>> {
  return Object.fromEntries(
    await Promise.all(
      endpoints.map(async ({ id }) => {
        const items = await fetchDeliveries(id).then(
          (result) => result.items,
          (): WebhookDelivery[] => []
        )
        return [id, items] as const
      })
    )
  )
}
