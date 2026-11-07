/**
 * `api-core`: the api's and ai's core request-response load, as the spec's §2.
 *
 * Phase 1 (the step loop) — setup signs up `max(vus)` verified users with a workspace each, in
 * parallel batches of 10; then steps of 10 → 50 → 100 → 200 VUs (env-overridable `LOAD_STEPS`, a
 * comma list), 30 s each (`LOAD_STEP_MS`), each iteration calling `auth.me`, `notes.list`,
 * `notes.create` and `workspaces.list` as one signed-in user. Every step is checked against
 * `max5xx: 0`; the budgets (250 ms for the three reads, 500 ms for the write) are reported, not
 * enforced — reaching one is the point of a capacity run, not a failure.
 *
 * Phase 2 (anonymous forms, open model) — `waitlist.join`, `support.create` and `jobs.apply`
 * round-robin at 5/s for 30 s, asserting every refusal is `status:429`, nothing is a 5xx, each
 * label lets at least one call through and no label succeeds more often than its per-client limit
 * (`ANON_CLIENT_LIMITS`) — proving the limiter's boundary, not just absorbing 429s. These
 * three procedures' limiters (`waitlistLimiter`, `supportLimiter` + friends, `jobsLimiter` +
 * friends, in `apps/api/src/server.ts`) are hard-coded, not read from env, so they are already at
 * production values on *any* stack this package starts — `apiEnvFor`'s raised limits never touch
 * them. No second stack is needed; this phase runs against the same target as phase 1. A shared
 * client id per form (not one per VU) simulates a single caller, so the per-client limiters (5,
 * 5 and 3 an hour respectively) trip within the 30 s window.
 *
 * Phase 3 (ai) — `POST /chat` against the ai service's mock model at 20 VUs for 20 s.
 *
 * Two ways to run, like `scripts/stack.ts`:
 * - Against an already-running stack: set `LOAD_TARGET_API` / `LOAD_TARGET_AI` and the service
 *   tokens, then `bun run --filter @repo/load api-core`.
 * - With no target set, it starts its own stack on `DEFAULT_PORTS` (3027/3028) and stops it when
 *   done.
 *
 * `--smoke`: 10 VUs × 20 s of the step loop only (phases 2 and 3 skipped), thresholds `max5xx: 0`
 * plus each core label's own p95 budget (`perf/budgets.json`'s `api` section) — the CI gate
 * (`bun run --filter @repo/load smoke`). `--write-results` (or `PERF_WRITE_RESULTS=1`) writes the
 * smoke's measured p95s to `perf/.results/api.json` for `bun run perf:update`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Budgets, loadBudgets, RESULTS_DIR } from "../../../../perf/budgets"
import { apiClient, type SignedInUser, signUpVerified, withWorkspace } from "../clients"
import { tinyPdfFile } from "../pdf"
import { writeReport } from "../report"
import { evaluate, HttpError, type RunResult, run, type Threshold, type VuContext } from "../runner"
import { DEFAULT_PORTS, loadDb, type Stack, startStack } from "../stack"
import { type Targets, targets } from "../target"

export const DEFAULT_STEPS = [10, 50, 100, 200]
export const DEFAULT_STEP_MS = 30_000
export const SMOKE_VUS = 10
export const SMOKE_DURATION_MS = 20_000

export const READ_LABELS = ["auth.me", "notes.list", "workspaces.list"] as const
export const WRITE_LABELS = ["notes.create"] as const
export const READ_BUDGET_MS = 250
export const WRITE_BUDGET_MS = 500

const ANON_RATE_PER_SECOND = 5
const ANON_DURATION_MS = 30_000
const AI_VUS = 20
const AI_DURATION_MS = 20_000

type Env = Record<string, string | undefined>

/** `LOAD_STEPS`: a comma-separated list of VU counts, e.g. `"10,50,100,200"`. Default `DEFAULT_STEPS`. */
export function parseSteps(env: Env = process.env): number[] {
  const raw = env.LOAD_STEPS
  if (!raw) return DEFAULT_STEPS
  const steps = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  if (steps.length === 0) {
    throw new Error(`LOAD_STEPS must be a comma-separated list of positive integers, got "${raw}"`)
  }
  return steps
}

/** `LOAD_STEP_MS`: how long each step runs. Default `DEFAULT_STEP_MS` (30 s). */
export function parseStepMs(env: Env = process.env): number {
  const raw = env.LOAD_STEP_MS
  if (!raw) return DEFAULT_STEP_MS
  const ms = Number(raw)
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new Error(`LOAD_STEP_MS must be a positive number of milliseconds, got "${raw}"`)
  }
  return ms
}

/** The one hard requirement at every step: never a 5xx. */
export function hardThresholds(): Threshold[] {
  return [{ label: "*", max5xx: 0 }]
}

/** The read/write latency budgets, for reporting — not fed into a step's pass/fail. */
export function budgetThresholds(): Threshold[] {
  return [
    ...READ_LABELS.map((label) => ({ label, p95Ms: READ_BUDGET_MS })),
    ...WRITE_LABELS.map((label) => ({ label, p95Ms: WRITE_BUDGET_MS })),
  ]
}

/**
 * The `--smoke` gate: zero 5xx across every label, plus each core label's own p95 budget from
 * `perf/budgets.json`'s `api` section (`auth.me`, `notes.list`, `notes.create`,
 * `workspaces.list` — the labels `coreScenario` measures). Takes the section directly so tests
 * never depend on the committed file's current placeholder values.
 */
export function smokeThresholds(api: Budgets["api"] = loadBudgets().api): Threshold[] {
  return [
    { label: "*", max5xx: 0 },
    ...Object.entries(api).map(([label, p95Ms]) => ({ label, p95Ms })),
  ]
}

/**
 * The smoke's guard for a label with no budget at all in `perf/budgets.json`'s `api` section:
 * `smokeThresholds` only builds a `p95Ms` check for the labels already *in* that section, so a
 * core-loop label added without a budget would otherwise run the smoke with no latency check
 * whatsoever. `scripts/perf-budgets.test.ts` / `perf-e2e.test.ts` catch that offline, in
 * `bun test scripts`; this is the same guard at smoke run time, for when the two drift apart.
 */
export function unbudgetedLabelFailures(result: RunResult, api: Budgets["api"]): string[] {
  return Object.keys(result.labels)
    .filter((label) => !(label in api))
    .map(
      (label) =>
        `${label}: no budget in perf/budgets.json's "api" section — add one with \`bun run perf:update\``
    )
}

/** The first step (in the given order) whose any-label p95 exceeds its budget, or null. */
export function firstBreach(
  steps: Array<{ vus: number; result: RunResult }>
): { vus: number; failures: string[] } | null {
  for (const { vus, result } of steps) {
    const { failures } = evaluate(result, budgetThresholds())
    if (failures.length > 0) return { vus, failures }
  }
  return null
}

/**
 * Each anonymous form's per-client limit — the most calls one client id may get through before its
 * limiter answers 429. Hard-coded in `apps/api/src/server.ts` (`waitlistLimiter` 5 per 15 minutes,
 * `supportLimiter` 5 per hour, `jobsLimiter` 3 per hour); keep these in step with it. The phase
 * runs 30 s, inside every window, so at most this many calls per label can succeed.
 */
export const ANON_CLIENT_LIMITS: Record<string, number> = {
  "waitlist.join": 5,
  "support.create": 5,
  "jobs.apply": 3,
}

/**
 * The anonymous-forms phase's rule, per label: at least one call succeeded and at most that
 * procedure's per-client limit (`ANON_CLIENT_LIMITS`) did — the first calls within the limit
 * legitimately go through, any more means the limiter never tripped, and none at all means the
 * limiter (or the call itself) is broken, not proven to work. Every failure is a `status:429`
 * (never a 5xx, a timeout or another error). A label with no known limit may not succeed at all.
 */
export function anonPhaseFailures(result: RunResult): string[] {
  const failures: string[] = []
  for (const [label, stats] of Object.entries(result.labels)) {
    const limit = ANON_CLIENT_LIMITS[label] ?? 0
    if (limit > 0 && stats.ok < 1)
      failures.push(`${label}: 0 succeeded (want at least 1, the per-client limit is ${limit})`)
    if (stats.ok > limit)
      failures.push(`${label}: ${stats.ok} succeeded (the per-client limit is ${limit})`)
    for (const kind of Object.keys(stats.errors)) {
      if (kind !== "status:429")
        failures.push(`${label}: unexpected ${kind} (want only status:429)`)
    }
  }
  return failures
}

export type CoreUser = { user: SignedInUser; workspaceId: number }

/** Signs up `count` verified users with a workspace each, in parallel batches of 10. */
async function setupUsers(count: number, target: Targets): Promise<CoreUser[]> {
  const users: CoreUser[] = []
  const stamp = Date.now()
  for (let start = 0; start < count; start += 10) {
    const batch = Array.from({ length: Math.min(10, count - start) }, (_, j) => start + j)
    const results = await Promise.all(
      batch.map(async (n) => {
        const user = await signUpVerified(`load-core-${stamp}-${n}@example.com`, {
          target,
          clientId: `load-core-${n}`,
        })
        const workspaceId = await withWorkspace(user.client, `Load workspace ${n}`)
        return { user, workspaceId }
      })
    )
    users.push(...results)
  }
  return users
}

/** One signed-in user's core loop: read, read, write, read. */
function coreScenario(users: CoreUser[]) {
  return async (ctx: VuContext): Promise<void> => {
    const { user, workspaceId } = users[ctx.vu % users.length] as CoreUser
    const client = user.client
    await ctx.measure("auth.me", () => client.auth.me())
    await ctx.measure("notes.list", () => client.notes.list({ workspaceId }))
    await ctx.measure("notes.create", () =>
      client.notes.create({ workspaceId, title: `Load ${ctx.vu}-${ctx.iteration}`, body: "" })
    )
    await ctx.measure("workspaces.list", () => client.workspaces.list())
  }
}

async function runSteps(
  target: Targets,
  vusList: number[],
  stepMs: number
): Promise<{ steps: Array<{ vus: number; result: RunResult }>; failed: boolean }> {
  const users = await setupUsers(Math.max(...vusList), target)
  const steps: Array<{ vus: number; result: RunResult }> = []
  let failed = false
  for (const vus of vusList) {
    const result = await run({
      name: `api-core-${vus}vu`,
      vus,
      durationMs: stepMs,
      scenario: coreScenario(users.slice(0, vus)),
    })
    const evaluation = evaluate(result, hardThresholds())
    writeReport(result, evaluation)
    if (!evaluation.passed) failed = true
    steps.push({ vus, result })
  }
  return { steps, failed }
}

/**
 * With `--write-results` or `PERF_WRITE_RESULTS=1`, records the smoke's measured p95 per label in
 * `perf/.results/api.json` for `bun run perf:update` (merged with whatever is already there, like
 * `scripts/bundle-budget.ts --write-results`).
 */
function recordApiResults(result: RunResult) {
  const file = join(RESULTS_DIR, "api.json")
  const previous = existsSync(file)
    ? ((JSON.parse(readFileSync(file, "utf8")) as { api?: Record<string, number> }).api ?? {})
    : {}
  const api = Object.fromEntries(
    Object.entries(result.labels).map(([label, stats]) => [label, Math.round(stats.p95)])
  )
  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(file, `${JSON.stringify({ api: { ...previous, ...api } }, null, 2)}\n`)
  console.log(`Wrote ${file}`)
}

/** `--smoke`: a single 10 VU × 20 s step, thresholds `max5xx: 0` plus each label's p95 budget. */
async function runSmoke(target: Targets, writeResults: boolean): Promise<boolean> {
  const users = await setupUsers(SMOKE_VUS, target)
  const result = await run({
    name: "api-core-smoke",
    vus: SMOKE_VUS,
    durationMs: SMOKE_DURATION_MS,
    scenario: coreScenario(users),
  })
  const api = loadBudgets().api
  const evaluation = evaluate(result, smokeThresholds(api))
  const failures = [...evaluation.failures, ...unbudgetedLabelFailures(result, api)]
  const passed = failures.length === 0
  writeReport(result, { passed, failures })
  if (writeResults) recordApiResults(result)
  return passed
}

/** One anonymous-forms iteration: waitlist, support or jobs.apply, round-robin by iteration. */
function anonScenario(target: Targets) {
  const clients = {
    waitlist: apiClient({ target, clientId: "load-anon-waitlist" }),
    support: apiClient({ target, clientId: "load-anon-support" }),
    jobs: apiClient({ target, clientId: "load-anon-jobs" }),
  }
  return async (ctx: VuContext): Promise<void> => {
    const n = ctx.iteration
    const email = `load-anon-${ctx.vu}-${n}@example.com`
    const form = n % 3
    if (form === 0) {
      await ctx.measure("waitlist.join", () =>
        clients.waitlist.waitlist.join({ email, source: "www" })
      )
    } else if (form === 1) {
      await ctx.measure("support.create", () =>
        clients.support.support.create({
          email,
          topic: "other",
          message: "Load test message, please ignore.",
        })
      )
    } else {
      await ctx.measure("jobs.apply", () =>
        clients.jobs.jobs.apply({
          job: "load-test-role",
          title: "Load Tester",
          name: "Load Test",
          email,
          cv: tinyPdfFile(),
        })
      )
    }
  }
}

async function runAnonPhase(target: Targets): Promise<boolean> {
  const result = await run({
    name: "api-core-anon",
    ratePerSecond: ANON_RATE_PER_SECOND,
    durationMs: ANON_DURATION_MS,
    scenario: anonScenario(target),
  })
  const hard = evaluate(result, hardThresholds())
  const failures = [...hard.failures, ...anonPhaseFailures(result)]
  writeReport(result, { passed: failures.length === 0, failures })
  return failures.length === 0
}

/** `POST /chat` on the ai service, mock model, one short user message per call. */
function aiScenario(target: Targets) {
  return async (ctx: VuContext): Promise<void> => {
    await ctx.measure("ai.chat", async () => {
      const res = await fetch(new URL("/chat", target.ai), {
        method: "POST",
        headers: {
          authorization: `Bearer ${target.aiToken}`,
          "content-type": "application/json",
          "x-ai-client-id": `load-ai-${ctx.vu}`,
        },
        body: JSON.stringify({
          messages: [
            {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text: `load test ${ctx.vu}-${ctx.iteration}` }],
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new HttpError(res.status)
      await res.text() // drain the stream so the connection is freed
    })
  }
}

async function runAiPhase(target: Targets): Promise<boolean> {
  const result = await run({
    name: "api-core-ai",
    vus: AI_VUS,
    durationMs: AI_DURATION_MS,
    scenario: aiScenario(target),
  })
  const evaluation = evaluate(result, [{ label: "ai.chat", max5xx: 0 }])
  writeReport(result, evaluation)
  return evaluation.passed
}

export async function main(argv: string[]): Promise<void> {
  const smoke = argv.includes("--smoke")
  const writeResults = argv.includes("--write-results") || process.env.PERF_WRITE_RESULTS === "1"
  let stack: Stack | undefined
  let target: Targets
  if (process.env.LOAD_TARGET_API) {
    target = targets()
  } else {
    stack = await startStack({ db: loadDb(), apiPort: DEFAULT_PORTS.api, aiPort: DEFAULT_PORTS.ai })
    target = stack.target
    process.env.LOAD_MAIL_DIR = stack.mailDir
  }
  try {
    let passed: boolean
    if (smoke) {
      passed = await runSmoke(target, writeResults)
    } else {
      const { steps, failed } = await runSteps(target, parseSteps(), parseStepMs())
      const breach = firstBreach(steps)
      if (breach) {
        console.log(`First step over budget: ${breach.vus} VUs — ${breach.failures.join("; ")}`)
      } else {
        console.log("No step exceeded its latency budget.")
      }
      const anonPassed = await runAnonPhase(target)
      const aiPassed = await runAiPhase(target)
      passed = !failed && anonPassed && aiPassed
    }
    if (!passed) process.exitCode = 1
  } finally {
    await stack?.stop()
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2))
}
