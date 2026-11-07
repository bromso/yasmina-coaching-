import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { StepIndicator } from "@/components/booking/step-indicator"
import { Eyebrow } from "@/components/eyebrow"
import { bookingFor } from "@/content/booking"

type DoneViewProps = {
  /** The booking reference, shown as text; empty when the page was reached without one. */
  reference: string
  /** The manage link, only when it points at this site (see `isOwnManageUrl`); else omitted. */
  manageUrl?: string
  kind: "instant" | "request"
  locale: Locale
}

/** Step 3 of 3: what happened, the reference, the manage link, and what comes next. */
export function DoneView({ reference, manageUrl, kind, locale }: DoneViewProps) {
  const booking = bookingFor(locale)
  const copy = kind === "request" ? booking.done.requested : booking.done.booked
  return (
    <main id="main">
      <section aria-labelledby="done-title" className="container max-w-3xl py-16 lg:py-24">
        <div className="rounded-4xl bg-linear-to-b from-sun-soft via-sun to-sun px-6 py-12 sm:px-10 lg:px-14 lg:py-16">
          {kind === "instant" && (
            <StepIndicator
              steps={booking.form.steps}
              stepOf={booking.form.stepOf}
              current={3}
              className="mb-8"
            />
          )}
          <Eyebrow>{booking.done.eyebrow}</Eyebrow>
          <h1 id="done-title" className="mt-5 scroll-mt-24 text-balance text-4xl sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted-foreground">{copy.body}</p>
          {reference && (
            <dl className="mt-8 grid gap-1">
              <dt className="text-muted-foreground text-sm">{booking.done.reference}</dt>
              <dd className="font-display text-3xl">{reference}</dd>
            </dl>
          )}
          {manageUrl && (
            <div className="mt-8 grid gap-2">
              <Button asChild size="lg" className="h-12 w-fit rounded-full px-6 text-base">
                <a href={manageUrl}>{booking.done.manage}</a>
              </Button>
              <p className="text-muted-foreground text-sm">{booking.done.manageHint}</p>
            </div>
          )}
          <h2 className="mt-12 font-display text-2xl">{booking.done.next}</h2>
          <ol className="mt-4 grid gap-3">
            {booking.done.nextItems[kind].map((item, i) => (
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
          <Button
            asChild
            variant="outline"
            className="mt-12 min-h-11 rounded-full bg-background/70 px-6"
          >
            <a href="/">{booking.done.home}</a>
          </Button>
        </div>
      </section>
    </main>
  )
}
