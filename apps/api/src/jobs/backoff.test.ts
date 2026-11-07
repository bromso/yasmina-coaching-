import { describe, expect, test } from "bun:test"
import { backoffMs } from "./backoff"

describe("backoffMs", () => {
  test("30 s doubling per attempt, at the midpoint random", () => {
    expect(backoffMs(1, () => 0.5)).toBe(30_000)
    expect(backoffMs(2, () => 0.5)).toBe(60_000)
    expect(backoffMs(3, () => 0.5)).toBe(120_000)
  })

  test("capped at 1 h", () => {
    expect(backoffMs(10, () => 0.5)).toBe(3_600_000)
    expect(backoffMs(20, () => 0.5)).toBe(3_600_000)
  })

  test("jitter bounds: 0 -> x0.8, 1 -> x1.2", () => {
    expect(backoffMs(1, () => 0)).toBe(24_000)
    expect(backoffMs(1, () => 1)).toBe(36_000)
    expect(backoffMs(10, () => 0)).toBe(2_880_000)
    expect(backoffMs(10, () => 1)).toBe(4_320_000)
  })

  test("never negative, even for attempts <= 0", () => {
    expect(backoffMs(0, () => 0)).toBeGreaterThanOrEqual(0)
    expect(backoffMs(-5, () => 0)).toBeGreaterThanOrEqual(0)
  })
})
