import { stockholmDay } from "./admin"

/**
 * Month maths for `/admin/bookings`. Everything here works on `YYYY-MM-DD` strings and UTC
 * midnight, which is safe because a calendar date carries no zone: the only zone-aware step is
 * deciding what "today" and "this month" are, and that goes through `stockholmDay`.
 */

export type Month = { year: number; month: number }

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** `?month=YYYY-MM` on the page: a plausible month, else the current month in Stockholm. */
export function parseMonth(value: string | string[] | undefined, now: Date = new Date()): Month {
  const v = Array.isArray(value) ? value[0] : value
  const m = typeof v === "string" ? MONTH_PATTERN.exec(v) : null
  if (m) {
    const year = Number(m[1])
    if (year >= 2000 && year <= 2100) return { year, month: Number(m[2]) }
  }
  const today = stockholmDay(now)
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
}

export const monthKey = ({ year, month }: Month) => `${year}-${String(month).padStart(2, "0")}`

export function addMonths({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

const dayString = (d: Date) => d.toISOString().slice(0, 10)

/** The month's first and last day, the `from`/`to` `admin.bookings.calendar` takes. */
export function monthRange({ year, month }: Month): { from: string; to: string } {
  return {
    from: dayString(new Date(Date.UTC(year, month - 1, 1))),
    to: dayString(new Date(Date.UTC(year, month, 0))),
  }
}

/** `June 2026`, the grid's caption. */
export function monthLabel({ year, month }: Month): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * The month as rows of seven, Monday first; a cell outside the month is `null`. `date` is
 * `YYYY-MM-DD`, `day` the number printed in the cell.
 */
export function monthGrid({ year, month }: Month): ({ date: string; day: number } | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7 // Sunday 0 → 6, Monday 1 → 0
  const cells: ({ date: string; day: number } | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= days; day++) {
    cells.push({ date: dayString(new Date(Date.UTC(year, month - 1, day))), day })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const rows: ({ date: string; day: number } | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

/** `YYYY-MM-DD` plus `days` (negative allowed). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return dayString(d)
}

/** Every day of `from`..`to` (inclusive) that lies within `range`, as a set of `YYYY-MM-DD`. */
export function blockedDays(
  blocks: ReadonlyArray<{ from: string; to: string }>,
  range: { from: string; to: string }
): Set<string> {
  const out = new Set<string>()
  for (const block of blocks) {
    // Clip to the range; these are YYYY-MM-DD strings, so plain comparison orders them.
    let day = block.from
    if (day < range.from) day = range.from
    let end = block.to
    if (end > range.to) end = range.to
    while (day <= end) {
      out.add(day)
      day = addDays(day, 1)
    }
  }
  return out
}

/**
 * The `<input type="datetime-local">` default a request's first proposed date suggests: 09:00 for
 * a morning or full day, 13:00 for an afternoon. Empty when the request proposed nothing.
 */
export function suggestedStart(
  preferred: ReadonlyArray<{ date: string; part: "morning" | "afternoon" | "full_day" }>
): string {
  const first = preferred[0]
  if (!first) return ""
  return `${first.date}T${first.part === "afternoon" ? "13:00" : "09:00"}`
}
