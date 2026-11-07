/**
 * Drill 1, database outage mid-load (spec §2.4.1). While a closed-model loop of `notes.list` +
 * `notes.create` runs, the database stops answering for `OUTAGE_MS`:
 *
 * - SQLite: a second connection in this process holds `BEGIN EXCLUSIVE` on the stack's file.
 * - Postgres (only with `LOAD_DRILL_POSTGRES=1`, needs docker): a throwaway `postgres:17-alpine`
 *   container on 127.0.0.1:5499, started by the drill, `docker pause`d and `unpause`d; always
 *   `docker rm -f`'d in a finally. No other container is touched.
 *
 * The stack runs with `REQUEST_TIMEOUT_MS=3000` (`DRILL_REQUEST_TIMEOUT_MS`), so the api's own
 * deadline answers before the client's 10 s timeout.
 *
 * Pass, Postgres: `/ready` answers 503 (within its probe timeout) during the outage; every request
 * ends — success or error — within `REQUEST_TIMEOUT_MS + 1 s`, and none by the client giving up
 * (the api's 503 is what a caller sees). Both engines: after the release every request succeeds
 * again and `/ready` is 200, with the same api process (no restart).
 *
 * SQLite asserts recovery and survival only: a write lock held by another process blocks the api's
 * event loop for up to `busy_timeout` per attempt (Bun's SQLite busy wait is synchronous), so
 * neither `/ready`'s timeout nor the request deadline can fire meanwhile. The drill records the
 * `/ready` answers and the longest stall as information instead (load-findings-1.md, F3).
 */
import { SQL } from "bun"
import { type Stack, startStack } from "../stack"
import {
  type Check,
  check,
  type DrillResult,
  durationOf,
  errorKinds,
  fmtKinds,
  percentile,
  probeReady,
  result,
  type Sample,
  setupUsers,
  sleep,
  startLoop,
} from "./common"

export const PORTS = { sqlite: { api: 3041, ai: 3042 }, postgres: { api: 3051, ai: 3052 } }
export const OUTAGE_MS = 10_000
const BASELINE_MS = 2_000
/** After the release: settle this long, then measure recovery for `RECOVERY_MS`. */
const SETTLE_MS = 1_000
const RECOVERY_MS = 3_000
export const READY_PROBE_TIMEOUT_MS = 3_000
const READY_PROBE_EVERY_MS = 500
/** The drill stack's `REQUEST_TIMEOUT_MS`: well under the client's own timeout. */
export const DRILL_REQUEST_TIMEOUT_MS = 3_000
const VUS = 10
/** Measurement slack on top of the bound (timers, the loop's own scheduling). */
const SLACK_MS = 500

const PG_PORT = 5499
const PG_IMAGE = "postgres:17-alpine"

/** The api's deadline plus a second; the client's own timeout sits above it. */
export const requestBoundMs = () => DRILL_REQUEST_TIMEOUT_MS + 1_000

export type Probe = { at: number; answer: number | string }

/** The drill's verdict from what it recorded — pure, unit-tested. */
export function judgeOutage(input: {
  engine: "sqlite" | "postgres"
  samples: Sample[]
  probes: Probe[]
  outage: { start: number; end: number }
  recoveryFrom: number
  boundMs: number
  finalReady: number | string
  sameProcess: boolean
}): Check[] {
  const { samples, probes, outage, recoveryFrom, boundMs } = input
  const during = probes.filter((p) => p.at >= outage.start && p.at < outage.end)
  const answers: Record<string, number> = {}
  for (const p of during) answers[String(p.answer)] = (answers[String(p.answer)] ?? 0) + 1
  const saw503 = (answers["503"] ?? 0) > 0
  const probeHung = (answers.timeout ?? 0) > 0
  const overlapping = samples.filter((s) => s.end >= outage.start && s.start <= outage.end)
  const slowest = Math.max(0, ...overlapping.map(durationOf))
  const recovery = samples.filter((s) => s.start >= recoveryFrom)
  const recoveryErrors = recovery.filter((s) => !s.ok)
  const kinds = errorKinds(overlapping)
  const clientTimeouts = kinds.timeout ?? 0
  const duringOutage =
    input.engine === "sqlite"
      ? [
          info(
            `/ready during the outage: ${fmtKinds(answers)}; longest stall ${Math.round(slowest)} ms ` +
              `over ${overlapping.length} requests, errors ${fmtKinds(kinds)} ` +
              `(recorded, not judged: SQLite's busy wait blocks the event loop)`
          ),
        ]
      : [
          check(
            saw503 && !probeHung,
            `/ready during the outage: ${fmtKinds(answers)} (want a 503, no probe past ${READY_PROBE_TIMEOUT_MS} ms)`
          ),
          check(
            slowest <= boundMs + SLACK_MS && clientTimeouts === 0,
            `slowest request overlapping the outage ${Math.round(slowest)} ms (bound ${boundMs} ms), ` +
              `client timeouts ${clientTimeouts}; ${overlapping.length} requests, errors ${fmtKinds(kinds)}`
          ),
        ]
  return [
    ...duringOutage,
    check(
      recovery.length > 0 && recoveryErrors.length === 0,
      `after release ${recovery.length - recoveryErrors.length}/${recovery.length} ok ` +
        `(errors ${fmtKinds(errorKinds(recoveryErrors))}), p95 ${Math.round(percentile(recovery.map(durationOf), 95))} ms`
    ),
    check(input.finalReady === 200, `/ready after release: ${input.finalReady}`),
    check(
      input.sameProcess,
      `api process ${input.sameProcess ? "still up" : "exited"} (no restart)`
    ),
  ]
}

/** A line recorded for the reader that never fails the drill. */
const info = (text: string): Check => ({ ok: true, text: `info ${text}` })

/** Runs the load loop, calls `outage.begin()`/`end()` around `OUTAGE_MS`, and judges. */
async function underOutage(
  engine: "sqlite" | "postgres",
  name: string,
  stack: Stack,
  outage: { begin(): Promise<void>; end(): Promise<void> }
): Promise<DrillResult> {
  const users = await setupUsers(VUS, stack.target, stack.mailDir, name.replace(/\W+/g, "-"))
  const loop = startLoop(VUS, async (vu, measure) => {
    const { user, workspaceId } = users[vu % users.length] as (typeof users)[number]
    await measure("notes.list", () => user.client.notes.list({ workspaceId }))
    await measure("notes.create", () =>
      user.client.notes.create({ workspaceId, title: `drill ${vu}`, body: "" })
    )
  })
  const probes: Probe[] = []
  let probing = true
  const prober = (async () => {
    while (probing) {
      const at = loop.now()
      probes.push({ at, answer: await probeReady(stack.apiUrl, READY_PROBE_TIMEOUT_MS) })
      await sleep(Math.max(0, READY_PROBE_EVERY_MS - (loop.now() - at)))
    }
  })()

  await sleep(BASELINE_MS)
  const start = loop.now()
  await outage.begin()
  await sleep(OUTAGE_MS)
  await outage.end()
  const end = loop.now()
  await sleep(SETTLE_MS)
  const recoveryFrom = loop.now()
  await sleep(RECOVERY_MS)
  probing = false
  await Promise.all([loop.stop(), prober])
  const finalReady = await probeReady(stack.apiUrl, READY_PROBE_TIMEOUT_MS)
  const api = stack.processes.api
  return result(
    name,
    judgeOutage({
      engine,
      samples: loop.samples,
      probes,
      outage: { start, end },
      recoveryFrom,
      boundMs: requestBoundMs(),
      finalReady,
      sameProcess: api.exitCode === null && api.signalCode === null,
    })
  )
}

export async function sqliteDrill(): Promise<DrillResult> {
  const stack = await startStack({
    db: "sqlite",
    apiPort: PORTS.sqlite.api,
    aiPort: PORTS.sqlite.ai,
    env: { REQUEST_TIMEOUT_MS: String(DRILL_REQUEST_TIMEOUT_MS) },
  })
  const locker = new SQL(`sqlite://${stack.runDir}/api.db`)
  try {
    return await underOutage("sqlite", "database (sqlite)", stack, {
      async begin() {
        // The api may hold a write at this instant (busy_timeout is 0 on this connection): retry.
        for (let attempt = 0; ; attempt++) {
          try {
            await locker.unsafe("BEGIN EXCLUSIVE")
            return
          } catch (error) {
            if (attempt >= 50) throw error
            await sleep(20)
          }
        }
      },
      async end() {
        await locker.unsafe("COMMIT")
      },
    })
  } finally {
    await locker.close().catch(() => {})
    await stack.stop()
  }
}

async function docker(...args: string[]): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const code = await proc.exited
  return { code, out: (out + err).trim() }
}

async function waitForPostgres(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs
  for (;;) {
    const sql = new SQL(url, { max: 1, connectionTimeout: 2 })
    try {
      await sql`SELECT 1`
      return
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`postgres did not come up: ${String(error)}`)
      await sleep(500)
    } finally {
      await sql.close().catch(() => {})
    }
  }
}

export async function postgresDrill(): Promise<DrillResult> {
  const container = `load-drill-pg-${process.pid}-${Date.now()}`
  const url = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`
  let stack: Stack | undefined
  try {
    const run = await docker(
      "run",
      "-d",
      "--rm",
      "--name",
      container,
      "-p",
      `127.0.0.1:${PG_PORT}:5432`,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      PG_IMAGE
    )
    if (run.code !== 0) throw new Error(`docker run failed: ${run.out}`)
    // The image's init restarts the server once, so a single successful SELECT is not enough
    // right away: wait, then require it again after a short pause.
    await waitForPostgres(url, 30_000)
    await sleep(1_500)
    await waitForPostgres(url, 15_000)
    stack = await startStack({
      db: "postgres",
      apiPort: PORTS.postgres.api,
      aiPort: PORTS.postgres.ai,
      env: { DATABASE_URL: url, REQUEST_TIMEOUT_MS: String(DRILL_REQUEST_TIMEOUT_MS) },
    })
    return await underOutage("postgres", "database (postgres)", stack, {
      async begin() {
        const paused = await docker("pause", container)
        if (paused.code !== 0) throw new Error(`docker pause failed: ${paused.out}`)
      },
      async end() {
        const resumed = await docker("unpause", container)
        if (resumed.code !== 0) throw new Error(`docker unpause failed: ${resumed.out}`)
      },
    })
  } finally {
    await stack?.stop()
    await docker("rm", "-f", container)
  }
}

/** The SQLite drill always; the Postgres one only with `LOAD_DRILL_POSTGRES=1`. */
export async function databaseDrill(env = process.env): Promise<DrillResult[]> {
  const results = [await sqliteDrill()]
  if (env.LOAD_DRILL_POSTGRES === "1") results.push(await postgresDrill())
  else
    results.push({
      name: "database (postgres)",
      passed: true,
      lines: ["SKIP database (postgres): set LOAD_DRILL_POSTGRES=1 (needs docker)"],
    })
  return results
}
