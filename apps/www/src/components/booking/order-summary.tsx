import type { BookingAudience } from "@repo/api-contract/booking-limits"
import type { OfferingAmount } from "@/content/booking"
import type { BookingFormCopy } from "@/content/booking-forms"
import { formatKr, vatBreakdown } from "@/content/inner-pricing"
import type { Locale } from "@/lib/site-locale"

type OrderSummaryProps = {
  copy: BookingFormCopy["payment"]["summary"]
  offering: string
  /** The chosen times or dates, each already formatted. */
  when: readonly string[]
  /** Where, when the journey asks (a group's dates carry their own place in `when`). */
  location?: string
  bookedAs: string
  audience: BookingAudience
  price: OfferingAmount | null
  locale: Locale
}

/**
 * What is being paid for: the offering, the times, the place and the price. A private client's
 * price includes VAT, an organisation's excludes it; the VAT gets its own line either way,
 * derived from the price table (`vatBreakdown`), never typed. An offering priced in writing says
 * so instead.
 */
export function OrderSummary({
  copy,
  offering,
  when,
  location,
  bookedAs,
  audience,
  price,
  locale,
}: OrderSummaryProps) {
  const kr = (n: number) => formatKr(n, locale)
  const split = price ? vatBreakdown(price.amount, audience) : null
  const row = "grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
  return (
    <section
      aria-labelledby="order-summary-heading"
      className="grid gap-4 rounded-3xl bg-background p-5 shadow-xs"
    >
      <h3 id="order-summary-heading" className="font-display text-xl">
        {copy.heading}
      </h3>
      <dl className="grid gap-3 text-sm">
        <div className={row}>
          <dt className="text-muted-foreground">{copy.offering}</dt>
          <dd className="font-medium">{offering}</dd>
        </div>
        {when.length > 0 && (
          <div className={row}>
            <dt className="text-muted-foreground">{copy.when}</dt>
            <dd>
              <ul className="grid gap-1">
                {when.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {location && (
          <div className={row}>
            <dt className="text-muted-foreground">{copy.location}</dt>
            <dd>{location}</dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-muted-foreground">{copy.bookedAs}</dt>
          <dd>{bookedAs}</dd>
        </div>
        <div className={row}>
          <dt className="text-muted-foreground">{copy.price}</dt>
          <dd>
            {price
              ? `${kr(price.amount)} ${copy.vat[audience]}${price.per === "month" ? `, ${copy.perMonth}` : ""}`
              : copy.unpriced}
          </dd>
        </div>
        {split && (
          <div className={row}>
            <dt className="text-muted-foreground">
              {audience === "private" ? copy.vatIncluded : copy.vatAdded}
            </dt>
            <dd>{kr(split.vat)}</dd>
          </div>
        )}
        {split && (
          <div className={`${row} border-border border-t pt-3`}>
            <dt className="font-medium">{copy.total}</dt>
            <dd className="font-display text-xl">{kr(split.total)}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
