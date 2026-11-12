import type { Locator } from "@playwright/test"
import {
  BOOKING_TIMEZONE,
  shiftDay,
  withdrawalLastDay,
  zonedDay,
} from "@repo/api-contract/booking-limits"

/**
 * The booking calendar's dates, derived from the clock the way the api derives them, so a
 * journey does not depend on the day it runs. Every day is a `YYYY-MM-DD` in `Europe/Stockholm`.
 */

/** Today and `days` later, for an availability query (`from`/`to`). */
export function availabilityRange(days = 30, now = new Date()): { from: string; to: string } {
  const from = zonedDay(now, BOOKING_TIMEZONE)
  return { from, to: shiftDay(from, days) }
}

/**
 * The `YYYY-MM-DD` of a calendar day button: react-day-picker puts the ISO date on the gridcell
 * around it (`data-day` on the button itself is the browser's locale string, see
 * `packages/ui/src/components/calendar.tsx`).
 */
export async function calendarDay(button: Locator): Promise<string> {
  const day = await button.evaluate(
    (el) => el.closest("[role=gridcell][data-day]")?.getAttribute("data-day") ?? null
  )
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`no ISO day on the cell: ${day}`)
  return day
}

/**
 * Whether a private client booking a first session on `day` must consent to an early start:
 * the day is on or before the withdrawal period's last day (`withdrawalLastDay`, the rule the
 * api and www use: 14 days on, past weekends, Swedish holidays and the three aftnar).
 */
export function needsEarlyStart(day: string, now = new Date()): boolean {
  return day <= withdrawalLastDay(now)
}
