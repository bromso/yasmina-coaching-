/**
 * `realtime`: the `/events/workspaces/:id` stream's delivery latency, its caps, and the process
 * ceiling, as the spec's §2.
 *
 * Setup — `LOAD_WORKSPACES` workspaces (default 10) share `LOAD_STREAMS` streams (default 200)
 * as evenly as `distribute` can: each workspace gets its own member accounts (`planSlots` decides
 * how many — one user holds at most 5 streams per session and 10 per user, the server's own
 * defaults, so a workspace needing more than 10 streams gets a second invited member, a third
 * invited member past 20, and so on) and enough extra sign-ins (`addSession`) to reach that many
 * sessions. Every stream opens as `GET /events/workspaces/:id`; each workspace's owner then
 * writes a note every 200 ms (5/s) for `LOAD_REALTIME_DURATION_MS` (default 30 s), its body
 * carrying `{ sentAt: performance.now() }` — all in this one process, so the writer's and the
 * readers' clocks agree without NTP. Every reader matches `note.created` and records
 * `receivedAt - sentAt` into one histogram, reported like any other scenario (`evaluate` +
 * `writeReport`), threshold `p95Ms: 500` at the default N.
 *
 * Probes, each independent of the measurement phase above (fresh accounts, no shared state):
 * - the session cap: one user's 6th stream on the same session → 429 (default `maxPerSession: 5`).
 * - the user cap: a fresh session's stream once the user already holds 10 (two sessions of 5) →
 *   429 (default `maxPerUser: 10`).
 * - the process cap: its own dedicated stack, `REALTIME_MAX_STREAMS=<LOAD_PROCESS_CAP>` (default
 *   50) — the (cap + 1)th stream across however many users that needs → 503.
 * - the drop rule: a stream that opens and never reads is pushed, by a burst of large notes, past
 *   the server's 256 KiB queued-bytes ceiling; its next read then throws (the server errored the
 *   body) rather than resolving — proof it was dropped, not stalled.
 *
 * `/metrics` (`realtime_streams_open`, `process_resident_memory_bytes`) is sampled at 0, N/2 and N
 * open streams when a `METRICS_TOKEN` is available (always true for a stack this file starts
 * itself; set `METRICS_TOKEN` too when pointing at an already-running one via `LOAD_TARGET_API`).
 *
 * Two ways to run, like `api-core`: with `LOAD_TARGET_API` set, against an already-running stack
 * (whose measurement-phase member cap and process cap must already be at their defaults for the
 * thresholds above to mean anything); with nothing set, it starts its own stack on
 * `DEFAULT_PORTS` and stops it when done. The process-cap probe always starts its own separate
 * stack (fixed ports below), since it needs a `REALTIME_MAX_STREAMS` neither of those may have.
 */
import { isTwoFactorChallenge } from "@repo/api-contract"
import { NOTIFY_PAYLOAD_LIMIT } from "@repo/api-contract/realtime"
import {
  apiClient,
  LOAD_PASSWORD,
  type SignedInUser,
  signUpVerified,
  withWorkspace,
} from "../clients"
import { createHistogram, type Histogram } from "../histogram"
import { fetchMetrics, metricValue } from "../metrics-client"
import { writeReport } from "../report"
import { evaluate, type LabelStats, type RunResult } from "../runner"
import { readEvents } from "../sse"
import { DEFAULT_PORTS, loadDb, type Stack, startStack } from "../stack"
import { type Targets, targets } from "../target"

export const DEFAULT_STREAMS = 200
export const DEFAULT_WORKSPACES = 10
export const DEFAULT_REALTIME_DURATION_MS = 30_000
export const DEFAULT_PROCESS_CAP = 50
export const DELIVERY_P95_BUDGET_MS = 500
/** Spare ports the process-cap probe's own dedicated stack always uses. */
export const PROCESS_CAP_PORTS = { api: 3047, ai: 3048 } as const
/**
 * The most notes the drop probe bursts (each ≈ 7 KB on the wire, so ≈ 7 MB) before giving up on
 * overflowing the server's queued-bytes ceiling — see probeDrop for why it takes far more than
 * 256 KiB. With `/metrics` available it stops as soon as the drop shows there.
 */
export const DROP_BURST_MAX = 1_000
/** Notes per concurrent batch in the drop probe's burst. */
export const DROP_BATCH = 25
/**
 * How long the drop probe waits after its burst before it reads anything: on the Postgres bus a
 * note's event reaches the stream only after the NOTIFY round trip, which can land after
 * `notes.create` has already answered — reading at once would drain the socket ahead of those
 * last events and keep the queue from ever crossing the ceiling.
 */
export const DROP_SETTLE_MS = 1_000

type Env = Record<string, string | undefined>

function parsePositiveInt(raw: string | undefined, name: string, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${name} must be a positive integer, got "${raw}"`)
  return n
}

/** `LOAD_STREAMS`: total streams across every workspace. Default 200. */
export function parseStreams(env: Env = process.env): number {
  return parsePositiveInt(env.LOAD_STREAMS, "LOAD_STREAMS", DEFAULT_STREAMS)
}

/** `LOAD_WORKSPACES`: how many workspaces share those streams. Default 10. */
export function parseWorkspaces(env: Env = process.env): number {
  return parsePositiveInt(env.LOAD_WORKSPACES, "LOAD_WORKSPACES", DEFAULT_WORKSPACES)
}

/** `LOAD_REALTIME_DURATION_MS`: how long the writer/reader measurement phase runs. Default 30 s. */
export function parseRealtimeDurationMs(env: Env = process.env): number {
  return parsePositiveInt(
    env.LOAD_REALTIME_DURATION_MS,
    "LOAD_REALTIME_DURATION_MS",
    DEFAULT_REALTIME_DURATION_MS
  )
}

/** `LOAD_PROCESS_CAP`: the `REALTIME_MAX_STREAMS` the process-cap probe's own stack starts with. */
export function parseProcessCap(env: Env = process.env): number {
  return parsePositiveInt(env.LOAD_PROCESS_CAP, "LOAD_PROCESS_CAP", DEFAULT_PROCESS_CAP)
}

/** Splits `total` across `buckets` as evenly as possible (the first `total % buckets` get one extra). */
export function distribute(total: number, buckets: number): number[] {
  if (!(buckets > 0)) throw new Error("distribute: buckets must be positive")
  if (!(total >= 0)) throw new Error("distribute: total must not be negative")
  const base = Math.floor(total / buckets)
  const extra = total % buckets
  return Array.from({ length: buckets }, (_, i) => base + (i < extra ? 1 : 0))
}

export type StreamSlot = { userIndex: number; sessionIndex: number }

/**
 * Assigns `count` streams to users and sessions, filling one session to `maxPerSession` before
 * starting the next, and one user to `maxPerUser` before starting the next — the server's own cap
 * order, so a plan built this way never trips a cap by accident.
 */
export function planSlots(count: number, maxPerSession = 5, maxPerUser = 10): StreamSlot[] {
  if (!(count >= 0)) throw new Error("planSlots: count must not be negative")
  const slots: StreamSlot[] = []
  let userIndex = 0
  let sessionIndex = 0
  let inSession = 0
  let inUser = 0
  for (let i = 0; i < count; i++) {
    if (inUser >= maxPerUser) {
      userIndex++
      inUser = 0
      sessionIndex = 0
      inSession = 0
    }
    if (inSession >= maxPerSession) {
      sessionIndex++
      inSession = 0
    }
    slots.push({ userIndex, sessionIndex })
    inSession++
    inUser++
  }
  return slots
}

/** How many distinct users (and, per user, sessions) a slot plan needs. */
export function slotCounts(slots: StreamSlot[]): { users: number; sessionsPerUser: number[] } {
  const users = slots.length === 0 ? 0 : Math.max(...slots.map((s) => s.userIndex)) + 1
  const sessionsPerUser = Array.from({ length: users }, (_, u) => {
    const forUser = slots.filter((s) => s.userIndex === u)
    return forUser.length === 0 ? 0 : Math.max(...forUser.map((s) => s.sessionIndex)) + 1
  })
  return { users, sessionsPerUser }
}

/**
 * The `sentAt` a writer embedded in a `note.created` event's note body (`{"sentAt": <number>}`),
 * or null for any other event (presence, resync) or an unparseable one.
 */
export function extractSentAt(data: string): number | null {
  try {
    const event = JSON.parse(data) as { type?: string; note?: { body?: string } }
    if (event.type !== "note.created" || !event.note) return null
    const body = JSON.parse(event.note.body ?? "") as { sentAt?: unknown }
    return typeof body.sentAt === "number" ? body.sentAt : null
  } catch {
    return null
  }
}

/** A one-line failure, or null when `status` is `expected`. */
export function capFailure(label: string, status: number, expected: number): string | null {
  return status === expected ? null : `${label}: got ${status}, expected ${expected}`
}

/** A `RunResult` wrapping the delivery histogram, for the standard `evaluate`/`writeReport` path. */
export function deliveryResult(
  histogram: Histogram,
  durationMs: number,
  openFailures: number
): RunResult {
  const stats: LabelStats = {
    count: histogram.count + openFailures,
    ok: histogram.count,
    errors: openFailures > 0 ? { "stream-open-failed": openFailures } : {},
    p50: histogram.percentile(50),
    p95: histogram.percentile(95),
    p99: histogram.percentile(99),
    max: histogram.max,
    rps: durationMs > 0 ? histogram.count / (durationMs / 1000) : 0,
  }
  return {
    name: "realtime-delivery",
    model: "open",
    durationMs,
    iterations: histogram.count,
    failedIterations: openFailures,
    dropped: 0,
    labels: { "note.delivery": stats },
  }
}

// --- Live parts: everything below talks to a running stack. ---

/** One more sign-in for `email`, as a fresh session (independent of the account's first one). */
async function addSession(target: Targets, email: string, clientId: string): Promise<string> {
  const anon = apiClient({ target, clientId })
  const result = await anon.auth.signIn({ email, password: LOAD_PASSWORD })
  if (isTwoFactorChallenge(result)) throw new Error(`${email} unexpectedly has two-step on`)
  return result.session.token
}

/** `owner` invites `invited` (by email) and `invited` accepts from their own pending list. */
async function inviteAndAccept(
  owner: SignedInUser,
  workspaceId: number,
  invited: SignedInUser
): Promise<void> {
  await owner.client.workspaces.invitations.create({
    workspaceId,
    email: invited.email,
    role: "member",
  })
  const { pendingInvitations } = await invited.client.workspaces.list()
  const pending = pendingInvitations[0]
  if (!pending)
    throw new Error(`${invited.email}: no pending invitation for workspace ${workspaceId}`)
  await invited.client.invitations.acceptById({ id: pending.id })
}

export type ProvisionedWorkspace = {
  workspaceId: number
  writer: SignedInUser
  sessionTokens: string[]
}

/** One workspace with enough members and sessions to open `slots.length` streams without a cap tripping. */
async function provisionWorkspace(
  target: Targets,
  stamp: number,
  index: number,
  slots: StreamSlot[]
): Promise<ProvisionedWorkspace> {
  const { users: userCount, sessionsPerUser } = slotCounts(slots)
  const owner = await signUpVerified(`load-rt-${stamp}-${index}-0@example.com`, {
    target,
    clientId: `load-rt-${stamp}-${index}-0`,
  })
  const workspaceId = await withWorkspace(owner.client, `Realtime ${stamp}-${index}`)
  const users: SignedInUser[] = [owner]
  for (let u = 1; u < userCount; u++) {
    const member = await signUpVerified(`load-rt-${stamp}-${index}-${u}@example.com`, {
      target,
      clientId: `load-rt-${stamp}-${index}-${u}`,
    })
    await inviteAndAccept(owner, workspaceId, member)
    users.push(member)
  }
  const sessionsByUser = await Promise.all(
    users.map(async (user, u) => {
      const tokens = [user.sessionToken]
      for (let s = 1; s < (sessionsPerUser[u] ?? 1); s++) {
        tokens.push(await addSession(target, user.email, `load-rt-${stamp}-${index}-${u}-s${s}`))
      }
      return tokens
    })
  )
  const sessionTokens = slots.map((slot) => {
    const token = sessionsByUser[slot.userIndex]?.[slot.sessionIndex]
    if (!token)
      throw new Error(`provisionWorkspace: missing session for slot ${JSON.stringify(slot)}`)
    return token
  })
  return { workspaceId, writer: owner, sessionTokens }
}

function openStream(
  target: Targets,
  workspaceId: number,
  sessionToken: string,
  clientId: string,
  signal?: AbortSignal
): Promise<Response> {
  return fetch(new URL(`/events/workspaces/${workspaceId}`, target.api), {
    headers: {
      authorization: `Bearer ${target.apiToken}`,
      "x-api-client-id": clientId,
      "x-session-token": sessionToken,
    },
    signal,
  })
}

async function closeQuietly(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // Already gone.
  }
}

/** Writes one note every `1000/ratePerSecond` ms for `durationMs`, body carrying `sentAt`. */
async function writeNotes(
  client: SignedInUser["client"],
  workspaceId: number,
  ratePerSecond: number,
  durationMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => Bun.sleep(ms)
): Promise<number> {
  const interval = 1000 / ratePerSecond
  const end = performance.now() + durationMs
  let n = 0
  while (performance.now() < end) {
    const sentAt = performance.now()
    try {
      await client.notes.create({ workspaceId, title: `L${n}`, body: JSON.stringify({ sentAt }) })
    } catch {
      // A failed write just means one fewer note in flight; the loop keeps its pace.
    }
    n++
    await sleep(Math.max(0, interval - (performance.now() - sentAt)))
  }
  return n
}

async function sampleMetrics(apiUrl: URL, token: string | undefined, label: string): Promise<void> {
  if (!token) {
    console.log(`metrics @ ${label}: skipped (no METRICS_TOKEN)`)
    return
  }
  try {
    const metrics = await fetchMetrics(apiUrl, token)
    const open = metricValue(metrics, "realtime_streams_open")
    const rss = metricValue(metrics, "process_resident_memory_bytes")
    const rssMb = rss !== undefined ? `${(rss / 1024 / 1024).toFixed(1)} MB` : "?"
    console.log(`metrics @ ${label}: realtime_streams_open=${open ?? "?"} rss=${rssMb}`)
  } catch (error) {
    console.log(`metrics @ ${label}: unavailable (${(error as Error).message})`)
  }
}

/** The 6th stream on one session (default `maxPerSession: 5`) must answer 429. */
async function probeSessionCap(target: Targets, stamp: number): Promise<string[]> {
  const user = await signUpVerified(`load-rt-cap-session-${stamp}@example.com`, {
    target,
    clientId: `load-rt-cap-session-${stamp}`,
  })
  const workspaceId = await withWorkspace(user.client, `Realtime cap session ${stamp}`)
  const failures: string[] = []
  const opened: Response[] = []
  for (let i = 0; i < 5; i++) {
    const res = await openStream(
      target,
      workspaceId,
      user.sessionToken,
      `load-rt-cap-session-${stamp}-${i}`
    )
    opened.push(res)
    const failure = capFailure(`session cap: stream ${i + 1}`, res.status, 200)
    if (failure) failures.push(failure)
  }
  const sixth = await openStream(
    target,
    workspaceId,
    user.sessionToken,
    `load-rt-cap-session-${stamp}-6`
  )
  const failure = capFailure("session cap: 6th stream", sixth.status, 429)
  if (failure) failures.push(failure)
  await Promise.all([...opened, sixth].map(closeQuietly))
  return failures
}

/** The 11th stream on one user (default `maxPerUser: 10`), via a third session, must answer 429. */
async function probeUserCap(target: Targets, stamp: number): Promise<string[]> {
  const user = await signUpVerified(`load-rt-cap-user-${stamp}@example.com`, {
    target,
    clientId: `load-rt-cap-user-${stamp}`,
  })
  const workspaceId = await withWorkspace(user.client, `Realtime cap user ${stamp}`)
  const failures: string[] = []
  const opened: Response[] = []
  let streamNumber = 0
  for (const sessionIndex of [0, 1]) {
    const token =
      sessionIndex === 0
        ? user.sessionToken
        : await addSession(target, user.email, `load-rt-cap-user-${stamp}-s1`)
    for (let i = 0; i < 5; i++) {
      streamNumber++
      const res = await openStream(
        target,
        workspaceId,
        token,
        `load-rt-cap-user-${stamp}-${sessionIndex}-${i}`
      )
      opened.push(res)
      const failure = capFailure(`user cap: stream ${streamNumber}`, res.status, 200)
      if (failure) failures.push(failure)
    }
  }
  const thirdToken = await addSession(target, user.email, `load-rt-cap-user-${stamp}-s2`)
  const eleventh = await openStream(
    target,
    workspaceId,
    thirdToken,
    `load-rt-cap-user-${stamp}-2-0`
  )
  const failure = capFailure("user cap: 11th stream", eleventh.status, 429)
  if (failure) failures.push(failure)
  await Promise.all([...opened, eleventh].map(closeQuietly))
  return failures
}

/** `REALTIME_MAX_STREAMS=cap`'s own dedicated stack: the (cap + 1)th stream must answer 503. */
async function probeProcessCap(cap: number, stamp: number): Promise<string[]> {
  const stack = await startStack({
    db: loadDb(),
    apiPort: PROCESS_CAP_PORTS.api,
    aiPort: PROCESS_CAP_PORTS.ai,
    env: { REALTIME_MAX_STREAMS: String(cap) },
  })
  const failures: string[] = []
  const opened: Response[] = []
  try {
    const slots = planSlots(cap + 1)
    const { users: userCount, sessionsPerUser } = slotCounts(slots)
    const entries: Array<{ workspaceId: number; sessions: string[] }> = []
    for (let u = 0; u < userCount; u++) {
      const user = await signUpVerified(`load-rt-cap-process-${stamp}-${u}@example.com`, {
        target: stack.target,
        mailDir: stack.mailDir,
        clientId: `load-rt-cap-process-${stamp}-${u}`,
      })
      const workspaceId = await withWorkspace(user.client, `Realtime cap process ${stamp}-${u}`)
      const sessions = [user.sessionToken]
      for (let s = 1; s < (sessionsPerUser[u] ?? 1); s++) {
        sessions.push(
          await addSession(stack.target, user.email, `load-rt-cap-process-${stamp}-${u}-s${s}`)
        )
      }
      entries.push({ workspaceId, sessions })
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i] as StreamSlot
      const entry = entries[slot.userIndex] as { workspaceId: number; sessions: string[] }
      const token = entry.sessions[slot.sessionIndex] as string
      const res = await openStream(
        stack.target,
        entry.workspaceId,
        token,
        `load-rt-cap-process-${stamp}-${i}`
      )
      opened.push(res)
      const expected = i < cap ? 200 : 503
      const failure = capFailure(`process cap: stream ${i + 1}`, res.status, expected)
      if (failure) failures.push(failure)
    }
  } finally {
    await Promise.all(opened.map(closeQuietly))
    await stack.stop()
  }
  return failures
}

/**
 * The drop probe's burst: `create(count)` sends `count` notes at once, in batches of `batch`, until
 * `dropped()` reports the stream gone or `max` notes are sent. `dropped()` answers `undefined`
 * when it cannot tell (no `/metrics`), and the burst then simply runs to `max`. Returns how many
 * notes it sent and whether the drop was seen.
 */
export async function burstUntilDropped(opts: {
  create: (count: number, offset: number) => Promise<void>
  dropped: () => Promise<boolean | undefined>
  max: number
  batch: number
}): Promise<{ sent: number; seen: boolean }> {
  let sent = 0
  while (sent < opts.max) {
    const n = Math.min(opts.batch, opts.max - sent)
    await opts.create(n, sent)
    sent += n
    if (await opts.dropped()) return { sent, seen: true }
  }
  return { sent, seen: false }
}

/**
 * Opens a stream and never reads it, then bursts large notes into its workspace until the
 * server's 256 KiB queued-bytes ceiling drops it: a later read must throw (the body was errored),
 * not resolve normally. A timeout (`maxWaitMs`) turns "never got dropped" into a named failure
 * instead of hanging the scenario.
 *
 * The server only counts what its stream queue holds past its 64 KiB buffer; everything Bun's
 * HTTP writer, the two kernel socket buffers (loopback buffers auto-tune to megabytes on macOS)
 * and the never-reading `fetch` client have already absorbed comes first. Measured with
 * `apps/api`'s own test server, the drop took anywhere from 175 to more than 250 of these notes
 * (≈ 1.2 to over 1.75 MB) on either engine, run to run — so a fixed burst of 250 sat right on the
 * edge, and on the Postgres bus the last NOTIFYs could still be in flight when the read began.
 * Hence: burst until `/metrics` shows the stream gone (or up to `DROP_BURST_MAX`), settle, read.
 */
async function probeDrop(
  target: Targets,
  stamp: number,
  metricsToken: string | undefined,
  maxWaitMs = 10_000
): Promise<string | null> {
  const owner = await signUpVerified(`load-rt-drop-${stamp}@example.com`, {
    target,
    clientId: `load-rt-drop-${stamp}`,
  })
  const workspaceId = await withWorkspace(owner.client, `Realtime drop ${stamp}`)
  const res = await openStream(
    target,
    workspaceId,
    owner.sessionToken,
    `load-rt-drop-stream-${stamp}`
  )
  if (res.status !== 200 || !res.body) return `drop probe: stream open failed with ${res.status}`
  const streamsOpen = async (): Promise<number | undefined> => {
    if (!metricsToken) return undefined
    try {
      return metricValue(await fetchMetrics(target.api, metricsToken), "realtime_streams_open")
    } catch {
      return undefined
    }
  }
  // The probes run one at a time, so this stream is the newest open one: fewer than now = dropped.
  const baseline = await streamsOpen()
  // Each note's own frame must stay under NOTIFY_PAYLOAD_LIMIT (8000 bytes: both buses refuse a
  // bigger publish and fall back to a bare `resync`, which carries no body at all) — so the
  // queue is filled by *many* notes, not a few huge ones.
  const body = "x".repeat(NOTIFY_PAYLOAD_LIMIT - 1_000)
  const { sent, seen } = await burstUntilDropped({
    max: DROP_BURST_MAX,
    batch: DROP_BATCH,
    create: async (count, offset) => {
      await Promise.allSettled(
        Array.from({ length: count }, (_, j) =>
          owner.client.notes.create({ workspaceId, title: `drop ${offset + j}`, body })
        )
      )
    },
    dropped: async () => {
      if (baseline === undefined) return undefined
      const now = await streamsOpen()
      return now === undefined ? undefined : now < baseline
    },
  })
  console.log(
    `drop probe: ${sent} notes sent${seen ? ", drop seen in /metrics" : " (drop not seen in /metrics)"}`
  )
  await Bun.sleep(DROP_SETTLE_MS)
  const reader = res.body.getReader()
  const deadline = Date.now() + maxWaitMs
  const timedOut = Symbol("timeout")
  try {
    for (;;) {
      const remaining = deadline - Date.now()
      // Raced, not just checked between reads: once a live stream's backlog is drained, the next
      // read would otherwise wait for the server's 25 s ping.
      const next =
        remaining > 0
          ? await Promise.race([
              reader.read(),
              Bun.sleep(remaining).then((): typeof timedOut => timedOut),
            ])
          : timedOut
      if (next === timedOut) return "drop probe: the stream was never dropped (timed out waiting)"
      if (next.done) return "drop probe: the stream ended cleanly (done) instead of being errored"
    }
  } catch {
    return null // The server errored the body, as expected.
  } finally {
    // `cancel()` on an already-errored stream returns a promise *rejected* with that same
    // error (never throws synchronously) — awaiting it, not just calling it, is what lets this
    // catch it rather than leaving an unhandled rejection behind.
    await reader.cancel().catch(() => {})
  }
}

export async function main(): Promise<void> {
  const totalStreams = parseStreams()
  const workspaceCount = parseWorkspaces()
  const durationMs = parseRealtimeDurationMs()
  const processCap = parseProcessCap()
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
  const failures: string[] = []

  try {
    await sampleMetrics(target.api, metricsToken, "0 streams")

    console.log(`Provisioning ${workspaceCount} workspace(s) for ${totalStreams} stream(s)...`)
    const counts = distribute(totalStreams, workspaceCount)
    const workspaces: ProvisionedWorkspace[] = []
    for (const [i, count] of counts.entries()) {
      workspaces.push(await provisionWorkspace(target, stamp, i, planSlots(count)))
    }

    const histogram = createHistogram()
    const controller = new AbortController()
    const readerPromises: Promise<void>[] = []
    let opened = 0
    let openFailures = 0
    const half = Math.floor(totalStreams / 2)
    let sampledHalf = half === 0

    for (const [wi, ws] of workspaces.entries()) {
      for (const [si, token] of ws.sessionTokens.entries()) {
        // No signal on the fetch itself: `readEvents` below gets the signal instead, so ending
        // the measurement phase cancels the reader (a clean `{ done: true }`) rather than
        // aborting the request (an `AbortError` on whatever `read()` happened to be pending).
        const res = await openStream(
          target,
          ws.workspaceId,
          token,
          `load-rt-stream-${stamp}-${wi}-${si}`
        )
        if (res.status !== 200) {
          openFailures++
          console.log(`stream open: workspace ${wi} session ${si} got ${res.status}`)
          continue
        }
        opened++
        readerPromises.push(
          readEvents(
            res,
            (event) => {
              if (event.event !== "message") return
              const sentAt = extractSentAt(event.data)
              if (sentAt !== null) histogram.record(event.receivedAt - sentAt)
            },
            { signal: controller.signal }
          ).catch(() => {})
        )
        if (!sampledHalf && opened >= half) {
          sampledHalf = true
          await sampleMetrics(target.api, metricsToken, `${half} streams`)
        }
      }
    }
    await sampleMetrics(target.api, metricsToken, `${totalStreams} streams`)

    console.log(`Writing notes at 5/s per workspace for ${durationMs} ms...`)
    await Promise.all(
      workspaces.map((ws) => writeNotes(ws.writer.client, ws.workspaceId, 5, durationMs))
    )
    // Lets the last write's event reach every reader before the streams close.
    await Bun.sleep(1_000)
    controller.abort()
    await Promise.allSettled(readerPromises)

    const result = deliveryResult(histogram, durationMs, openFailures)
    const deliveryEval = evaluate(result, [
      { label: "note.delivery", p95Ms: DELIVERY_P95_BUDGET_MS, minOk: 1 },
    ])
    writeReport(result, deliveryEval)
    failures.push(...deliveryEval.failures)

    console.log("Probing the session cap (6th stream on one session)...")
    failures.push(...(await probeSessionCap(target, stamp)))
    console.log("Probing the user cap (11th stream on one user)...")
    failures.push(...(await probeUserCap(target, stamp)))
    console.log("Probing the never-reading stream is dropped...")
    const dropFailure = await probeDrop(target, stamp, metricsToken)
    if (dropFailure) failures.push(dropFailure)
    console.log(`Probing the process cap (REALTIME_MAX_STREAMS=${processCap})...`)
    failures.push(...(await probeProcessCap(processCap, stamp)))

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
