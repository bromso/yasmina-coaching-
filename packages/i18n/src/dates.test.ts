import { expect, test } from "bun:test"
import { formatUtcDate, SWEDISH_MONTHS } from "./dates"

const at = "2026-03-04T05:06:07.000Z"

test("English is exactly the medium/short formatters it always used", () => {
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" })
  const dateTime = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })
  expect(formatUtcDate(at, "en")).toBe(date.format(new Date(at)))
  expect(formatUtcDate(at, "en", { time: true })).toBe(dateTime.format(new Date(at)))
})

test("Swedish is built by hand, 24-hour and padded, in UTC", () => {
  expect(formatUtcDate(at, "sv")).toBe("4 mars 2026")
  expect(formatUtcDate(at, "sv", { time: true })).toBe("4 mars 2026 05:06")
  expect(formatUtcDate("2026-12-31T23:59:00.000Z", "sv", { time: true })).toBe("31 dec. 2026 23:59")
  // Midnight UTC stays on its own day whatever the runtime's zone.
  expect(formatUtcDate("2026-09-01T00:00:00.000Z", "sv", { time: true })).toBe("1 sep. 2026 00:00")
})

test("the month table covers the year in order", () => {
  expect(SWEDISH_MONTHS).toHaveLength(12)
  const months = SWEDISH_MONTHS.map((_, m) =>
    formatUtcDate(new Date(Date.UTC(2026, m, 15)).toISOString(), "sv")
  )
  expect(months[0]).toBe("15 jan. 2026")
  expect(months[4]).toBe("15 maj 2026")
  expect(months[11]).toBe("15 dec. 2026")
})
