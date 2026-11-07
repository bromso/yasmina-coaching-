import { describe, expect, test } from "bun:test"
import {
  daysBetween,
  isOfferedSlot,
  overlaps,
  padded,
  shiftDay,
  slotsForDay,
  weekdayOf,
  zonedDay,
  zonedInstant,
} from "./availability"

// A Monday in CET (UTC+1) and a Monday in CEST (UTC+2), to pin the DST handling.
const WINTER = "2026-01-12"
const SUMMER = "2026-06-15"
const rules = [{ weekday: 1, start: "09:00", end: "12:00" }]
const now = new Date("2026-01-01T08:00:00Z")

describe("time helpers", () => {
  test("zonedInstant converts Stockholm wall-clock time to UTC, winter and summer", () => {
    expect(zonedInstant(WINTER, "09:00").toISOString()).toBe("2026-01-12T08:00:00.000Z")
    expect(zonedInstant(SUMMER, "09:00").toISOString()).toBe("2026-06-15T07:00:00.000Z")
  })
  test("zonedDay is the Stockholm calendar day of an instant", () => {
    expect(zonedDay(new Date("2026-01-12T23:30:00Z"))).toBe("2026-01-13")
  })
  test("weekdayOf, shiftDay, daysBetween", () => {
    expect(weekdayOf(WINTER)).toBe(1)
    expect(shiftDay("2026-01-31", 1)).toBe("2026-02-01")
    expect(daysBetween("2026-01-30", "2026-02-01")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
    ])
  })
  test("overlaps is strict at the edges; padded widens by the buffer", () => {
    const a = { startsAt: "2026-01-12T08:00:00.000Z", endsAt: "2026-01-12T09:00:00.000Z" }
    const b = { startsAt: "2026-01-12T09:00:00.000Z", endsAt: "2026-01-12T10:00:00.000Z" }
    expect(overlaps(a, b)).toBe(false)
    expect(overlaps(a, padded(b))).toBe(true)
  })
})

describe("slotsForDay", () => {
  test("offers the step grid inside the rule's window, in UTC", () => {
    const slots = slotsForDay({
      day: WINTER,
      durationMinutes: 60,
      rules,
      blocks: [],
      busy: [],
      now,
    })
    expect(slots.map((s) => s.startsAt)).toEqual([
      "2026-01-12T08:00:00.000Z",
      "2026-01-12T08:30:00.000Z",
      "2026-01-12T09:00:00.000Z",
      "2026-01-12T09:30:00.000Z",
      "2026-01-12T10:00:00.000Z",
    ])
    expect(slots[0]?.endsAt).toBe("2026-01-12T09:00:00.000Z")
  })

  test("a longer duration has fewer starts; a day without a rule has none", () => {
    expect(
      slotsForDay({ day: WINTER, durationMinutes: 120, rules, blocks: [], busy: [], now })
    ).toHaveLength(3)
    expect(
      slotsForDay({ day: "2026-01-13", durationMinutes: 60, rules, blocks: [], busy: [], now })
    ).toEqual([])
  })

  test("a busy interval removes the slots it touches plus the buffer around it", () => {
    const busy = [{ startsAt: "2026-01-12T09:00:00.000Z", endsAt: "2026-01-12T10:00:00.000Z" }]
    const slots = slotsForDay({ day: WINTER, durationMinutes: 60, rules, blocks: [], busy, now })
    // Padded, the booking is busy 08:45–10:15. 08:00 ends inside that; 10:00 starts inside it;
    // 10:30 would be free but ends after the window closes at 11:00 UTC. Nothing is left.
    expect(slots).toEqual([])
    const wide = slotsForDay({
      day: WINTER,
      durationMinutes: 60,
      rules: [{ weekday: 1, start: "09:00", end: "13:00" }],
      blocks: [],
      busy,
      now,
    })
    expect(wide.map((s) => s.startsAt)).toEqual([
      "2026-01-12T10:30:00.000Z",
      "2026-01-12T11:00:00.000Z",
    ])
  })

  test("a block hides the whole day; the lead time and horizon trim the ends", () => {
    expect(
      slotsForDay({
        day: WINTER,
        durationMinutes: 60,
        rules,
        blocks: [{ from: "2026-01-10", to: "2026-01-12" }],
        busy: [],
        now,
      })
    ).toEqual([])
    const late = new Date("2026-01-11T08:10:00Z") // 24 h later is 08:10: 08:00 is too soon
    const trimmed = slotsForDay({
      day: WINTER,
      durationMinutes: 60,
      rules,
      blocks: [],
      busy: [],
      now: late,
    })
    expect(trimmed.map((s) => s.startsAt)).toEqual([
      "2026-01-12T08:30:00.000Z",
      "2026-01-12T09:00:00.000Z",
      "2026-01-12T09:30:00.000Z",
      "2026-01-12T10:00:00.000Z",
    ])
    const farFuture = new Date("2025-09-01T00:00:00Z") // 133 days before: beyond the horizon
    expect(
      slotsForDay({ day: WINTER, durationMinutes: 60, rules, blocks: [], busy: [], now: farFuture })
    ).toEqual([])
  })

  test("isOfferedSlot accepts an offered slot and refuses an off-grid or busy one", () => {
    const input = { durationMinutes: 60, rules, blocks: [], busy: [], now }
    expect(
      isOfferedSlot(
        { startsAt: "2026-01-12T08:30:00.000Z", endsAt: "2026-01-12T09:30:00.000Z" },
        input
      )
    ).toBe(true)
    expect(
      isOfferedSlot(
        { startsAt: "2026-01-12T08:40:00.000Z", endsAt: "2026-01-12T09:40:00.000Z" },
        input
      )
    ).toBe(false)
    expect(
      isOfferedSlot(
        { startsAt: "2026-01-12T08:30:00.000Z", endsAt: "2026-01-12T09:30:00.000Z" },
        {
          ...input,
          busy: [{ startsAt: "2026-01-12T09:30:00.000Z", endsAt: "2026-01-12T10:30:00.000Z" }],
        }
      )
    ).toBe(false)
  })
})
