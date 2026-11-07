import { createHistogram, type Histogram } from "./histogram"

/**
 * The load runner. Two models:
 *
 * - **closed** (`vus`): that many virtual users each run the scenario back to back until the run
 *   ends — throughput follows the target's speed.
 * - **open** (`ratePerSecond`): iteration `i` is scheduled at `start + i / rate` by the clock, not
 *   by completions, so a slow target piles requests up instead of slowing the arrivals; the first
 *   `measure` of an iteration counts from its *scheduled* start (no coordinated omission). At most
 *   `maxInFlight` iterations run at once; an arrival beyond that is counted as `dropped`.
 *
 * Every request goes through `ctx.measure(label, fn)`. A scenario that throws is counted as a failed
 * iteration, never fatal to the run.
 */

export type ErrorKind = `status:${number}` | "timeout" | "network" | "other"

export type VuContext = {
  vu: number
  iteration: number
  measure<T>(label: string, fn: () => Promise<T>): Promise<T>
}

export type RunOptions = {
  name: string
  vus?: number
  ratePerSecond?: number
  durationMs: number
  /** Iterations started before this have their requests discarded (the run lasts warmup + duration). */
  warmupMs?: number
  /** Open model only; default 10 × rate. */
  maxInFlight?: number
  /** How long to wait for in-flight iterations once the run ends. Default 30 s. */
  drainMs?: number
  scenario: (ctx: VuContext) => Promise<void>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export type LabelStats = {
  count: number
  ok: number
  errors: Record<string, number>
  p50: number
  p95: number
  p99: number
  max: number
  rps: number
}

export type RunResult = {
  name: string
  model: "closed" | "open"
  durationMs: number
  iterations: number
  failedIterations: number
  dropped: number
  labels: Record<string, LabelStats>
}

/** An HTTP answer that is not 2xx, for scenarios that call `fetch` directly. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message = `HTTP ${status}`
  ) {
    super(message)
    this.name = "HttpError"
  }
}

const NETWORK_CODES = new Set([
  "ConnectionRefused",
  "ConnectionClosed",
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ENOTFOUND",
  "FailedToOpenSocket",
])

/** What went wrong, from an oRPC/HTTP error (`status:<code>`), an abort, or a failed fetch. */
export function classifyError(error: unknown): ErrorKind {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    if (typeof e !== "object") break
    const { name, status, code, cause } = e as {
      name?: unknown
      status?: unknown
      code?: unknown
      cause?: unknown
    }
    if (typeof status === "number" && status >= 100 && status < 600) return `status:${status}`
    if (name === "AbortError" || name === "TimeoutError") return "timeout"
    if (typeof code === "string" && NETWORK_CODES.has(code)) return "network"
    if (e instanceof TypeError) return "network"
    e = cause
  }
  return "other"
}

type LabelRecord = { histogram: Histogram; ok: number; errors: Map<string, number> }

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function run(opts: RunOptions): Promise<RunResult> {
  const now = opts.now ?? (() => performance.now())
  const sleep = opts.sleep ?? realSleep
  const warmupMs = opts.warmupMs ?? 0
  const open = opts.ratePerSecond !== undefined
  if (open && opts.vus !== undefined) throw new Error("run: pass vus or ratePerSecond, not both")
  if (open && !((opts.ratePerSecond ?? 0) > 0)) throw new Error("run: ratePerSecond must be > 0")
  const vus = opts.vus ?? 1
  if (!open && !(vus >= 1)) throw new Error("run: vus must be ≥ 1")

  const labels = new Map<string, LabelRecord>()
  const start = now()
  const measureFrom = start + warmupMs
  const end = measureFrom + opts.durationMs
  let iterations = 0
  let failedIterations = 0
  let dropped = 0

  const record = (label: string, startedAt: number, kind: ErrorKind | null) => {
    // Warmup: requests that started before the measured window are discarded.
    if (startedAt < measureFrom) return
    let entry = labels.get(label)
    if (!entry) {
      entry = { histogram: createHistogram(), ok: 0, errors: new Map() }
      labels.set(label, entry)
    }
    entry.histogram.record(now() - startedAt)
    if (kind === null) entry.ok += 1
    else entry.errors.set(kind, (entry.errors.get(kind) ?? 0) + 1)
  }

  const context = (vu: number, iteration: number, scheduledAt?: number): VuContext => {
    let pendingScheduled = scheduledAt
    return {
      vu,
      iteration,
      async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const startedAt = pendingScheduled ?? now()
        pendingScheduled = undefined
        try {
          const value = await fn()
          record(label, startedAt, null)
          return value
        } catch (error) {
          record(label, startedAt, classifyError(error))
          throw error
        }
      },
    }
  }

  const iterate = async (ctx: VuContext, startedAt: number) => {
    try {
      await opts.scenario(ctx)
    } catch {
      if (startedAt >= measureFrom) failedIterations += 1
    }
    if (startedAt >= measureFrom) iterations += 1
  }

  // Waits for in-flight iterations, at most `drainMs`; a hung request never hangs the run. The real
  // timer is cleared once they settle, so it never holds the process open.
  const settle = async (pending: Promise<unknown>[]) => {
    const drainMs = opts.drainMs ?? 30_000
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = opts.sleep
      ? opts.sleep(drainMs)
      : new Promise<void>((resolve) => {
          timer = setTimeout(resolve, drainMs)
        })
    await Promise.race([Promise.allSettled(pending), deadline])
    clearTimeout(timer)
  }

  if (!open) {
    const loops = Array.from({ length: vus }, async (_, vu) => {
      for (let iteration = 0; now() < end; iteration++) {
        const startedAt = now()
        await iterate(context(vu, iteration), startedAt)
      }
    })
    await settle(loops)
  } else {
    const rate = opts.ratePerSecond as number
    const interval = 1000 / rate
    const maxInFlight = opts.maxInFlight ?? Math.max(1, Math.ceil(10 * rate))
    const inFlight = new Set<Promise<void>>()
    for (let i = 0; ; i++) {
      const scheduledAt = start + i * interval
      if (scheduledAt >= end) break
      const wait = scheduledAt - now()
      if (wait > 0) await sleep(wait)
      if (inFlight.size >= maxInFlight) {
        if (scheduledAt >= measureFrom) dropped += 1
        continue
      }
      const task = iterate(context(i % maxInFlight, i, scheduledAt), scheduledAt).finally(() => {
        inFlight.delete(task)
      })
      inFlight.add(task)
    }
    await settle([...inFlight])
  }

  const seconds = opts.durationMs / 1000
  const result: RunResult = {
    name: opts.name,
    model: open ? "open" : "closed",
    durationMs: opts.durationMs,
    iterations,
    failedIterations,
    dropped,
    labels: {},
  }
  for (const [label, entry] of [...labels].sort(([a], [b]) => a.localeCompare(b))) {
    const h = entry.histogram
    result.labels[label] = {
      count: h.count,
      ok: entry.ok,
      errors: Object.fromEntries(entry.errors),
      p50: h.percentile(50),
      p95: h.percentile(95),
      p99: h.percentile(99),
      max: h.max,
      rps: seconds > 0 ? h.count / seconds : 0,
    }
  }
  return result
}

export type Threshold = {
  /** A label, or `"*"` for every label in the result. */
  label: string
  p95Ms?: number
  /** Highest allowed share of failed requests, 0–1. */
  errorRate?: number
  /** Highest allowed number of 5xx answers. */
  max5xx?: number
  /** Fewest successful requests; default 1, so a label where everything failed never passes. */
  minOk?: number
}

export type Evaluation = { passed: boolean; failures: string[] }

const count5xx = (errors: Record<string, number>) =>
  Object.entries(errors)
    .filter(([kind]) => /^status:5\d\d$/.test(kind))
    .reduce((sum, [, n]) => sum + n, 0)

export function evaluate(result: RunResult, thresholds: Threshold[]): Evaluation {
  const failures: string[] = []
  for (const threshold of thresholds) {
    const names = threshold.label === "*" ? Object.keys(result.labels) : [threshold.label]
    if (names.length === 0) failures.push(`${result.name}: no requests recorded`)
    for (const label of names) {
      const stats = result.labels[label]
      if (!stats) {
        failures.push(`${label}: no requests recorded`)
        continue
      }
      const minOk = threshold.minOk ?? 1
      if (stats.ok < minOk) failures.push(`${label}: ${stats.ok} successful (needs ≥ ${minOk})`)
      if (threshold.p95Ms !== undefined && stats.p95 > threshold.p95Ms) {
        failures.push(`${label}: p95 ${stats.p95.toFixed(1)} ms > ${threshold.p95Ms} ms`)
      }
      if (threshold.errorRate !== undefined && stats.count > 0) {
        const rate = (stats.count - stats.ok) / stats.count
        if (rate > threshold.errorRate) {
          failures.push(
            `${label}: error rate ${(rate * 100).toFixed(2)} % > ${(threshold.errorRate * 100).toFixed(2)} %`
          )
        }
      }
      if (threshold.max5xx !== undefined) {
        const fives = count5xx(stats.errors)
        if (fives > threshold.max5xx)
          failures.push(`${label}: ${fives} 5xx (max ${threshold.max5xx})`)
      }
    }
  }
  return { passed: failures.length === 0, failures }
}
