import { ORPCError } from "@orpc/client"
import {
  type ApiClient,
  BookingAvailabilitySchema,
  BookingCancelSchema,
  BookingCreateSchema,
  BookingRequestSchema,
  BookingReserveSchema,
} from "@repo/api-contract"
import { OFFERING_KEYS, type OfferingKey } from "@repo/api-contract/booking-limits"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { amountFor } from "@/content/booking"
import { shiftDay, zonedDay } from "@/lib/booking-dates"
import { type BookingFlow, flowFor, paysIn } from "@/lib/booking-flow"
import { type PaymentMethod, paidFor } from "@/lib/mock-payment"
import { type Locale, SITE_LOCALE } from "@/lib/site-locale"

const logger = createLogger({ service: "www" })

/**
 * The cores' own messages, in the page's language (`locale` in each core's deps, Swedish when
 * omitted). A declared api refusal (a taken slot, a full event, the cutoff, the rate limit) shows
 * the api's own message instead, which follows the `x-locale` the action sends.
 */
export const GENERIC_FAILURE: Record<Locale, string> = {
  sv: "Något gick fel, försök igen senare.",
  en: "Something went wrong, please try again later.",
}

/**
 * What a booking action hands back: a failure for the form (with the api's own `code` so the
 * calendar can reopen slot picking after a `CONFLICT`), or where to send the visitor next. The
 * `"use server"` wrappers in `src/app/actions.ts` turn `redirectTo` into a `redirect()`.
 */
export type BookingFormState = FormState & { code?: string }
export type BookingOutcome = { ok: true; redirectTo: string } | (BookingFormState & { ok: false })

export type BookApi = Pick<ApiClient["booking"], "book">
export type ReserveApi = Pick<ApiClient["booking"], "reserve">
export type RequestApi = Pick<ApiClient["booking"], "request">
export type CancelApi = Pick<ApiClient["booking"]["manage"], "cancel">

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}
const strs = (fd: FormData, key: string) =>
  fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "")
const optional = (v: string) => (v.trim() === "" ? undefined : v)

/**
 * Zod issues as one message per form field. The contract nests the customer (`customer.email`)
 * and indexes lists (`slots.0`, `preferredDates.1.date`); the form's inputs are flat, so the
 * key is the customer field, the list's own name, or `date_<n>` / `part_<n>` for a preferred date.
 */
export function bookingFieldErrors(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>
) {
  return fieldErrors(
    issues.map((issue) => {
      const [head, second, third] = issue.path
      if (head === "customer" && second !== undefined) return { ...issue, path: [second] }
      if (head === "preferredDates" && typeof second === "number" && third !== undefined) {
        return { ...issue, path: [`${String(third)}_${second + 1}`] }
      }
      return { ...issue, path: head === undefined ? [] : [head] }
    })
  )
}

/**
 * `/book/done?ref=…&manage=…[&kind=…][&paid=…]`, the page every successful write lands on: `kind`
 * is the journey (left out for `instant`), `paid` the payment method's key, never anything the
 * visitor typed.
 */
export function doneUrl(
  reference: string,
  manageUrl: string,
  kind?: Exclude<BookingFlow, "instant">,
  paid?: PaymentMethod
): string {
  const params = new URLSearchParams({ ref: reference, manage: manageUrl })
  if (kind) params.set("kind", kind)
  if (paid) params.set("paid", paid)
  return `/book/done?${params.toString()}`
}

const offeringKey = (raw: string): OfferingKey | null =>
  (OFFERING_KEYS as readonly string[]).includes(raw) ? (raw as OfferingKey) : null

/**
 * The mock payment a booking of `offering` went through, from the form's `paymentMethod`: only for
 * a journey with a payment step, and only a method the offering allows (invoice alone when it has
 * no fixed price). The api never sees it; it only picks the line `/book/done` shows.
 */
export function paymentOf(fd: FormData, offering: string, packageId?: string) {
  const key = offeringKey(offering)
  if (!key) return undefined
  if (!paysIn(flowFor(key, packageId))) return undefined
  return paidFor(str(fd, "paymentMethod"), amountFor(key) !== null)
}

/**
 * Whether a `manage` value from the query string may be linked: only a URL on this site's own
 * www origin, under `/book/manage/`. Anything else is shown nowhere (the reference still is).
 */
export function isOwnManageUrl(url: string, origin: string): boolean {
  if (!url.startsWith(`${origin}/book/manage/`)) return false
  try {
    const parsed = new URL(url)
    return parsed.origin === origin && parsed.pathname.startsWith("/book/manage/")
  } catch {
    return false
  }
}

/** The customer block every write shares, from the flat form fields. */
function customerOf(fd: FormData) {
  return {
    name: str(fd, "name"),
    email: str(fd, "email"),
    organisation: optional(str(fd, "organisation")),
    phone: optional(str(fd, "phone")),
  }
}

function failure(
  error: unknown,
  what: string,
  values: Record<string, string>,
  locale: Locale = SITE_LOCALE
): BookingOutcome {
  if (error instanceof ORPCError && error.defined) {
    if (error.code !== "TOO_MANY_REQUESTS" && error.code !== "CONFLICT") {
      logger.warn(`${what} refused`, { code: error.code })
    }
    return { ok: false, message: error.message, code: error.code, values }
  }
  logger.error(`${what} failed`, { error })
  return { ok: false, message: GENERIC_FAILURE[locale], values }
}

/**
 * An instant booking (a session or a programme's first sessions). `slots` arrives as one hidden
 * input per picked ISO start. `packageId` (from `?package=` on the page) is carried in `values`
 * only: the contract has no field for it yet, so the api decides what a repeat booking means.
 */
export async function bookCore(
  deps: { api: BookApi; locale?: Locale },
  fd: FormData
): Promise<BookingOutcome> {
  const slots = strs(fd, "slots")
  const values = {
    offering: str(fd, "offering"),
    audience: str(fd, "audience"),
    location: str(fd, "location"),
    name: str(fd, "name"),
    email: str(fd, "email"),
    organisation: str(fd, "organisation"),
    phone: str(fd, "phone"),
    notes: str(fd, "notes"),
    slots: slots.join(","),
    packageId: str(fd, "packageId"),
  }
  const parsed = BookingCreateSchema.safeParse({
    offering: values.offering,
    slots,
    audience: values.audience,
    customer: customerOf(fd),
    location: values.location,
    notes: optional(values.notes),
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: bookingFieldErrors(parsed.error.issues), values }
  }
  try {
    const { reference, manageUrl } = await deps.api.book(parsed.data)
    const flow = flowFor(parsed.data.offering, values.packageId || undefined)
    const paid = paymentOf(fd, parsed.data.offering, values.packageId || undefined)
    return {
      ok: true,
      redirectTo: doneUrl(reference, manageUrl, flow === "instant" ? undefined : flow, paid),
    }
  } catch (error) {
    return failure(error, "booking.book", values, deps.locale)
  }
}

/**
 * Seats at one or several group events (`eventIds`, one checkbox each). `offering` (a hidden
 * field) is read only to check the payment method; the api decides the offering by the events.
 */
export async function reserveSeatsCore(
  deps: { api: ReserveApi; locale?: Locale },
  fd: FormData
): Promise<BookingOutcome> {
  const eventIds = strs(fd, "eventIds")
  const values = {
    audience: str(fd, "audience"),
    name: str(fd, "name"),
    email: str(fd, "email"),
    organisation: str(fd, "organisation"),
    phone: str(fd, "phone"),
    notes: str(fd, "notes"),
    eventIds: eventIds.join(","),
  }
  const parsed = BookingReserveSchema.safeParse({
    eventIds: eventIds.map((id) => (/^\d+$/.test(id) ? Number(id) : id)),
    audience: values.audience,
    customer: customerOf(fd),
    notes: optional(values.notes),
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: bookingFieldErrors(parsed.error.issues), values }
  }
  try {
    const { reference, manageUrl } = await deps.api.reserve(parsed.data)
    const paid = paymentOf(fd, str(fd, "offering"))
    return { ok: true, redirectTo: doneUrl(reference, manageUrl, "group", paid) }
  } catch (error) {
    return failure(error, "booking.reserve", values, deps.locale)
  }
}

export const PREFERRED_DATE_SLOTS = [1, 2, 3] as const
export const DATE_TOO_SOON: Record<Locale, string> = {
  sv: "Välj ett datum från och med i morgon.",
  en: "Pick a date from tomorrow onwards.",
}

/**
 * A request for a workshop, programme or talk. Preferred dates come as `date_1`…`date_3` with a
 * `part_1`…`part_3` each; an empty date is simply not proposed. The browser's `min` is only a
 * hint, so a date before tomorrow (in the booking zone) is refused here too. `now` is injectable
 * for tests.
 */
export async function requestBookingCore(
  deps: { api: RequestApi; now?: () => Date; locale?: Locale },
  fd: FormData
): Promise<BookingOutcome> {
  const values: Record<string, string> = {
    offering: str(fd, "offering"),
    location: str(fd, "location"),
    name: str(fd, "name"),
    email: str(fd, "email"),
    organisation: str(fd, "organisation"),
    phone: str(fd, "phone"),
    attendees: str(fd, "attendees"),
    venue: str(fd, "venue"),
    message: str(fd, "message"),
  }
  const preferredDates: Array<{ date: string; part: string; n: number }> = []
  for (const n of PREFERRED_DATE_SLOTS) {
    values[`date_${n}`] = str(fd, `date_${n}`)
    values[`part_${n}`] = str(fd, `part_${n}`)
    if (values[`date_${n}`]) {
      preferredDates.push({ date: values[`date_${n}`], part: values[`part_${n}`], n })
    }
  }
  const attendees = values.attendees.trim()
  const parsed = BookingRequestSchema.safeParse({
    offering: values.offering,
    customer: {
      name: values.name,
      email: values.email,
      organisation: values.organisation,
      phone: optional(values.phone),
    },
    location: values.location,
    preferredDates: preferredDates.map(({ date, part }) => ({ date, part })),
    attendees: attendees === "" ? undefined : Number(attendees),
    venue: optional(values.venue),
    message: values.message,
  })
  if (!parsed.success) {
    const errors = bookingFieldErrors(parsed.error.issues)
    // A path on the list itself ("at least one date") belongs to the first date field.
    if (errors.preferredDates && !errors.date_1) errors.date_1 = errors.preferredDates
    delete errors.preferredDates
    return { ok: false, fieldErrors: errors, values }
  }
  const tomorrow = shiftDay(zonedDay(deps.now ? deps.now() : new Date()), 1)
  const tooSoon = preferredDates.filter((d) => d.date < tomorrow)
  if (tooSoon.length > 0) {
    const errors: Record<string, string> = {}
    for (const d of tooSoon) errors[`date_${d.n}`] = DATE_TOO_SOON[deps.locale ?? SITE_LOCALE]
    return { ok: false, fieldErrors: errors, values }
  }
  try {
    const { reference, manageUrl } = await deps.api.request(parsed.data)
    return { ok: true, redirectTo: doneUrl(reference, manageUrl, "request") }
  } catch (error) {
    return failure(error, "booking.request", values, deps.locale)
  }
}

export const CONFIRM_REQUIRED: Record<Locale, string> = {
  sv: "Kryssa i rutan för att bekräfta att du vill avboka.",
  en: "Tick the box to confirm that you want to cancel.",
}

/**
 * Cancelling one booking from its manage link. The form asks for a ticked `confirm` box instead
 * of a JavaScript dialog; without it nothing is sent. Success reloads the manage page with
 * `?cancelled=<id>` so the page can say so.
 */
export async function cancelBookingCore(
  deps: { api: CancelApi; locale?: Locale },
  fd: FormData
): Promise<BookingOutcome> {
  const values = { bookingId: str(fd, "bookingId"), confirm: str(fd, "confirm") }
  const parsed = BookingCancelSchema.safeParse({
    token: str(fd, "token"),
    bookingId: values.bookingId,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: bookingFieldErrors(parsed.error.issues), values }
  }
  if (values.confirm !== "yes") {
    return {
      ok: false,
      fieldErrors: { confirm: CONFIRM_REQUIRED[deps.locale ?? SITE_LOCALE] },
      values,
    }
  }
  try {
    await deps.api.cancel(parsed.data)
    const params = new URLSearchParams({ cancelled: String(parsed.data.bookingId) })
    return {
      ok: true,
      redirectTo: `/book/manage/${encodeURIComponent(parsed.data.token)}?${params.toString()}`,
    }
  } catch (error) {
    return failure(error, "booking.manage.cancel", values, deps.locale)
  }
}

/**
 * The availability route's query (`?offering=&from=&to=`), checked with the contract's own schema
 * so the api is never asked something it would refuse. Returns the parsed input or the issues as
 * field messages for a 400.
 */
export function parseAvailabilityQuery(
  params: URLSearchParams
):
  | { ok: true; data: ReturnType<typeof BookingAvailabilitySchema.parse> }
  | { ok: false; errors: Record<string, string> } {
  const parsed = BookingAvailabilitySchema.safeParse({
    offering: params.get("offering") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  })
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error.issues) }
  return { ok: true, data: parsed.data }
}
