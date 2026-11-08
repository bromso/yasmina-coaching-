// The pure half of the two perf specs (tests/perf-lighthouse.spec.ts, tests/perf-vitals.spec.ts):
// which pages they measure, turning one run's raw numbers into metrics, medians, the budget
// verdict and the results file. `bun test scripts` imports it (scripts/perf-e2e.test.ts) before
// `bun install`, so it imports no package — only the repo's budget library and Node built-ins.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  breaches,
  formatBreach,
  type LighthouseBudget,
  median,
  RESULTS_DIR,
  type Results,
  type VitalsBudget,
} from "../../../perf/budgets"
import type { AppId } from "../a11y/routes"

export type PerfPage = { app: AppId; path: string; auth: "none" | "user" }

/** Runs per page; the median of these is judged, so one slow run cannot fail CI. */
export const RUNS = 3

/** The public pages Lighthouse scores (design §3). */
export const LIGHTHOUSE_PAGES: PerfPage[] = [
  { app: "www", path: "/", auth: "none" },
  { app: "docs", path: "/getting-started", auth: "none" },
  { app: "blog", path: "/att-leda-genom-en-kris", auth: "none" },
  { app: "help", path: "/getting-started/create-an-account", auth: "none" },
  { app: "jobs", path: "/senior-fullstack-engineer", auth: "none" },
  { app: "auth", path: "/login", auth: "none" },
]

/** The Lighthouse pages plus two signed-in ones (design §4). */
export const VITALS_PAGES: PerfPage[] = [
  ...LIGHTHOUSE_PAGES,
  { app: "app", path: "/notes", auth: "user" },
  { app: "account", path: "/security", auth: "user" },
]

/** The budget key: `<app>:<path>`. */
export const pageKey = (p: PerfPage) => `${p.app}:${p.path}`

type MetricSpec<T> = { metric: keyof T & string; unit: string; higherIsBetter?: boolean }

export const LIGHTHOUSE_METRICS: MetricSpec<LighthouseBudget>[] = [
  { metric: "score", unit: "", higherIsBetter: true },
  { metric: "lcpMs", unit: "ms" },
  { metric: "tbtMs", unit: "ms" },
  { metric: "cls", unit: "" },
]

export const VITALS_METRICS: MetricSpec<VitalsBudget>[] = [
  { metric: "lcpMs", unit: "ms" },
  { metric: "cls", unit: "" },
]

/** The slice of a Lighthouse result (`lhr`) the budget reads. */
export type LhrLike = {
  runtimeError?: { code: string; message: string }
  categories: Record<string, { score: number | null } | undefined>
  audits: Record<string, { numericValue?: number } | undefined>
}

/** One Lighthouse run's metrics; throws when the run errored or a metric is missing. */
export function lighthouseRun(lhr: LhrLike): LighthouseBudget {
  if (lhr.runtimeError) {
    throw new Error(`Lighthouse failed: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`)
  }
  const score = lhr.categories.performance?.score
  if (typeof score !== "number") throw new Error("Lighthouse reported no performance score")
  const audit = (id: string) => {
    const value = lhr.audits[id]?.numericValue
    if (typeof value !== "number") throw new Error(`Lighthouse reported no "${id}"`)
    return value
  }
  return {
    score: Math.round(score * 100),
    lcpMs: audit("largest-contentful-paint"),
    tbtMs: audit("total-blocking-time"),
    cls: audit("cumulative-layout-shift"),
  }
}

/**
 * One page load's Web Vitals, as the injected `web-vitals` script left them. A metric that never
 * fired fails the page: treating it as 0 would pass a page whose measurement broke.
 */
export function vitalsRun(raw: { lcp?: unknown; cls?: unknown } | null | undefined): VitalsBudget {
  const value = (name: "lcp" | "cls", label: string) => {
    const v = raw?.[name]
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`${label} was never reported by web-vitals on this load`)
    }
    return v
  }
  return { lcpMs: value("lcp", "LCP"), cls: value("cls", "CLS") }
}

/** Every budget breach of the median of `runs`, one line each; a missing budget is one too. */
export function judge<T extends { [K in keyof T]: number }>(
  key: string,
  runs: T[],
  budget: T | undefined,
  specs: MetricSpec<T>[]
): string[] {
  if (!budget) {
    return [`${key}: no budget in perf/budgets.json — measure it and run \`bun run perf:update\``]
  }
  if (runs.length === 0) return [`${key}: no runs`]
  const out: string[] = []
  for (const { metric, unit, higherIsBetter } of specs) {
    const b = { runs: runs.map((r) => r[metric]), budget: budget[metric], unit, higherIsBetter }
    if (breaches(b)) out.push(formatBreach({ key, metric, ...b }))
  }
  return out
}

const round = (n: number, decimals: number) => Number(n.toFixed(decimals))

/** The per-metric median of `runs` (ms to 1 ms, CLS to 0.0001), for the results file. */
export function medianRun<T extends { [K in keyof T]: number }>(
  runs: T[],
  specs: MetricSpec<T>[]
): T {
  return Object.fromEntries(
    specs.map(({ metric, unit }) => [
      metric,
      round(median(runs.map((r) => r[metric])), unit === "ms" ? 0 : 4),
    ])
  ) as T
}

/** `existing` with `value` set at `section[key]`; other keys kept. */
export function withResult<S extends "lighthouse" | "vitals">(
  existing: Results,
  section: S,
  key: string,
  value: NonNullable<Results[S]>[string]
): Results {
  return { ...existing, [section]: { ...(existing[section] ?? {}), [key]: value } }
}

/**
 * With `PERF_WRITE_RESULTS=1`, records a page's medians in `perf/.results/<section>.json` for
 * `bun run perf:update`. Specs run in one worker, so read-modify-write is safe.
 */
export function recordResult<S extends "lighthouse" | "vitals">(
  section: S,
  key: string,
  value: NonNullable<Results[S]>[string]
) {
  if (process.env.PERF_WRITE_RESULTS !== "1") return
  const file = join(RESULTS_DIR, `${section}.json`)
  let existing: Results = {}
  try {
    existing = JSON.parse(readFileSync(file, "utf8")) as Results
  } catch {}
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(file, `${JSON.stringify(withResult(existing, section, key, value), null, 2)}\n`)
}
