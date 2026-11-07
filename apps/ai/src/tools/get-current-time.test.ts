import { expect, test } from "bun:test"
import { getCurrentTime } from "./get-current-time"

const noonUtc = new Date("2026-01-15T12:00:00Z")

test("formats the time in the requested zone", () => {
  expect(getCurrentTime("UTC", noonUtc)).toEqual({
    timeZone: "UTC",
    iso: "2026-01-15T12:00:00.000Z",
    formatted: "Thursday, January 15, 2026 at 12:00:00 PM UTC",
  })
})

test("uses the zone's offset", () => {
  expect(getCurrentTime("Asia/Tokyo", noonUtc).formatted).toContain("9:00:00 PM")
})

test("an unknown zone throws a message the model can act on", () => {
  expect(() => getCurrentTime("Mars/Olympus", noonUtc)).toThrow(/IANA name/)
})
