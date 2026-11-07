import type { Entitlements, Interval, Plan } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"

// Plain helpers, called from server and client components alike. They take the `account.plans`
// translator rather than importing a catalog, so a client bundle never pulls one in: a client
// component passes next-intl's `useTranslations("account.plans")`, a server one the same or
// `scoped(accountTranslator(locale), "plans")`.

/** The `account.plans` keys these helpers read. */
type PlansKey =
  | "seatsUsed"
  | "seats"
  | "unlimitedMembers"
  | "upToMembers"
  | Interval
  | "statusFree"
  | "statusCanceledEnds"
  | "statusCanceled"
  | "statusTrial"
  | "statusPastDue"
  | "statusActive"

/** A translator over `account.plans`. */
export type PlansT = (key: PlansKey, values?: Record<string, string | number | Date>) => string

/** A UTC date in `locale` ("May 1, 2026", "1 maj 2026"): server render and hydration agree. */
export const formatDate = (iso: string, locale: Locale) => formatUtcDate(iso, locale)

const english = {
  whole: new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  cents: new Intl.NumberFormat("en", { style: "currency", currency: "USD" }),
}

/**
 * `PLANS` prices are USD cents; whole dollars print without decimals ("$19", "19 US$"). English
 * keeps `Intl` (its output is what this always printed). Every other locale is built by hand:
 * `PlanPicker` is a client component, so the server's ICU and the browser's must print the same
 * string, and they need not. Every price in `PLANS` is under $1000, so no digit grouping is
 * needed; the amount and "US$" are separated by a no-break space, as Swedish ICU writes it.
 */
export function formatPrice(cents: number, locale: Locale): string {
  const whole = cents % 100 === 0
  if (locale === "en") return (whole ? english.whole : english.cents).format(cents / 100)
  const n = whole ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",")
  return `${n}\u00a0US$`
}

/** "Monthly" / "Yearly". */
export const intervalLabel = (interval: Interval, t: PlansT) => t(interval)

export const seatLimitLabel = (plan: Plan, t: PlansT) =>
  plan.seatLimit === null ? t("unlimitedMembers") : t("upToMembers", { count: plan.seatLimit })

/** "2 of 3 seats used", or "12 seats" ("1 seat") on an unlimited plan. */
export const seatsLine = (e: Pick<Entitlements, "seatLimit" | "seatsUsed">, t: PlansT) =>
  e.seatLimit === null
    ? t("seats", { count: e.seatsUsed })
    : // Strings, not numbers: ICU would group 1000 as "1,000", which this never printed.
      t("seatsUsed", { used: String(e.seatsUsed), limit: String(e.seatLimit) })

/** The Plan card's badge: what the subscription's state means for the workspace. */
export function statusLabel(
  e: Pick<Entitlements, "plan" | "status" | "cancelAtPeriodEnd" | "currentPeriodEnd">,
  t: PlansT,
  locale: Locale
): string {
  if (e.plan === "free") return t("statusFree")
  if (e.cancelAtPeriodEnd)
    return e.currentPeriodEnd
      ? t("statusCanceledEnds", { date: formatDate(e.currentPeriodEnd, locale) })
      : t("statusCanceled")
  if (e.status === "trialing") return t("statusTrial")
  if (e.status === "past_due") return t("statusPastDue")
  return t("statusActive")
}
