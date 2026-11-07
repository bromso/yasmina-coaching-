/**
 * `jobs-burst`: how fast `apps/api`'s durable queue drains a burst, as the spec's §2.
 *
 * Enqueue path — `auth.magicLink.request({ email })`: anonymous, one `mail.send` job per call
 * (not two, like `support.create`), through a real api path rather than direct SQL. Its
 * per-email limiter (3 per 15 minutes) never matters here since every call uses its own email;
 * its api-wide limiter (`MAGIC_LINK_RATE_LIMIT`, default 30 per 10 minutes) is exactly the one
 * `stack.ts` already raises to 100000 for every scenario in this package — unlike
 * `support.create` (api-wide cap 100/hour, hard-coded, no env override: nowhere near
 * `LOAD_JOBS`'s default 5000) or `jobs.apply` (api-wide cap 50/hour, same problem). Each call is
 * handled, enqueued and dropped in constant work, independent of any other account or workspace —
 * no sign-up, no password hashing, no workspace — so the enqueue phase measures the queue, not
 * account creation.
 *
 * Enqueue — `LOAD_JOBS` (default 5000) calls, `LOAD_JOBS_CONCURRENCY` (default 50) at a time,
 * as fast as possible (a worker pool, not the duration-boxed `run()`: this needs an exact count,
 * not a time window). Drain — polls `/metrics`' `jobs_queue{status}` gauge
 * (`queued + running === 0`, held for two consecutive polls after `LOAD_DRAIN_INITIAL_DELAY_MS`
 * — a single zero reading right after the last enqueue call returns is not proof: the mail
 * enqueue itself is `detach()`-ed from the response by a `setTimeout(0)`, and the worker's own
 * poll loop runs every `JOBS_POLL_MS`, default 1 s) up to `LOAD_DRAIN_TIMEOUT_MS` (default 120 s).
 * Correctness — `job_runs_total{name="mail.send",outcome="succeeded"}`'s delta over the run must
 * equal the enqueued count exactly (no loss, no double-run), `job_runs_total{outcome="dead"}`'s
 * delta must be 0, and the mailbox (`MAIL_PROVIDER=file`) must gain exactly one new file per job
 * — a stronger check than `admin.jobs.list`, which only shows the 20 most recent dead jobs.
 * Meanwhile a probe loop (its own signed-in user, one workspace) hammers `notes.list` the whole
 * time, reported like any other scenario (`evaluate` + `writeReport`), threshold `p95Ms: 1000`.
 *
 * Two ways to run, like `api-core` and `realtime`: with `LOAD_TARGET_API` (and `METRICS_TOKEN`,
 * `LOAD_MAIL_DIR`) set, against an already-running stack with the in-process worker; with
 * nothing set, it starts its own stack on `DEFAULT_PORTS` and stops it when done.
 */
import { apiClient, signUpVerified, withWorkspace } from "../clients"
import { createHistogram, type Histogram } from "../histogram"
import { mailFiles } from "../mail"
import { fetchMetrics, metricSum, metricValue } from "../metrics-client"
import { writeReport } from "../report"
import { classifyError, evaluate, type LabelStats, type RunResult } from "../runner"
import { DEFAULT_PORTS, loadDb, type Stack, startStack } from "../stack"
import { type Targets, targets } from "../target"

export const DEFAULT_JOBS = 5_000
export const DEFAULT_ENQUEUE_CONCURRENCY = 50
export const DEFAULT_DRAIN_TIMEOUT_MS = 120_000
export const DEFAULT_DRAIN_INITIAL_DELAY_MS = 1_500
export const DRAIN_POLL_INTERVAL_MS = 200
export const DRAIN_CONSECUTIVE_CLEAN = 2
export const PROBE_P95_BUDGET_MS = 1_000

type Env = Record<string, string | undefined>

function parsePositiveInt(raw: string | undefined, name: string, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${name} must be a positive integer, got "${raw}"`)
  return n
}

/** `LOAD_JOBS`: how many jobs to enqueue. Default 5000. */
export function parseJobsCount(env: Env = process.env): number {
  return parsePositiveInt(env.LOAD_JOBS, "LOAD_JOBS", DEFAULT_JOBS)
}

/** `LOAD_JOBS_CONCURRENCY`: how many enqueue calls run at once. Default 50. */
export function parseEnqueueConcurrency(env: Env = process.env): number {
  return parsePositiveInt(
    env.LOAD_JOBS_CONCURRENCY,
    "LOAD_JOBS_CONCURRENCY",
    DEFAULT_ENQUEUE_CONCURRENCY
  )
}

/** `LOAD_DRAIN_TIMEOUT_MS`: how long to wait for the queue to empty before giving up. Default 120 s. */
export function parseDrainTimeoutMs(env: Env = process.env): number {
  return parsePositiveInt(
    env.LOAD_DRAIN_TIMEOUT_MS,
    "LOAD_DRAIN_TIMEOUT_MS",
    DEFAULT_DRAIN_TIMEOUT_MS
  )
}

/**
 * The failures in what the run actually produced, compared with what it enqueued: the
 * `job_runs_total{name:"mail.send",outcome:"succeeded"}` delta must equal `enqueued` exactly
 * (every job ran, none lost, none run twice), the `outcome:"dead"` delta must be 0, and the
 * mailbox must have gained exactly `enqueued` files (one per job — a delta above `enqueued`
 * means a duplicate send, not just a missing one).
 */
export function assertDrainCounts(
  enqueued: number,
  succeededDelta: number,
  deadDelta: number,
  mailDelta: number
): string[] {
  const failures: string[] = []
  if (succeededDelta !== enqueued) {
    failures.push(`job_runs_total mail.send succeeded delta ${succeededDelta}, want ${enqueued}`)
  }
  if (deadDelta !== 0) failures.push(`job_runs_total dead delta ${deadDelta}, want 0`)
  if (mailDelta !== enqueued) {
    failures.push(`mailbox gained ${mailDelta} file(s), want exactly ${enqueued} (one per job)`)
  }
  return failures
}

/** A `RunResult` wrapping the probe histogram, for the standard `evaluate`/`writeReport` path. */
export function probeResult(
  histogram: Histogram,
  durationMs: number,
  errors: Map<string, number>
): RunResult {
  const errorCount = [...errors.values()].reduce((a, b) => a + b, 0)
  const stats: LabelStats = {
    count: histogram.count,
    ok: histogram.count - errorCount,
    errors: Object.fromEntries(errors),
    p50: histogram.percentile(50),
    p95: histogram.percentile(95),
    p99: histogram.percentile(99),
    max: histogram.max,
    rps: durationMs > 0 ? histogram.count / (durationMs / 1000) : 0,
  }
  return {
    name: "jobs-burst-probe",
    model: "closed",
    durationMs,
    iterations: histogram.count,
    failedIterations: errorCount,
    dropped: 0,
    labels: { "notes.list": stats },
  }
}

// --- Live parts: everything below talks to a running stack. ---

export type EnqueueResult = { succeeded: number; failed: number; durationMs: number }

/**
 * `count` calls to `auth.magicLink.request`, `concurrency` at a time, each a distinct email (so
 * the per-email limiter never trips) — the fastest this package can drive a real enqueuing api
 * path, bounded only by the api's own throughput.
 */
export async function enqueueJobs(
  target: Targets,
  stamp: number,
  count: number,
  concurrency: number
): Promise<EnqueueResult> {
  const client = apiClient({ target, clientId: `load-jobs-burst-${stamp}` })
  let next = 0
  let succeeded = 0
  let failed = 0
  const start = performance.now()
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= count) return
      try {
        await client.auth.magicLink.request({ email: `load-jobs-${stamp}-${i}@example.com` })
        succeeded++
      } catch {
        failed++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, count) }, worker))
  return { succeeded, failed, durationMs: performance.now() - start }
}

export type DrainResult = { drained: boolean; elapsedMs: number }

/**
 * Polls `/metrics`' `jobs_queue{status}` gauge until `queued + running` reads 0 on
 * `consecutiveClean` polls in a row (one clean reading right after the last enqueue call returns
 * is not proof: the mail enqueue is itself detached from the response, and the worker only polls
 * every `JOBS_POLL_MS`). Waits `initialDelayMs` before the first check, for the same reason.
 */
export async function pollDrain(
  apiUrl: URL,
  token: string,
  {
    timeoutMs = DEFAULT_DRAIN_TIMEOUT_MS,
    intervalMs = DRAIN_POLL_INTERVAL_MS,
    initialDelayMs = DEFAULT_DRAIN_INITIAL_DELAY_MS,
    consecutiveClean = DRAIN_CONSECUTIVE_CLEAN,
    sleep = (ms: number) => Bun.sleep(ms),
  }: {
    timeoutMs?: number
    intervalMs?: number
    initialDelayMs?: number
    consecutiveClean?: number
    sleep?: (ms: number) => Promise<void>
  } = {}
): Promise<DrainResult> {
  const start = performance.now()
  await sleep(initialDelayMs)
  let clean = 0
  for (;;) {
    const metrics = await fetchMetrics(apiUrl, token)
    const pending =
      (metricValue(metrics, "jobs_queue", { status: "queued" }) ?? 0) +
      (metricValue(metrics, "jobs_queue", { status: "running" }) ?? 0)
    if (pending === 0) {
      clean++
      if (clean >= consecutiveClean) return { drained: true, elapsedMs: performance.now() - start }
    } else {
      clean = 0
    }
    if (performance.now() - start > timeoutMs)
      return { drained: false, elapsedMs: performance.now() - start }
    await sleep(intervalMs)
  }
}

type ProbeState = { stop: boolean }

/** Hammers `notes.list` until `state.stop`, recording every call's latency and error kind. */
async function probeLoop(
  client: ReturnType<typeof apiClient>,
  workspaceId: number,
  state: ProbeState,
  histogram: Histogram,
  errors: Map<string, number>
): Promise<void> {
  while (!state.stop) {
    const started = performance.now()
    try {
      await client.notes.list({ workspaceId })
      histogram.record(performance.now() - started)
    } catch (error) {
      histogram.record(performance.now() - started)
      const kind = classifyError(error)
      errors.set(kind, (errors.get(kind) ?? 0) + 1)
    }
  }
}

export async function main(): Promise<void> {
  const jobsCount = parseJobsCount()
  const concurrency = parseEnqueueConcurrency()
  const drainTimeoutMs = parseDrainTimeoutMs()
  const stamp = Date.now()

  let stack: Stack | undefined
  let target: Targets
  if (process.env.LOAD_TARGET_API) {
    target = targets()
  } else {
    stack = await startStack({ db: loadDb(), apiPort: DEFAULT_PORTS.api, aiPort: DEFAULT_PORTS.ai })
    target = stack.target
    process.env.LOAD_MAIL_DIR = stack.mailDir
  }
  const metricsToken = stack?.metricsToken ?? process.env.METRICS_TOKEN
  const mailDir = stack?.mailDir ?? process.env.LOAD_MAIL_DIR
  if (!metricsToken)
    throw new Error("jobs-burst needs METRICS_TOKEN (or let it start its own stack)")
  if (!mailDir) throw new Error("jobs-burst needs LOAD_MAIL_DIR (or let it start its own stack)")

  const failures: string[] = []
  try {
    const prober = await signUpVerified(`load-jobs-probe-${stamp}@example.com`, { target, mailDir })
    const workspaceId = await withWorkspace(prober.client, `Jobs burst probe ${stamp}`)
    await prober.client.notes.create({ workspaceId, title: "seed", body: "" })

    const probeHistogram = createHistogram()
    const probeErrors = new Map<string, number>()
    const probeState: ProbeState = { stop: false }
    const probeStart = performance.now()
    const probePromise = probeLoop(
      prober.client,
      workspaceId,
      probeState,
      probeHistogram,
      probeErrors
    )

    const before = await fetchMetrics(target.api, metricsToken)
    const mailBefore = mailFiles(mailDir).length

    console.log(
      `Enqueuing ${jobsCount} jobs (${concurrency} at a time) via auth.magicLink.request...`
    )
    const enqueue = await enqueueJobs(target, stamp, jobsCount, concurrency)
    console.log(
      `enqueue: ${enqueue.succeeded} ok, ${enqueue.failed} failed, ${(enqueue.durationMs / 1000).toFixed(1)} s`
    )
    if (enqueue.failed > 0)
      failures.push(`enqueue: ${enqueue.failed} magicLink.request call(s) failed`)

    console.log("Draining...")
    const drain = await pollDrain(target.api, metricsToken, { timeoutMs: drainTimeoutMs })
    console.log(
      `drain time: ${(drain.elapsedMs / 1000).toFixed(1)} s (${drain.drained ? "drained" : "TIMED OUT"})`
    )
    if (!drain.drained) failures.push("drain: queued + running never reached 0 within the timeout")

    probeState.stop = true
    await probePromise
    const probeDurationMs = performance.now() - probeStart

    const after = await fetchMetrics(target.api, metricsToken)
    const mailAfter = mailFiles(mailDir).length
    const succeededDelta =
      metricSum(after, "job_runs_total", { name: "mail.send", outcome: "succeeded" }) -
      metricSum(before, "job_runs_total", { name: "mail.send", outcome: "succeeded" })
    const deadDelta =
      metricSum(after, "job_runs_total", { outcome: "dead" }) -
      metricSum(before, "job_runs_total", { outcome: "dead" })
    const mailDelta = mailAfter - mailBefore
    failures.push(...assertDrainCounts(enqueue.succeeded, succeededDelta, deadDelta, mailDelta))

    const result = probeResult(probeHistogram, probeDurationMs, probeErrors)
    const probeEval = evaluate(result, [{ label: "notes.list", p95Ms: PROBE_P95_BUDGET_MS }])
    writeReport(result, probeEval)
    failures.push(...probeEval.failures)

    console.log(
      failures.length === 0 ? "PASS" : `FAIL\n${failures.map((f) => `  - ${f}`).join("\n")}`
    )
    if (failures.length > 0) process.exitCode = 1
  } finally {
    await stack?.stop()
  }
}

if (import.meta.main) {
  await main()
}
