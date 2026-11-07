import type { BillingStatus } from "@repo/api-contract"
import Stripe from "stripe"
import { type PriceEnv, planForPrice, priceFor } from "./plans"
import { type BillingEvent, type BillingProvider, BillingSignatureError } from "./provider"

export type StripeConfig = {
  secretKey: string
  webhookSecret: string
  prices: PriceEnv
  log: (message: string, error: unknown) => void
  /** Injected in tests; defaults to a real client. */
  client?: Stripe
}

const STATUSES: readonly BillingStatus[] = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
]
/** Stripe statuses we do not model (`incomplete_expired`, `paused`) read as `incomplete`: not entitled. */
const toStatus = (s: string): BillingStatus =>
  STATUSES.includes(s as BillingStatus) ? (s as BillingStatus) : "incomplete"
const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null)
const idOf = (ref: string | { id: string } | null | undefined) =>
  typeof ref === "string" ? ref : (ref?.id ?? null)
/**
 * The workspace id we put on the checkout, or null. Plain decimal digits only: `Number()` alone
 * would also accept "0x10", "1e3" or "007", none of which we ever write.
 */
const workspaceOf = (value: string | null | undefined) =>
  value && /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : null

/** Reduces a Stripe subscription to the mirror's shape; `null` + unknownPrice for a foreign price. */
function reduceSubscription(sub: Stripe.Subscription, prices: PriceEnv) {
  const item = sub.items.data[0]
  const priceId = item?.price?.id
  const resolved = priceId ? planForPrice(priceId, prices) : null
  if (!resolved) return { subscription: null, unknownPrice: true as const }
  // Newer API versions carry the period on the item; older ones on the subscription, which the
  // current types no longer declare — hence the one narrow cast.
  const legacyPeriodEnd = (sub as { current_period_end?: number }).current_period_end
  return {
    subscription: {
      subscriptionId: sub.id,
      status: toStatus(sub.status),
      plan: resolved.plan,
      interval: resolved.interval,
      currentPeriodEnd: iso(item?.current_period_end ?? legacyPeriodEnd),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    },
    unknownPrice: false as const,
  }
}

export function stripeBilling(config: StripeConfig): BillingProvider {
  // No explicit apiVersion: the SDK pins the version its types describe.
  const stripe = config.client ?? new Stripe(config.secretKey)
  return {
    kind: "stripe",
    async createCheckout(input) {
      const price = priceFor(input.plan, input.interval, config.prices)
      if (!price) throw new Error(`No Stripe price configured for ${input.plan}/${input.interval}`)
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: String(input.workspaceId),
        metadata: { workspaceId: String(input.workspaceId) },
        // On the subscription too, so its own events can be attributed without the session.
        subscription_data: { metadata: { workspaceId: String(input.workspaceId) } },
        ...(input.customerId
          ? { customer: input.customerId }
          : { customer_email: input.customerEmail }),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      })
      if (!session.url) throw new Error("Stripe returned a checkout session without a url")
      return { url: session.url }
    },
    async createPortal(input) {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      })
      return { url: session.url }
    },
    hasPrice(plan, interval) {
      return priceFor(plan, interval, config.prices) !== null
    },
    // Idempotent: a subscription that already ended, or that Stripe no longer has, is cancelled
    // as far as we are concerned, so deleting its workspace never dead-ends on it.
    async cancelSubscription(subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        if (sub.status === "canceled" || sub.status === "incomplete_expired") return
        await stripe.subscriptions.cancel(subscriptionId)
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === "resource_missing") return
        throw error
      }
    },
    async verifyWebhook(rawBody, signatureHeader): Promise<BillingEvent | null> {
      if (!signatureHeader) throw new BillingSignatureError("Missing stripe-signature")
      let event: Stripe.Event
      try {
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          signatureHeader,
          config.webhookSecret
        )
      } catch (error) {
        throw new BillingSignatureError(error instanceof Error ? error.message : "Bad signature")
      }
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object
          return {
            id: event.id,
            type: event.type,
            createdAt: new Date(event.created * 1000).toISOString(),
            // Metadata only: `client_reference_id` is end-user settable on Payment Links, so it
            // is written on our sessions as a label but never trusted for attribution.
            workspaceId: workspaceOf(s.metadata?.workspaceId),
            customerId: idOf(s.customer),
            customerEmail: s.customer_details?.email ?? s.customer_email ?? null,
            subscription: null,
          }
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object
          const reduced = reduceSubscription(sub, config.prices)
          if (reduced.unknownPrice) config.log(`stripe: unknown price on ${sub.id}`, undefined)
          return {
            id: event.id,
            type: event.type,
            createdAt: new Date(event.created * 1000).toISOString(),
            workspaceId: workspaceOf(sub.metadata?.workspaceId),
            customerId: idOf(sub.customer),
            customerEmail: null,
            ...reduced,
          }
        }
        default:
          return null
      }
    },
  }
}
