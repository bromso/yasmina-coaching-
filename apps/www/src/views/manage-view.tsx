import type { BookingManageResult, BookingSummary } from "@repo/api-contract"
import type { BookingStatus } from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { CancelForm } from "@/components/booking/cancel-form"
import { LocaleProvider } from "@/components/booking/locale-provider"
import { Eyebrow } from "@/components/eyebrow"
import { type BookingContent, bookingFor } from "@/content/booking"
import { formatRange } from "@/lib/booking-dates"

type ManageViewProps = {
  token: string
  data: BookingManageResult
  /** `?cancelled=<id>` after a successful cancel: say so, once. */
  cancelledId?: number
  locale: Locale
}

const badgeVariant: Record<BookingStatus, "default" | "secondary" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  declined: "outline",
  cancelled: "outline",
}

function when(b: BookingSummary, booking: BookingContent, locale: Locale): string {
  return b.startsAt && b.endsAt ? formatRange(b.startsAt, b.endsAt, locale) : booking.manage.timeTbc
}

/**
 * The bookings behind a manage link: each with a status badge, the confirmed future ones with a
 * cancel form, and a package's progress with a link to place the next session.
 */
export function ManageView({ token, data, cancelledId, locale }: ManageViewProps) {
  const booking = bookingFor(locale)
  const pkg = data.package
  const cancelled = cancelledId ? data.bookings.find((b) => b.id === cancelledId) : undefined
  return (
    <main id="main">
      <section aria-labelledby="manage-title" className="container max-w-3xl py-16 lg:py-24">
        <Eyebrow>{booking.manage.eyebrow}</Eyebrow>
        <h1 id="manage-title" className="mt-5 scroll-mt-24 text-balance text-4xl sm:text-5xl">
          {booking.manage.title}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {booking.manage.bookedBy} {data.customer.name}
          {data.customer.organisation ? `, ${data.customer.organisation}` : ""}
        </p>

        {cancelled && (
          <p
            role="status"
            className="mt-8 rounded-2xl border border-border bg-background px-4 py-3 text-sm"
          >
            {booking.manage.cancelled} {cancelled.reference}
          </p>
        )}

        {pkg && (
          <div className="mt-10 grid gap-4 rounded-4xl bg-sun-soft p-6 sm:p-8">
            <h2 className="font-display text-2xl">{booking.offerings[pkg.offering].title}</h2>
            <p>{booking.manage.packageProgress(pkg.sessionsBooked, pkg.sessionsTotal)}</p>
            {pkg.sessionsBooked < pkg.sessionsTotal && (
              <Button asChild className="min-h-11 w-fit rounded-full px-5">
                <a href={`/book/${pkg.offering}?package=${pkg.id}`}>
                  {booking.manage.bookAnother}
                  <Icon icon="lucide:arrow-right" aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        )}

        <h2 className="mt-12 font-display text-2xl">{booking.manage.bookings}</h2>
        <p className="mt-2 text-muted-foreground text-sm">{booking.manage.cancelRule}</p>
        {data.bookings.length === 0 && (
          <p className="mt-6 text-muted-foreground">{booking.manage.empty}</p>
        )}
        <ul className="mt-6 grid gap-4">
          {data.bookings.map((b) => {
            const label = `${booking.offerings[b.offering].title}, ${when(b, booking, locale)}`
            return (
              <li
                key={b.id}
                className="grid gap-4 rounded-3xl border border-border bg-background p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <h3 className="font-display text-xl">
                      {b.groupEvent ? b.groupEvent.title : booking.offerings[b.offering].title}
                    </h3>
                    <p className="text-sm">{when(b, booking, locale)}</p>
                    <p className="text-muted-foreground text-xs">
                      {booking.form.locationLabels[b.location]} · {b.reference}
                    </p>
                  </div>
                  <Badge variant={badgeVariant[b.status]}>{booking.statusLabels[b.status]}</Badge>
                </div>
                {b.cancellable ? (
                  <details className="group rounded-2xl bg-muted/60 p-4">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-sm">
                      <Icon
                        icon="lucide:chevron-right"
                        aria-hidden="true"
                        className="transition-transform group-open:rotate-90"
                      />
                      {booking.manage.cancelLegend}
                    </summary>
                    <div className="mt-3">
                      <LocaleProvider locale={locale}>
                        <CancelForm token={token} bookingId={b.id} label={label} />
                      </LocaleProvider>
                    </div>
                  </details>
                ) : (
                  b.status === "confirmed" &&
                  b.startsAt &&
                  new Date(b.startsAt).getTime() > Date.now() && (
                    <p className="text-muted-foreground text-sm">{booking.manage.notCancellable}</p>
                  )
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
