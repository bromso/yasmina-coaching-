import { describe, expect, mock, test } from "bun:test"

const sent: unknown[] = []
mock.module("@repo/telemetry/browser", () => ({
  reportVital: (metric: unknown) => sent.push(metric),
  reportError: () => {},
  installBrowserHandlers: () => {},
}))
const { reportWebVitals } = await import("./web-vitals")

describe("reportWebVitals", () => {
  test("outside development every metric goes to reportVital", () => {
    const metric = {
      name: "LCP",
      value: 1200,
      rating: "good",
      delta: 1200,
      id: "v1",
      navigationType: "navigate",
      entries: [],
    }
    reportWebVitals(metric as never, "production")
    expect(sent).toEqual([metric])
  })
  test("in development it only logs", () => {
    sent.length = 0
    const metric = {
      name: "CLS",
      value: 0.01,
      rating: "good",
      delta: 0.01,
      id: "v2",
      navigationType: "navigate",
      entries: [],
    }
    reportWebVitals(metric as never, "development")
    expect(sent).toEqual([])
  })
})
