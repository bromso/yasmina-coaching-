import { describe, expect, test } from "bun:test"
import {
  judge,
  type LhrLike,
  LIGHTHOUSE_METRICS,
  LIGHTHOUSE_PAGES,
  lighthouseRun,
  medianRun,
  pageKey,
  VITALS_METRICS,
  VITALS_PAGES,
  vitalsRun,
  withResult,
} from "../apps/e2e/perf/core"
import { loadBudgets } from "../perf/budgets"

const lhr = (score: number | null, lcp = 1200, tbt = 80, cls = 0.01): LhrLike => ({
  categories: { performance: { score } },
  audits: {
    "largest-contentful-paint": { numericValue: lcp },
    "total-blocking-time": { numericValue: tbt },
    "cumulative-layout-shift": { numericValue: cls },
  },
})

const budget = { score: 80, lcpMs: 2500, tbtMs: 200, cls: 0.1 }

describe("perf pages", () => {
  test("every measured page has a budget of its kind", () => {
    const b = loadBudgets()
    expect(LIGHTHOUSE_PAGES.map(pageKey).filter((k) => !b.lighthouse[k])).toEqual([])
    expect(VITALS_PAGES.map(pageKey).filter((k) => !b.vitals[k])).toEqual([])
  })

  test("every budget names a measured page", () => {
    const b = loadBudgets()
    const lh = LIGHTHOUSE_PAGES.map(pageKey)
    const vi = VITALS_PAGES.map(pageKey)
    expect(Object.keys(b.lighthouse).filter((k) => !lh.includes(k))).toEqual([])
    expect(Object.keys(b.vitals).filter((k) => !vi.includes(k))).toEqual([])
  })
})

describe("lighthouseRun", () => {
  test("reads the score as 0-100 and the three audits", () => {
    expect(lighthouseRun(lhr(0.934))).toEqual({ score: 93, lcpMs: 1200, tbtMs: 80, cls: 0.01 })
  })

  test("a runtime error, a null score or a missing audit throws", () => {
    expect(() =>
      lighthouseRun({ ...lhr(0.9), runtimeError: { code: "NO_FCP", message: "no paint" } })
    ).toThrow("NO_FCP")
    expect(() => lighthouseRun(lhr(null))).toThrow("no performance score")
    const partial = lhr(0.9)
    delete partial.audits["total-blocking-time"]
    expect(() => lighthouseRun(partial)).toThrow("total-blocking-time")
  })
})

describe("vitalsRun", () => {
  test("reads LCP and CLS", () => {
    expect(vitalsRun({ lcp: 812.4, cls: 0 })).toEqual({ lcpMs: 812.4, cls: 0 })
  })

  test("a metric that never fired fails rather than reading as 0", () => {
    expect(() => vitalsRun({ cls: 0 })).toThrow("LCP was never reported")
    expect(() => vitalsRun({ lcp: 900 })).toThrow("CLS was never reported")
    expect(() => vitalsRun(undefined)).toThrow("LCP")
    expect(() => vitalsRun({ lcp: Number.NaN, cls: 0 })).toThrow("LCP")
  })
})

describe("judge", () => {
  test("one slow run among three does not fail the page", () => {
    const runs = [lhr(0.95, 1100), lhr(0.4, 9000, 900), lhr(0.93, 1300)].map(lighthouseRun)
    expect(judge("www:/", runs, budget, LIGHTHOUSE_METRICS)).toEqual([])
  })

  test("a median over budget names the key, every run, the median and the budget", () => {
    const runs = [lhr(0.9, 2600), lhr(0.9, 3000), lhr(0.9, 1000)].map(lighthouseRun)
    const [line, ...rest] = judge("www:/", runs, budget, LIGHTHOUSE_METRICS)
    expect(rest).toEqual([])
    expect(line).toContain("www:/ lcpMs")
    expect(line).toContain("median 2600ms")
    expect(line).toContain("runs 2600ms, 3000ms, 1000ms")
    expect(line).toContain("budget 2500ms")
  })

  test("the score is a floor", () => {
    const runs = [lhr(0.7), lhr(0.75), lhr(0.99)].map(lighthouseRun)
    expect(judge("www:/", runs, budget, LIGHTHOUSE_METRICS)).toEqual([
      expect.stringContaining("score: median 75 (runs 70, 75, 99) is below the budget 80"),
    ])
  })

  test("a missing budget fails", () => {
    expect(judge("www:/new", [{ lcpMs: 1, cls: 0 }], undefined, VITALS_METRICS)).toEqual([
      expect.stringContaining("www:/new: no budget"),
    ])
  })
})

test("medianRun rounds ms to 1 and CLS to 0.0001", () => {
  const runs = [
    { lcpMs: 900.6, cls: 0.012345 },
    { lcpMs: 1000.2, cls: 0.1 },
    { lcpMs: 5000, cls: 0 },
  ]
  expect(medianRun(runs, VITALS_METRICS)).toEqual({ lcpMs: 1000, cls: 0.0123 })
})

test("withResult keeps the other keys", () => {
  const before = { vitals: { "www:/": { lcpMs: 1, cls: 0 } } }
  expect(withResult(before, "vitals", "app:/notes", { lcpMs: 2, cls: 0.1 })).toEqual({
    vitals: { "www:/": { lcpMs: 1, cls: 0 }, "app:/notes": { lcpMs: 2, cls: 0.1 } },
  })
})
