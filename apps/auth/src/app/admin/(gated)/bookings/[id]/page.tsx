import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminBookingView } from "@/views/admin-booking-view"

export const metadata: Metadata = { title: "Booking · Admin" }

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,12}$/.test(id)) notFound()
  const [error, booking] = await safe(
    (await getAuth().api()).admin.bookings.get({ id: Number(id) })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminBookingView booking={booking} now={new Date().toISOString()} />
}
