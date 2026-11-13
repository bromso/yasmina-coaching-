/*
 * Swedish calendar days, pure and Zod-free (the booking pages' browser bundle imports it through
 * `./booking-limits`). Dates are `YYYY-MM-DD` calendar days, never instants, so no time zone and
 * no DST enters here.
 */

/** `day` shifted by `delta` calendar days, as `YYYY-MM-DD` (UTC noon avoids any DST edge). */
export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const ymd = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

/** `Date#getDay` of a calendar day: 0 = Sunday … 6 = Saturday. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay()

/** Påskdagen, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(year, month, day)
}

/** The Saturday from `from` (a day in `year`'s `month`) through the next six days. */
function saturdayFrom(year: number, month: number, from: number): string {
  const start = ymd(year, month, from)
  return shiftDay(start, (6 - weekday(start) + 7) % 7)
}

/**
 * The days a statutory time limit cannot end on besides weekends (lag (1930:173) om beräkning av
 * lagstadgad tid): the public holidays (lag (1989:253) om allmänna helgdagar) and midsommar-, jul-
 * and nyårsafton, sorted. Several always fall on a weekend (påskdagen, pingstdagen, midsommardagen,
 * alla helgons dag) and are listed anyway, so the table reads like the law.
 */
export function swedishHolidays(year: number): string[] {
  const easter = easterSunday(year)
  const midsummer = saturdayFrom(year, 6, 20)
  return [
    ymd(year, 1, 1), // nyårsdagen
    ymd(year, 1, 6), // trettondedag jul
    shiftDay(easter, -2), // långfredagen
    easter, // påskdagen
    shiftDay(easter, 1), // annandag påsk
    ymd(year, 5, 1), // första maj
    shiftDay(easter, 39), // Kristi himmelsfärdsdag
    shiftDay(easter, 49), // pingstdagen
    ymd(year, 6, 6), // nationaldagen
    shiftDay(midsummer, -1), // midsommarafton
    midsummer, // midsommardagen
    saturdayFrom(year, 10, 31), // alla helgons dag
    ymd(year, 12, 24), // julafton
    ymd(year, 12, 25), // juldagen
    ymd(year, 12, 26), // annandag jul
    ymd(year, 12, 31), // nyårsafton
  ].sort()
}

const holidaysByYear = new Map<number, Set<string>>()

/** A Saturday, a Sunday or one of `swedishHolidays`: a day a time limit moves past. */
export function isSwedishNonWorkingDay(day: string): boolean {
  const dow = weekday(day)
  if (dow === 0 || dow === 6) return true
  const year = Number(day.slice(0, 4))
  let holidays = holidaysByYear.get(year)
  if (!holidays) {
    holidays = new Set(swedishHolidays(year))
    holidaysByYear.set(year, holidays)
  }
  return holidays.has(day)
}
