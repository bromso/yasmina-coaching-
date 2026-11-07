import {
  AdminAvailabilityBlockSchema,
  AdminAvailabilitySetSchema,
  AdminBookingConfirmSchema,
  AdminBookingDecideSchema,
  AdminGroupEventCreateSchema,
  type ApiClient,
  type AvailabilityRule,
  BOOKING_TIME_PATTERN,
  BOOKING_TIMEZONE,
} from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { fieldErrors } from "@repo/ui/components/form-feedback"
import { fromZonedTime } from "date-fns-tz"
import { apiError, type FormState, str, UNAVAILABLE } from "./admin-actions"

const logger = createLogger({ service: "auth" })

export type { FormState }

type Bookings = ApiClient["admin"]["bookings"]
export type BookingDecisionDeps = {
  api: { bookings: Pick<Bookings, "confirm" | "decline" | "cancel"> }
}
export type AvailabilityDeps = {
  api: { bookings: { availability: Pick<Bookings["availability"], "set" | "block" | "unblock"> } }
}
export type GroupEventDeps = {
  api: { bookings: { groupEvents: Pick<Bookings["groupEvents"], "create" | "cancel"> } }
}

export const CONFIRM_BOX_MESSAGE = "Tick the box to confirm."
export const DATETIME_MESSAGE = "Enter a date and time."

/** `<input type="datetime-local">`'s value: `YYYY-MM-DDTHH:MM`, seconds optional. */
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/**
 * A datetime-local value, which the admin typed as Stockholm wall-clock time, as the ISO UTC
 * instant the api stores — or null when it is not a datetime-local value (or not a real date).
 */
export function stockholmLocalToUtc(value: string): string | null {
  if (!DATETIME_LOCAL.test(value)) return null
  const utc = fromZonedTime(value, BOOKING_TIMEZONE)
  return Number.isNaN(utc.getTime()) ? null : utc.toISOString()
}

const optional = (v: string) => (v.trim() ? v : undefined)

const idOf = (fd: FormData) => {
  const id = Number(str(fd, "id"))
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Confirms a pending request at the chosen Stockholm time; CONFLICT (an overlap) is shown verbatim. */
export async function confirmBookingCore(
  deps: BookingDecisionDeps,
  fd: FormData
): Promise<FormState> {
  const values = {
    startsAt: str(fd, "startsAt"),
    durationMinutes: str(fd, "durationMinutes"),
    location: str(fd, "location"),
    note: str(fd, "note"),
  }
  const id = idOf(fd)
  if (id === null) return { ok: false, message: "Not found", values }
  const startsAt = stockholmLocalToUtc(values.startsAt)
  if (!startsAt) return { ok: false, fieldErrors: { startsAt: DATETIME_MESSAGE }, values }
  const parsed = AdminBookingConfirmSchema.safeParse({
    id,
    startsAt,
    durationMinutes: optional(values.durationMinutes),
    location: optional(values.location),
    note: optional(values.note),
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.confirm(parsed.data)
    return { ok: true, message: "Booking confirmed." }
  } catch (error) {
    const known = apiError(error, ["CONFLICT", "NOT_FOUND"])
    if (!known) logger.error("confirmBooking failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Declines a pending request, with an optional note to the customer. */
export async function declineBookingCore(
  deps: BookingDecisionDeps,
  fd: FormData
): Promise<FormState> {
  const values = { note: str(fd, "note") }
  const id = idOf(fd)
  if (id === null) return { ok: false, message: "Not found", values }
  const parsed = AdminBookingDecideSchema.safeParse({ id, note: optional(values.note) })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.decline(parsed.data)
    return { ok: true, message: "Request declined." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("declineBooking failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Cancels a confirmed booking; the "Yes, cancel" box stands in for a JS confirm. */
export async function cancelBookingCore(
  deps: BookingDecisionDeps,
  fd: FormData
): Promise<FormState> {
  const values = { note: str(fd, "note") }
  if (str(fd, "confirm") !== "yes") return { ok: false, message: CONFIRM_BOX_MESSAGE, values }
  const id = idOf(fd)
  if (id === null) return { ok: false, message: "Not found", values }
  const parsed = AdminBookingDecideSchema.safeParse({ id, note: optional(values.note) })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.cancel(parsed.data)
    return { ok: true, message: "Booking cancelled." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("cancelBooking failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const

/**
 * The weekly rules form: per weekday an `available-<w>` box and `start-<w>` / `end-<w>` times.
 * Every ticked weekday becomes one rule; the set replaces whatever was stored. Errors are keyed
 * by the input that is wrong, so the table marks the right cell.
 */
export async function setAvailabilityCore(
  deps: AvailabilityDeps,
  fd: FormData
): Promise<FormState> {
  const values: Record<string, string> = {}
  const errors: Record<string, string> = {}
  const rules: AvailabilityRule[] = []
  for (const weekday of WEEKDAYS) {
    const available = str(fd, `available-${weekday}`) === "on"
    const start = str(fd, `start-${weekday}`)
    const end = str(fd, `end-${weekday}`)
    values[`available-${weekday}`] = available ? "on" : ""
    values[`start-${weekday}`] = start
    values[`end-${weekday}`] = end
    if (!available) continue
    if (!BOOKING_TIME_PATTERN.test(start)) errors[`start-${weekday}`] = "Enter a time."
    if (!BOOKING_TIME_PATTERN.test(end)) errors[`end-${weekday}`] = "Enter a time."
    else if (BOOKING_TIME_PATTERN.test(start) && start >= end) {
      errors[`end-${weekday}`] = "End must be after start."
    }
    if (!errors[`start-${weekday}`] && !errors[`end-${weekday}`]) {
      rules.push({ weekday, start, end })
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors, values }
  const parsed = AdminAvailabilitySetSchema.safeParse({ rules })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.availability.set(parsed.data)
    return {
      ok: true,
      message: rules.length === 0 ? "Saved: no weekly availability." : "Weekly availability saved.",
    }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("setAvailability failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Blocks a range of days (from/to inclusive, Stockholm dates). */
export async function blockDaysCore(deps: AvailabilityDeps, fd: FormData): Promise<FormState> {
  const values = { from: str(fd, "from"), to: str(fd, "to"), reason: str(fd, "reason") }
  const parsed = AdminAvailabilityBlockSchema.safeParse({
    from: values.from,
    to: values.to || values.from,
    reason: optional(values.reason),
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.availability.block(parsed.data)
    return { ok: true, message: "Days blocked." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("blockDays failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Removes one blocked range. */
export async function unblockDaysCore(deps: AvailabilityDeps, fd: FormData): Promise<FormState> {
  const id = idOf(fd)
  if (id === null) return { ok: false, message: "Not found" }
  try {
    await deps.api.bookings.availability.unblock({ id })
    return { ok: true, message: "Unblocked." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("unblockDays failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/** Schedules a group event, or a weekly series of them; CONFLICT (an overlap) is shown verbatim. */
export async function createGroupEventCore(deps: GroupEventDeps, fd: FormData): Promise<FormState> {
  const values = {
    title: str(fd, "title"),
    description: str(fd, "description"),
    startsAt: str(fd, "startsAt"),
    durationMinutes: str(fd, "durationMinutes"),
    capacity: str(fd, "capacity"),
    location: str(fd, "location"),
    repeatWeeks: str(fd, "repeatWeeks"),
    offering: str(fd, "offering"),
  }
  const startsAt = stockholmLocalToUtc(values.startsAt)
  if (!startsAt) return { ok: false, fieldErrors: { startsAt: DATETIME_MESSAGE }, values }
  const parsed = AdminGroupEventCreateSchema.safeParse({
    title: values.title,
    description: optional(values.description),
    startsAt,
    durationMinutes: values.durationMinutes,
    capacity: values.capacity,
    location: values.location,
    repeatWeeks: optional(values.repeatWeeks),
    offering: optional(values.offering),
  })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    const { ids } = await deps.api.bookings.groupEvents.create(parsed.data)
    return {
      ok: true,
      message: ids.length === 1 ? "Group event created." : `Created ${ids.length} group events.`,
    }
  } catch (error) {
    const known = apiError(error, ["CONFLICT", "NOT_FOUND"])
    if (!known) logger.error("createGroupEvent failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}

/** Cancels a group event and, through the api, tells its seat holders. */
export async function cancelGroupEventCore(deps: GroupEventDeps, fd: FormData): Promise<FormState> {
  const values = { note: str(fd, "note") }
  if (str(fd, "confirm") !== "yes") return { ok: false, message: CONFIRM_BOX_MESSAGE, values }
  const id = idOf(fd)
  if (id === null) return { ok: false, message: "Not found", values }
  const parsed = AdminBookingDecideSchema.safeParse({ id, note: optional(values.note) })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  try {
    await deps.api.bookings.groupEvents.cancel(parsed.data)
    return { ok: true, message: "Group event cancelled." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("cancelGroupEvent failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}
