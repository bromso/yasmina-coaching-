import { expect, test } from "bun:test"
import { formatVital, ratingClass, ratingLabel } from "./vitals"

test("formatVital prints seconds for LCP, ms for INP, a bare number for CLS", () => {
  expect(formatVital("LCP", 2340)).toBe("2.3 s")
  expect(formatVital("INP", 180.4)).toBe("180 ms")
  expect(formatVital("CLS", 0.0512)).toBe("0.05")
  expect(formatVital("LCP", null)).toBe("—")
})
test("ratingLabel", () => {
  expect(ratingLabel("good")).toBe("Good")
  expect(ratingLabel("needs-improvement")).toBe("Needs improvement")
  expect(ratingLabel("poor")).toBe("Poor")
})
test("ratingClass takes its colour from the tokens: plain when good, destructive when poor", () => {
  expect(ratingClass("good")).toBe("")
  expect(ratingClass("needs-improvement")).toBe("font-medium")
  expect(ratingClass("poor")).toBe("text-destructive font-medium")
})
