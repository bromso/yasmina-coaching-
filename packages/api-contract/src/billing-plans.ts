/**
 * Zod-free billing constants: safe for a browser bundle that must not pull in zod or the oRPC
 * contract (both are rooted in `@repo/api-contract`'s index, which this module is not part of).
 * `billing.ts` imports these and re-exports them, so every existing `@repo/api-contract` import
 * keeps working; a client component (like `apps/account`'s `PlanPicker`) imports them from here
 * instead.
 */

export const PLAN_KEYS = ["free", "pro", "team"] as const
export type PlanKey = (typeof PLAN_KEYS)[number]
export const PAID_PLANS = ["pro", "team"] as const
export const INTERVALS = ["month", "year"] as const
export type Interval = (typeof INTERVALS)[number]
export const FEATURES = ["chat", "api"] as const
export type Feature = (typeof FEATURES)[number]

export type Plan = {
  key: PlanKey
  name: string
  /** USD cents, display only — Stripe prices come from the environment. */
  price: { month: number; year: number }
  /** Members allowed, null = unlimited. Pending invitations do not count. */
  seatLimit: number | null
  features: readonly Feature[]
}

/** The three plans. Edit here; the api, the Payments page and www's pricing read this. */
export const PLANS: Record<PlanKey, Plan> = {
  free: { key: "free", name: "Free", price: { month: 0, year: 0 }, seatLimit: 3, features: [] },
  pro: {
    key: "pro",
    name: "Pro",
    price: { month: 1900, year: 19000 },
    seatLimit: 10,
    features: FEATURES,
  },
  team: {
    key: "team",
    name: "Team",
    price: { month: 4900, year: 49000 },
    seatLimit: null,
    features: FEATURES,
  },
}
