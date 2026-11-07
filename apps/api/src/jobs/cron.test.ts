import { describe, expect, test } from "bun:test"
import { cronMatches, parseCron } from "./cron"

const at = (iso: string) => new Date(iso)
describe("cron", () => {
  test("* and fixed fields", () => {
    expect(cronMatches(parseCron("* * * * *"), at("2026-10-06T12:34:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 * * * *"), at("2026-10-06T12:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 * * * *"), at("2026-10-06T12:01:00Z"))).toBe(false)
    expect(cronMatches(parseCron("15 3 * * *"), at("2026-10-06T03:15:59Z"))).toBe(true)
  })
  test("lists, ranges, steps", () => {
    const spec = parseCron("*/15 9-17 * * 1-5")
    expect(cronMatches(spec, at("2026-10-06T09:45:00Z"))).toBe(true) // Tuesday
    expect(cronMatches(spec, at("2026-10-06T18:00:00Z"))).toBe(false)
    expect(cronMatches(spec, at("2026-10-04T10:00:00Z"))).toBe(false) // Sunday
    expect(cronMatches(parseCron("5,35 * * * *"), at("2026-10-06T00:35:00Z"))).toBe(true)
    expect(cronMatches(parseCron("10-20/5 * * * *"), at("2026-10-06T00:15:00Z"))).toBe(true)
  })
  test("day of week 0 and 7 are both Sunday; day-of-month OR day-of-week when both set", () => {
    expect(cronMatches(parseCron("0 0 * * 7"), at("2026-10-04T00:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 0 * * 0"), at("2026-10-04T00:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 0 1 * 1"), at("2026-10-05T00:00:00Z"))).toBe(true) // a Monday
  })
  test("invalid expressions throw", () => {
    for (const bad of [
      "",
      "* * * *",
      "60 * * * *",
      "* 24 * * *",
      "*/0 * * * *",
      "a * * * *",
      "5-1 * * * *",
      "-5 * * * *",
      "1,,2 * * * *",
      "1-2-3 * * * *",
      "1e1 * * * *",
      "0x1 * * * *",
      "*/1e1 * * * *",
    ])
      expect(() => parseCron(bad)).toThrow()
  })
  test("a field starting with '*' (even with a step) counts as unrestricted for the day-of-month/day-of-week OR rule", () => {
    // dom "*/2" is "starred" (unspecified), even though it narrows the actual set to odd days;
    // with dow restricted to Monday, an odd non-Monday day must not match just because domOk
    // happens to be true for that date.
    const spec = parseCron("0 0 */2 * 1")
    expect(cronMatches(spec, at("2026-10-07T00:00:00Z"))).toBe(false) // Wednesday, date 7 (odd)
    expect(cronMatches(spec, at("2026-10-05T00:00:00Z"))).toBe(true) // Monday, date 5 (odd too)
    expect(cronMatches(spec, at("2026-10-06T00:00:00Z"))).toBe(false) // Tuesday, date 6 (even)
  })
})
