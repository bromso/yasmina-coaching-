import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminBookingAvailabilityView } from "@/views/admin-booking-availability-view"

export const metadata: Metadata = { title: "Availability · Admin" }

export default async function AvailabilityPage() {
  const [error, availability] = await safe(
    (await getAuth().api()).admin.bookings.availability.get()
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminBookingAvailabilityView rules={availability.rules} blocks={availability.blocks} />
}
