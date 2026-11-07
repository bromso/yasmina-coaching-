import { ORPCError } from "@orpc/server"
import {
  type Entitlements,
  entitlementsFor,
  type Feature,
  hasFeature,
  seatsLeft,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import type { Db, Queries } from "../db"
import { apiMessage, FEATURE_MESSAGE_KEYS } from "../i18n"
import type { BillingProvider } from "./provider"

/** What a workspace may do right now: its latest mirrored subscription plus its member count. */
export async function entitlementsForWorkspace(
  db: Pick<Db, "billing" | "workspaces"> | Queries,
  workspaceId: number,
  provider: Pick<BillingProvider, "kind">
): Promise<Entitlements> {
  // Sequential on purpose: this also runs on a transaction-bound `Queries`, and concurrent
  // statements on one Postgres transaction connection hung on Bun 1.3's driver; kept sequential
  // until that is re-verified on the pinned Bun.
  const row = await db.billing.subscriptions.latest(workspaceId)
  const memberCount = await db.workspaces.memberCount(workspaceId)
  const customer = await db.billing.customers.find(workspaceId)
  return entitlementsFor({
    subscription: row
      ? {
          plan: row.plan,
          interval: row.interval,
          status: row.status,
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: Boolean(Number(row.cancel_at_period_end)),
        }
      : null,
    memberCount,
    portalAvailable: provider.kind === "stripe" && customer !== undefined,
  })
}

export function assertSeatAvailable(e: Entitlements, locale: Locale): void {
  const left = seatsLeft(e)
  if (left !== null && left <= 0) {
    throw new ORPCError("FORBIDDEN", { message: apiMessage({ locale }, "seatLimit") })
  }
}
export function assertEntitled(e: Entitlements, feature: Feature, locale: Locale): void {
  if (!hasFeature(e, feature)) {
    throw new ORPCError("FORBIDDEN", {
      message: apiMessage({ locale }, FEATURE_MESSAGE_KEYS[feature]),
    })
  }
}
