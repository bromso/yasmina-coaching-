/** `<time dateTime>`'s value: a plain YYYY-MM-DD slice of the date's UTC calendar day. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The visible date text: en-US, UTC, so server and client agree in any zone. */
export function formatPostDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}
