import { describe, expect, test } from "bun:test"
import { DISCOUNT, formatKr, HOURLY_RATE, INNER_PRICES, priceFor } from "./inner-pricing"

describe("inner pricing", () => {
  test("rates and discounts", () => {
    expect(HOURLY_RATE).toBe(1500)
    expect(DISCOUNT).toEqual({ single: 0, monthly: 0.1, quarter: 0.15 })
  })

  test("published figures", () => {
    expect(INNER_PRICES.coaching).toEqual({
      start: 2250,
      monthly: 2700,
      quarter: 7650,
    })
    expect(INNER_PRICES.mentoring).toEqual({
      start: 2250,
      monthly: 2025,
      quarter: 5738,
    })
    expect(INNER_PRICES.lifestyle).toEqual({
      start: 2250,
      monthly: 2700,
      quarter: 7650,
    })
    expect(INNER_PRICES.group).toEqual({ monthly: 1980, quarter: 5610 })
    expect(INNER_PRICES.group.start).toBeUndefined()
  })

  test("priceFor applies the tier discount to hours", () => {
    expect(priceFor(2, "monthly", 1000)).toBe(1800)
    expect(priceFor(2, "single")).toBe(3000)
  })

  test("formatKr groups thousands with a non-breaking space and puts one before kr", () => {
    expect(formatKr(2700, "sv")).toBe("2\u00a0700\u00a0kr")
    expect(formatKr(2700, "en")).toBe("2\u00a0700\u00a0kr")
    expect(formatKr(450, "en")).toBe("450\u00a0kr")
  })
})
