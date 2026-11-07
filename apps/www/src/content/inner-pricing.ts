import type { Locale } from "@/lib/site-locale"

/** Price model for Ledarskap inifrån. Amounts are whole kronor, excl. VAT. */
export const HOURLY_RATE = 1500
export const GROUP_HOURLY_RATE = 550
export const DISCOUNT = { single: 0, monthly: 0.1, quarter: 0.15 } as const

export type DiscountTier = keyof typeof DISCOUNT
export type InnerServiceId = "coaching" | "mentoring" | "lifestyle" | "group"

const START_HOURS = 1.5

/**
 * Price for `hours` at `rate`. `single` and `monthly` are one month or session; `quarter` is the
 * three-month total. Works in integer percent so discounts never leave float error behind.
 */
export function priceFor(hours: number, tier: DiscountTier, rate = HOURLY_RATE): number {
  const months = tier === "quarter" ? 3 : 1
  const pct = Math.round(DISCOUNT[tier] * 100)
  return Math.round((hours * months * rate * (100 - pct)) / 100)
}

export const INNER_PRICES: Record<
  InnerServiceId,
  { start?: number; monthly: number; quarter: number }
> = {
  coaching: {
    start: priceFor(START_HOURS, "single"),
    monthly: priceFor(2, "monthly"),
    quarter: priceFor(2, "quarter"),
  },
  mentoring: {
    start: priceFor(START_HOURS, "single"),
    monthly: priceFor(1.5, "monthly"),
    quarter: priceFor(1.5, "quarter"),
  },
  lifestyle: {
    start: priceFor(START_HOURS, "single"),
    monthly: priceFor(2, "monthly"),
    quarter: priceFor(2, "quarter"),
  },
  group: {
    monthly: priceFor(4, "monthly", GROUP_HOURLY_RATE),
    quarter: priceFor(4, "quarter", GROUP_HOURLY_RATE),
  },
}

/** "2\u00a0700\u00a0kr": non-breaking spaces between digit groups and before "kr", in every locale. */
export function formatKr(amount: number, _locale: Locale): string {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
  return `${grouped}\u00a0kr`
}
