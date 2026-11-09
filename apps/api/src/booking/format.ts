import { BOOKING_TIMEZONE, type BookingDayPart, type BookingLocation } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { formatInTimeZone } from "date-fns-tz"

/*
 * The human strings the booking mails carry: when and where, in the recipient's language and in
 * the booking zone. Built by hand (fixed weekday and month tables) rather than Intl so the api's
 * ICU version never changes a mail's wording.
 */

const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const SV_DAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"]
const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const SV_MONTHS_LONG = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
]
const parts = (iso: string, timeZone: string) => {
  const [y, m, d, w, hh, mm] = formatInTimeZone(new Date(iso), timeZone, "yyyy M d i HH mm")
    .split(" ")
    .map(Number)
  // date-fns `i` is ISO weekday (1 = Monday … 7 = Sunday); our tables are Sunday-first.
  return { y, m: (m ?? 1) - 1, d, w: (w ?? 7) % 7, time: `${pad(hh)}:${pad(mm)}` }
}
const pad = (n: number | undefined) => String(n ?? 0).padStart(2, "0")

/** "Monday 12 January 2026, 09:00–10:00 (Europe/Stockholm)" / "måndag 12 januari 2026, 09.00–10.00". */
export function formatWhen(
  startsAt: string,
  endsAt: string,
  locale: Locale,
  timeZone = BOOKING_TIMEZONE
): string {
  const s = parts(startsAt, timeZone)
  const e = parts(endsAt, timeZone)
  if (locale === "sv") {
    const t = (x: string) => x.replace(":", ".")
    return `${SV_DAYS[s.w]} ${s.d} ${SV_MONTHS_LONG[s.m]} ${s.y}, kl. ${t(s.time)}–${t(e.time)} (${timeZone})`
  }
  return `${EN_DAYS[s.w]} ${s.d} ${EN_MONTHS[s.m]} ${s.y}, ${s.time}–${e.time} (${timeZone})`
}

/** "12 January 2026 (morning)" / "12 januari 2026 (förmiddag)". */
export function formatPreferredDate(date: string, part: BookingDayPart, locale: Locale): string {
  const [y, m, d] = date.split("-").map(Number)
  const month = (m ?? 1) - 1
  const partWord =
    locale === "sv"
      ? { morning: "förmiddag", afternoon: "eftermiddag", full_day: "heldag" }[part]
      : { morning: "morning", afternoon: "afternoon", full_day: "full day" }[part]
  return locale === "sv"
    ? `${d} ${SV_MONTHS_LONG[month]} ${y} (${partWord})`
    : `${d} ${EN_MONTHS[month]} ${y} (${partWord})`
}

export function formatWhere(location: BookingLocation, locale: Locale): string {
  const en = { varberg: "in Varberg", video: "on video", on_site: "at your site" }
  const sv = { varberg: "i Varberg", video: "via video", on_site: "hos er" }
  return (locale === "sv" ? sv : en)[location]
}
