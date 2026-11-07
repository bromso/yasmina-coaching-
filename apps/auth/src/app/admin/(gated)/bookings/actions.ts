"use server"

import { revalidatePath } from "next/cache"
import { notFound } from "next/navigation"
import { canUseAdmin } from "@/lib/admin"
import {
  blockDaysCore,
  cancelBookingCore,
  cancelGroupEventCore,
  confirmBookingCore,
  createGroupEventCore,
  declineBookingCore,
  type FormState,
  setAvailabilityCore,
  unblockDaysCore,
} from "@/lib/admin-booking-actions"
import { getAuth } from "@/lib/auth"

/** The same gate as the pages: anyone else gets the 404 the pages give. */
async function requireAdmin() {
  const auth = getAuth()
  await auth.requireUser()
  if (!canUseAdmin(await auth.getMe())) notFound()
  return auth
}

/** The calendar and, for a decision, the booking's own page. */
function revalidateBooking(fd: FormData) {
  revalidatePath("/admin/bookings")
  const id = fd.get("id")
  if (typeof id === "string" && /^\d+$/.test(id)) revalidatePath(`/admin/bookings/${id}`)
}

export async function confirmBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await confirmBookingCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidateBooking(fd)
  return out
}

export async function declineBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await declineBookingCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidateBooking(fd)
  return out
}

export async function cancelBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await cancelBookingCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidateBooking(fd)
  return out
}

export async function setAvailability(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await setAvailabilityCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidatePath("/admin/bookings/availability")
  return out
}

export async function blockDays(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await blockDaysCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) {
    revalidatePath("/admin/bookings/availability")
    revalidatePath("/admin/bookings")
  }
  return out
}

export async function unblockDays(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await unblockDaysCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) {
    revalidatePath("/admin/bookings/availability")
    revalidatePath("/admin/bookings")
  }
  return out
}

export async function createGroupEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await createGroupEventCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) {
    revalidatePath("/admin/bookings/groups")
    revalidatePath("/admin/bookings")
  }
  return out
}

export async function cancelGroupEvent(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await cancelGroupEventCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) {
    revalidatePath("/admin/bookings/groups")
    revalidatePath("/admin/bookings")
  }
  return out
}
