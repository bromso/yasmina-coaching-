import type { Locale } from "./locales"

// Dates that render under client components (app's note list and pending invitations, account's
// devices, connected accounts, members and invitations) must print the same string on the server
// and in the browser, so the zone is fixed to UTC and the locale is the page's, passed down as a
// prop — never the browser's own. Client-safe: imports nothing outside this package.
//
// English keeps the `dateStyle`/`timeStyle` formatters it always had (byte-identical output).
// Swedish is built by hand: the combined `dateStyle`/`timeStyle` pattern differs between ICU
// versions ("4 mars 2026 05:06" vs "… kl. 05:06"), and so have CLDR's abbreviated Swedish month
// names, so neither comes from the runtime — Bun's ICU need not match the browser's.

const english = {
  date: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }),
  dateTime: new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }),
}

/** Swedish abbreviated month names, January first — today's CLDR forms, fixed here. */
export const SWEDISH_MONTHS = [
  "jan.",
  "feb.",
  "mars",
  "apr.",
  "maj",
  "juni",
  "juli",
  "aug.",
  "sep.",
  "okt.",
  "nov.",
  "dec.",
] as const

const pad = (n: number) => String(n).padStart(2, "0")

/** `iso` as a UTC date ("Mar 4, 2026", "4 mars 2026"), or date and time with `{ time: true }`. */
export function formatUtcDate(
  iso: string,
  locale: Locale,
  { time = false }: { time?: boolean } = {}
): string {
  const date = new Date(iso)
  if (locale === "en") return (time ? english.dateTime : english.date).format(date)
  const day = `${date.getUTCDate()} ${SWEDISH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
  if (!time) return day
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}
