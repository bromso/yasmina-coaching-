import { describe, expect, test } from "bun:test"
import { BrowserBatchSchema, rateVital, TELEMETRY_LIMITS, TelemetryBatchSchema } from "./telemetry"

describe("telemetry schemas", () => {
  test("a browser batch has no app; the api batch requires one", () => {
    const browser = BrowserBatchSchema.parse({
      errors: [{ kind: "boundary", message: "boom" }],
      vitals: [{ name: "LCP", value: 1200, rating: "good", route: "/notes" }],
    })
    expect(browser.errors[0]).toEqual({ kind: "boundary", message: "boom" })
    expect(TelemetryBatchSchema.safeParse(browser).success).toBe(false)
    expect(TelemetryBatchSchema.parse({ ...browser, app: "app" }).app).toBe("app")
    expect(TelemetryBatchSchema.safeParse({ ...browser, app: "evil" }).success).toBe(false)
  })

  test("caps: message, stack, batch size, value sign", () => {
    const long = (n: number) => "x".repeat(n)
    expect(
      BrowserBatchSchema.safeParse({ errors: [{ kind: "server", message: long(501) }], vitals: [] })
        .success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: [{ kind: "server", message: "m", stack: long(TELEMETRY_LIMITS.stack + 1) }],
        vitals: [],
      }).success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: Array.from({ length: TELEMETRY_LIMITS.batch + 1 }, () => ({
          kind: "server",
          message: "m",
        })),
        vitals: [],
      }).success
    ).toBe(false)
    expect(
      BrowserBatchSchema.safeParse({
        errors: [],
        vitals: [{ name: "CLS", value: -1, rating: "good", route: "/" }],
      }).success
    ).toBe(false)
  })

  test("rateVital follows the web-vitals thresholds", () => {
    expect(rateVital("LCP", 2500)).toBe("good")
    expect(rateVital("LCP", 2501)).toBe("needs-improvement")
    expect(rateVital("LCP", 4001)).toBe("poor")
    expect(rateVital("INP", 200)).toBe("good")
    expect(rateVital("INP", 500)).toBe("needs-improvement")
    expect(rateVital("CLS", 0.1)).toBe("good")
    expect(rateVital("CLS", 0.26)).toBe("poor")
  })
})
