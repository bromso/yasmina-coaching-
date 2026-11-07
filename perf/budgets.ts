// The performance budgets (`perf/budgets.json`) and the pure maths around them: loading,
// validating against the repo (routes, e2e pages, load-smoke labels), the headroom `perf:update`
// adds over a measurement, medians and the breach message every checker prints.
//
// `bun test scripts` imports this before `bun install`, so it imports nothing outside the repo
// (`apps/e2e/a11y/routes.ts` is plain data) and only Node built-ins: the Playwright perf specs in
// `apps/e2e` load it too, and Playwright runs tests in Node, not Bun (so no `bun` import and no
// `import.meta.dir`). Needs Node ≥ 22 for `node:fs`'s `globSync` (and ≥ 20.11 for
// `import.meta.dirname`); fine today — CI and the devcontainer both run ≥ 22 — but note it here
// since nothing else in this file would otherwise hint at a Node floor.

import { globSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { A11Y_PAGES, routeOf } from "../apps/e2e/a11y/routes"

export type LighthouseBudget = { score: number; lcpMs: number; tbtMs: number; cls: number }
export type VitalsBudget = { lcpMs: number; cls: number }

export type Budgets = {
  /** First-load JS per route, gzip KB (1 KB = 1000 bytes): `{ <app>: { <route>: kb } }`. */
  bundles: Record<string, Record<string, number>>
  /** Lighthouse lab medians per `<app>:<path>`; `score` is a floor, the rest ceilings. */
  lighthouse: Record<string, LighthouseBudget>
  /** In-browser Web Vitals medians per `<app>:<path>`. */
  vitals: Record<string, VitalsBudget>
  /** Per-procedure p95 in ms, keyed by the load smoke's label. */
  api: Record<string, number>
}

/** What one measurement writes to `perf/.results/*.json`: measured values, any subset. */
export type Results = Partial<Budgets>

/**
 * The labels the load smoke measures (`READ_LABELS` + `WRITE_LABELS` in
 * `apps/load/src/scenarios/api-core.ts`). Copied, not imported: that module imports the api
 * client at top level, which `bun test scripts` cannot resolve before `bun install`.
 */
export const API_PROCEDURES = ["auth.me", "notes.list", "notes.create", "workspaces.list"] as const

export const BUDGETS_PATH = join(import.meta.dirname, "budgets.json")
export const RESULTS_DIR = join(import.meta.dirname, ".results")

export const SECTIONS = ["bundles", "lighthouse", "vitals", "api"] as const
const LIGHTHOUSE_METRICS = ["score", "lcpMs", "tbtMs", "cls"] as const
const VITALS_METRICS = ["lcpMs", "cls"] as const

export function loadBudgets(path: string = BUDGETS_PATH): Budgets {
  return JSON.parse(readFileSync(path, "utf8")) as Budgets
}

const sortKeys = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

/** The file's exact text: sections in a fixed order, keys sorted, two-space JSON. */
export function serializeBudgets(b: Budgets): string {
  const sorted = {
    bundles: sortKeys(
      Object.fromEntries(Object.entries(b.bundles).map(([k, v]) => [k, sortKeys(v)]))
    ),
    lighthouse: sortKeys(b.lighthouse),
    vitals: sortKeys(b.vitals),
    api: sortKeys(b.api),
  }
  return `${JSON.stringify(sorted, null, 2)}\n`
}

export type RepoContext = {
  /** Every app's page routes, as `routeOf` names them. */
  routes: Record<string, string[]>
  /** Every e2e a11y page as `<app>:<path>`. */
  pages: string[]
  /** Every load-smoke label. */
  procedures: string[]
}

/** The routes, pages and procedures a budget key may name, read from the repo at `root`. */
export function repoContext(root: string = join(import.meta.dirname, "..")): RepoContext {
  const routes: Record<string, string[]> = {}
  for (const file of globSync("apps/*/src/app/**/page.tsx", { cwd: root })) {
    const r = routeOf(file.split("\\").join("/"))
    if (r) routes[r.app] = [...(routes[r.app] ?? []), r.route].sort()
  }
  return {
    routes,
    pages: A11Y_PAGES.map((p) => `${p.app}:${p.path}`),
    procedures: [...API_PROCEDURES],
  }
}

const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Every problem with a parsed budget file, or `[]`. */
export function validateBudgets(b: unknown, ctx: RepoContext): string[] {
  const problems: string[] = []
  if (!isRecord(b)) return ["the budget file is not a JSON object"]
  for (const key of Object.keys(b)) {
    if (!(SECTIONS as readonly string[]).includes(key)) problems.push(`unknown section "${key}"`)
  }
  const section = (name: (typeof SECTIONS)[number]): Record<string, unknown> => {
    const value = b[name]
    if (isRecord(value)) return value
    problems.push(`section "${name}" is missing or not an object`)
    return {}
  }

  for (const [app, routes] of Object.entries(section("bundles"))) {
    const known = ctx.routes[app]
    if (!known) {
      problems.push(`bundles: unknown app "${app}"`)
      continue
    }
    if (!isRecord(routes)) {
      problems.push(`bundles.${app} is not an object`)
      continue
    }
    for (const [route, kb] of Object.entries(routes)) {
      if (!known.includes(route)) problems.push(`bundles.${app}: no page.tsx for route "${route}"`)
      if (!isPositive(kb)) problems.push(`bundles.${app}["${route}"] must be a positive number`)
    }
  }

  const pageSection = (name: "lighthouse" | "vitals", metrics: readonly string[]) => {
    for (const [page, value] of Object.entries(section(name))) {
      if (!ctx.pages.includes(page)) {
        problems.push(`${name}: "${page}" is not a page in apps/e2e/a11y/routes.ts`)
      }
      if (!isRecord(value)) {
        problems.push(`${name}["${page}"] is not an object`)
        continue
      }
      for (const metric of metrics) {
        if (!isPositive(value[metric])) {
          problems.push(`${name}["${page}"].${metric} must be a positive number`)
        }
      }
      for (const metric of Object.keys(value)) {
        if (!metrics.includes(metric))
          problems.push(`${name}["${page}"]: unknown metric "${metric}"`)
      }
    }
  }
  pageSection("lighthouse", LIGHTHOUSE_METRICS)
  pageSection("vitals", VITALS_METRICS)

  for (const [label, ms] of Object.entries(section("api"))) {
    if (!ctx.procedures.includes(label)) {
      problems.push(
        `api: "${label}" is not a load-smoke label (apps/load/src/scenarios/api-core.ts)`
      )
    }
    if (!isPositive(ms)) problems.push(`api["${label}"] must be a positive number`)
  }
  return problems
}

// Rounds `x` up to a multiple of `step`, immune to float noise (105.00000000000001 → 105).
function ceilTo(x: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const units = Math.ceil(Number((x / step).toFixed(6)))
  return Number((units * step).toFixed(decimals))
}

/** Bundles: measured + max(5 %, 5 KB), rounded up to 0.1 KB. */
export const bundleBudget = (kb: number): number => ceilTo(kb + Math.max(kb * 0.05, 5), 0.1)

/** Absolute ms floors `labMsBudget` adds over the measured value, per metric. */
export const LIGHTHOUSE_LCP_FLOOR_MS = 800
export const LIGHTHOUSE_TBT_FLOOR_MS = 200
export const VITALS_LCP_FLOOR_MS = 200
/**
 * Lighthouse / vitals milliseconds: max(measured × 1.3, measured + floor), rounded up to 10 ms.
 * The multiplier alone is too thin once a single CI run is the seed — a slower runner (GitHub's
 * fleet mixes CPU generations) pushes Lighthouse's throttled TBT and real-browser LCP well past
 * 30 % in absolute terms while staying a proportionally small regression. `floor` is a fixed
 * absolute ms added over the measured value, picked per metric by how far CI's own runs already
 * strayed from the single seed run (see docs/guides/performance.md).
 */
export const labMsBudget = (ms: number, floor: number): number =>
  ceilTo(Math.max(ms * 1.3, ms + floor), 10)
/** Lighthouse score (0-100): measured − 10, rounded to an integer, never below 50. */
export const scoreBudget = (score: number): number => Math.max(50, Math.round(score) - 10)
/** CLS: max(× 1.3, + 0.02), rounded up to 0.001. */
export const clsBudget = (cls: number): number => ceilTo(Math.max(cls * 1.3, cls + 0.02), 0.001)
/**
 * API p95: max(× 1.5, + 150 ms), rounded up to 10 ms. The absolute floor is for the shared runner: a
 * slow ubuntu-latest machine measured notes.create's smoke p95 at 65 ms against 19 ms on a normal
 * one, so a multiplier on a ~20 ms number alone flakes.
 */
export const API_FLOOR_MS = 150
export const apiBudget = (ms: number): number => ceilTo(Math.max(ms * 1.5, ms + API_FLOOR_MS), 10)

const mapValues = <T, U>(record: Record<string, T>, fn: (v: T) => U): Record<string, U> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]))

/** The budgets a measurement implies: each measured value plus its kind's headroom. */
export function applyHeadroom(results: Results): Results {
  const out: Results = {}
  if (results.bundles) out.bundles = mapValues(results.bundles, (r) => mapValues(r, bundleBudget))
  if (results.lighthouse) {
    out.lighthouse = mapValues(results.lighthouse, (m) => ({
      score: scoreBudget(m.score),
      lcpMs: labMsBudget(m.lcpMs, LIGHTHOUSE_LCP_FLOOR_MS),
      tbtMs: labMsBudget(m.tbtMs, LIGHTHOUSE_TBT_FLOOR_MS),
      cls: clsBudget(m.cls),
    }))
  }
  if (results.vitals) {
    out.vitals = mapValues(results.vitals, (m) => ({
      lcpMs: labMsBudget(m.lcpMs, VITALS_LCP_FLOOR_MS),
      cls: clsBudget(m.cls),
    }))
  }
  if (results.api) out.api = mapValues(results.api, apiBudget)
  return out
}

/**
 * Several measurements as one, keeping the worse value per key (the higher number, or the lower
 * Lighthouse score) — how a local and a CI run combine into one set of budgets.
 */
export function mergeResults(sets: Results[]): Results {
  const out: Results = {}
  const worse = (a: number | undefined, b: number, lowerIsWorse = false) =>
    a === undefined ? b : lowerIsWorse ? Math.min(a, b) : Math.max(a, b)
  for (const set of sets) {
    for (const [app, routes] of Object.entries(set.bundles ?? {})) {
      out.bundles ??= {}
      out.bundles[app] ??= {}
      const into = out.bundles[app]
      for (const [route, kb] of Object.entries(routes)) into[route] = worse(into[route], kb)
    }
    for (const [page, m] of Object.entries(set.lighthouse ?? {})) {
      out.lighthouse ??= {}
      const prev = out.lighthouse[page]
      out.lighthouse[page] = {
        score: worse(prev?.score, m.score, true),
        lcpMs: worse(prev?.lcpMs, m.lcpMs),
        tbtMs: worse(prev?.tbtMs, m.tbtMs),
        cls: worse(prev?.cls, m.cls),
      }
    }
    for (const [page, m] of Object.entries(set.vitals ?? {})) {
      out.vitals ??= {}
      const prev = out.vitals[page]
      out.vitals[page] = { lcpMs: worse(prev?.lcpMs, m.lcpMs), cls: worse(prev?.cls, m.cls) }
    }
    for (const [label, ms] of Object.entries(set.api ?? {})) {
      out.api ??= {}
      out.api[label] = worse(out.api[label], ms)
    }
  }
  return out
}

/** `next` laid over `current` key by key; keys nothing measured keep their budget. */
export function mergeBudgets(current: Budgets, next: Results): Budgets {
  const bundles = { ...current.bundles }
  for (const [app, routes] of Object.entries(next.bundles ?? {})) {
    bundles[app] = { ...(bundles[app] ?? {}), ...routes }
  }
  return {
    bundles,
    lighthouse: { ...current.lighthouse, ...(next.lighthouse ?? {}) },
    vitals: { ...current.vitals, ...(next.vitals ?? {}) },
    api: { ...current.api, ...(next.api ?? {}) },
  }
}

/** The median of a non-empty list (the mean of the middle two for an even length). */
export function median(xs: number[]): number {
  if (xs.length === 0) throw new Error("median of an empty list")
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

export type Breach = {
  /** What was measured: `www /`, `www:/`, `notes.list`. */
  key: string
  metric: string
  /** Every run, in order; one value for a deterministic measurement. */
  runs: number[]
  budget: number
  unit?: string
  /** `score`: the budget is a floor, not a ceiling. */
  higherIsBetter?: boolean
}

const fmt = (n: number, unit = "") => `${Number(n.toFixed(3))}${unit}`

/** True when the median of `runs` misses the budget. */
export function breaches(b: Omit<Breach, "key" | "metric">): boolean {
  const value = median(b.runs)
  return b.higherIsBetter ? value < b.budget : value > b.budget
}

/** One line naming the key, the metric, every run, the median and the budget. */
export function formatBreach(b: Breach): string {
  const value = median(b.runs)
  const unit = b.unit ?? ""
  const verb = b.higherIsBetter ? "below" : "over"
  const measured =
    b.runs.length === 1
      ? `${fmt(value, unit)}`
      : `median ${fmt(value, unit)} (runs ${b.runs.map((r) => fmt(r, unit)).join(", ")})`
  const delta = value - b.budget
  const sign = delta > 0 ? "+" : ""
  return `${b.key} ${b.metric}: ${measured} is ${verb} the budget ${fmt(b.budget, unit)} (${sign}${fmt(delta, unit)})`
}
