import type { AdminBooking } from "@repo/api-contract"
import { OFFERINGS } from "@repo/api-contract/booking-limits"
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { AdminNav } from "@/components/admin/admin-nav"
import { BookingCancelForm } from "@/components/admin/booking-cancel-form"
import { BookingConfirmForm } from "@/components/admin/booking-confirm-form"
import { BookingDeclineForm } from "@/components/admin/booking-decline-form"
import { BookingsSubnav } from "@/components/admin/bookings-subnav"
import { formatDateTime, formatDay, formatStockholm } from "@/lib/admin"
import { suggestedStart } from "@/lib/admin-calendar"
import { DAY_PART_LABELS, LOCATION_LABELS, STATUS_VARIANTS } from "@/lib/booking-labels"

const AUDIENCE_LABELS = { private: "Private", organisation: "Organisation" } as const

export function AdminBookingView({ booking, now }: { booking: AdminBooking; now: string }) {
  const offering = OFFERINGS[booking.offering]
  const isPending = booking.status === "pending"
  const isFutureConfirmed =
    booking.status === "confirmed" && booking.startsAt !== null && booking.startsAt > now
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{booking.reference}</h1>
        <Badge variant={STATUS_VARIANTS[booking.status]}>{booking.status}</Badge>
      </div>
      <AdminNav current="/admin/bookings" />
      <BookingsSubnav current="/admin/bookings" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card size="compact">
          <CardHeader>
            <CardTitle>{offering.label}</CardTitle>
            <CardDescription>
              {booking.startsAt && booking.endsAt
                ? `${formatStockholm(booking.startsAt)} to ${formatStockholm(booking.endsAt).slice(-5)}`
                : "No time set yet"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{booking.status}</dd>
              <dt className="text-muted-foreground">Starts</dt>
              <dd>
                {booking.startsAt ? (
                  <time dateTime={booking.startsAt}>{formatStockholm(booking.startsAt)}</time>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Ends</dt>
              <dd>
                {booking.endsAt ? (
                  <time dateTime={booking.endsAt}>{formatStockholm(booking.endsAt)}</time>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{LOCATION_LABELS[booking.location]}</dd>
              <dt className="text-muted-foreground">Audience</dt>
              <dd>{AUDIENCE_LABELS[booking.audience]}</dd>
              {booking.groupEvent && (
                <>
                  <dt className="text-muted-foreground">Group event</dt>
                  <dd>{booking.groupEvent.title}</dd>
                </>
              )}
              {booking.packageId !== null && (
                <>
                  <dt className="text-muted-foreground">Package</dt>
                  <dd>#{booking.packageId}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Cancellable by customer</dt>
              <dd>{booking.cancellable ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Received</dt>
              <dd>
                <time dateTime={booking.createdAt}>{formatDateTime(booking.createdAt)}</time>
              </dd>
              {booking.decidedAt && (
                <>
                  <dt className="text-muted-foreground">Decided</dt>
                  <dd>
                    <time dateTime={booking.decidedAt}>{formatDateTime(booking.decidedAt)}</time>
                    {booking.decidedBy && ` by ${booking.decidedBy.email}`}
                  </dd>
                </>
              )}
              {booking.cancelledAt && (
                <>
                  <dt className="text-muted-foreground">Cancelled</dt>
                  <dd>
                    <time dateTime={booking.cancelledAt}>
                      {formatDateTime(booking.cancelledAt)}
                    </time>
                  </dd>
                </>
              )}
            </dl>
            {booking.adminNote && (
              <>
                <h3 className="mt-4 text-sm font-medium">Note sent with the decision</h3>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {booking.adminNote}
                </pre>
              </>
            )}
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>{booking.customer.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{booking.customer.name}</dd>
              <dt className="text-muted-foreground">Organisation</dt>
              <dd>{booking.customer.organisation ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{booking.customer.phone ?? "—"}</dd>
              {offering.kind === "request" && (
                <>
                  <dt className="text-muted-foreground">Proposed dates</dt>
                  <dd>
                    {booking.preferredDates.length === 0 ? (
                      "—"
                    ) : (
                      <ul>
                        {booking.preferredDates.map((d) => (
                          <li key={`${d.date}-${d.part}`}>
                            <time dateTime={d.date}>{formatDay(d.date)}</time>,{" "}
                            {DAY_PART_LABELS[d.part]}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Attendees</dt>
                  <dd>{booking.attendees ?? "—"}</dd>
                  <dt className="text-muted-foreground">Venue</dt>
                  <dd>{booking.venue ?? "—"}</dd>
                </>
              )}
            </dl>
            {booking.notes && (
              <>
                <h3 className="mt-4 text-sm font-medium">Message</h3>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {booking.notes}
                </pre>
              </>
            )}
          </CardContent>
        </Card>
        {isPending && (
          <>
            <Card size="compact">
              <CardHeader>
                <CardTitle>Confirm</CardTitle>
                <CardDescription>
                  Pick the time; the customer gets a confirmation with your note.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BookingConfirmForm
                  id={booking.id}
                  offering={booking.offering}
                  location={booking.location}
                  defaultStart={suggestedStart(booking.preferredDates)}
                />
              </CardContent>
            </Card>
            <Card size="compact">
              <CardHeader>
                <CardTitle>Decline</CardTitle>
                <CardDescription>
                  The customer is told, with your note if you add one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BookingDeclineForm id={booking.id} />
              </CardContent>
            </Card>
          </>
        )}
        {isFutureConfirmed && (
          <Card size="compact">
            <CardHeader>
              <CardTitle>Cancel</CardTitle>
              <CardDescription>
                Frees the time and tells the customer. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BookingCancelForm id={booking.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
