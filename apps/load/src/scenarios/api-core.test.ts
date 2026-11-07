import { describe, expect, test } from "bun:test"
import type { LabelStats, RunResult } from "../runner"
import {
  ANON_CLIENT_LIMITS,
  anonPhaseFailures,
  budgetThresholds,
  DEFAULT_STEP_MS,
  DEFAULT_STEPS,
  firstBreach,
  hardThresholds,
  parseStepMs,
  parseSteps,
  READ_BUDGET_MS,
  smokeThresholds,
  unbudgetedLabelFailures,
  WRITE_BUDGET_MS,
} from "./api-core"

const stats = (patch: Partial<LabelStats> = {}): LabelStats => ({
  count: 10,
  ok: 10,
  errors: {},
  p50: 1,
  p95: 1,
  p99: 1,
  max: 1,
  rps: 1,
  ...patch,
})

const resultOf = (labels: Record<string, LabelStats>): RunResult => ({
  name: "r",
  model: "closed",
  durationMs: 1_000,
  iterations: 10,
  failedIterations: 0,
  dropped: 0,
  labels,
})

/** A step result with all four core-loop labels present (as a real step always has), p95 1 ms
 * unless overridden. */
const stepResult = (overrides: Record<string, Partial<LabelStats>> = {}): RunResult =>
  resultOf({
    "auth.me": stats(overrides["auth.me"]),
    "notes.list": stats(overrides["notes.list"]),
    "notes.create": stats(overrides["notes.create"]),
    "workspaces.list": stats(overrides["workspaces.list"]),
  })

describe("parseSteps", () => {
  test("defaults to 10 → 50 → 100 → 200 when unset", () => {
    expect(parseSteps({})).toEqual(DEFAULT_STEPS)
  })

  test("parses a comma-separated list, trimming whitespace", () => {
    expect(parseSteps({ LOAD_STEPS: " 5, 15 ,30" })).toEqual([5, 15, 30])
  })

  test("throws on a list with no valid positive integers", () => {
    expect(() => parseSteps({ LOAD_STEPS: "0,-1,abc" })).toThrow("LOAD_STEPS")
  })

  test("drops invalid entries but keeps the valid ones", () => {
    expect(parseSteps({ LOAD_STEPS: "10,abc,20" })).toEqual([10, 20])
  })
})

describe("parseStepMs", () => {
  test("defaults to 30 s when unset", () => {
    expect(parseStepMs({})).toBe(DEFAULT_STEP_MS)
  })

  test("parses a positive number", () => {
    expect(parseStepMs({ LOAD_STEP_MS: "5000" })).toBe(5_000)
  })

  test("throws on zero, negative or non-numeric", () => {
    for (const bad of ["0", "-5", "nope"]) {
      expect(() => parseStepMs({ LOAD_STEP_MS: bad })).toThrow("LOAD_STEP_MS")
    }
  })
})

describe("hardThresholds / budgetThresholds / smokeThresholds", () => {
  test("hardThresholds is max5xx: 0 on every label", () => {
    expect(hardThresholds()).toEqual([{ label: "*", max5xx: 0 }])
  })

  test("budgetThresholds sets the read budget on reads and the write budget on writes", () => {
    const thresholds = budgetThresholds()
    expect(thresholds).toEqual(
      expect.arrayContaining([
        { label: "auth.me", p95Ms: READ_BUDGET_MS },
        { label: "notes.list", p95Ms: READ_BUDGET_MS },
        { label: "workspaces.list", p95Ms: READ_BUDGET_MS },
        { label: "notes.create", p95Ms: WRITE_BUDGET_MS },
      ])
    )
    expect(thresholds).toHaveLength(4)
  })

  test("smokeThresholds: max5xx 0 across the board, plus each label's own budget", () => {
    expect(smokeThresholds({ "auth.me": 300, "notes.create": 500 })).toEqual([
      { label: "*", max5xx: 0 },
      { label: "auth.me", p95Ms: 300 },
      { label: "notes.create", p95Ms: 500 },
    ])
  })

  test("smokeThresholds with no argument reads perf/budgets.json's api section", () => {
    const thresholds = smokeThresholds()
    expect(thresholds[0]).toEqual({ label: "*", max5xx: 0 })
    for (const label of ["auth.me", "notes.list", "notes.create", "workspaces.list"]) {
      expect(thresholds).toEqual(
        expect.arrayContaining([expect.objectContaining({ label, p95Ms: expect.any(Number) })])
      )
    }
  })
})

describe("unbudgetedLabelFailures", () => {
  test("no failures when every measured label has a budget", () => {
    const result = stepResult()
    const api = { "auth.me": 50, "notes.list": 50, "notes.create": 50, "workspaces.list": 50 }
    expect(unbudgetedLabelFailures(result, api)).toEqual([])
  })

  test("names a measured label with no budget, telling the fix", () => {
    const result = resultOf({ "auth.me": stats(), "notes.list": stats() })
    expect(unbudgetedLabelFailures(result, { "auth.me": 50 })).toEqual([
      'notes.list: no budget in perf/budgets.json\'s "api" section — add one with `bun run perf:update`',
    ])
  })

  test("a budgeted label the run never measured is not flagged here", () => {
    const result = resultOf({ "auth.me": stats() })
    expect(unbudgetedLabelFailures(result, { "auth.me": 50, "notes.create": 500 })).toEqual([])
  })
})

describe("firstBreach", () => {
  test("null when every step is within budget", () => {
    const steps = [
      { vus: 10, result: stepResult({ "auth.me": { p95: 100 } }) },
      { vus: 50, result: stepResult({ "auth.me": { p95: 200 } }) },
    ]
    expect(firstBreach(steps)).toBeNull()
  })

  test("names the first step, in the given order, whose any-label p95 exceeds its budget", () => {
    const steps = [
      { vus: 10, result: stepResult({ "auth.me": { p95: 100 } }) },
      { vus: 50, result: stepResult({ "notes.create": { p95: 600 } }) },
      { vus: 100, result: stepResult({ "auth.me": { p95: 900 } }) },
    ]
    const breach = firstBreach(steps)
    expect(breach?.vus).toBe(50)
    expect(breach?.failures[0]).toContain("notes.create")
  })

  test("a read breaches at its own (tighter) budget even though it is under the write budget", () => {
    expect(READ_BUDGET_MS).toBeLessThan(WRITE_BUDGET_MS)
    const steps = [{ vus: 10, result: stepResult({ "notes.list": { p95: READ_BUDGET_MS + 1 } }) }]
    const breach = firstBreach(steps)
    expect(breach?.failures[0]).toContain("notes.list")
  })
})

describe("anonPhaseFailures", () => {
  test("flags a known-limit label with zero successes, even when every error is status:429", () => {
    const result = resultOf({
      "waitlist.join": stats({ ok: 0, errors: { "status:429": 10 } }),
      "jobs.apply": stats({ ok: 0, errors: { "status:429": 5 } }),
    })
    const failures = anonPhaseFailures(result)
    expect(failures).toHaveLength(2)
    expect(failures[0]).toContain("waitlist.join: 0 succeeded")
    expect(failures[1]).toContain("jobs.apply: 0 succeeded")
  })

  test("allows successes up to each procedure's per-client limit", () => {
    const result = resultOf({
      "waitlist.join": stats({ ok: 5, errors: { "status:429": 45 } }),
      "support.create": stats({ ok: 5, errors: { "status:429": 45 } }),
      "jobs.apply": stats({ ok: 3, errors: { "status:429": 47 } }),
    })
    expect(anonPhaseFailures(result)).toEqual([])
  })

  test("flags a label with more successes than its per-client limit", () => {
    const result = resultOf({
      "jobs.apply": stats({ ok: 4, errors: { "status:429": 46 } }),
      "waitlist.join": stats({ ok: 6, errors: { "status:429": 44 } }),
    })
    const failures = anonPhaseFailures(result)
    expect(failures).toHaveLength(2)
    expect(failures[0]).toContain("jobs.apply: 4 succeeded")
    expect(failures[1]).toContain("waitlist.join: 6 succeeded")
  })

  test("flags any success on a label with no known limit", () => {
    const result = resultOf({ "other.form": stats({ ok: 1, errors: { "status:429": 9 } }) })
    expect(anonPhaseFailures(result)[0]).toContain("other.form")
  })

  test("the limits match the api's hard-coded per-client limiters", async () => {
    const server = await Bun.file(
      new URL("../../../api/src/server.ts", import.meta.url).pathname
    ).text()
    const limitOf = (name: string) =>
      Number(
        server.match(
          new RegExp(`options\\.${name} \\?\\? createMemoryRateLimiter\\(\\{ limit: (\\d+)`)
        )?.[1]
      )
    expect(ANON_CLIENT_LIMITS).toEqual({
      "waitlist.join": limitOf("waitlistLimiter"),
      "support.create": limitOf("supportLimiter"),
      "jobs.apply": limitOf("jobsLimiter"),
    })
  })

  test("flags a non-429 error kind", () => {
    const result = resultOf({
      "support.create": stats({ ok: 1, errors: { "status:500": 1 } }),
    })
    expect(anonPhaseFailures(result)[0]).toContain("status:500")
  })

  test("flags zero successes on a known-limit label even with no errors at all", () => {
    const result = resultOf({ "support.create": stats({ ok: 0, errors: {} }) })
    expect(anonPhaseFailures(result)[0]).toContain("support.create: 0 succeeded")
  })
})
