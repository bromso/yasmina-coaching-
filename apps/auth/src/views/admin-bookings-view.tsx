import type { AdminBooking, AvailabilityBlock, GroupEvent } from "@repo/api-contract"
import { OFFERINGS } from "@repo/api-contract/booking-limits"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Card } from "@repo/ui/components/card"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { BookingsSubnav } from "@/components/admin/bookings-subnav"
import {
  formatDateTime,
  formatDay,
  formatStockholm,
  formatStockholmTime,
  stockholmDay,
} from "@/lib/admin"
import {
  addMonths,
  blockedDays,
  type Month,
  monthGrid,
  monthKey,
  monthLabel,
  monthRange,
} from "@/lib/admin-calendar"
import { DAY_PART_LABELS, LOCATION_LABELS } from "@/lib/booking-labels"

const WEEKDAY_HEADERS = [
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
  ["Sun", "Sunday"],
] as const

const seatsBooked = (e: GroupEvent) => e.capacity - e.seatsLeft

export function AdminBookingsView({
  month,
  today,
  pending,
  bookings,
  groupEvents,
  blocks,
}: {
  month: Month
  /** Today's Stockholm date, `YYYY-MM-DD`. */
  today: string
  pending: AdminBooking[]
  bookings: AdminBooking[]
  groupEvents: GroupEvent[]
  blocks: AvailabilityBlock[]
}) {
  const range = monthRange(month)
  const label = monthLabel(month)
  const blocked = blockedDays(blocks, range)
  const confirmed = bookings
    .filter(
      (b): b is AdminBooking & { startsAt: string } => b.status === "confirmed" && !!b.startsAt
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const events = [...groupEvents].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const bookingsByDay = new Map<string, typeof confirmed>()
  for (const b of confirmed) {
    const day = stockholmDay(b.startsAt)
    bookingsByDay.set(day, [...(bookingsByDay.get(day) ?? []), b])
  }
  const eventsByDay = new Map<string, GroupEvent[]>()
  for (const e of events) {
    const day = stockholmDay(e.startsAt)
    eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), e])
  }
  const monthBlocks = blocks.filter((b) => b.from <= range.to && b.to >= range.from)
  return (
    <>
      <h1 className="text-2xl font-semibold">Bookings</h1>
      <AdminNav current="/admin/bookings" />
      <BookingsSubnav current="/admin/bookings" />

      <section aria-labelledby="pending-heading" className="grid gap-3">
        <h2 id="pending-heading" className="text-lg font-semibold">
          Requests waiting for a decision{pending.length > 0 && ` (${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">No open requests.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((b) => (
              <Card as="li" key={b.id} size="compact" className="gap-0 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{b.reference}</span>
                    <Badge>{OFFERINGS[b.offering].label}</Badge>
                  </div>
                  <time dateTime={b.createdAt} className="text-muted-foreground text-xs">
                    Received {formatDateTime(b.createdAt)}
                  </time>
                </div>
                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">From</dt>
                    <dd>
                      {b.customer.name}
                      {b.customer.organisation && `, ${b.customer.organisation}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Proposed</dt>
                    <dd>
                      {b.preferredDates.length === 0 ? (
                        "No dates proposed"
                      ) : (
                        <ul>
                          {b.preferredDates.map((d) => (
                            <li key={`${d.date}-${d.part}`}>
                              <time dateTime={d.date}>{formatDay(d.date)}</time>,{" "}
                              {DAY_PART_LABELS[d.part]}
                            </li>
                          ))}
                        </ul>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/bookings/${b.id}`}>Open {b.reference}</Link>
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="calendar-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="calendar-heading" className="text-lg font-semibold">
            {label}
          </h2>
          <nav aria-label="Month" className="flex gap-1">
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/bookings?month=${monthKey(addMonths(month, -1))}`}>
                Previous month
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/bookings?month=${monthKey(addMonths(month, 1))}`}>
                Next month
              </Link>
            </Button>
          </nav>
        </div>
        {/* The grid may scroll sideways on a narrow screen; the list below carries the same facts. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] table-fixed border-collapse text-xs">
            <caption className="sr-only">
              {label}: confirmed bookings and group events per day, Stockholm time
            </caption>
            <thead>
              <tr>
                {WEEKDAY_HEADERS.map(([short, long]) => (
                  <th key={short} scope="col" className="border p-1 text-left font-medium">
                    <abbr title={long} className="no-underline">
                      {short}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(month).map((week) => (
                <tr key={week.map((c) => c?.date ?? "-").join("|")}>
                  {week.map((cell, i) => {
                    if (!cell) {
                      return <td key={`empty-${WEEKDAY_HEADERS[i][0]}`} className="border p-1" />
                    }
                    const isBlocked = blocked.has(cell.date)
                    const dayBookings = bookingsByDay.get(cell.date) ?? []
                    const dayEvents = eventsByDay.get(cell.date) ?? []
                    return (
                      <td
                        key={cell.date}
                        aria-current={cell.date === today ? "date" : undefined}
                        className={cn(
                          "h-24 border p-1 align-top",
                          isBlocked && "bg-muted",
                          cell.date === today && "ring-2 ring-inset ring-primary"
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-1">
                          <time dateTime={cell.date} className="font-medium">
                            {cell.day}
                          </time>
                          {isBlocked && <span className="text-muted-foreground">Blocked</span>}
                        </div>
                        {(dayBookings.length > 0 || dayEvents.length > 0) && (
                          <ul className="mt-1 grid gap-0.5">
                            {dayBookings.map((b) => (
                              <li key={`b-${b.id}`} className="truncate">
                                <Link
                                  href={`/admin/bookings/${b.id}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  <time dateTime={b.startsAt}>
                                    {formatStockholmTime(b.startsAt)}
                                  </time>{" "}
                                  {OFFERINGS[b.offering].label}, {b.customer.name}
                                </Link>
                              </li>
                            ))}
                            {dayEvents.map((e) => (
                              <li key={`e-${e.id}`} className="truncate text-muted-foreground">
                                <time dateTime={e.startsAt}>{formatStockholmTime(e.startsAt)}</time>{" "}
                                {e.title} ({seatsBooked(e)}/{e.capacity} seats)
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="month-list-heading" className="grid gap-3">
        <h2 id="month-list-heading" className="text-lg font-semibold">
          Everything in {label}
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-muted-foreground text-sm">No confirmed bookings this month.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {confirmed.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline gap-x-2">
                <time dateTime={b.startsAt} className="font-medium">
                  {formatStockholm(b.startsAt)}
                </time>
                <span>
                  {OFFERINGS[b.offering].label}, {b.customer.name}
                  {b.customer.organisation && ` (${b.customer.organisation})`},{" "}
                  {LOCATION_LABELS[b.location]}
                </span>
                <Link
                  href={`/admin/bookings/${b.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {b.reference}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {events.length > 0 && (
          <>
            <h3 className="font-medium">Group events</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  <time dateTime={e.startsAt} className="font-medium">
                    {formatStockholm(e.startsAt)}
                  </time>
                  <span>
                    {e.title}, {seatsBooked(e)}/{e.capacity} seats, {LOCATION_LABELS[e.location]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{e.reference}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {monthBlocks.length > 0 && (
          <>
            <h3 className="font-medium">Blocked days</h3>
            <ul className="flex flex-col gap-1 text-sm">
              {monthBlocks.map((b) => (
                <li key={b.id}>
                  <time dateTime={b.from}>{formatDay(b.from)}</time>
                  {b.to !== b.from && (
                    <>
                      {" "}
                      to <time dateTime={b.to}>{formatDay(b.to)}</time>
                    </>
                  )}
                  {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
