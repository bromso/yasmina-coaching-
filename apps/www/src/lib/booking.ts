import { ORPCError } from "@orpc/client"
import {
  type ApiClient,
  BookingAvailabilitySchema,
  BookingCancelSchema,
  BookingCreateSchema,
  BookingManageSchema,
  BookingRequestSchema,
  BookingReserveSchema,
} from "@repo/api-contract"
import {
  BOOKING_EARLY_START_FIELD,
  BOOKING_NOTES_MAX,
  earlyStartRequired,
  GROUP_OFFERING_KEYS,
  OFFERING_KEYS,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { amountFor } from "@/content/booking"
import { BOOKING_FORMS } from "@/content/booking-forms"
import { shiftDay, zonedDay } from "@/lib/booking-dates"
import { type BookingFlow, flowFor, paysIn } from "@/lib/booking-flow"
import {
  type DonePayment,
  donePaymentOf,
  formatOrgNumber,
  isOrgNumber,
  paidFor,
} from "@/lib/mock-payment"
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

/** `booking.manage.get`, which proves a manage token is a package holder's (`packageExtension`). */
export type ManageApi = Pick<ApiClient["booking"]["manage"], "get">
/** `manage` is optional: without it no manage token is ever taken as verified. */
export type BookApi = Pick<ApiClient["booking"], "book"> & { manage?: ManageApi }
/** `groupEvents` dates the ticked events, so a missing `earlyStart` is refused before the write. */
export type ReserveApi = Pick<ApiClient["booking"], "reserve" | "groupEvents">
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
  paid?: DonePayment
): string {
  const params = new URLSearchParams({ ref: reference, manage: manageUrl })
  if (kind) params.set("kind", kind)
  if (paid) params.set("paid", paid)
  return `/book/done?${params.toString()}`
}

const offeringKey = (raw: string): OfferingKey | null =>
  (OFFERING_KEYS as readonly string[]).includes(raw) ? (raw as OfferingKey) : null

/** The invoice details' own limits; the whole billing block must also fit the api's notes. */
export const INVOICE_REFERENCE_MAX = 100
export const INVOICE_ADDRESS_MAX = 300

export type Payment =
  | { ok: true; paid?: DonePayment; block?: string; values: Record<string, string> }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> }

/**
 * The payment a booking of `offering` went through, from the form: nothing for a journey with no
 * payment step; otherwise `paymentMethod` must be a method the offering allows (`paidFor`: invoice
 * alone without a fixed price or with the mock off), and an organisation paying by invoice must
 * give a valid organisation number, an invoice reference and where the invoice goes. Returns the
 * done page's key and a labelled billing block for the booking's notes, so Yasmina's mail carries
 * it; the Swish number is never part of the form. The page's own words, in `locale`.
 */
export function paymentOf(
  fd: FormData,
  offering: string,
  audience: string,
  locale: Locale = SITE_LOCALE,
  extending = false
): Payment {
  const values = {
    paymentMethod: str(fd, "paymentMethod"),
    invoiceOrgNumber: str(fd, "invoiceOrgNumber"),
    invoiceReference: str(fd, "invoiceReference"),
    invoiceAddress: str(fd, "invoiceAddress"),
  }
  const key = offeringKey(offering)
  if (!key || !paysIn(flowFor(key, extending))) return { ok: true, values }
  const copy = BOOKING_FORMS[locale]
  const priced = amountFor(key) !== null
  const method = paidFor(values.paymentMethod, priced)
  if (!method) return { ok: false, fieldErrors: { paymentMethod: copy.check.method }, values }
  const labels = copy.billing
  const lines = [labels.heading, `${labels.method}: ${labels.methods[method]}`]
  const billsOrganisation = method === "invoice" && audience === "organisation"
  if (billsOrganisation) {
    const errors: Record<string, string> = {}
    const reference = values.invoiceReference.trim()
    const address = values.invoiceAddress.trim()
    if (!isOrgNumber(values.invoiceOrgNumber)) {
      errors.invoiceOrgNumber = copy.payment.invoice.orgNumberInvalid
    }
    if (!reference || reference.length > INVOICE_REFERENCE_MAX) {
      errors.invoiceReference = copy.payment.invoice.referenceMissing
    }
    if (!address || address.length > INVOICE_ADDRESS_MAX) {
      errors.invoiceAddress = copy.payment.invoice.addressMissing
    }
    if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors, values }
    lines.push(
      `${labels.orgNumber}: ${formatOrgNumber(values.invoiceOrgNumber)}`,
      `${labels.reference}: ${reference}`,
      `${labels.address}: ${address.replace(/\s*\n\s*/g, ", ")}`
    )
  }
  const block = lines.join("\n")
  if (block.length > BOOKING_NOTES_MAX) {
    return { ok: false, fieldErrors: { invoiceAddress: labels.tooLong }, values }
  }
  return {
    ok: true,
    paid: donePaymentOf(method, audience === "organisation" ? "organisation" : "private", priced),
    block,
    values,
  }
}

/**
 * The visitor's own notes with the billing block after them, within the api's `BOOKING_NOTES_MAX`:
 * the free text is shortened (ending in "…") to make room, the billing block never is.
 */
export function notesWithBilling(notes: string, block?: string): string | undefined {
  // A visitor could type their own "[Betalning]" heading to fake a second block in Yasmina's mail:
  // any line of theirs that opens with a bracketed payment heading loses its bracket.
  const free = notes.trim().replace(/^[ \t]*\[(?=(?:Betalning|Payment)\])/gim, "")
  if (!block) return optional(free)
  const room = BOOKING_NOTES_MAX - block.length - 2
  if (!free || room <= 1) return block
  const kept = free.length > room ? `${free.slice(0, room - 1).trimEnd()}…` : free
  return `${kept}\n\n${block}`
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

/**
 * The terms box (`name="terms"`, `value="on"`, see `TermsField`): a refusal naming it in the page's
 * language when it was not ticked, else nothing. Each core parses its input with
 * `termsAccepted: true` so every other field is still checked (a schema's cross-field rules run
 * only once every field parses), and sends that input only after this check passed; the api
 * stamps the terms version itself.
 */
function termsRefusal(fd: FormData, locale: Locale = SITE_LOCALE): Record<string, string> {
  return str(fd, "terms") === "on" ? {} : { terms: BOOKING_FORMS[locale].check.terms }
}

/**
 * The box for a start within the withdrawal period (`name="earlyStart"`, `value="on"`, see
 * `EarlyStartField`): a refusal naming it when a private client's new purchase has a session
 * inside the period (`earlyStartRequired`, from the offering and the actual start times) and it
 * was not ticked, else nothing. The api judges it again from its own slots and refuses the same way.
 */
function earlyStartRefusal(
  fd: FormData,
  audience: string,
  startsAts: readonly string[],
  now: Date,
  locale: Locale = SITE_LOCALE
): Record<string, string> {
  const required = earlyStartRequired(str(fd, "offering"), audience, startsAts, now)
  if (str(fd, "earlyStart") === "on" || !required) return {}
  return { earlyStart: BOOKING_FORMS[locale].check.earlyStart }
}

/** `true` when the box was ticked, else left out of the api input. */
const earlyStartOf = (fd: FormData) => (str(fd, "earlyStart") === "on" ? true : undefined)

/**
 * When the ticked group events start, from `booking.groupEvents` (the form posts only their ids):
 * an id the list does not hold is left out. `null` when the list cannot be read; the api then
 * judges the consent on its own.
 */
async function groupEventStarts(
  api: ReserveApi,
  offering: string,
  ids: readonly string[]
): Promise<string[] | null> {
  const key = (GROUP_OFFERING_KEYS as readonly string[]).includes(offering)
    ? (offering as OfferingKey)
    : "group"
  try {
    const { events } = await api.groupEvents({ offering: key })
    return events.filter((event) => ids.includes(String(event.id))).map((event) => event.startsAt)
  } catch (error) {
    logger.warn("booking.groupEvents failed", { error })
    return null
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
    // The api's own judgement of the withdrawal-period box: a field error, like the core's.
    const data = error.data as { field?: unknown } | undefined
    if (error.code === "BAD_REQUEST" && data?.field === BOOKING_EARLY_START_FIELD) {
      const message = BOOKING_FORMS[locale].check.earlyStart
      return { ok: false, fieldErrors: { earlyStart: message }, values }
    }
    if (error.code !== "TOO_MANY_REQUESTS" && error.code !== "CONFLICT") {
      logger.warn(`${what} refused`, { code: error.code })
    }
    return { ok: false, message: error.message, code: error.code, values }
  }
  logger.error(`${what} failed`, { error })
  return { ok: false, message: GENERIC_FAILURE[locale], values }
}

/**
 * The manage token of a "Book another" link (`?manage=<token>`), when `booking.manage.get` says it
 * is a package of `offering` with a session left; `undefined` for a token of the wrong shape, one
 * the api does not know, another offering's package, a full one, or any failure. Only then does a
 * booking skip the payment step and the early-start pre-check; the api checks the token again.
 */
export async function packageExtension(
  api: ManageApi | undefined,
  offering: string,
  token: string | undefined
): Promise<string | undefined> {
  if (!api || !token || !BookingManageSchema.safeParse({ token }).success) return undefined
  try {
    const { package: pkg } = await api.get({ token })
    return pkg && pkg.offering === offering && pkg.sessionsBooked < pkg.sessionsTotal
      ? token
      : undefined
  } catch {
    return undefined
  }
}

/**
 * An instant booking (a session or a programme's first sessions). `slots` arrives as one hidden
 * input per picked ISO start. `manageToken` (the page's verified `?manage=`) marks a further
 * session of a programme already bought; it counts only once `packageExtension` verifies it
 * again here, and the api checks it a third time.
 */
export async function bookCore(
  deps: { api: BookApi; locale?: Locale; now?: () => Date },
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
    terms: str(fd, "terms"),
    earlyStart: str(fd, "earlyStart"),
  }
  const manageToken = await packageExtension(
    deps.api.manage,
    values.offering,
    optional(str(fd, "manageToken"))
  )
  const payment = paymentOf(fd, values.offering, values.audience, deps.locale, !!manageToken)
  const parsed = BookingCreateSchema.safeParse({
    offering: values.offering,
    slots,
    audience: values.audience,
    customer: customerOf(fd),
    location: values.location,
    notes: notesWithBilling(values.notes, payment.ok ? payment.block : undefined),
    termsAccepted: true,
    earlyStart: earlyStartOf(fd),
    manageToken,
  })
  const terms = termsRefusal(fd, deps.locale)
  const now = deps.now ? deps.now() : new Date()
  // A further session of a programme already bought opens no new right, so it needs no box. The
  // api checks the token again and otherwise refuses the box like any new order.
  const early = manageToken ? {} : earlyStartRefusal(fd, values.audience, slots, now, deps.locale)
  const all = { ...values, ...payment.values }
  if (!parsed.success || !payment.ok || terms.terms || early.earlyStart) {
    const fieldErrors = {
      ...(payment.ok ? {} : payment.fieldErrors),
      ...(parsed.success ? {} : bookingFieldErrors(parsed.error.issues)),
      ...terms,
      ...early,
    }
    return { ok: false, fieldErrors, values: all }
  }
  try {
    const { reference, manageUrl } = await deps.api.book(parsed.data)
    const flow = flowFor(parsed.data.offering, !!manageToken)
    return {
      ok: true,
      redirectTo: doneUrl(
        reference,
        manageUrl,
        flow === "instant" ? undefined : flow,
        payment.paid
      ),
    }
  } catch (error) {
    return failure(error, "booking.book", all, deps.locale)
  }
}

/**
 * Seats at one or several group events (`eventIds`, one checkbox each). `offering` (a hidden
 * field) is read only to check the payment method; the api decides the offering by the events.
 * The visitor can change it, but all it can change is their own done page's payment line and
 * which methods this check accepts — every method is a mock or an invoice, the billing block in
 * the notes still names the method actually chosen, and nothing is charged — so trusting it is
 * cosmetic and acceptable. A real provider must price the events server-side instead.
 */
export async function reserveSeatsCore(
  deps: { api: ReserveApi; locale?: Locale; now?: () => Date },
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
    terms: str(fd, "terms"),
    earlyStart: str(fd, "earlyStart"),
  }
  const payment = paymentOf(fd, str(fd, "offering"), values.audience, deps.locale)
  const parsed = BookingReserveSchema.safeParse({
    eventIds: eventIds.map((id) => (/^\d+$/.test(id) ? Number(id) : id)),
    audience: values.audience,
    customer: customerOf(fd),
    notes: notesWithBilling(values.notes, payment.ok ? payment.block : undefined),
    termsAccepted: true,
    earlyStart: earlyStartOf(fd),
  })
  const terms = termsRefusal(fd, deps.locale)
  // The events' dates are read only when they could matter: a private client, the box unticked,
  // and a form that would otherwise be sent (with other errors it is refused anyway).
  const starts =
    parsed.success &&
    payment.ok &&
    !terms.terms &&
    values.audience === "private" &&
    values.earlyStart !== "on"
      ? await groupEventStarts(deps.api, str(fd, "offering"), eventIds)
      : null
  const now = deps.now ? deps.now() : new Date()
  const early = earlyStartRefusal(fd, values.audience, starts ?? [], now, deps.locale)
  const all = { ...values, ...payment.values }
  if (!parsed.success || !payment.ok || terms.terms || early.earlyStart) {
    const fieldErrors = {
      ...(payment.ok ? {} : payment.fieldErrors),
      ...(parsed.success ? {} : bookingFieldErrors(parsed.error.issues)),
      ...terms,
      ...early,
    }
    return { ok: false, fieldErrors, values: all }
  }
  try {
    const { reference, manageUrl } = await deps.api.reserve(parsed.data)
    return { ok: true, redirectTo: doneUrl(reference, manageUrl, "group", payment.paid) }
  } catch (error) {
    return failure(error, "booking.reserve", all, deps.locale)
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
    terms: str(fd, "terms"),
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
    termsAccepted: true,
  })
  const terms = termsRefusal(fd, deps.locale)
  if (!parsed.success) {
    const errors = bookingFieldErrors(parsed.error.issues)
    // A path on the list itself ("at least one date") belongs to the first date field.
    if (errors.preferredDates && !errors.date_1) errors.date_1 = errors.preferredDates
    delete errors.preferredDates
    return { ok: false, fieldErrors: { ...errors, ...terms }, values }
  }
  const tomorrow = shiftDay(zonedDay(deps.now ? deps.now() : new Date()), 1)
  const tooSoon = preferredDates.filter((d) => d.date < tomorrow)
  if (tooSoon.length > 0 || terms.terms) {
    const errors: Record<string, string> = { ...terms }
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
