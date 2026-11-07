import { describe, expect, test } from "bun:test"
import { createHistogram } from "./histogram"

const within = (actual: number, expected: number, relative = 0.01) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(expected * relative)

describe("histogram", () => {
  test("1..10 000 uniform: percentiles within 1 %", () => {
    const h = createHistogram()
    for (let i = 1; i <= 10_000; i++) h.record(i)
    expect(h.count).toBe(10_000)
    within(h.percentile(50), 5_000)
    within(h.percentile(95), 9_500)
    within(h.percentile(99), 9_900)
    expect(h.percentile(100)).toBe(10_000)
    expect(h.percentile(0)).toBe(1)
    expect(h.max).toBe(10_000)
    within(h.mean, 5_000.5, 0.0001)
  })

  test("sub-millisecond values keep their resolution", () => {
    const h = createHistogram()
    for (let i = 1; i <= 1_000; i++) h.record(i / 1000) // 1 µs … 1 ms
    within(h.percentile(50), 0.5)
    within(h.percentile(99), 0.99)
  })

  test("a single sample: every percentile equals it", () => {
    const h = createHistogram()
    h.record(42.37)
    for (const p of [0, 1, 50, 95, 99, 100]) expect(h.percentile(p)).toBe(42.37)
    expect(h.max).toBe(42.37)
    expect(h.mean).toBe(42.37)
  })

  test("empty: zeros and count 0", () => {
    const h = createHistogram()
    expect(h.count).toBe(0)
    expect(h.percentile(50)).toBe(0)
    expect(h.percentile(99)).toBe(0)
    expect(h.max).toBe(0)
    expect(h.mean).toBe(0)
    expect(h.toJSON()).toMatchObject({ count: 0, p95: 0, max: 0 })
  })

  test("values past 60 s are clamped in the buckets but max stays true", () => {
    const h = createHistogram()
    h.record(120_000)
    expect(h.max).toBe(120_000)
    expect(h.percentile(50)).toBe(120_000)
    h.record(1)
    within(h.percentile(99), 60_000) // the bucket's top, not the true value
    expect(h.percentile(100)).toBe(120_000)
  })

  test("merge adds counts and keeps extremes", () => {
    const a = createHistogram()
    const b = createHistogram()
    for (let i = 1; i <= 100; i++) a.record(i)
    for (let i = 101; i <= 200; i++) b.record(i)
    a.merge(b)
    expect(a.count).toBe(200)
    expect(a.max).toBe(200)
    within(a.percentile(50), 100)
    within(a.mean, 100.5, 0.0001)
    expect(b.count).toBe(100)
  })
})
