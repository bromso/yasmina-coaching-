import { describe, expect, test } from "bun:test"
import {
  addDays,
  addMonths,
  blockedDays,
  monthGrid,
  monthKey,
  monthLabel,
  monthRange,
  parseMonth,
  suggestedStart,
} from "./admin-calendar"

describe("parseMonth", () => {
  test("a well-formed ?month is used", () => {
    expect(parseMonth("2026-06")).toEqual({ year: 2026, month: 6 })
    expect(parseMonth(["2026-12", "x"])).toEqual({ year: 2026, month: 12 })
  })

  test("anything else is the current Stockholm month", () => {
    // 23:30 UTC on 31 May is already 1 June in Stockholm.
    const now = new Date("2026-05-31T23:30:00.000Z")
    expect(parseMonth(undefined, now)).toEqual({ year: 2026, month: 6 })
    expect(parseMonth("2026-13", now)).toEqual({ year: 2026, month: 6 })
    expect(parseMonth("1999-01", now)).toEqual({ year: 2026, month: 6 })
    expect(parseMonth("junk", now)).toEqual({ year: 2026, month: 6 })
  })
})

test("monthKey, addMonths and monthLabel", () => {
  expect(monthKey({ year: 2026, month: 6 })).toBe("2026-06")
  expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
  expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  expect(monthLabel({ year: 2026, month: 6 })).toBe("June 2026")
})

test("monthRange is the first and last day, within the api's 62-day cap", () => {
  expect(monthRange({ year: 2026, month: 2 })).toEqual({ from: "2026-02-01", to: "2026-02-28" })
  expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" })
  expect(monthRange({ year: 2026, month: 12 })).toEqual({ from: "2026-12-01", to: "2026-12-31" })
})

test("monthGrid starts on Monday and pads both ends", () => {
  // 1 June 2026 is a Monday; 30 June a Tuesday.
  const june = monthGrid({ year: 2026, month: 6 })
  expect(june).toHaveLength(5)
  expect(june[0]?.[0]).toEqual({ date: "2026-06-01", day: 1 })
  expect(june[4]?.[1]).toEqual({ date: "2026-06-30", day: 30 })
  expect(june[4]?.slice(2)).toEqual([null, null, null, null, null])
  // 1 November 2026 is a Sunday: six leading blanks.
  const november = monthGrid({ year: 2026, month: 11 })
  expect(november[0]?.slice(0, 6)).toEqual([null, null, null, null, null, null])
  expect(november[0]?.[6]).toEqual({ date: "2026-11-01", day: 1 })
  for (const week of november) expect(week).toHaveLength(7)
})

test("addDays crosses month and year ends", () => {
  expect(addDays("2026-06-30", 1)).toBe("2026-07-01")
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  expect(addDays("2026-06-01", 61)).toBe("2026-08-01")
})

test("blockedDays expands ranges and clips them to the month", () => {
  const days = blockedDays(
    [
      { from: "2026-05-30", to: "2026-06-02" },
      { from: "2026-06-15", to: "2026-06-15" },
      { from: "2026-06-29", to: "2026-07-05" },
      { from: "2026-08-01", to: "2026-08-03" },
    ],
    { from: "2026-06-01", to: "2026-06-30" }
  )
  expect([...days].sort()).toEqual([
    "2026-06-01",
    "2026-06-02",
    "2026-06-15",
    "2026-06-29",
    "2026-06-30",
  ])
})

test("suggestedStart proposes 09:00 or 13:00 on the first preferred date", () => {
  expect(suggestedStart([{ date: "2026-06-10", part: "morning" }])).toBe("2026-06-10T09:00")
  expect(suggestedStart([{ date: "2026-06-10", part: "afternoon" }])).toBe("2026-06-10T13:00")
  expect(suggestedStart([{ date: "2026-06-10", part: "full_day" }])).toBe("2026-06-10T09:00")
  expect(suggestedStart([])).toBe("")
})
