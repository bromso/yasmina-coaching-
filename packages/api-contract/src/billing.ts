import { z } from "zod"
import {
  FEATURES,
  type Feature,
  INTERVALS,
  type Interval,
  PAID_PLANS,
  PLAN_KEYS,
  PLANS,
  type Plan,
  type PlanKey,
} from "./billing-plans"
import { WorkspaceIdSchema } from "./ids"

export type { Feature, Interval, Plan, PlanKey }
export { FEATURES, INTERVALS, PAID_PLANS, PLAN_KEYS, PLANS }

export const PlanKeySchema = z.enum(PLAN_KEYS)
export const PaidPlanSchema = z.enum(PAID_PLANS)
export const IntervalSchema = z.enum(INTERVALS)

/** Stripe's subscription statuses, verbatim. */
export const BILLING_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "unpaid",
] as const
export type BillingStatus = (typeof BILLING_STATUSES)[number]
export const BillingStatusSchema = z.enum(BILLING_STATUSES)
/** Statuses that keep the paid plan's entitlements (past_due: Stripe is retrying). */
const ENTITLED_STATUSES: readonly BillingStatus[] = ["active", "trialing", "past_due"]

export const EntitlementsSchema = z.object({
  plan: PlanKeySchema,
  planName: z.string(),
  status: z.enum([...BILLING_STATUSES, "none"]),
  features: z.array(z.enum(FEATURES)),
  seatLimit: z.number().int().positive().nullable(),
  seatsUsed: z.number().int().nonnegative(),
  currentPeriodEnd: z.iso.datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  interval: IntervalSchema.nullable(),
  portalAvailable: z.boolean(),
})
export type Entitlements = z.infer<typeof EntitlementsSchema>

export type SubscriptionLike = {
  plan: Exclude<PlanKey, "free">
  interval: Interval
  status: BillingStatus
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/** The one rule mapping a mirrored subscription (or none) to what a workspace may do. */
export function entitlementsFor(input: {
  subscription: SubscriptionLike | null
  memberCount: number
  portalAvailable: boolean
}): Entitlements {
  const sub = input.subscription
  const entitled = sub !== null && ENTITLED_STATUSES.includes(sub.status)
  const plan = entitled ? PLANS[sub.plan] : PLANS.free
  return {
    plan: plan.key,
    planName: plan.name,
    status: sub?.status ?? "none",
    features: [...plan.features],
    seatLimit: plan.seatLimit,
    seatsUsed: input.memberCount,
    currentPeriodEnd: entitled ? sub.currentPeriodEnd : null,
    cancelAtPeriodEnd: entitled ? sub.cancelAtPeriodEnd : false,
    interval: entitled ? sub.interval : null,
    portalAvailable: input.portalAvailable,
  }
}

export const hasFeature = (e: Entitlements, feature: Feature) => e.features.includes(feature)
/** Seats still free, null when unlimited, never negative. */
export const seatsLeft = (e: Entitlements): number | null =>
  e.seatLimit === null ? null : Math.max(0, e.seatLimit - e.seatsUsed)

export const SEAT_LIMIT_MESSAGE = "This workspace has reached its member limit"
export type FeatureCopy = { label: string; upgradeMessage: string }
/** Every feature's words, in one place: the type demands an entry per `FEATURES` value. */
export const FEATURE_COPY: Record<Feature, FeatureCopy> = {
  chat: { label: "AI chat", upgradeMessage: "Upgrade to use chat" },
  api: { label: "API access", upgradeMessage: "Upgrade to use the API" },
}
/**
 * A feature's words. Read them through this rather than indexing `FEATURE_COPY`, so emptying
 * `FEATURES` (`Feature` becomes `never`) still typechecks everywhere.
 */
export const featureCopy = (feature: Feature): FeatureCopy =>
  (FEATURE_COPY as Readonly<Record<string, FeatureCopy>>)[feature] as FeatureCopy
/** The refusal a gated feature answers with (`FORBIDDEN` from the api, `403` from a route). */
export const FEATURE_MESSAGES = Object.fromEntries(
  FEATURES.map((f) => [f, featureCopy(f).upgradeMessage])
) as Record<Feature, string>

export const BillingProviderKindSchema = z.enum(["stripe", "mock"])
export type BillingProviderKind = z.infer<typeof BillingProviderKindSchema>
export const BillingSchema = EntitlementsSchema.extend({ provider: BillingProviderKindSchema })
export type Billing = z.infer<typeof BillingSchema>
export const CheckoutSchema = WorkspaceIdSchema.extend({
  plan: PaidPlanSchema,
  interval: IntervalSchema,
})
export const CheckoutUrlSchema = z.object({ url: z.string().url() })
export const MockChangeSchema = WorkspaceIdSchema.extend({
  plan: z.enum([...PAID_PLANS, "cancel"]),
  interval: IntervalSchema.default("month"),
})
