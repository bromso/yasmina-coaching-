import {
  type AdminBooking,
  type AvailabilityBlock,
  BOOKING_CANCEL_CUTOFF_HOURS,
  type BookingAudience,
  type BookingCustomer,
  type BookingLocation,
  type BookingSummary,
  bookingReference,
  type GroupEvent,
  groupEventReference,
  OFFERINGS,
  type OfferingKey,
  type PreferredDate,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { newToken, tokenHash } from "../credentials"
import type { AdminBookingRow, BookingBlockRow, GroupEventWithSeats } from "../queries/booking"
import { formatPreferredDate, formatWhen, formatWhere } from "./format"

/*
 * The shapes the booking procedures return, built from rows, and the one-off helpers the handlers
 * share (manage tokens, the mail-facing "when" strings, the offering's translated label). Pure:
 * no database, no clock beyond what is passed in.
 */

const HOUR = 60 * 60_000

/** Whether the customer may still cancel `row` online at `now`. */
export const cancellableAt = (row: { status: string; starts_at: string | null }, now: Date) =>
  row.status === "confirmed" &&
  row.starts_at !== null &&
  Date.parse(row.starts_at) - now.getTime() >= BOOKING_CANCEL_CUTOFF_HOURS * HOUR

export function toSummary(row: AdminBookingRow, now: Date): BookingSummary {
  return {
    id: row.id,
    reference: bookingReference(row.id),
    offering: row.offering,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    groupEvent:
      row.group_event_id !== null && row.group_event_title !== null
        ? { id: row.group_event_id, title: row.group_event_title }
        : null,
    cancellable: cancellableAt(row, now),
    createdAt: row.created_at,
  }
}

export function parsePreferredDates(json: string): PreferredDate[] {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as PreferredDate[]) : []
  } catch {
    return []
  }
}

export function toAdminBooking(row: AdminBookingRow, now: Date): AdminBooking {
  return {
    ...toSummary(row, now),
    audience: row.audience,
    customer: {
      name: row.customer_name,
      email: row.customer_email,
      organisation: row.organisation,
      phone: row.phone,
    },
    notes: row.notes,
    preferredDates: parsePreferredDates(row.preferred_dates),
    attendees: row.attendees,
    venue: row.venue,
    packageId: row.package_id,
    adminNote: row.admin_note,
    decidedAt: row.decided_at,
    decidedBy:
      row.decided_by !== null && row.decided_by_email !== null
        ? { id: row.decided_by, email: row.decided_by_email }
        : null,
    cancelledAt: row.cancelled_at,
  }
}

export function toGroupEvent(row: GroupEventWithSeats): GroupEvent {
  return {
    id: row.id,
    reference: groupEventReference(row.id),
    title: row.title,
    description: row.description,
    offering: row.offering,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    capacity: row.capacity,
    seatsLeft: Math.max(0, row.capacity - row.seats_taken),
    seriesKey: row.series_key,
  }
}

export const toBlock = (row: BookingBlockRow): AvailabilityBlock => ({
  id: row.id,
  from: row.from_date,
  to: row.to_date,
  reason: row.reason,
})

/** A fresh manage token and its stored hash. */
export function newManageToken() {
  const token = newToken()
  return { token, hash: tokenHash(token) }
}

export const manageUrlFor = (wwwUrl: string, token: string) =>
  `${wwwUrl}/book/manage/${encodeURIComponent(token)}`

/** Where a member books their sessions once a start call is booked (none for other offerings). */
const MEMBER_BOOKING_AFTER: Partial<Record<OfferingKey, OfferingKey>> = {
  inner_start_coaching: "inner_session",
  inner_start_lifestyle: "inner_session",
  inner_start_mentoring: "inner_mentoring_session",
}

export function memberBookingUrlFor(wwwUrl: string, offering: OfferingKey): string | undefined {
  const next = MEMBER_BOOKING_AFTER[offering]
  return next ? `${wwwUrl}/book/${next}` : undefined
}

/** The offering's name in the recipient's language (the catalog's `label` is the English one). */
export function offeringLabel(key: OfferingKey, locale: Locale): string {
  if (locale !== "sv") return OFFERINGS[key].label
  const sv: Record<OfferingKey, string> = {
    session: "Coachingsamtal",
    package_6: "Coachingprogram, 6 samtal",
    package_10: "Coachingprogram, 10 samtal",
    group: "Gruppcoaching",
    workshop: "Workshop eller teamdag",
    enterprise: "Företagsprogram",
    keynote: "Föreläsning",
    inner_start_coaching: "Startsamtal – transformativ coachning",
    inner_start_mentoring: "Startsamtal – mentorskap",
    inner_start_lifestyle: "Startsamtal – livsstilsförändring",
    inner_session: "Samtal för medlemmar",
    inner_mentoring_session: "Mentorssamtal",
    inner_group: "Inifrån-gruppen",
  }
  return sv[key]
}

/** The props every customer-facing booking mail starts from. */
export function mailBasics(
  row: {
    id: number
    offering: OfferingKey
    starts_at: string | null
    ends_at: string | null
    location: BookingLocation
    customer_name: string
    group_event_title?: string | null
  },
  locale: Locale
) {
  const label = row.group_event_title ?? offeringLabel(row.offering, locale)
  return {
    reference: bookingReference(row.id),
    offeringLabel: label,
    when: row.starts_at && row.ends_at ? formatWhen(row.starts_at, row.ends_at, locale) : undefined,
    where: formatWhere(row.location, locale),
    name: row.customer_name,
  }
}

/** The internal "new booking" mail's props (English). */
export function newBookingMailProps(input: {
  reference: string
  offering: OfferingKey
  kind: "instant" | "group" | "request"
  customer: BookingCustomer
  audience: BookingAudience
  location: BookingLocation
  slots?: Array<{ startsAt: string; endsAt: string }>
  eventTitle?: string
  preferredDates?: PreferredDate[]
  attendees?: number
  venue?: string
  message?: string
  adminUrl: string
}) {
  const [first, ...rest] = input.slots ?? []
  return {
    reference: input.reference,
    offeringLabel: input.eventTitle ?? OFFERINGS[input.offering].label,
    kind: input.kind,
    name: input.customer.name,
    email: input.customer.email,
    organisation: input.customer.organisation || undefined,
    phone: input.customer.phone || undefined,
    audience: input.audience,
    location: formatWhere(input.location, "en"),
    when: first ? formatWhen(first.startsAt, first.endsAt, "en") : undefined,
    extraSessions: rest.length
      ? rest.map((s) => formatWhen(s.startsAt, s.endsAt, "en"))
      : undefined,
    preferredDates: input.preferredDates?.length
      ? input.preferredDates.map((d) => formatPreferredDate(d.date, d.part, "en"))
      : undefined,
    attendees: input.attendees,
    venue: input.venue || undefined,
    message: input.message || undefined,
    adminUrl: input.adminUrl,
  }
}
