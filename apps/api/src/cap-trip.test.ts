import { expect, test } from "bun:test"
import { capTripLogger } from "./cap-trip"

test("logs a tripped cap once per key per window", () => {
  let t = 0
  const lines: string[] = []
  const note = capTripLogger((message) => lines.push(message), { everyMs: 60_000, now: () => t })
  note("reset:global")
  note("reset:global")
  note("magic:global")
  t = 59_999
  note("reset:global")
  expect(lines).toEqual([
    "rate cap tripped: reset:global (refusing until the window passes)",
    "rate cap tripped: magic:global (refusing until the window passes)",
  ])
  t = 60_000
  note("reset:global")
  expect(lines).toHaveLength(3)
})
