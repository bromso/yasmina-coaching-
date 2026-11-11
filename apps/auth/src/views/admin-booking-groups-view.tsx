import type { GroupEvent } from "@repo/api-contract"
import { OFFERINGS } from "@repo/api-contract/booking-limits"
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { AdminNav } from "@/components/admin/admin-nav"
import { BookingsSubnav } from "@/components/admin/bookings-subnav"
import { GroupEventCancelForm } from "@/components/admin/group-event-cancel-form"
import { GroupEventCreateForm } from "@/components/admin/group-event-create-form"
import { formatStockholm, formatStockholmTime } from "@/lib/admin"
import { LOCATION_LABELS } from "@/lib/booking-labels"

export function AdminBookingGroupsView({
  events,
  horizonDays,
}: {
  events: GroupEvent[]
  horizonDays: number
}) {
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return (
    <>
      <h1 className="text-2xl font-semibold">Group events</h1>
      <AdminNav current="/admin/bookings" />
      <BookingsSubnav current="/admin/bookings/groups" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card size="compact">
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>The next {horizonDays} days, Stockholm time.</CardDescription>
          </CardHeader>
          <CardContent>
            {sorted.length === 0 ? (
              <p className="text-muted-foreground text-sm">No group events scheduled.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {sorted.map((e) => {
                  const booked = e.capacity - e.seatsLeft
                  return (
                    <Card as="li" key={e.id} size="compact" className="gap-0 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {e.reference}
                          </span>
                          <Badge variant="outline">{OFFERINGS[e.offering].label}</Badge>
                          <Badge variant={e.seatsLeft === 0 ? "destructive" : "secondary"}>
                            {booked}/{e.capacity} seats
                          </Badge>
                        </div>
                        {e.seriesKey && (
                          <span className="text-muted-foreground text-xs">Weekly series</span>
                        )}
                      </div>
                      <h3 className="mt-1 font-medium">{e.title}</h3>
                      <p className="text-sm">
                        <time dateTime={e.startsAt}>{formatStockholm(e.startsAt)}</time> to{" "}
                        <time dateTime={e.endsAt}>{formatStockholmTime(e.endsAt)}</time>,{" "}
                        {LOCATION_LABELS[e.location]}
                      </p>
                      {e.description && (
                        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                          {e.description}
                        </pre>
                      )}
                      <div className="mt-3">
                        <GroupEventCancelForm id={e.id} />
                      </div>
                    </Card>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Schedule a group event</CardTitle>
            <CardDescription>
              Visitors book seats from the public calendar once it is created.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GroupEventCreateForm />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
