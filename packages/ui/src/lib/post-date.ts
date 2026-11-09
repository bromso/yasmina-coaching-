/** `<time dateTime>`'s value: a plain YYYY-MM-DD slice of the date's UTC calendar day. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The visible date text: in `locale` (en-US by default), UTC, so server and client agree in any
 * zone. */
export function formatPostDate(date: Date, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}
