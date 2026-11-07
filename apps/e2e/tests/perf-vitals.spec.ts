import { expect, test } from "@playwright/test"
import { loadBudgets } from "../../../perf/budgets"
import { measureVitals } from "../fixtures/vitals"
import {
  judge,
  medianRun,
  pageKey,
  RUNS,
  recordResult,
  VITALS_METRICS,
  VITALS_PAGES,
  vitalsRun,
} from "../perf/core"

// In-browser Web Vitals budgets (perf/budgets.json `vitals`): `web-vitals` injected, three loads
// per page in fresh contexts, the median LCP / CLS judged. A metric that never fired fails the
// page. INP is out: it needs a real interaction. See docs/guides/performance.md.

const budgets = loadBudgets()

for (const page of VITALS_PAGES) {
  const key = pageKey(page)
  test(`vitals: ${key}`, async ({ browser }) => {
    test.setTimeout(120_000)
    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push(vitalsRun(await measureVitals(browser, page)))
    const measured = medianRun(runs, VITALS_METRICS)
    console.log(`${key} vitals runs ${JSON.stringify(runs)} median ${JSON.stringify(measured)}`)
    recordResult("vitals", key, measured)
    const problems = judge(key, runs, budgets.vitals[key], VITALS_METRICS)
    expect(problems, problems.join("\n")).toEqual([])
  })
}
