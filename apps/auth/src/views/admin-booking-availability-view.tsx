import type { AvailabilityBlock, AvailabilityRule } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { AdminNav } from "@/components/admin/admin-nav"
import { AvailabilityRulesForm } from "@/components/admin/availability-rules-form"
import { BlockDaysForm } from "@/components/admin/block-days-form"
import { BookingsSubnav } from "@/components/admin/bookings-subnav"
import { UnblockForm } from "@/components/admin/unblock-form"
import { formatDay } from "@/lib/admin"

export function AdminBookingAvailabilityView({
  rules,
  blocks,
}: {
  rules: AvailabilityRule[]
  blocks: AvailabilityBlock[]
}) {
  const sorted = [...blocks].sort((a, b) => a.from.localeCompare(b.from))
  return (
    <>
      <h1 className="text-2xl font-semibold">Availability</h1>
      <AdminNav current="/admin/bookings" />
      <BookingsSubnav current="/admin/bookings/availability" />
      <Card size="compact">
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>
            When sessions can be booked on the public calendar. Saving replaces every rule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityRulesForm rules={rules} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card size="compact">
          <CardHeader>
            <CardTitle>Blocked days</CardTitle>
            <CardDescription>Holidays and travel: nothing can be booked on these.</CardDescription>
          </CardHeader>
          <CardContent>
            {sorted.length === 0 ? (
              <p className="text-muted-foreground text-sm">No blocked days.</p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {sorted.map((b) => {
                  const span =
                    b.from === b.to
                      ? formatDay(b.from)
                      : `${formatDay(b.from)} to ${formatDay(b.to)}`
                  return (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <time dateTime={b.from}>{formatDay(b.from)}</time>
                        {b.to !== b.from && (
                          <>
                            {" "}
                            to <time dateTime={b.to}>{formatDay(b.to)}</time>
                          </>
                        )}
                        {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
                      </span>
                      <UnblockForm id={b.id} label={`Unblock ${span}`} />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Block days</CardTitle>
            <CardDescription>Existing bookings on those days are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <BlockDaysForm />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
