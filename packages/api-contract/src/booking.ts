import { z } from "zod"
import { EmailSchema } from "./auth"
import {
  BOOKING_ATTENDEES_MAX,
  BOOKING_AUDIENCES,
  BOOKING_AVAILABILITY_MAX_DAYS,
  BOOKING_BUFFER_MINUTES,
  BOOKING_CANCEL_CUTOFF_HOURS,
  BOOKING_CANCEL_LATE_MESSAGE,
  BOOKING_CONFLICT_MESSAGE,
  BOOKING_DATE_PATTERN,
  BOOKING_DAY_PARTS,
  BOOKING_HORIZON_DAYS,
  BOOKING_LEAD_HOURS,
  BOOKING_LOCATIONS,
  BOOKING_MAX_PREFERRED_DATES,
  BOOKING_MESSAGE_MAX,
  BOOKING_MESSAGE_MIN,
  BOOKING_NAME_MAX,
  BOOKING_NAME_MIN,
  BOOKING_NOTES_MAX,
  BOOKING_ORGANISATION_MAX,
  BOOKING_PHONE_MAX,
  BOOKING_RATE_MESSAGE,
  BOOKING_SEATS_FULL_MESSAGE,
  BOOKING_SLOT_STEP_MINUTES,
  BOOKING_SLOT_TAKEN_MESSAGE,
  BOOKING_STATUSES,
  BOOKING_TIME_PATTERN,
  BOOKING_TIMEZONE,
  BOOKING_VENUE_MAX,
  type BookingAudience,
  type BookingDayPart,
  type BookingLocation,
  type BookingStatus,
  bookingReference,
  DEFAULT_AVAILABILITY_RULES,
  GROUP_EVENT_DESCRIPTION_MAX,
  GROUP_EVENT_MAX_CAPACITY,
  GROUP_EVENT_MAX_REPEATS,
  GROUP_EVENT_TITLE_MAX,
  GROUP_RESERVE_MAX_EVENTS,
  groupEventReference,
  INSTANT_OFFERING_KEYS,
  OFFERING_KEYS,
  OFFERING_KINDS,
  OFFERINGS,
  type Offering,
  type OfferingKey,
  type OfferingKind,
  REQUEST_OFFERING_KEYS,
} from "./booking-limits"

// Like support.ts: this file imports only zod, ./auth and the Zod-free ./booking-limits, never the
// main index, so "@repo/api-contract/booking" stays small. A client component wants
// "@repo/api-contract/booking-limits" (no zod at all); server code gets both from the index.

export type {
  BookingAudience,
  BookingDayPart,
  BookingLocation,
  BookingStatus,
  Offering,
  OfferingKey,
  OfferingKind,
}
export {
  BOOKING_ATTENDEES_MAX,
  BOOKING_AUDIENCES,
  BOOKING_AVAILABILITY_MAX_DAYS,
  BOOKING_BUFFER_MINUTES,
  BOOKING_CANCEL_CUTOFF_HOURS,
  BOOKING_CANCEL_LATE_MESSAGE,
  BOOKING_CONFLICT_MESSAGE,
  BOOKING_DATE_PATTERN,
  BOOKING_DAY_PARTS,
  BOOKING_HORIZON_DAYS,
  BOOKING_LEAD_HOURS,
  BOOKING_LOCATIONS,
  BOOKING_MAX_PREFERRED_DATES,
  BOOKING_MESSAGE_MAX,
  BOOKING_MESSAGE_MIN,
  BOOKING_NAME_MAX,
  BOOKING_NAME_MIN,
  BOOKING_NOTES_MAX,
  BOOKING_ORGANISATION_MAX,
  BOOKING_PHONE_MAX,
  BOOKING_RATE_MESSAGE,
  BOOKING_SEATS_FULL_MESSAGE,
  BOOKING_SLOT_STEP_MINUTES,
  BOOKING_SLOT_TAKEN_MESSAGE,
  BOOKING_STATUSES,
  BOOKING_TIME_PATTERN,
  BOOKING_TIMEZONE,
  BOOKING_VENUE_MAX,
  bookingReference,
  DEFAULT_AVAILABILITY_RULES,
  GROUP_EVENT_DESCRIPTION_MAX,
  GROUP_EVENT_MAX_CAPACITY,
  GROUP_EVENT_MAX_REPEATS,
  GROUP_EVENT_TITLE_MAX,
  GROUP_RESERVE_MAX_EVENTS,
  groupEventReference,
  INSTANT_OFFERING_KEYS,
  OFFERING_KEYS,
  OFFERING_KINDS,
  OFFERINGS,
  REQUEST_OFFERING_KEYS,
}

const Id = z.number().int().positive()
const CoercedId = z.coerce.number().int().positive()
const Iso = z.iso.datetime()
/** `YYYY-MM-DD` in `BOOKING_TIMEZONE`. */
export const BookingDateSchema = z.string().regex(BOOKING_DATE_PATTERN)
export const BookingTimeSchema = z.string().regex(BOOKING_TIME_PATTERN)

export const OfferingKeySchema = z.enum(OFFERING_KEYS)
export const InstantOfferingKeySchema = z.enum(
  INSTANT_OFFERING_KEYS as [OfferingKey, ...OfferingKey[]]
)
export const RequestOfferingKeySchema = z.enum(
  REQUEST_OFFERING_KEYS as [OfferingKey, ...OfferingKey[]]
)
export const BookingAudienceSchema = z.enum(BOOKING_AUDIENCES)
export const BookingLocationSchema = z.enum(BOOKING_LOCATIONS)
export const BookingStatusSchema = z.enum(BOOKING_STATUSES)

/** Who is booking. `organisation` is required by `BookingRequestSchema` (every request kind is B2B). */
export const BookingCustomerSchema = z.object({
  name: z.string().trim().min(BOOKING_NAME_MIN).max(BOOKING_NAME_MAX),
  email: EmailSchema,
  organisation: z.string().trim().max(BOOKING_ORGANISATION_MAX).optional(),
  phone: z.string().trim().max(BOOKING_PHONE_MAX).optional(),
})
export type BookingCustomer = z.infer<typeof BookingCustomerSchema>

/** The `errors` every public booking write declares. */
export const BOOKING_ERRORS = {
  TOO_MANY_REQUESTS: { message: BOOKING_RATE_MESSAGE },
} as const

// ── Availability ───────────────────────────────────────────────────────────────────────────────

export const BookingAvailabilitySchema = z
  .object({
    offering: InstantOfferingKeySchema,
    from: BookingDateSchema,
    to: BookingDateSchema,
  })
  .refine((v) => v.from <= v.to, { message: "`to` must not be before `from`", path: ["to"] })
export const BookingSlotSchema = z.object({ startsAt: Iso, endsAt: Iso })
export type BookingSlot = z.infer<typeof BookingSlotSchema>
export const BookingAvailabilityResultSchema = z.object({
  timezone: z.literal(BOOKING_TIMEZONE),
  durationMinutes: z.number().int().positive(),
  /** One entry per day asked for, in order; a day with no free slot has an empty list. */
  days: z.array(z.object({ date: BookingDateSchema, slots: z.array(BookingSlotSchema) })),
})
export type BookingAvailability = z.infer<typeof BookingAvailabilityResultSchema>

// ── Bookings ───────────────────────────────────────────────────────────────────────────────────

/** A booking as its owner sees it (manage page, confirmation): no admin fields. */
export const BookingSummarySchema = z.object({
  id: Id,
  reference: z.string(),
  offering: OfferingKeySchema,
  status: BookingStatusSchema,
  startsAt: Iso.nullable(),
  endsAt: Iso.nullable(),
  location: BookingLocationSchema,
  groupEvent: z.object({ id: Id, title: z.string() }).nullable(),
  /** Whether `booking.manage.cancel` would accept it right now. */
  cancellable: z.boolean(),
  createdAt: Iso,
})
export type BookingSummary = z.infer<typeof BookingSummarySchema>

export const BookingCreateSchema = z
  .object({
    offering: InstantOfferingKeySchema,
    /** The chosen start times, ISO UTC, each one a slot `booking.availability` offered. */
    slots: z.array(Iso).min(1).max(10),
    audience: BookingAudienceSchema,
    customer: BookingCustomerSchema,
    location: BookingLocationSchema,
    notes: z.string().trim().max(BOOKING_NOTES_MAX).optional(),
  })
  .superRefine((v, ctx) => {
    const offering = OFFERINGS[v.offering]
    if (v.slots.length > offering.sessions) {
      ctx.addIssue({
        code: "custom",
        path: ["slots"],
        message: `${offering.label} covers ${offering.sessions} session(s)`,
      })
    }
    if (new Set(v.slots).size !== v.slots.length) {
      ctx.addIssue({ code: "custom", path: ["slots"], message: "Each slot once" })
    }
    if (!offering.locations.includes(v.location)) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Not offered there" })
    }
    if (!offering.audiences.includes(v.audience)) {
      ctx.addIssue({ code: "custom", path: ["audience"], message: "Not offered to that audience" })
    }
  })
export type BookingCreateInput = z.infer<typeof BookingCreateSchema>

export const BookingPackageSummarySchema = z.object({
  id: Id,
  offering: OfferingKeySchema,
  sessionsTotal: z.number().int().positive(),
  /** Sessions already placed on the calendar (confirmed, not cancelled). */
  sessionsBooked: z.number().int().nonnegative(),
})
export type BookingPackageSummary = z.infer<typeof BookingPackageSummarySchema>

export const BookingCreateResultSchema = z.object({
  reference: z.string(),
  /** The manage page on the marketing site, also sent in the confirmation mail. */
  manageUrl: z.string(),
  bookings: z.array(BookingSummarySchema),
  package: BookingPackageSummarySchema.nullable(),
})
export type BookingCreateResult = z.infer<typeof BookingCreateResultSchema>

// ── Group events ───────────────────────────────────────────────────────────────────────────────

export const GroupEventSchema = z.object({
  id: Id,
  reference: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: Iso,
  endsAt: Iso,
  location: BookingLocationSchema,
  capacity: z.number().int().positive(),
  seatsLeft: z.number().int().nonnegative(),
  /** Shared by the dates of one weekly series, so a visitor can book several at once. */
  seriesKey: z.string().nullable(),
})
export type GroupEvent = z.infer<typeof GroupEventSchema>
export const GroupEventsResultSchema = z.object({ events: z.array(GroupEventSchema) })

export const BookingReserveSchema = z.object({
  eventIds: z.array(Id).min(1).max(GROUP_RESERVE_MAX_EVENTS),
  audience: BookingAudienceSchema,
  customer: BookingCustomerSchema,
  notes: z.string().trim().max(BOOKING_NOTES_MAX).optional(),
})
export type BookingReserveInput = z.infer<typeof BookingReserveSchema>

// ── Requests ───────────────────────────────────────────────────────────────────────────────────

export const PreferredDateSchema = z.object({
  date: BookingDateSchema,
  part: z.enum(BOOKING_DAY_PARTS),
})
export type PreferredDate = z.infer<typeof PreferredDateSchema>

export const BookingRequestSchema = z
  .object({
    offering: RequestOfferingKeySchema,
    customer: BookingCustomerSchema.extend({
      organisation: z.string().trim().min(1).max(BOOKING_ORGANISATION_MAX),
    }),
    location: BookingLocationSchema,
    preferredDates: z.array(PreferredDateSchema).min(1).max(BOOKING_MAX_PREFERRED_DATES),
    attendees: z.number().int().min(1).max(BOOKING_ATTENDEES_MAX).optional(),
    venue: z.string().trim().max(BOOKING_VENUE_MAX).optional(),
    message: z.string().trim().min(BOOKING_MESSAGE_MIN).max(BOOKING_MESSAGE_MAX),
  })
  .superRefine((v, ctx) => {
    if (!OFFERINGS[v.offering].locations.includes(v.location)) {
      ctx.addIssue({ code: "custom", path: ["location"], message: "Not offered there" })
    }
  })
export type BookingRequestInput = z.infer<typeof BookingRequestSchema>
export const BookingRequestResultSchema = z.object({
  reference: z.string(),
  manageUrl: z.string(),
})

// ── Manage (token link) ────────────────────────────────────────────────────────────────────────

export const BookingManageSchema = z.object({ token: z.string().min(20).max(200) })
export const BookingManageResultSchema = z.object({
  customer: z.object({
    name: z.string(),
    email: z.string(),
    organisation: z.string().nullable(),
  }),
  bookings: z.array(BookingSummarySchema),
  package: BookingPackageSummarySchema.nullable(),
})
export type BookingManageResult = z.infer<typeof BookingManageResultSchema>
export const BookingCancelSchema = z.object({
  token: z.string().min(20).max(200),
  bookingId: CoercedId,
})
export const BOOKING_MANAGE_ERRORS = {
  NOT_FOUND: { message: "Not found" },
  TOO_MANY_REQUESTS: { message: BOOKING_RATE_MESSAGE },
} as const
export const BOOKING_CANCEL_ERRORS = {
  ...BOOKING_MANAGE_ERRORS,
  CONFLICT: { message: BOOKING_CANCEL_LATE_MESSAGE },
} as const
export const BOOKING_CREATE_ERRORS = {
  ...BOOKING_ERRORS,
  CONFLICT: { message: BOOKING_SLOT_TAKEN_MESSAGE },
} as const
export const BOOKING_RESERVE_ERRORS = {
  ...BOOKING_ERRORS,
  NOT_FOUND: { message: "Not found" },
  CONFLICT: { message: BOOKING_SEATS_FULL_MESSAGE },
} as const

// ── Admin ──────────────────────────────────────────────────────────────────────────────────────

const Who = z.object({ id: Id, email: z.string() })

/** A booking as the admin calendar shows it: everything the customer typed, plus the decision. */
export const AdminBookingSchema = BookingSummarySchema.extend({
  audience: BookingAudienceSchema,
  customer: z.object({
    name: z.string(),
    email: z.string(),
    organisation: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  notes: z.string().nullable(),
  /** Request kinds only: what the customer proposed. */
  preferredDates: z.array(PreferredDateSchema),
  attendees: z.number().int().nullable(),
  venue: z.string().nullable(),
  packageId: Id.nullable(),
  adminNote: z.string().nullable(),
  decidedAt: Iso.nullable(),
  decidedBy: Who.nullable(),
  cancelledAt: Iso.nullable(),
})
export type AdminBooking = z.infer<typeof AdminBookingSchema>

export const AvailabilityRuleSchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday, as `Date#getDay`. */
    weekday: z.number().int().min(0).max(6),
    start: BookingTimeSchema,
    end: BookingTimeSchema,
  })
  .refine((r) => r.start < r.end, { message: "`end` must be after `start`", path: ["end"] })
export type AvailabilityRule = z.infer<typeof AvailabilityRuleSchema>

export const AvailabilityBlockSchema = z.object({
  id: Id,
  from: BookingDateSchema,
  to: BookingDateSchema,
  reason: z.string().nullable(),
})
export type AvailabilityBlock = z.infer<typeof AvailabilityBlockSchema>

export const AdminBookingCalendarSchema = z
  .object({ from: BookingDateSchema, to: BookingDateSchema })
  .refine((v) => v.from <= v.to, { message: "`to` must not be before `from`", path: ["to"] })
export const AdminBookingCalendarResultSchema = z.object({
  timezone: z.literal(BOOKING_TIMEZONE),
  bookings: z.array(AdminBookingSchema),
  groupEvents: z.array(GroupEventSchema),
  blocks: z.array(AvailabilityBlockSchema),
})
export type AdminBookingCalendar = z.infer<typeof AdminBookingCalendarResultSchema>

export const AdminBookingPendingResultSchema = z.object({ items: z.array(AdminBookingSchema) })

export const AdminBookingConfirmSchema = z.object({
  id: CoercedId,
  startsAt: Iso,
  /** Defaults to the offering's own length. */
  durationMinutes: z.coerce.number().int().min(15).max(600).optional(),
  location: BookingLocationSchema.optional(),
  note: z.string().trim().max(BOOKING_NOTES_MAX).optional(),
})
export const AdminBookingDecideSchema = z.object({
  id: CoercedId,
  note: z.string().trim().max(BOOKING_NOTES_MAX).optional(),
})

export const AdminAvailabilityResultSchema = z.object({
  timezone: z.literal(BOOKING_TIMEZONE),
  rules: z.array(AvailabilityRuleSchema),
  blocks: z.array(AvailabilityBlockSchema),
})
export const AdminAvailabilitySetSchema = z.object({
  rules: z.array(AvailabilityRuleSchema).max(21),
})
export const AdminAvailabilityBlockSchema = z
  .object({
    from: BookingDateSchema,
    to: BookingDateSchema,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.from <= v.to, { message: "`to` must not be before `from`", path: ["to"] })

export const AdminGroupEventCreateSchema = z.object({
  title: z.string().trim().min(2).max(GROUP_EVENT_TITLE_MAX),
  description: z.string().trim().max(GROUP_EVENT_DESCRIPTION_MAX).optional(),
  startsAt: Iso,
  durationMinutes: z.coerce.number().int().min(30).max(600),
  capacity: z.coerce.number().int().min(1).max(GROUP_EVENT_MAX_CAPACITY),
  location: BookingLocationSchema,
  /** 1 creates the event alone; n creates it and n-1 weekly repeats as one series. */
  repeatWeeks: z.coerce.number().int().min(1).max(GROUP_EVENT_MAX_REPEATS).default(1),
})
export const AdminGroupEventCreateResultSchema = z.object({ ids: z.array(Id) })

export const ADMIN_BOOKING_CONFIRM_ERRORS = {
  CONFLICT: { message: BOOKING_CONFLICT_MESSAGE },
} as const

/** `bookingReference(id)` for a booking row, kept next to the schema that shows it. */
export const referenceOf = (row: { id: number }) => bookingReference(row.id)
export const groupReferenceOf = (row: { id: number }) => groupEventReference(row.id)
