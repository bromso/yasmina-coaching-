import { BOOKING_TIMEZONE, shiftDay, zonedDay } from "@repo/api-contract/booking-limits"
import { INTL_LOCALE, type Locale } from "@/lib/site-locale"

/*
 * Date helpers for the booking pages, client-safe (no Zod, no Node): the calendar day a visitor
 * sees is always a `YYYY-MM-DD` in BOOKING_TIMEZONE, and every ISO instant the api hands back is
 * shown in that zone through `Intl`, whatever the browser's own zone.
 */

// `zonedDay` (an instant's `YYYY-MM-DD` in the booking zone) and `shiftDay` are the contract's,
// the same rules the api's slot engine and the withdrawal period use.
export { shiftDay, zonedDay }

/** A `YYYY-MM-DD` key for a calendar-grid date (react-day-picker hands local-midnight dates). */
export function gridDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** The first and last `YYYY-MM-DD` of the month a grid date falls in. */
export function monthBounds(date: Date): { from: string; to: string } {
  const y = date.getFullYear()
  const m = date.getMonth()
  const last = new Date(y, m + 1, 0).getDate()
  const mm = String(m + 1).padStart(2, "0")
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` }
}

/** `YYYY-MM` of a grid date, the cache key for one month's availability. */
export const monthKey = (date: Date): string => gridDay(date).slice(0, 7)

// `YYYY-MM-DD` keys sort as dates, so the earlier of two is the lexically smaller one.
const earliest = (a: string, b: string) => (a.localeCompare(b) <= 0 ? a : b)
const latest = (a: string, b: string) => (a.localeCompare(b) >= 0 ? a : b)

/**
 * The part of a month the calendar may ask the api for: from the later of the month's start and
 * `today`, to the earlier of its end and `today + horizon`. `null` when nothing of the month is
 * bookable, so no request is made.
 */
export function bookableRange(
  date: Date,
  today: string,
  horizonDays: number
): { from: string; to: string } | null {
  const { from, to } = monthBounds(date)
  const start = latest(from, today)
  const end = earliest(to, shiftDay(today, horizonDays))
  return start <= end ? { from: start, to: end } : null
}

// Weekday and month names, and the day-month-year order, follow the page's language: `sv-SE`
// or `en-GB`, both 24-hour, both in the booking zone. One set of formatters per locale, built once.
const formatsFor = (locale: Locale) => {
  const tag = INTL_LOCALE[locale]
  return {
    time: new Intl.DateTimeFormat(tag, {
      timeZone: BOOKING_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    day: new Intl.DateTimeFormat(tag, {
      timeZone: BOOKING_TIMEZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    shortDay: new Intl.DateTimeFormat(tag, {
      timeZone: BOOKING_TIMEZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
  }
}
const FORMATS: Record<Locale, ReturnType<typeof formatsFor>> = {
  sv: formatsFor("sv"),
  en: formatsFor("en"),
}

/** `14:30`, in the booking zone. */
export const formatTime = (iso: string, locale: Locale): string =>
  FORMATS[locale].time.format(new Date(iso))
/** `måndag 2 mars 2026` / `Monday, 2 March 2026`, in the booking zone. */
export const formatDay = (iso: string, locale: Locale): string =>
  FORMATS[locale].day.format(new Date(iso))
/** `mån 2 mars` / `Mon 2 Mar`, in the booking zone. */
export const formatShortDay = (iso: string, locale: Locale): string =>
  FORMATS[locale].shortDay.format(new Date(iso))
/** `måndag 2 mars 2026, 14:30–15:30`. */
export const formatRange = (startsAt: string, endsAt: string, locale: Locale): string =>
  `${formatDay(startsAt, locale)}, ${formatTime(startsAt, locale)}–${formatTime(endsAt, locale)}`
/** A `YYYY-MM-DD` as `måndag 2 mars 2026` (the day itself, no zone shift). */
export const formatDateKey = (day: string, locale: Locale): string =>
  FORMATS[locale].day.format(new Date(`${day}T12:00:00Z`))
