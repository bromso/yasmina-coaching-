import { describe, expect, test } from "bun:test"
import {
  API_PROCEDURES,
  apiBudget,
  applyHeadroom,
  type Budgets,
  breaches,
  bundleBudget,
  clsBudget,
  formatBreach,
  LIGHTHOUSE_LCP_FLOOR_MS,
  LIGHTHOUSE_TBT_FLOOR_MS,
  labMsBudget,
  loadBudgets,
  median,
  mergeBudgets,
  mergeResults,
  type RepoContext,
  repoContext,
  scoreBudget,
  serializeBudgets,
  VITALS_LCP_FLOOR_MS,
  validateBudgets,
} from "../perf/budgets"

const ctx: RepoContext = {
  routes: { www: ["/", "/terms"], blog: ["/", "/[slug]"] },
  pages: ["www:/", "blog:/welcome"],
  procedures: ["auth.me", "notes.list"],
}

const valid = (): Budgets => ({
  bundles: { www: { "/": 120, "/terms": 110 }, blog: { "/[slug]": 130 } },
  lighthouse: { "www:/": { score: 80, lcpMs: 2500, tbtMs: 200, cls: 0.05 } },
  vitals: { "blog:/welcome": { lcpMs: 1500, cls: 0.02 } },
  api: { "auth.me": 60 },
})

describe("headroom", () => {
  test("bundles: + 5 KB below 100 KB, + 5 % above, rounded up to 0.1 KB", () => {
    expect(bundleBudget(40)).toBe(45)
    expect(bundleBudget(100)).toBe(105)
    expect(bundleBudget(200)).toBe(210)
    expect(bundleBudget(37.04)).toBe(42.1)
    expect(bundleBudget(123.45)).toBe(129.7) // 129.6225 → 129.7
  })

  test("lab milliseconds: max(× 1.3, + floor), rounded up to 10 ms", () => {
    // Multiplier wins once the measurement is well above the floor.
    expect(labMsBudget(3000, 200)).toBe(3900)
    expect(labMsBudget(3000, LIGHTHOUSE_LCP_FLOOR_MS)).toBe(3900)
    // Floor wins for a small or noisy measurement, where 1.3× leaves little absolute margin.
    expect(labMsBudget(100, LIGHTHOUSE_TBT_FLOOR_MS)).toBe(300) // 130 vs 300
    expect(labMsBudget(200, VITALS_LCP_FLOOR_MS)).toBe(400) // 260 vs 400
    expect(labMsBudget(1234, 200)).toBe(1610) // 1604.2 → 1610, floor (1434) does not win
    expect(labMsBudget(0, 200)).toBe(200)
  })

  test("score: − 10, integer, floored at 50", () => {
    expect(scoreBudget(95)).toBe(85)
    expect(scoreBudget(87.6)).toBe(78)
    expect(scoreBudget(58)).toBe(50)
    expect(scoreBudget(30)).toBe(50)
  })

  test("CLS: the larger of × 1.3 and + 0.02, rounded up to 0.001", () => {
    expect(clsBudget(0)).toBe(0.02)
    expect(clsBudget(0.05)).toBe(0.07) // + 0.02 beats × 1.3 (0.065)
    expect(clsBudget(0.1)).toBe(0.13) // × 1.3 beats + 0.02 (0.12)
    expect(clsBudget(0.0123)).toBe(0.033) // 0.0323 → 0.033
  })

  test("api: × 1.5, rounded up to 10 ms, floored at 50 ms", () => {
    expect(apiBudget(10)).toBe(160) // 10 + 150
    expect(apiBudget(19)).toBe(170) // 169 → 170
    expect(apiBudget(400)).toBe(600) // × 1.5 wins above 300 ms
  })

  test("applyHeadroom maps every section present and leaves out the rest", () => {
    const out = applyHeadroom({
      bundles: { www: { "/": 100 } },
      lighthouse: { "www:/": { score: 90, lcpMs: 2000, tbtMs: 100, cls: 0 } },
      vitals: { "www:/": { lcpMs: 200, cls: 0 } },
      api: { "auth.me": 20 },
    })
    expect(out).toEqual({
      bundles: { www: { "/": 105 } },
      // lcpMs: max(2600, 2800) = 2800; tbtMs: max(130, 300) = 300 — both floor-bound.
      lighthouse: { "www:/": { score: 80, lcpMs: 2800, tbtMs: 300, cls: 0.02 } },
      // lcpMs: max(260, 400) = 400 — floor-bound.
      vitals: { "www:/": { lcpMs: 400, cls: 0.02 } },
      // max(30, 170) = 170 — floor-bound.
      api: { "auth.me": 170 },
    })
  })

  test("mergeResults keeps the worse value per key, the lower score", () => {
    const merged = mergeResults([
      {
        bundles: { www: { "/": 100 } },
        lighthouse: { "www:/": { score: 90, lcpMs: 2000, tbtMs: 100, cls: 0.01 } },
      },
      {
        bundles: { www: { "/": 90, "/terms": 80 } },
        lighthouse: { "www:/": { score: 70, lcpMs: 1500, tbtMs: 300, cls: 0 } },
      },
    ])
    expect(merged.bundles).toEqual({ www: { "/": 100, "/terms": 80 } })
    expect(merged.lighthouse).toEqual({
      "www:/": { score: 70, lcpMs: 2000, tbtMs: 300, cls: 0.01 },
    })
  })

  test("mergeBudgets replaces measured keys and keeps the others", () => {
    const next = mergeBudgets(valid(), { bundles: { www: { "/": 99 } }, api: { "notes.list": 70 } })
    expect(next.bundles).toEqual({ www: { "/": 99, "/terms": 110 }, blog: { "/[slug]": 130 } })
    expect(next.api).toEqual({ "auth.me": 60, "notes.list": 70 })
    expect(next.lighthouse).toEqual(valid().lighthouse)
  })
})

describe("median", () => {
  test("odd, even and one value; an outlier does not move it", () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1500, 1400, 9000])).toBe(1500)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([7])).toBe(7)
    expect(() => median([])).toThrow()
  })
})

describe("breaches", () => {
  test("ceilings fail above, the score floor fails below", () => {
    expect(breaches({ runs: [1, 5, 9], budget: 4 })).toBe(true)
    expect(breaches({ runs: [1, 3, 9], budget: 4 })).toBe(false)
    expect(breaches({ runs: [70, 75, 99], budget: 80, higherIsBetter: true })).toBe(true)
    expect(breaches({ runs: [80], budget: 80, higherIsBetter: true })).toBe(false)
  })

  test("the message names the key, every run, the median and the budget", () => {
    const line = formatBreach({
      key: "www:/",
      metric: "lcpMs",
      runs: [3000, 3200, 4100],
      budget: 3000,
      unit: " ms",
    })
    expect(line).toBe(
      "www:/ lcpMs: median 3200 ms (runs 3000 ms, 3200 ms, 4100 ms) is over the budget 3000 ms (+200 ms)"
    )
    expect(
      formatBreach({
        key: "www /",
        metric: "first-load JS",
        runs: [130.4],
        budget: 120,
        unit: " KB",
      })
    ).toBe("www / first-load JS: 130.4 KB is over the budget 120 KB (+10.4 KB)")
    expect(
      formatBreach({
        key: "www:/",
        metric: "score",
        runs: [70, 71, 72],
        budget: 80,
        higherIsBetter: true,
      })
    ).toContain("median 71 (runs 70, 71, 72) is below the budget 80 (-9)")
  })
})

describe("validateBudgets", () => {
  test("a valid file has no problems", () => {
    expect(validateBudgets(valid(), ctx)).toEqual([])
  })

  test("an unknown route, app, page and procedure are each named", () => {
    const b = valid()
    b.bundles.www = { "/gone": 100 }
    b.bundles.nope = { "/": 100 }
    b.vitals = { "www:/missing": { lcpMs: 1, cls: 1 } }
    b.api = { "notes.purge": 100 }
    expect(validateBudgets(b, ctx)).toEqual([
      'bundles.www: no page.tsx for route "/gone"',
      'bundles: unknown app "nope"',
      'vitals: "www:/missing" is not a page in apps/e2e/a11y/routes.ts',
      'api: "notes.purge" is not a load-smoke label (apps/load/src/scenarios/api-core.ts)',
    ])
  })

  test("a missing, zero, negative or non-numeric value is refused", () => {
    const b = valid() as unknown as Record<string, Record<string, unknown>>
    b.lighthouse = { "www:/": { score: 80, lcpMs: 0, tbtMs: -1 } }
    b.api = { "auth.me": "60" }
    ;(b.bundles as Record<string, Record<string, unknown>>).www = { "/": null }
    expect(validateBudgets(b, ctx)).toEqual([
      'bundles.www["/"] must be a positive number',
      'lighthouse["www:/"].lcpMs must be a positive number',
      'lighthouse["www:/"].tbtMs must be a positive number',
      'lighthouse["www:/"].cls must be a positive number',
      'api["auth.me"] must be a positive number',
    ])
  })

  test("a missing section or an unknown one is refused", () => {
    const { api: _api, ...rest } = valid()
    expect(validateBudgets({ ...rest, extra: {} }, ctx)).toEqual([
      'unknown section "extra"',
      'section "api" is missing or not an object',
    ])
  })
})

describe("the committed budget file", () => {
  const committed = loadBudgets()

  test("validates against the repo's routes, e2e pages and load-smoke labels", () => {
    expect(validateBudgets(committed, repoContext())).toEqual([])
  })

  test("is in perf:update's canonical form (sorted keys, two-space JSON)", async () => {
    const text = await Bun.file(new URL("../perf/budgets.json", import.meta.url)).text()
    expect(text).toBe(serializeBudgets(committed))
  })

  test("budgets every load-smoke label", () => {
    expect(Object.keys(committed.api).sort()).toEqual([...API_PROCEDURES].sort())
  })
})
