import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { StepIndicator } from "@/components/booking/step-indicator"
import { bookingFor } from "@/content/booking"
import { type BookingFlow, paysIn } from "@/lib/booking-flow"
import type { DonePayment } from "@/lib/mock-payment"

type DoneViewProps = {
  /** The booking reference, shown as text; empty when the page was reached without one. */
  reference: string
  /** The manage link, only when it points at this site (see `isOwnManageUrl`); else omitted. */
  manageUrl?: string
  /** The journey that led here; its stepper shows its last step. */
  kind: BookingFlow
  /** How the booking was paid (a checked key, see `isDonePayment`), for the paying journeys. */
  paid?: DonePayment
  locale: Locale
}

/**
 * The journey's last step (4 of 4, or 3 of 3 for a member's session): what happened, how it was
 * paid, the reference, the manage link, and what comes next.
 */
export function DoneView({ reference, manageUrl, kind, paid, locale }: DoneViewProps) {
  const booking = bookingFor(locale)
  const copy = kind === "request" ? booking.done.requested : booking.done.booked
  const steps = booking.form.steps[kind]
  const next = booking.done.nextItems[kind === "request" ? "request" : "instant"]
  return (
    <main id="main">
      <section aria-labelledby="done-title" className="container max-w-3xl py-16 lg:py-24">
        <div className="rounded-4xl bg-linear-to-b from-sun-soft via-sun to-sun px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          <StepIndicator
            steps={steps}
            stepOf={booking.form.stepOf}
            doneLabel={booking.form.stepper.done}
            current={steps.length}
            className="mb-8"
          />
          <Eyebrow>{booking.done.eyebrow}</Eyebrow>
          <h1 id="done-title" className="mt-5 scroll-mt-24 text-balance text-4xl sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{copy.body}</p>
          {paid && paysIn(kind) && (
            <p className="mt-6 flex items-start gap-3 rounded-2xl bg-background/70 px-4 py-3">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
                fill="none"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M8 12.5l2.5 2.5L16 9.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{booking.done.paid[paid]}</span>
            </p>
          )}
          {reference && (
            <dl className="mt-8 grid gap-1">
              <dt className="text-muted-foreground text-sm">{booking.done.reference}</dt>
              <dd className="font-display text-3xl">{reference}</dd>
            </dl>
          )}
          {manageUrl && (
            <div className="mt-8 grid gap-2">
              <Button asChild size="lg" className="h-12 w-fit px-6 text-base">
                <a href={manageUrl}>{booking.done.manage}</a>
              </Button>
              <p className="text-muted-foreground text-sm">{booking.done.manageHint}</p>
            </div>
          )}
          <h2 className="mt-12 font-display text-2xl">{booking.done.next}</h2>
          <ol className="mt-4 grid gap-3">
            {next.map((item, i) => (
              <li key={item} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-foreground/20 font-display text-sm"
                >
                  {i + 1}
                </span>
                <span className="pt-1 text-pretty">{item}</span>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="mt-12 min-h-11 bg-background/70 px-6">
            <a href="/">{booking.done.home}</a>
          </Button>
        </div>
      </section>
    </main>
  )
}
