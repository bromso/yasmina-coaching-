import { type Browser, expect, test } from "@playwright/test"
import { loadBudgets } from "../../../perf/budgets"
import { urlFor } from "../fixtures/a11y-session"
import { launchForLighthouse, runLighthouse } from "../fixtures/lighthouse"
import {
  judge,
  LIGHTHOUSE_METRICS,
  LIGHTHOUSE_PAGES,
  lighthouseRun,
  medianRun,
  pageKey,
  RUNS,
  recordResult,
} from "../perf/core"

// Lighthouse lab budgets (perf/budgets.json `lighthouse`): three runs per page, the median of
// score / LCP / TBT / CLS judged, the failure naming every run. See docs/guides/performance.md.

const budgets = loadBudgets()
let browser: Browser | undefined
let port = 0

test.beforeAll(async () => {
  ;({ browser, port } = await launchForLighthouse())
})

test.afterAll(async () => {
  await browser?.close()
})

for (const page of LIGHTHOUSE_PAGES) {
  const key = pageKey(page)
  test(`lighthouse: ${key}`, async () => {
    test.setTimeout(180_000)
    const runs = []
    for (let i = 0; i < RUNS; i++) {
      runs.push(lighthouseRun(await runLighthouse(urlFor(page.app, page.path), port)))
    }
    const measured = medianRun(runs, LIGHTHOUSE_METRICS)
    console.log(`${key} lighthouse median ${JSON.stringify(measured)}`)
    recordResult("lighthouse", key, measured)
    const problems = judge(key, runs, budgets.lighthouse[key], LIGHTHOUSE_METRICS)
    expect(problems, problems.join("\n")).toEqual([])
  })
}
