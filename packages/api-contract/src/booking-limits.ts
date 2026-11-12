/**
 * Zod-free booking constants: the offering catalog, the scheduling rules and the references. Safe
 * for a browser bundle (`apps/www`'s booking calendar imports it through
 * `@repo/api-contract/booking-limits`); `booking.ts` re-exports everything here for server code.
 */

import { isSwedishNonWorkingDay, shiftDay } from "./swedish-calendar"

export { isSwedishNonWorkingDay, shiftDay, swedishHolidays } from "./swedish-calendar"

/** Every availability rule and every slot a visitor sees is in this zone; storage is UTC. */
export const BOOKING_TIMEZONE = "Europe/Stockholm"

export const BOOKING_AUDIENCES = ["private", "organisation"] as const
export type BookingAudience = (typeof BOOKING_AUDIENCES)[number]

/** Where a session happens: Yasmina's room in Varberg, a video call, or the customer's site. */
export const BOOKING_LOCATIONS = ["varberg", "video", "on_site"] as const
export type BookingLocation = (typeof BOOKING_LOCATIONS)[number]

/**
 * How an offering is booked. `instant`: pick free slots on the calendar, confirmed at once.
 * `group`: take seats at a group event Yasmina has scheduled. `request`: propose dates and
 * details; Yasmina confirms a time from the admin calendar.
 */
export const OFFERING_KINDS = ["instant", "group", "request"] as const
export type OfferingKind = (typeof OFFERING_KINDS)[number]

export const OFFERING_KEYS = [
  "session",
  "package_6",
  "package_10",
  "group",
  "workshop",
  "enterprise",
  "keynote",
  "inner_start_coaching",
  "inner_start_mentoring",
  "inner_start_lifestyle",
  "inner_session",
  "inner_mentoring_session",
  "inner_group",
] as const
export type OfferingKey = (typeof OFFERING_KEYS)[number]

export type Offering = {
  key: OfferingKey
  kind: OfferingKind
  /** English, for the admin pages and internal mail; customer copy lives in the apps' content. */
  label: string
  /** How long one session (or the event) lasts on the calendar. */
  durationMinutes: number
  /** Instant kinds: how many sessions one booking buys (a package books some now, the rest later). */
  sessions: number
  audiences: readonly BookingAudience[]
  locations: readonly BookingLocation[]
}

export const OFFERINGS: Record<OfferingKey, Offering> = {
  session: {
    key: "session",
    kind: "instant",
    label: "Coaching session",
    durationMinutes: 60,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  package_6: {
    key: "package_6",
    kind: "instant",
    label: "Coaching programme, 6 sessions",
    durationMinutes: 60,
    sessions: 6,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  package_10: {
    key: "package_10",
    kind: "instant",
    label: "Coaching programme, 10 sessions",
    durationMinutes: 60,
    sessions: 10,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  group: {
    key: "group",
    kind: "group",
    label: "Group coaching",
    durationMinutes: 120,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  workshop: {
    key: "workshop",
    kind: "request",
    label: "Workshop or team day",
    durationMinutes: 240,
    sessions: 1,
    audiences: ["organisation"],
    locations: ["on_site", "video"],
  },
  enterprise: {
    key: "enterprise",
    kind: "request",
    label: "Enterprise programme",
    durationMinutes: 480,
    sessions: 1,
    audiences: ["organisation"],
    locations: ["on_site", "video", "varberg"],
  },
  keynote: {
    key: "keynote",
    kind: "request",
    label: "Keynote or talk",
    durationMinutes: 60,
    sessions: 1,
    audiences: ["organisation"],
    locations: ["on_site", "video"],
  },
  inner_start_coaching: {
    key: "inner_start_coaching",
    kind: "instant",
    label: "Start call, transformative coaching",
    durationMinutes: 90,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  inner_start_mentoring: {
    key: "inner_start_mentoring",
    kind: "instant",
    label: "Start call, mentoring",
    durationMinutes: 90,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  inner_start_lifestyle: {
    key: "inner_start_lifestyle",
    kind: "instant",
    label: "Start call, lifestyle change",
    durationMinutes: 90,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  inner_session: {
    key: "inner_session",
    kind: "instant",
    label: "Member session",
    durationMinutes: 60,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  inner_mentoring_session: {
    key: "inner_mentoring_session",
    kind: "instant",
    label: "Member mentoring session",
    durationMinutes: 90,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
  inner_group: {
    key: "inner_group",
    kind: "group",
    label: "The Inifrån group",
    durationMinutes: 120,
    sessions: 1,
    audiences: ["private", "organisation"],
    locations: ["varberg", "video"],
  },
}

export const INSTANT_OFFERING_KEYS = OFFERING_KEYS.filter(
  (key) => OFFERINGS[key].kind === "instant"
) as readonly OfferingKey[]
export const REQUEST_OFFERING_KEYS = OFFERING_KEYS.filter(
  (key) => OFFERINGS[key].kind === "request"
) as readonly OfferingKey[]

/** Offerings booked as seats at a group event Yasmina schedules. */
export const GROUP_OFFERING_KEYS = OFFERING_KEYS.filter(
  (key) => OFFERINGS[key].kind === "group"
) as readonly OfferingKey[]
/** Member-only sessions booked from a member link: bookable, but never listed in the catalog. */
export const MEMBER_OFFERING_KEYS = [
  "inner_session",
  "inner_mentoring_session",
] as const satisfies readonly OfferingKey[] as readonly OfferingKey[]

/** The week the calendar offers while `booking_rules` is empty (never stored; see migration 0034). */
export const DEFAULT_AVAILABILITY_RULES: ReadonlyArray<{
  weekday: number
  start: string
  end: string
}> = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "16:00" }))

export const BOOKING_STATUSES = ["pending", "confirmed", "declined", "cancelled"] as const
export type BookingStatus = (typeof BOOKING_STATUSES)[number]

/** Which part of a proposed day a request asks for. */
export const BOOKING_DAY_PARTS = ["morning", "afternoon", "full_day"] as const
export type BookingDayPart = (typeof BOOKING_DAY_PARTS)[number]

/** Slots start on this grid within an availability rule's window. */
export const BOOKING_SLOT_STEP_MINUTES = 30
/** Kept free after every booking, so two sessions never touch. */
export const BOOKING_BUFFER_MINUTES = 15
/** The earliest a slot can start, counted from the moment the calendar is read. */
export const BOOKING_LEAD_HOURS = 24
/** How far ahead the calendar offers slots; later requests are still welcome as requests. */
export const BOOKING_HORIZON_DAYS = 90
/** A customer may cancel from their manage link until this long before a session. */
export const BOOKING_CANCEL_CUTOFF_HOURS = 24
/** `booking.availability` reads at most this many days per call. */
export const BOOKING_AVAILABILITY_MAX_DAYS = 62
/** A request proposes between one and this many dates. */
export const BOOKING_MAX_PREFERRED_DATES = 3
/** A group event's largest room. */
export const GROUP_EVENT_MAX_CAPACITY = 50
/** `admin.bookings.groupEvents.create` repeats a weekly series at most this many times. */
export const GROUP_EVENT_MAX_REPEATS = 12
/** Seats one customer may reserve in one go (several dates of a series, or a couple of people). */
export const GROUP_RESERVE_MAX_EVENTS = 12

export const BOOKING_NAME_MIN = 2
export const BOOKING_NAME_MAX = 100
export const BOOKING_ORGANISATION_MAX = 120
export const BOOKING_PHONE_MAX = 40
export const BOOKING_NOTES_MAX = 2000
export const BOOKING_MESSAGE_MIN = 10
export const BOOKING_MESSAGE_MAX = 3000
export const BOOKING_VENUE_MAX = 200
export const BOOKING_ATTENDEES_MAX = 5000
export const GROUP_EVENT_TITLE_MAX = 120
export const GROUP_EVENT_DESCRIPTION_MAX = 1000

/** `booking.*`'s refusal once the per-client, per-recipient or api-wide limit trips. */
export const BOOKING_RATE_MESSAGE = "Too many booking attempts, try again later."
/** `booking.book`'s refusal when a picked slot is no longer free (or never was). */
export const BOOKING_SLOT_TAKEN_MESSAGE = "That time is no longer available. Pick another slot."
/** `booking.reserve`'s refusal when an event has fewer seats left than asked. */
export const BOOKING_SEATS_FULL_MESSAGE = "That session is fully booked."
/** `booking.manage.cancel`'s refusal inside the cutoff. */
export const BOOKING_CANCEL_LATE_MESSAGE = `Sessions can be cancelled online until ${BOOKING_CANCEL_CUTOFF_HOURS} hours before they start. Reply to your confirmation email instead.`
/** `admin.bookings.confirm`'s refusal when the chosen time collides with another booking. */
export const BOOKING_CONFLICT_MESSAGE = "That time overlaps another booking."
/**
 * `booking.book` / `booking.reserve`'s refusal of a private booking starting within the withdrawal
 * period without the `earlyStart` consent; its `data.field` names the form field.
 */
export const BOOKING_EARLY_START_MESSAGE =
  "Confirm that the session may take place within the withdrawal period, or choose a later time."
export const BOOKING_EARLY_START_FIELD = "earlyStart"

/**
 * A private client's right of withdrawal, in days (lag (2005:59) 2 kap. 12 §): counted in calendar
 * days in `BOOKING_TIMEZONE` from the day of booking, see `withdrawalLastDay`.
 */
export const BOOKING_WITHDRAWAL_DAYS = 14

const dayFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * The `YYYY-MM-DD` of an instant in `timeZone` (the booking zone by default): the one calendar-day
 * rule the slot engine (`apps/api`), the booking pages (`apps/www`) and the withdrawal period share.
 */
export function zonedDay(at: Date, timeZone: string = BOOKING_TIMEZONE): string {
  let format = dayFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    dayFormats.set(timeZone, format)
  }
  return format.format(at)
}

/**
 * The last day of the withdrawal period of a booking made at `now`: the booking's day in the
 * booking zone plus `BOOKING_WITHDRAWAL_DAYS`, moved on past a Saturday, a Sunday, a public holiday
 * or midsommar-, jul- or nyårsafton to the next working day (lag (1930:173) om beräkning av
 * lagstadgad tid).
 */
export function withdrawalLastDay(now: Date): string {
  let day = shiftDay(zonedDay(now), BOOKING_WITHDRAWAL_DAYS)
  while (isSwedishNonWorkingDay(day)) day = shiftDay(day, 1)
  return day
}

/**
 * Whether a session starting at `startsAt` (ISO) falls within the withdrawal period of a booking
 * made at `now`: its calendar day in the booking zone is from today through `withdrawalLastDay`.
 */
export function startsWithinWithdrawal(startsAt: string, now: Date): boolean {
  const day = zonedDay(new Date(startsAt))
  return day >= zonedDay(now) && day <= withdrawalLastDay(now)
}

/**
 * Whether booking `offering` is a new purchase, and so a new contract with its own right of
 * withdrawal. A member's session (`MEMBER_OFFERING_KEYS`) is not: it is part of the membership the
 * start call already bought, and the right attaches to that contract, not to each session.
 */
export function opensNewContract(offering: string): boolean {
  return !(MEMBER_OFFERING_KEYS as readonly string[]).includes(offering)
}

/**
 * Whether a booking needs the consent to start within the withdrawal period (lag (2005:59)
 * 2 kap. 11 § 1): a private client's new purchase (`opensNewContract`) whose first session falls
 * inside it. Organisations have no right of withdrawal, so they never do.
 */
export function earlyStartRequired(
  offering: string,
  audience: string,
  startsAts: readonly string[],
  now: Date
): boolean {
  if (audience !== "private" || startsAts.length === 0 || !opensNewContract(offering)) return false
  const first = [...startsAts].sort((a, b) => Date.parse(a) - Date.parse(b))[0] as string
  return startsWithinWithdrawal(first, now)
}

/** The reference a booking is known by, in mail and on the admin pages: `BK-<id>`. */
export const bookingReference = (id: number) => `BK-${id}`
/** The reference a group event is known by: `GE-<id>`. */
export const groupEventReference = (id: number) => `GE-${id}`

/** `YYYY-MM-DD`, the only date shape the booking procedures accept. */
export const BOOKING_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
/** `HH:MM`, 24-hour, the shape of an availability rule's bounds. */
export const BOOKING_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
