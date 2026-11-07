import { describe, expect, test } from "bun:test"
import {
  bookableRange,
  formatDateKey,
  formatRange,
  formatShortDay,
  formatTime,
  gridDay,
  monthBounds,
  monthKey,
  shiftDay,
  zonedDay,
} from "./booking-dates"

describe("booking dates", () => {
  test("zonedDay is the Stockholm calendar day, not UTC's", () => {
    // 23:30 UTC on 1 March is 00:30 CET on 2 March.
    expect(zonedDay(new Date("2026-03-01T23:30:00Z"))).toBe("2026-03-02")
    // 22:30 UTC on 1 July is 00:30 CEST on 2 July.
    expect(zonedDay(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02")
    expect(zonedDay(new Date("2026-03-01T10:00:00Z"))).toBe("2026-03-01")
  })

  test("gridDay reads a grid date's own components, zero-padded", () => {
    expect(gridDay(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(gridDay(new Date(2026, 11, 31))).toBe("2026-12-31")
  })

  test("shiftDay crosses months, years and DST changes", () => {
    expect(shiftDay("2026-02-27", 2)).toBe("2026-03-01")
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01")
    expect(shiftDay("2026-03-28", 2)).toBe("2026-03-30")
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28")
  })

  test("monthBounds and monthKey", () => {
    expect(monthBounds(new Date(2026, 1, 10))).toEqual({ from: "2026-02-01", to: "2026-02-28" })
    expect(monthBounds(new Date(2028, 1, 10))).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(monthKey(new Date(2026, 8, 3))).toBe("2026-09")
  })

  test("bookableRange clips a month to today and the horizon, or is null outside both", () => {
    const today = "2026-03-10"
    expect(bookableRange(new Date(2026, 2, 1), today, 90)).toEqual({
      from: "2026-03-10",
      to: "2026-03-31",
    })
    expect(bookableRange(new Date(2026, 3, 1), today, 90)).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    })
    // Horizon: 10 March + 90 days = 8 June.
    expect(bookableRange(new Date(2026, 5, 1), today, 90)).toEqual({
      from: "2026-06-01",
      to: "2026-06-08",
    })
    expect(bookableRange(new Date(2026, 1, 1), today, 90)).toBeNull()
    expect(bookableRange(new Date(2026, 6, 1), today, 90)).toBeNull()
  })

  test("times and days render in Swedish time, 24-hour, with sv-SE weekday and month names", () => {
    expect(formatTime("2026-03-02T08:00:00Z", "sv")).toBe("09:00")
    expect(formatTime("2026-07-02T08:00:00Z", "sv")).toBe("10:00")
    expect(formatRange("2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", "sv")).toBe(
      "måndag 2 mars 2026, 09:00–10:00"
    )
    expect(formatShortDay("2026-03-02T08:00:00Z", "sv")).toBe("mån 2 mars")
    expect(formatDateKey("2026-03-02", "sv")).toBe("måndag 2 mars 2026")
  })

  test("in English: en-GB names and order, still 24-hour and still Stockholm time", () => {
    expect(formatTime("2026-03-02T13:30:00Z", "en")).toBe("14:30")
    expect(formatTime("2026-07-02T08:00:00Z", "en")).toBe("10:00")
    expect(formatRange("2026-03-02T08:00:00Z", "2026-03-02T09:00:00Z", "en")).toBe(
      "Monday, 2 March 2026, 09:00–10:00"
    )
    expect(formatShortDay("2026-03-02T08:00:00Z", "en")).toBe("Mon 2 Mar")
    expect(formatDateKey("2026-03-02", "en")).toBe("Monday, 2 March 2026")
  })
})
