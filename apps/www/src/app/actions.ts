"use server"

import { REQUEST_ID_HEADER } from "@repo/log"
import { requestInfo } from "@repo/session"
import type { FormState } from "@repo/ui/components/form-feedback"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { anonymousApi } from "@/lib/api"
import {
  type BookingFormState,
  bookCore,
  cancelBookingCore,
  requestBookingCore,
  reserveSeatsCore,
} from "@/lib/booking"
import { sendLeadCore } from "@/lib/leads"
import { getLocale } from "@/lib/locale"

/**
 * The api for one POST, in the page's language: service token, rate-limit key per browser ip,
 * the request id forwarded, and `x-locale` = the page's locale (`getLocale()`, the `locale`
 * cookie), so the api's declared error messages (shown verbatim on the booking forms) and every
 * mail it sends — the contact form's confirmation, the booking confirmations — match the page the visitor
 * read. The api stores it on the order, so later mails about a booking follow too.
 */
async function api() {
  const [h, locale] = await Promise.all([headers(), getLocale()])
  const { ip } = requestInfo(h)
  const client = await anonymousApi(ip, locale, h.get(REQUEST_ID_HEADER))
  return { client, locale }
}

/** A success leaves the page through `redirect()` (which throws); a failure feeds the form. */
function settle<T extends { ok: true; redirectTo: string } | (FormState & { ok: false })>(
  outcome: T
): Exclude<T, { ok: true }> {
  if (outcome.ok) redirect(outcome.redirectTo)
  return outcome as Exclude<T, { ok: true }>
}

/** `/kontakt`: send the contact form, then land on `/kontakt/tack` with its next step. */
export async function sendLead(_prev: FormState, fd: FormData): Promise<FormState> {
  const { client, locale } = await api()
  return settle(await sendLeadCore({ api: client.leads, locale }, fd))
}

/** `/book/<instant offering>`: book the picked slots. */
export async function book(_prev: BookingFormState, fd: FormData): Promise<BookingFormState> {
  const { client, locale } = await api()
  return settle(await bookCore({ api: client.booking, locale }, fd))
}

/** `/book/group`: reserve seats at the ticked events. */
export async function reserveSeats(
  _prev: BookingFormState,
  fd: FormData
): Promise<BookingFormState> {
  const { client, locale } = await api()
  return settle(await reserveSeatsCore({ api: client.booking, locale }, fd))
}

/** `/book/<request offering>`: send a request with preferred dates. */
export async function requestBooking(
  _prev: BookingFormState,
  fd: FormData
): Promise<BookingFormState> {
  const { client, locale } = await api()
  return settle(await requestBookingCore({ api: client.booking, locale }, fd))
}

/** `/book/manage/<token>`: cancel one booking, then reload the page. */
export async function cancelBooking(
  _prev: BookingFormState,
  fd: FormData
): Promise<BookingFormState> {
  const { client, locale } = await api()
  return settle(await cancelBookingCore({ api: client.booking.manage, locale }, fd))
}
