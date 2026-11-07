import type { Interval, PlanKey } from "@repo/api-contract"
import type { WorkspaceAuditContext } from "../admin"
import { noopEvents } from "../analytics/record"
import type { Db } from "../db"
import { applyBillingEvent, type MirrorEvents } from "./mirror"
import type { BillingEvent, BillingProvider } from "./provider"

const PROVIDER = "mock"
/** Who made a mock plan change: the activity log's actor (`{}` = the system; `null` = not
 * recorded, for the cancellation that comes right before the workspace is deleted). */
type Actor = Omit<WorkspaceAuditContext, "db"> | null
const periodEnd = (interval: Interval) => {
  const d = new Date()
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString()
}
let seq = 0

/** Keyless billing: "checkout" activates the plan at once, the portal is the Payments page itself. */
export function mockProvider(
  db: Db,
  events: MirrorEvents = noopEvents
): BillingProvider & {
  change(
    workspaceId: number,
    plan: Exclude<PlanKey, "free"> | "cancel",
    interval: Interval,
    actor?: Actor
  ): Promise<void>
} {
  const emit = async (
    workspaceId: number,
    type: string,
    subscription: BillingEvent["subscription"],
    actor: Actor = {}
  ) => {
    const event: BillingEvent = {
      id: `mock_evt_${Date.now()}_${++seq}`,
      type,
      createdAt: new Date().toISOString(),
      workspaceId,
      customerId: `mock_${workspaceId}`,
      customerEmail: null,
      subscription,
    }
    await applyBillingEvent(db, PROVIDER, event, events, actor)
  }
  const subscriptionIdFor = async (workspaceId: number) =>
    (await db.billing.subscriptions.latest(workspaceId))?.subscription_id ??
    `mock_sub_${workspaceId}`
  const cancel = async (subscriptionId: string, actor: Actor = {}) => {
    const row = await db.billing.subscriptions.findBySubscriptionId(PROVIDER, subscriptionId)
    if (!row) return
    await emit(
      row.workspace_id,
      "customer.subscription.deleted",
      {
        subscriptionId,
        status: "canceled",
        plan: row.plan,
        interval: row.interval,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: false,
      },
      actor
    )
  }
  return {
    kind: "mock",
    async createCheckout(input) {
      await emit(
        input.workspaceId,
        "customer.subscription.created",
        {
          subscriptionId: await subscriptionIdFor(input.workspaceId),
          status: "active",
          plan: input.plan,
          interval: input.interval,
          currentPeriodEnd: periodEnd(input.interval),
          cancelAtPeriodEnd: false,
        },
        input.actor
      )
      return { url: input.successUrl }
    },
    async createPortal(input) {
      return { url: input.returnUrl }
    },
    hasPrice() {
      return true
    },
    // Only called ahead of deleting the workspace (its delete, or the privacy purge): nothing to
    // record for a workspace about to be gone.
    cancelSubscription: (subscriptionId) => cancel(subscriptionId, null),
    async verifyWebhook() {
      return null
    },
    /** The in-app portal: switch plan, or cancel. */
    async change(workspaceId, plan, interval, actor) {
      const id = await subscriptionIdFor(workspaceId)
      if (plan === "cancel") return cancel(id, actor)
      await emit(
        workspaceId,
        "customer.subscription.updated",
        {
          subscriptionId: id,
          status: "active",
          plan,
          interval,
          currentPeriodEnd: periodEnd(interval),
          cancelAtPeriodEnd: false,
        },
        actor
      )
    },
  }
}
export type MockBillingProvider = ReturnType<typeof mockProvider>

/** True for the mock provider, which alone has the in-app `change`. */
export function isMockBilling(provider: BillingProvider): provider is MockBillingProvider {
  return provider.kind === "mock" && "change" in provider
}
