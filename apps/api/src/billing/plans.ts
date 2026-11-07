import type { Interval, PlanKey } from "@repo/api-contract"

export type PriceEnv = {
  STRIPE_PRICE_PRO_MONTH?: string
  STRIPE_PRICE_PRO_YEAR?: string
  STRIPE_PRICE_TEAM_MONTH?: string
  STRIPE_PRICE_TEAM_YEAR?: string
}
const KEYS: Record<Exclude<PlanKey, "free">, Record<Interval, keyof PriceEnv>> = {
  pro: { month: "STRIPE_PRICE_PRO_MONTH", year: "STRIPE_PRICE_PRO_YEAR" },
  team: { month: "STRIPE_PRICE_TEAM_MONTH", year: "STRIPE_PRICE_TEAM_YEAR" },
}
/** The configured Stripe price id for a plan/interval, or null. Prices never live in code. */
export const priceFor = (plan: Exclude<PlanKey, "free">, interval: Interval, env: PriceEnv) =>
  env[KEYS[plan][interval]] ?? null
/** The plan/interval a Stripe price id belongs to, or null for a price this deployment does not know. */
export function planForPrice(priceId: string, env: PriceEnv) {
  for (const plan of ["pro", "team"] as const)
    for (const interval of ["month", "year"] as const)
      if (env[KEYS[plan][interval]] === priceId) return { plan, interval }
  return null
}
