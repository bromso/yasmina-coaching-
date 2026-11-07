import type { BillingStatus, Interval, PlanKey } from "@repo/api-contract"
import type { WorkspaceAuditContext } from "../admin"

export type BillingSubscriptionEvent = {
  subscriptionId: string
  status: BillingStatus
  plan: Exclude<PlanKey, "free">
  interval: Interval
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/** A provider event reduced to what the mirror writes. `workspaceId` null = we cannot place it. */
export type BillingEvent = {
  id: string
  type: string
  /** When the provider created the event (ISO): orders out-of-order deliveries. */
  createdAt: string
  workspaceId: number | null
  customerId: string | null
  customerEmail: string | null
  subscription: BillingSubscriptionEvent | null
  /** Set by the stripe provider when the price is not one this deployment configured. */
  unknownPrice?: boolean
}

export interface BillingProvider {
  readonly kind: "stripe" | "mock"
  createCheckout(input: {
    workspaceId: number
    plan: Exclude<PlanKey, "free">
    interval: Interval
    customerId: string | null
    customerEmail: string
    successUrl: string
    cancelUrl: string
    /** Who started the checkout. Only the mock uses it (it applies the plan at once, so it is the
     * activity log's actor); a real provider's plan change arrives by webhook, from the system. */
    actor?: Omit<WorkspaceAuditContext, "db">
  }): Promise<{ url: string }>
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  /** Whether this deployment can sell the pair (stripe: a price id is configured; mock: always). */
  hasPrice(plan: Exclude<PlanKey, "free">, interval: Interval): boolean
  cancelSubscription(subscriptionId: string): Promise<void>
  /** Throws BillingSignatureError on a bad signature; null for an event type it ignores. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): Promise<BillingEvent | null>
}

export class BillingSignatureError extends Error {}
