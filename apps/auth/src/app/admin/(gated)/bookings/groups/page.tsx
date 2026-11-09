import { ORPCError, safe } from "@orpc/client"
import {
  BOOKING_AVAILABILITY_MAX_DAYS,
  BOOKING_HORIZON_DAYS,
  type GroupEvent,
} from "@repo/api-contract"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { stockholmDay } from "@/lib/admin"
import { addDays } from "@/lib/admin-calendar"
import { getAuth } from "@/lib/auth"
import { AdminBookingGroupsView } from "@/views/admin-booking-groups-view"

export const metadata: Metadata = { title: "Group events · Admin" }

/**
 * The public horizon (90 days) in two `calendar` calls, each within the api's 62-day cap: today
 * through day 61, then day 62 through day 89.
 */
function windows(today: string) {
  const out: { from: string; to: string }[] = []
  for (let start = 0; start < BOOKING_HORIZON_DAYS; start += BOOKING_AVAILABILITY_MAX_DAYS) {
    const end = Math.min(start + BOOKING_AVAILABILITY_MAX_DAYS, BOOKING_HORIZON_DAYS) - 1
    out.push({ from: addDays(today, start), to: addDays(today, end) })
  }
  return out
}

export default async function GroupEventsPage() {
  const api = (await getAuth().api()).admin.bookings
  const results = await Promise.all(
    windows(stockholmDay(new Date())).map((w) => safe(api.calendar(w)))
  )
  const events: GroupEvent[] = []
  for (const [error, calendar] of results) {
    if (error) {
      if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
      throw error
    }
    events.push(...calendar.groupEvents)
  }
  return <AdminBookingGroupsView events={events} horizonDays={BOOKING_HORIZON_DAYS} />
}
