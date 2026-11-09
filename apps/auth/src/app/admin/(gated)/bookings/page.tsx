import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { stockholmDay } from "@/lib/admin"
import { monthRange, parseMonth } from "@/lib/admin-calendar"
import { getAuth } from "@/lib/auth"
import { AdminBookingsView } from "@/views/admin-bookings-view"

export const metadata: Metadata = { title: "Bookings · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function BookingsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const now = new Date()
  const month = parseMonth(params.month, now)
  const api = (await getAuth().api()).admin.bookings
  const [[calendarError, calendar], [pendingError, pending]] = await Promise.all([
    safe(api.calendar(monthRange(month))),
    safe(api.pending()),
  ])
  for (const error of [calendarError, pendingError]) {
    if (!error) continue
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  // `safe` narrows each tuple on its own error; both are null here.
  if (!calendar || !pending) notFound()
  return (
    <AdminBookingsView
      month={month}
      today={stockholmDay(now)}
      pending={pending.items}
      bookings={calendar.bookings}
      groupEvents={calendar.groupEvents}
      blocks={calendar.blocks}
    />
  )
}
