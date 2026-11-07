import { newRequestId } from "@repo/log"
import { outsideRequestContext, withRequestContext } from "@repo/log/context"
import type { Db } from "../db"
import type { JobRow } from "../queries/jobs"
import { backoffMs } from "./backoff"
import type { JobContext, JobDefinition, Log, ScheduleDefinition } from "./define"
import { createEnqueue } from "./enqueue"
import { JOBS, SCHEDULES } from "./registry"
import { tickSchedules } from "./scheduler"

export type Worker = {
  /** Begins polling every `pollMs` and the scheduler's minute ticks. */
  start(): void
  /** Stops claiming and ticking; waits for jobs in flight up to `drainMs`. */
  stop(drainMs: number): Promise<void>
  /** Poll now instead of at the next interval (a no-op unless started and not stopping). */
  nudge(): void
  /**
   * Tests: claims and runs due jobs until none is due and none is in flight (ignores `pollMs`).
   * Rejects when a claim fails, rather than reporting an empty queue.
   */
  drain(): Promise<void>
}

/** Added to a job timeout to make its lock: the batch's shared one, or a long job's own. */
const LOCK_SLACK_MS = 30_000
/**
 * A job whose timeout exceeds this (`backup.run`'s 30 minutes) does not set the batch's shared
 * lock: it gets its own, right after the claim, so one long job never delays every crashed
 * job's reclaim.
 */
export const LONG_JOB_MS = 5 * 60_000
const MINUTE_MS = 60_000
/** A database outage fails every poll; one log line a minute is enough to say so. */
const POLL_ERROR_LOG_INTERVAL_MS = MINUTE_MS

/**
 * The worker's per-name caps: `webhook.deliver` at WEBHOOK_CONCURRENCY. An endpoint that drops
 * packets holds its slot for the whole 10 s attempt, so without a cap one workspace's dead
 * endpoints could take every slot and hold up everyone's mail.
 */
export const webhookNameLimits = (webhookConcurrency: number): Record<string, number> => ({
  "webhook.deliver": webhookConcurrency,
})

type PollResult = { claimed: number; error?: unknown }

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * The job worker: claims due rows (up to `concurrency` in flight), runs each against its
 * definition with a per-job timeout, and records the outcome; plus the cron scheduler, which
 * enqueues each due schedule on every minute boundary.
 */
export function createWorker(deps: {
  db: Db
  context: Omit<JobContext, "signal" | "attempt" | "maxAttempts" | "now">
  // biome-ignore lint/suspicious/noExplicitAny: a list of job definitions, each with its own payload type.
  jobs?: readonly JobDefinition<any>[]
  schedules?: readonly ScheduleDefinition[]
  concurrency: number
  /**
   * Per-name caps on how many jobs of that name this process runs at once (e.g.
   * `{ "webhook.deliver": 2 }`), each at most `concurrency` — below it to keep slots for the
   * rest — so a flood of one kind of job never takes every slot from mail and the others.
   */
  nameLimits?: Readonly<Record<string, number>>
  pollMs: number
  now?: () => Date
  log: Log
  recordFailure: (message: string, error: unknown) => void
  /** Metrics hooks: every recorded outcome, and how late each scheduler tick fired. */
  metrics?: {
    jobOutcome(name: string, outcome: "succeeded" | "retried" | "dead", seconds?: number): void
    schedulerLag(seconds: number): void
  }
}): Worker {
  const { db, log, recordFailure, concurrency, pollMs, metrics } = deps
  const nameLimits = Object.entries(deps.nameLimits ?? {})
  const cappedNames = nameLimits.map(([name]) => name)
  const jobs = deps.jobs ?? JOBS
  const schedules = deps.schedules ?? SCHEDULES
  const now = deps.now ?? (() => new Date())
  const byName = new Map(jobs.map((job) => [job.name, job]))
  // One lock for the whole claimed batch: it must outlast the slowest ordinary job (each job's
  // own, shorter timeout is enforced here, not by the lock). A long job (over `LONG_JOB_MS`) is
  // excluded and has its row's lock extended to its own timeout right after the claim.
  const lockMs =
    Math.max(0, ...jobs.map((job) => job.timeoutMs).filter((ms) => ms <= LONG_JOB_MS)) +
    LOCK_SLACK_MS

  let started = false
  let stopping = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let tickTimer: ReturnType<typeof setTimeout> | undefined
  let polling: Promise<PollResult> | undefined
  let ticking: Promise<void> | undefined
  let pollAgain = false
  let lastPollErrorAt = Number.NEGATIVE_INFINITY
  // A slot is released when its job's outcome is recorded — or at the timeout, even if the job's
  // own promise never settles.
  const inFlight = new Set<Promise<void>>()
  // In-flight count per capped name (released with the slot).
  const inFlightByName = new Map<string, number>()

  const enqueue = createEnqueue({ db, now, nudge: () => nudge() })

  const iso = (ms = 0) => new Date(now().getTime() + ms).toISOString()

  async function kill(row: JobRow, reason: string, error: unknown = new Error(reason)) {
    const killed = await db.jobs.kill(row.id, row.attempts, iso(), reason)
    if (killed) {
      metrics?.jobOutcome(row.name, "dead")
      recordFailure(`job ${row.name} died`, error)
    }
  }

  /** Runs `def.run` with an abort signal that fires at `timeoutMs`; rejects on timeout. */
  async function runWithTimeout(
    def: JobDefinition<unknown>,
    payload: unknown,
    attempt: number,
    maxAttempts: number
  ) {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`timed out after ${def.timeoutMs} ms`)
        controller.abort(error)
        reject(error)
      }, def.timeoutMs)
      // A job that hangs must not keep the process alive on its own once the worker has stopped.
      timer.unref?.()
    })
    try {
      const run = Promise.resolve().then(() =>
        def.run(payload, { ...deps.context, signal: controller.signal, attempt, maxAttempts, now })
      )
      await Promise.race([run, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Runs the row inside the request context of whatever enqueued it (or a fresh id when there was
   * none), so every log line during the run — including the job's own `ctx.log` calls, which are
   * backed by the same structured logger — carries it.
   */
  function runRow(row: JobRow): Promise<void> {
    return withRequestContext({ requestId: row.request_id ?? newRequestId() }, () =>
      runRowInner(row)
    )
  }

  async function runRowInner(row: JobRow): Promise<void> {
    const def = byName.get(row.name)
    if (!def) return kill(row, `unknown job "${row.name}"`)

    let payload: unknown
    try {
      const parsed = def.payload.safeParse(JSON.parse(row.payload))
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")
        return kill(row, `invalid payload: ${issues}`)
      }
      payload = parsed.data
    } catch (error) {
      return kill(row, `invalid payload: ${messageOf(error)}`)
    }

    // claim bumps attempts, so a row reclaimed from a crashed worker on its last attempt arrives
    // with attempts = max + 1: the last attempt was used (and maybe half done) — stop here.
    if (row.attempts > row.max_attempts) {
      return kill(row, "worker lost the job on its last attempt")
    }

    // Wall-clock run time for the duration histogram (not the injectable `now`, which tests fix).
    const started = performance.now()
    const seconds = () => (performance.now() - started) / 1000
    try {
      await runWithTimeout(def, payload, row.attempts, row.max_attempts)
    } catch (error) {
      const message = messageOf(error)
      if (row.attempts < row.max_attempts) {
        log(`job ${row.name} failed (attempt ${row.attempts}/${row.max_attempts}), retrying`, error)
        const runAt = iso(backoffMs(row.attempts))
        if (await db.jobs.retry(row.id, row.attempts, runAt, message)) {
          metrics?.jobOutcome(row.name, "retried", seconds())
        } else {
          log(`job ${row.name} #${row.id}: outcome dropped, the row moved on`, null)
        }
      } else {
        const killed = await db.jobs.kill(row.id, row.attempts, iso(), message)
        if (killed) {
          metrics?.jobOutcome(row.name, "dead", seconds())
          recordFailure(`job ${row.name} died`, error)
        } else log(`job ${row.name} #${row.id}: outcome dropped, the row moved on`, null)
      }
      return
    }
    if (await db.jobs.succeed(row.id, row.attempts, iso())) {
      metrics?.jobOutcome(row.name, "succeeded", seconds())
    } else {
      log(`job ${row.name} #${row.id}: outcome dropped, the row moved on`, null)
    }
  }

  function track(row: JobRow) {
    const capped = cappedNames.includes(row.name)
    if (capped) inFlightByName.set(row.name, (inFlightByName.get(row.name) ?? 0) + 1)
    const slot: Promise<void> = runRow(row)
      .catch((error) => log(`job ${row.name} #${row.id}: recording the outcome failed`, error))
      .finally(() => {
        inFlight.delete(slot)
        if (capped) inFlightByName.set(row.name, (inFlightByName.get(row.name) ?? 1) - 1)
        // A freed slot: look for more work now rather than at the next interval.
        if (started && !stopping) void poll()
      })
    inFlight.add(slot)
  }

  /**
   * Claims rows for the free slots: each capped name first, up to what its cap leaves, then
   * every other name for the rest. Several statements, each one an atomic claim on its own; when a
   * later one fails, the rows the earlier ones claimed still come back (to run now rather than
   * wait out their lock), with the error.
   */
  async function claimRows(free: number): Promise<{ rows: JobRow[]; error?: unknown }> {
    if (nameLimits.length === 0) return { rows: await db.jobs.claim(iso(), free, iso(lockMs)) }
    const rows: JobRow[] = []
    try {
      for (const [name, limit] of nameLimits) {
        const room = Math.min(limit - (inFlightByName.get(name) ?? 0), free - rows.length)
        if (room > 0) rows.push(...(await db.jobs.claim(iso(), room, iso(lockMs), { only: name })))
      }
      const rest = free - rows.length
      if (rest > 0) {
        rows.push(...(await db.jobs.claim(iso(), rest, iso(lockMs), { except: cappedNames })))
      }
    } catch (error) {
      if (rows.length === 0) throw error
      return { rows, error }
    }
    return { rows }
  }

  /** One claim for the free slots; returns how many rows it claimed. */
  async function claimOnce(): Promise<number> {
    const free = concurrency - inFlight.size
    if (free <= 0 || stopping) return 0
    const { rows, error: claimError } = await claimRows(free)
    // Long jobs first get their own lock (one UPDATE per distinct timeout's rows), then run.
    // Extending before `track` keeps at-least-once intact: a crash before this leaves the row on
    // the shorter shared lock, so it is reclaimed sooner, never lost.
    const long = new Map<number, JobRow[]>()
    for (const row of rows) {
      const timeoutMs = byName.get(row.name)?.timeoutMs ?? 0
      if (timeoutMs > LONG_JOB_MS) long.set(timeoutMs, [...(long.get(timeoutMs) ?? []), row])
    }
    // A long row whose lock could not be extended is not run here: on the shorter shared lock it
    // would be reclaimed by another worker while still running. It is reclaimed once that lock
    // passes, and runs then.
    const skipped = new Set<number>()
    for (const [timeoutMs, longRows] of long) {
      try {
        await db.jobs.extendLock(longRows, iso(timeoutMs + LOCK_SLACK_MS))
      } catch (error) {
        log(`extending the lock of ${longRows.length} long job(s) failed; they run later`, error)
        for (const row of longRows) skipped.add(row.id)
      }
    }
    for (const row of rows) if (!skipped.has(row.id)) track(row)
    if (claimError !== undefined) throw claimError
    return rows.length
  }

  /**
   * Serialised: a poll asked for while one runs makes that one claim again when it finishes.
   * Never rejects — a failing claim (database down) is logged at most once a minute and handed
   * back as `error` (which `drain` rethrows; the timer loop just polls again).
   */
  function poll(): Promise<PollResult> {
    if (polling) {
      pollAgain = true
      return polling
    }
    polling = (async (): Promise<PollResult> => {
      let claimed = 0
      try {
        do {
          pollAgain = false
          claimed += await claimOnce()
        } while (pollAgain && !stopping)
        return { claimed }
      } catch (error) {
        if (Date.now() - lastPollErrorAt >= POLL_ERROR_LOG_INTERVAL_MS) {
          lastPollErrorAt = Date.now()
          log("job poll failed (logged at most once a minute)", error)
        }
        return { claimed, error }
      } finally {
        polling = undefined
      }
    })()
    return polling
  }

  function schedulePoll() {
    pollTimer = setTimeout(async () => {
      await poll()
      if (started && !stopping) schedulePoll()
    }, pollMs)
  }

  /**
   * Ticks the minute `target` (epoch ms on a minute boundary), then arms the next one. Waking up
   * a minute or more late (a blocked loop, a suspended process) ticks `target` and the current
   * minute — the dedupe key makes both safe — but not every minute in between, so a long
   * suspension does not replay hours of schedules. `stop` awaits the tick in progress.
   */
  function tick(target: number) {
    metrics?.schedulerLag((now().getTime() - target) / 1000)
    const current = Math.floor(now().getTime() / MINUTE_MS) * MINUTE_MS
    const minutes = current > target ? [target, current] : [target]
    const previous = ticking
    const run: Promise<void> = (async () => {
      await previous
      for (const minute of minutes) {
        await tickSchedules(enqueue, schedules, new Date(minute)).catch((error) =>
          log("job schedules failed to enqueue", error)
        )
      }
    })().finally(() => {
      if (ticking === run) ticking = undefined
    })
    ticking = run
    armTick((minutes.at(-1) ?? target) + MINUTE_MS)
  }

  function armTick(target: number) {
    if (!started || stopping) return
    tickTimer = setTimeout(() => tick(target), Math.max(0, target - now().getTime()))
  }

  // An enqueue inside a request nudges from that request's context; the poll (and every re-poll a
  // freed slot chains on) runs outside it, so "job poll failed" never names an unrelated request.
  function nudge() {
    if (started && !stopping) outsideRequestContext(() => void poll())
  }

  return {
    start() {
      if (started || stopping) return
      started = true
      schedulePoll()
      armTick(Math.ceil(now().getTime() / MINUTE_MS) * MINUTE_MS)
    },

    async stop(drainMs) {
      stopping = true
      clearTimeout(pollTimer)
      clearTimeout(tickTimer)
      await polling
      await ticking
      if (inFlight.size === 0) return
      let timer: ReturnType<typeof setTimeout> | undefined
      const drained = await Promise.race([
        Promise.allSettled([...inFlight]).then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), drainMs)
        }),
      ])
      clearTimeout(timer)
      if (!drained) {
        log(
          `jobs stopped with ${inFlight.size} still running after ${drainMs} ms; they are reclaimed once their lock expires`,
          null
        )
      }
    },

    nudge,

    async drain() {
      for (;;) {
        // Empty only when a poll that started with nothing running claims nothing: jobs that
        // finish while a claim is in flight free slots that claim never saw (a capped name's
        // whole cap, say), so their poll's empty answer proves nothing.
        const idle = inFlight.size === 0
        const { claimed, error } = await poll()
        if (error !== undefined) throw error
        if (claimed === 0 && idle) return
        if (inFlight.size > 0) await Promise.race(inFlight)
      }
    },
  }
}
