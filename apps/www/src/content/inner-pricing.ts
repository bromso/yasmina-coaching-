import type { Locale } from "@/lib/site-locale"

/**
 * Price model for Ledarskap inifrån. Amounts are whole kronor. Private clients see them incl. VAT,
 * organisations the same amount excl. VAT.
 */
export const HOURLY_RATE = 1500
export const GROUP_HOURLY_RATE = 550
export const DISCOUNT = { single: 0, monthly: 0.1, quarter: 0.15 } as const

export type DiscountTier = keyof typeof DISCOUNT
export type InnerServiceId = "coaching" | "mentoring" | "lifestyle" | "group"

/** The start call's length in hours (90 minutes), the same for every one-to-one service. */
export const START_HOURS = 1.5

/** Hours of sessions per month in each service's membership; the group's are shared hours. */
export const INNER_HOURS: Record<InnerServiceId, number> = {
  coaching: 2,
  mentoring: 1.5,
  lifestyle: 2,
  group: 4,
}

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
    monthly: priceFor(INNER_HOURS.coaching, "monthly"),
    quarter: priceFor(INNER_HOURS.coaching, "quarter"),
  },
  mentoring: {
    start: priceFor(START_HOURS, "single"),
    monthly: priceFor(INNER_HOURS.mentoring, "monthly"),
    quarter: priceFor(INNER_HOURS.mentoring, "quarter"),
  },
  lifestyle: {
    start: priceFor(START_HOURS, "single"),
    monthly: priceFor(INNER_HOURS.lifestyle, "monthly"),
    quarter: priceFor(INNER_HOURS.lifestyle, "quarter"),
  },
  group: {
    monthly: priceFor(INNER_HOURS.group, "monthly", GROUP_HOURLY_RATE),
    quarter: priceFor(INNER_HOURS.group, "quarter", GROUP_HOURLY_RATE),
  },
}

/** "2\u00a0700\u00a0kr": non-breaking spaces between digit groups and before "kr", in every locale. */
export function formatKr(amount: number, _locale: Locale): string {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0")
  return `${grouped}\u00a0kr`
}
