import {
  BOOKING_BUFFER_MINUTES,
  BOOKING_HORIZON_DAYS,
  BOOKING_LEAD_HOURS,
  BOOKING_SLOT_STEP_MINUTES,
  BOOKING_TIMEZONE,
} from "@repo/api-contract"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

/*
 * The slot engine, pure: rules and busy intervals in, free slots out. Rules are wall-clock windows
 * in BOOKING_TIMEZONE per weekday; everything else is UTC instants. A slot is offered when it
 * starts on the step grid inside a rule's window, ends inside it too, starts at least
 * BOOKING_LEAD_HOURS after `now`, lies within BOOKING_HORIZON_DAYS, its day is not blocked, and it
 * keeps BOOKING_BUFFER_MINUTES clear of every busy interval on both sides.
 */

export type Rule = { weekday: number; start: string; end: string }
export type Interval = { startsAt: string; endsAt: string }
export type Block = { from: string; to: string }

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** `YYYY-MM-DD` of `at` in the booking zone. */
export const zonedDay = (at: Date, timeZone = BOOKING_TIMEZONE) =>
  formatInTimeZone(at, timeZone, "yyyy-MM-dd")

/** `Date#getDay` of a `YYYY-MM-DD` calendar day (the weekday is zone-independent for a date). */
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

/** The UTC instant of `HH:MM` on `day` in the booking zone (DST-aware). */
export const zonedInstant = (day: string, time: string, timeZone = BOOKING_TIMEZONE) =>
  fromZonedTime(`${day}T${time}:00`, timeZone)

/** `day` shifted by `delta` days, as `YYYY-MM-DD`. */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Every day from `from` through `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) out.push(day)
  return out
}

export const isBlocked = (day: string, blocks: readonly Block[]) =>
  blocks.some((b) => b.from <= day && day <= b.to)

/** Two instants overlap when one starts before the other ends. */
export const overlaps = (a: Interval, b: Interval) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)

/** `interval` padded by the buffer on both sides, so neighbours never touch. */
export const padded = (interval: Interval, minutes = BOOKING_BUFFER_MINUTES): Interval => ({
  startsAt: new Date(Date.parse(interval.startsAt) - minutes * MINUTE).toISOString(),
  endsAt: new Date(Date.parse(interval.endsAt) + minutes * MINUTE).toISOString(),
})

export type SlotInput = {
  day: string
  durationMinutes: number
  rules: readonly Rule[]
  blocks: readonly Block[]
  busy: readonly Interval[]
  now: Date
  timeZone?: string
}

/** The free slots on one day, ascending, as ISO UTC intervals. */
export function slotsForDay({
  day,
  durationMinutes,
  rules,
  blocks,
  busy,
  now,
  timeZone = BOOKING_TIMEZONE,
}: SlotInput): Interval[] {
  if (isBlocked(day, blocks)) return []
  const earliest = now.getTime() + BOOKING_LEAD_HOURS * 60 * MINUTE
  const latest = now.getTime() + BOOKING_HORIZON_DAYS * DAY
  const weekday = weekdayOf(day)
  const taken = busy.map((b) => padded(b))
  const slots: Interval[] = []
  for (const rule of rules) {
    if (rule.weekday !== weekday) continue
    const open = zonedInstant(day, rule.start, timeZone).getTime()
    const close = zonedInstant(day, rule.end, timeZone).getTime()
    for (
      let start = open;
      start + durationMinutes * MINUTE <= close;
      start += BOOKING_SLOT_STEP_MINUTES * MINUTE
    ) {
      if (start < earliest || start > latest) continue
      const slot = {
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(start + durationMinutes * MINUTE).toISOString(),
      }
      if (taken.some((t) => overlaps(slot, t))) continue
      slots.push(slot)
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/**
 * Whether `slot` is one the engine would offer right now: the check `booking.book` runs again,
 * inside its transaction, on every slot a visitor sends (a slot the calendar showed a minute ago
 * may be gone, and a hand-crafted one may never have existed).
 */
export function isOfferedSlot(slot: Interval, input: Omit<SlotInput, "day">): boolean {
  const day = zonedDay(new Date(slot.startsAt), input.timeZone)
  return slotsForDay({ ...input, day }).some(
    (s) => s.startsAt === slot.startsAt && s.endsAt === slot.endsAt
  )
}

/** `minutes` after `startsAt`, ISO. */
export const endOf = (startsAt: string, minutes: number) =>
  new Date(Date.parse(startsAt) + minutes * MINUTE).toISOString()
