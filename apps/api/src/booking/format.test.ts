import { expect, test } from "bun:test"
import { formatPreferredDate, formatWhen, formatWhere } from "./format"

test("formatWhen prints the Stockholm wall-clock range in each language, DST included", () => {
  expect(formatWhen("2026-01-12T08:00:00.000Z", "2026-01-12T09:00:00.000Z", "en")).toBe(
    "Monday 12 January 2026, 09:00–10:00 (Europe/Stockholm)"
  )
  expect(formatWhen("2026-06-15T07:00:00.000Z", "2026-06-15T08:00:00.000Z", "sv")).toBe(
    "måndag 15 juni 2026, kl. 09.00–10.00 (Europe/Stockholm)"
  )
  // Sunday maps to index 0 in the Sunday-first tables.
  expect(formatWhen("2026-01-11T10:00:00.000Z", "2026-01-11T11:00:00.000Z", "en")).toStartWith(
    "Sunday 11 January 2026"
  )
})

test("formatPreferredDate and formatWhere", () => {
  expect(formatPreferredDate("2026-03-04", "morning", "en")).toBe("4 March 2026 (morning)")
  expect(formatPreferredDate("2026-03-04", "full_day", "sv")).toBe("4 mars 2026 (heldag)")
  expect(formatWhere("video", "en")).toBe("on video")
  expect(formatWhere("on_site", "sv")).toBe("hos er")
})
