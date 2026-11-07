/**
 * Drill 4, SIGTERM under load (spec §2.4.4). 20 VUs run `notes.list` (each held ~50 ms per
 * statement by the slow-query hook, so requests are really in flight), and the drill sends the api
 * process SIGTERM. Pass: every request started before the signal completes successfully (at least
 * one was in flight; completions = starts), the port
 * refuses new connections within the api's `drainMs` (8 s, `createServer`'s default), the process
 * exits 0 within `drainMs` plus a margin, and the log written after the signal holds no error
 * line (an `"level":"error"` entry, or an unhandled rejection/exception).
 */
import { readFileSync, statSync } from "node:fs"
import { startStack } from "../stack"
import {
  type Check,
  check,
  type DrillResult,
  durationOf,
  errorKinds,
  fmtKinds,
  result,
  type Sample,
  setupUsers,
  sleep,
  startLoop,
} from "./common"

export const PORTS = { api: 3047, ai: 3048 }
/** `apps/api`'s `createServer` default (`options.drainMs ?? 8_000`); `graceMs` defaults to 0. */
export const API_DRAIN_MS = 8_000
const EXIT_MARGIN_MS = 3_000
const VUS = 20
const USERS = 5
const WARM_MS = 3_000
/** Per statement, via `API_TEST_QUERY_DELAY_MS`. */
const QUERY_DELAY_MS = 50
const PORT_PROBE_EVERY_MS = 50

/** Log lines that count as an unhandled error (JSON logs in production mode). */
export function errorLines(log: string): string[] {
  return log
    .split("\n")
    .filter((line) => /"level":"error"/.test(line) || /unhandled|uncaught/i.test(line))
}

/** The drill's verdict from what it recorded — pure, unit-tested. */
export function judgeSigterm(input: {
  started: number
  samples: Sample[]
  /** When the signal was sent, on the loop's clock. */
  signalAt: number
  closedAfterMs: number | null
  newRequestRefused: boolean
  exit: { code: number | null; afterMs: number } | null
  errors: string[]
  drainMs?: number
}): Check[] {
  const drainMs = input.drainMs ?? API_DRAIN_MS
  // Started before the signal: every one must succeed. Started after it (the VUs keep going until
  // the loop notices the stop): refused or served, either is fine — the port check covers them.
  const before = input.samples.filter((s) => s.start < input.signalAt)
  const after = input.samples.filter((s) => s.start >= input.signalAt)
  const beforeFailed = before.filter((s) => !s.ok)
  const inFlight = before.filter((s) => s.end >= input.signalAt)
  const inFlightOk = inFlight.filter((s) => s.ok).length
  const slowest = Math.max(0, ...inFlight.map(durationOf))
  return [
    check(
      inFlight.length > 0 && beforeFailed.length === 0 && input.samples.length === input.started,
      `${inFlightOk}/${inFlight.length} in flight at the signal completed (slowest ${Math.round(slowest)} ms), ` +
        `${before.length - beforeFailed.length}/${before.length} started before it ok ` +
        `(errors ${fmtKinds(errorKinds(beforeFailed))}); ${input.samples.length}/${input.started} ended; ` +
        `after it ${after.length} (errors ${fmtKinds(errorKinds(after))})`
    ),
    check(
      input.closedAfterMs !== null && input.closedAfterMs <= drainMs && input.newRequestRefused,
      `port refused new connections ${input.closedAfterMs === null ? "never" : `after ${Math.round(input.closedAfterMs)} ms`} ` +
        `(drainMs ${drainMs}); a new request ${input.newRequestRefused ? "was refused" : "was served"}`
    ),
    check(
      input.exit !== null &&
        input.exit.code === 0 &&
        input.exit.afterMs <= drainMs + EXIT_MARGIN_MS,
      input.exit === null
        ? `did not exit within ${drainMs + EXIT_MARGIN_MS} ms`
        : `exit code ${input.exit.code} after ${Math.round(input.exit.afterMs)} ms`
    ),
    check(
      input.errors.length === 0,
      `error lines in the log after the signal: ${input.errors.length}` +
        (input.errors.length ? ` (first: ${input.errors[0]?.slice(0, 160)})` : "")
    ),
  ]
}

async function accepts(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: { data() {}, error() {} },
    })
    socket.end()
    return true
  } catch {
    return false
  }
}

export async function sigtermDrill(): Promise<DrillResult> {
  const stack = await startStack({
    db: "sqlite",
    apiPort: PORTS.api,
    aiPort: PORTS.ai,
    // A local notes.list answers in under a millisecond, so almost nothing would be in flight at
    // the signal. The test-only slow-query hook (honoured outside production only, hence
    // NODE_ENV=test; logs kept JSON) holds each request for a few statements' worth of delay.
    env: {
      NODE_ENV: "test",
      LOG_FORMAT: "json",
      API_TEST_QUERY_DELAY_MS: String(QUERY_DELAY_MS),
    },
  })
  try {
    const users = await setupUsers(USERS, stack.target, stack.mailDir, "sigterm")
    const loop = startLoop(VUS, async (vu, measure) => {
      const { user, workspaceId } = users[vu % users.length] as (typeof users)[number]
      await measure("notes.list", () => user.client.notes.list({ workspaceId }))
    })
    await sleep(WARM_MS)
    const logOffset = statSync(stack.logPath).size
    const api = stack.processes.api
    const signalledAt = performance.now()
    const signalAt = loop.now()
    api.kill("SIGTERM")
    const drained = loop.stop()

    const exited = api.exited.then(() => performance.now() - signalledAt)
    let closedAfterMs: number | null = null
    while (performance.now() - signalledAt < API_DRAIN_MS + EXIT_MARGIN_MS) {
      if (!(await accepts(PORTS.api))) {
        closedAfterMs = performance.now() - signalledAt
        break
      }
      await sleep(PORT_PROBE_EVERY_MS)
    }
    let newRequestRefused = false
    try {
      await fetch(`${stack.apiUrl}/health`, { signal: AbortSignal.timeout(2_000) })
    } catch {
      newRequestRefused = true
    }
    await drained
    const exitAfter = await Promise.race([
      exited,
      sleep(Math.max(0, API_DRAIN_MS + EXIT_MARGIN_MS - (performance.now() - signalledAt))).then(
        () => null
      ),
    ])
    // Let the last lines reach the file.
    await sleep(200)
    const log = readFileSync(stack.logPath).subarray(logOffset).toString("utf8")
    return result(
      "sigterm",
      judgeSigterm({
        started: loop.started(),
        samples: loop.samples,
        signalAt,
        closedAfterMs,
        newRequestRefused,
        exit: exitAfter === null ? null : { code: api.exitCode, afterMs: exitAfter },
        errors: errorLines(log),
      })
    )
  } finally {
    await stack.stop()
  }
}
