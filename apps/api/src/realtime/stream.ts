import {
  AUTH_ERRORS,
  type BroadcastEvent,
  type RealtimeEvent,
  userChannel,
  WORKSPACE_TWO_FACTOR_REASON,
  workspaceChannel,
} from "@repo/api-contract"
import { errorResponse } from "@repo/service-kit"
import { blockedByTwoFactor, findMembership, resolveSession } from "../access"
import type { Db } from "../db"
import type { Log } from "../jobs/define"
import type { SessionRow } from "../queries/sessions"
import type { UserRow } from "../queries/users"
import { publishAfterCommit } from "./after-commit"
import type { Broadcaster } from "./broadcaster"
import type { PresenceRegistry } from "./presence"

export type StreamDeps = {
  db: Db
  broadcaster: Broadcaster
  presence: PresenceRegistry
  /** A random id per process: every presence snapshot this replica publishes carries it. */
  replicaId: string
  /** Process-wide cap on open streams (REALTIME_MAX_STREAMS); beyond it a new stream gets 503. */
  maxStreams: number
  /**
   * Open streams one session may hold, per kind (workspace streams and `/events/me` each have
   * their own count); the next of that kind gets 429. Defaults to 5.
   */
  maxPerSession?: number
  /**
   * Open streams one user may hold across all their sessions, per kind; the next of that kind
   * gets 429. Defaults to 10.
   * An impersonation stream counts against the impersonating admin instead of the user they are
   * impersonating.
   */
  maxPerUser?: number
  /** How often every stream gets a `: ping` and presence is re-published. Defaults to 25 s. */
  pingMs?: number
  /** How often each stream re-checks its session, membership and two-step. Defaults to 60 s. */
  recheckMs?: number
  /**
   * Bytes a stream may hold unread beyond its 64 KiB buffer before it is closed (the client
   * reconnects and resyncs). Bounds the memory a client that stops reading can pin. Defaults to
   * 256 KiB.
   */
  maxQueuedBytes?: number
  fileUrl: (key: string | null) => string | null
  log: Log
  recordFailure: (message: string, error: unknown) => void
  /** The live SUPERADMIN_EMAILS set: an impersonation stream ends when its admin loses the role. */
  superadminEmails: ReadonlySet<string>
  /** The clock a suspension's end date is read against (the api's own). */
  now: () => Date
}

/**
 * The request's connection, as far as a stream needs it. The route turns Bun's idle timeout off
 * for a stream (pings keep a live one busy); when the server drops a stream it turns a short one
 * back on, so a client that never reads cannot hold the socket — and the request — forever.
 */
export type StreamSocket = { timeout(seconds: number): void }

/**
 * Seconds a dropped stream's connection may stay idle before Bun closes it. Bun (uSockets) sweeps
 * idle timeouts every 4 s, so the stuck connection is actually released within ~4 s of the drop.
 */
const DROPPED_IDLE_TIMEOUT_S = 1

export type StreamHandler = {
  /** `GET /events/workspaces/:workspaceId`, already past the bearer guard and rate limiter. */
  handle(req: Request, socket?: StreamSocket): Promise<Response>
  /** `GET /events/me`, already past the bearer guard and rate limiter. */
  handleMe(req: Request, socket?: StreamSocket): Promise<Response>
  /** Ends every open stream and refuses new ones (shutdown). Publishes nothing. */
  closeAll(): void
  openCount(): number
}

/**
 * Who ends a stream. `client`: the browser went away (abort, cancel), so a plain close is enough.
 * `server`: this process drops it (backpressure, a failed recheck, a failed enqueue, shutdown) and
 * errors the body instead — `controller.close()` would keep every queued chunk readable, so a
 * client that never reads would go on pinning that memory (and the request) after its slot was
 * freed. EventSource reconnects after either.
 *
 * A server drop errors the body with no reason at all (`controller.error()`): Bun.serve prints a
 * stack trace for every response body errored with any other value — an `Error`, a sentinel
 * subclass, a DOMException, even a string — and never routes it through the server's `error`
 * handler, so a reasonless error is the only quiet drop Bun 1.4 offers. A drop is routine (a slow
 * tab, a deploy), not a failure; the reasons that are failures are recorded where they happen.
 */
type CloseCause = "client" | "server"

type Stream = {
  write(text: string): void
  close(publish: boolean, cause: CloseCause): void
}

/**
 * `impersonating`: an admin's impersonation session. It receives the workspace's events like any
 * member's stream but never joins presence — "Here now" is a broadcast to coworkers, and they
 * must not see the user "present" while an admin is the one looking.
 */
type Authorized = { session: SessionRow; user: UserRow; impersonating: boolean }

/** Each stream's buffer before `desiredSize` goes negative. */
const HIGH_WATER_MARK = 64 * 1024

const PATH = /^\/events\/workspaces\/([^/]+)\/?$/

/** A positive integer id from the path, or null (which answers 404, like an unknown workspace). */
function parseWorkspaceId(req: Request): number | null {
  const raw = PATH.exec(new URL(req.url).pathname)?.[1]
  if (!raw || !/^\d{1,15}$/.test(raw)) return null
  const id = Number(raw)
  return id > 0 ? id : null
}

function decrement(counts: Map<number, number>, key: number) {
  const count = (counts.get(key) ?? 1) - 1
  if (count > 0) counts.set(key, count)
  else counts.delete(key)
}

const unauthorized = () => errorResponse("UNAUTHORIZED", AUTH_ERRORS.UNAUTHORIZED)
const workspaceNotFound = () => errorResponse("NOT_FOUND", { message: "Workspace not found" })
/** The workspace requires two-step verification and the caller has neither it nor a passkey. A
 * short, fixed body — never a member, count or factor detail; the relay passes the status on. */
const twoFactorRequired = () =>
  new Response(WORKSPACE_TWO_FACTOR_REASON, {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  })

/**
 * The SSE endpoint behind `GET /events/workspaces/:workspaceId`: one stream per open page, fed by
 * the broadcaster's `workspace:<id>` channel. On connect it sends `retry: 3000`, the presence
 * snapshot and a `resync` (nothing is replayed: `Last-Event-ID` is accepted and ignored, the
 * client re-fetches instead). Session, membership and the workspace's two-step requirement are
 * re-checked every `recheckMs`, through the same `resolveSession` / `findMembership` /
 * `blockedByTwoFactor` the oRPC procedures use; a failed check closes the stream. A caller the
 * requirement blocks gets `403` with the body `two_factor_required`.
 */
/** A workspace's stream (`/events/workspaces/:id`) or the user's own (`/events/me`). */
type StreamKind = "workspace" | "user"

export function createStreamHandler(deps: StreamDeps): StreamHandler {
  const maxPerSession = deps.maxPerSession ?? 5
  const maxPerUser = deps.maxPerUser ?? 10
  const pingMs = deps.pingMs ?? 25_000
  const recheckMs = deps.recheckMs ?? 60_000
  const maxQueuedBytes = deps.maxQueuedBytes ?? 256 * 1024
  const encoder = new TextEncoder()
  const open = new Set<Stream>()
  // Per-session and per-user counts, kept apart per kind of stream: a page that follows both its
  // workspace and the user's own notifications must not halve how many tabs a person can keep
  // open. The process-wide cap (`open`, REALTIME_MAX_STREAMS) stays shared by both kinds.
  const counts: Record<
    StreamKind,
    { perSession: Map<number, number>; perUser: Map<number, number> }
  > = {
    workspace: { perSession: new Map(), perUser: new Map() },
    user: { perSession: new Map(), perUser: new Map() },
  }
  // One bus subscription per channel, fanned out here: an event is framed (and gets its `id:`)
  // once, so every stream carries the same id for the same event.
  const channels = new Map<string, { streams: Set<Stream>; unsubscribe: () => void }>()
  let nextEventId = 0
  let nextConnectionId = 0
  let pingTimer: ReturnType<typeof setInterval> | undefined
  let lastRecheckFailureRecorded = Number.NEGATIVE_INFINITY
  let closed = false

  const frame = (event: BroadcastEvent) =>
    `id: ${++nextEventId}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`

  const snapshot = (workspaceId: number): RealtimeEvent => ({
    type: "presence",
    replicaId: deps.replicaId,
    members: deps.presence.members(workspaceId),
  })

  const publishSnapshot = (workspaceId: number) =>
    publishAfterCommit(deps, workspaceChannel(workspaceId), snapshot(workspaceId))

  function attach(channel: string, stream: Stream) {
    let entry = channels.get(channel)
    if (!entry) {
      const streams = new Set<Stream>()
      const unsubscribe = deps.broadcaster.subscribe(channel, (event) => {
        const text = frame(event)
        for (const s of [...streams]) s.write(text)
      })
      entry = { streams, unsubscribe }
      channels.set(channel, entry)
    }
    entry.streams.add(stream)
  }

  function detach(channel: string, stream: Stream) {
    const entry = channels.get(channel)
    if (!entry) return
    entry.streams.delete(stream)
    if (entry.streams.size === 0) {
      entry.unsubscribe()
      channels.delete(channel)
    }
  }

  // One process-wide timer, not one per stream: a workspace with N open pages would otherwise
  // publish N snapshots per interval, each fanned out to all N streams.
  const ping = () => {
    for (const stream of [...open]) stream.write(": ping\n\n")
    for (const workspaceId of deps.presence.workspaces()) publishSnapshot(workspaceId)
  }
  const startPing = () => {
    pingTimer ??= setInterval(ping, pingMs)
  }
  const stopPing = () => {
    clearInterval(pingTimer)
    pingTimer = undefined
  }

  // A database outage fails every stream's recheck at once: record it once per interval, log the rest.
  const recheckFailed = (error: unknown) => {
    const now = Date.now()
    if (now - lastRecheckFailureRecorded >= recheckMs) {
      lastRecheckFailureRecorded = now
      deps.recordFailure("realtime: stream recheck failed", error)
    } else {
      deps.log("realtime: stream recheck failed", error)
    }
  }

  /**
   * The session's user when the token is live, that user is a member of an existing workspace and
   * — when the workspace requires two-step verification — the user has it on or holds a passkey.
   */
  async function authorize(
    token: string | null,
    workspaceId: number | null
  ): Promise<Authorized | "unauthorized" | "not_found" | "two_factor_required"> {
    const resolved = await resolveSession(deps.db, token, deps.superadminEmails, deps.now())
    if (!resolved) return "unauthorized"
    if (workspaceId === null) return "not_found"
    const found = await findMembership(deps.db, workspaceId, resolved.user.id)
    if (!found) return "not_found"
    if (await blockedByTwoFactor(deps.db, found.workspace, resolved.user)) {
      return "two_factor_required"
    }
    return {
      session: resolved.session,
      user: resolved.user,
      impersonating: resolved.impersonator !== null,
    }
  }

  /**
   * Everything a stream needs once its caller is known: the caps (per session and per user — the
   * impersonating admin for an impersonation session — counted per `kind`, and one per process
   * shared by both kinds), the body with its backpressure drop, the bus subscription, the ping and
   * the periodic re-check. `/events/me` and `/events/workspaces/:id` both open through here, so
   * the two kinds behave alike everywhere but their own counters, the frames they start with and
   * what they re-check.
   */
  function openStream(input: {
    req: Request
    socket?: StreamSocket
    session: SessionRow
    channel: string
    /** Frames written right after the bus subscription, before anything else can arrive. */
    first: () => string[]
    /** Runs once the stream is registered and its first frames are written. */
    onOpen?: () => void
    /** Runs when the stream ends; `publish` is false on shutdown. */
    onClose?: (publish: boolean) => void
    /** True while the stream may stay open. */
    recheck: () => Promise<boolean>
    capKey: number
    /** Which per-session and per-user counters the stream counts toward. */
    kind: StreamKind
  }): Response {
    const { req, socket, session, channel, capKey } = input
    const { perSession, perUser } = counts[input.kind]
    if (
      (perSession.get(session.id) ?? 0) >= maxPerSession ||
      (perUser.get(capKey) ?? 0) >= maxPerUser
    ) {
      return errorResponse("TOO_MANY_REQUESTS", { message: "Too many open streams" })
    }
    if (open.size >= deps.maxStreams) {
      return errorResponse("SERVICE_UNAVAILABLE", { message: "Too many open streams" })
    }

    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let ended = false
    let recheckTimer: ReturnType<typeof setInterval> | undefined

    const stream: Stream = {
      write(text) {
        if (ended || !controller) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          stream.close(true, "server") // the body is already closed or errored
          return
        }
        // A client that stopped reading (but keeps its connection open) would otherwise pin an
        // ever-growing queue. Drop it; EventSource reconnects and the resync catches it up.
        if ((controller.desiredSize ?? 0) < -maxQueuedBytes) stream.close(true, "server")
      },
      close(publish, cause) {
        if (ended) return
        ended = true
        detach(channel, stream)
        clearInterval(recheckTimer)
        req.signal.removeEventListener("abort", onAbort)
        open.delete(stream)
        decrement(perSession, session.id)
        decrement(perUser, capKey)
        input.onClose?.(publish)
        try {
          if (cause === "server") controller?.error()
          else controller?.close()
        } catch {
          // Already closed or errored by the client's disconnect.
        }
        try {
          if (cause === "server") socket?.timeout(DROPPED_IDLE_TIMEOUT_S)
        } catch {
          // The connection is already gone.
        }
        if (open.size === 0) stopPing()
      },
    }
    const onAbort = () => stream.close(true, "client")

    const body = new ReadableStream<Uint8Array>(
      {
        // Runs synchronously inside the constructor.
        start(c) {
          controller = c
        },
        cancel() {
          stream.close(true, "client")
        },
      },
      { highWaterMark: HIGH_WATER_MARK, size: (chunk) => chunk?.byteLength ?? 0 }
    )

    open.add(stream)
    perSession.set(session.id, (perSession.get(session.id) ?? 0) + 1)
    perUser.set(capKey, (perUser.get(capKey) ?? 0) + 1)
    req.signal.addEventListener("abort", onAbort)
    // Attached before the first frames are written, so nothing published from now on is missed.
    attach(channel, stream)
    stream.write("retry: 3000\n\n")
    // A write can end the stream (a failed enqueue, the backpressure drop), and `close()` has then
    // already run `onClose`: never run `first()` or `onOpen()` after it (on the workspace path that
    // would join presence after leaving it, a ghost entry), nor start a ping or recheck for it.
    if (!ended) for (const text of input.first()) stream.write(text)
    if (!ended) input.onOpen?.()
    if (!ended) startPing()

    let checking = false
    if (!ended)
      recheckTimer = setInterval(async () => {
        if (checking || ended) return
        checking = true
        try {
          if (!(await input.recheck())) stream.close(true, "server")
        } catch (error) {
          // A database hiccup is not a reason to drop every stream; the next recheck tries again.
          recheckFailed(error)
        } finally {
          checking = false
        }
      }, recheckMs)

    if (req.signal.aborted) stream.close(true, "client")

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    })
  }

  /**
   * An impersonation stream counts against the admin's cap, not the impersonated user's: the
   * admin is the one who could open ten tabs, and the user's own cap must stay theirs alone.
   */
  const capKeyOf = (session: SessionRow, user: UserRow) => session.impersonated_by ?? user.id

  async function handle(req: Request, socket?: StreamSocket): Promise<Response> {
    if (closed) return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    const token = req.headers.get("x-session-token")
    const workspaceId = parseWorkspaceId(req)
    const result = await authorize(token, workspaceId)
    if (result === "unauthorized") return unauthorized()
    if (result === "not_found" || workspaceId === null) return workspaceNotFound()
    if (result === "two_factor_required") return twoFactorRequired()
    // Everything from here to the end of setup runs synchronously, so the counts below cannot
    // be raced by another request between the check and the registration.
    if (closed) return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    const { session, user, impersonating } = result
    const connectionId = `${deps.replicaId}:${++nextConnectionId}`
    let isNew = false
    return openStream({
      req,
      socket,
      session,
      capKey: capKeyOf(session, user),
      kind: "workspace",
      channel: workspaceChannel(workspaceId),
      first: () => {
        isNew =
          !impersonating &&
          deps.presence.join(
            workspaceId,
            { userId: user.id, name: user.name, avatarUrl: deps.fileUrl(user.avatar_key) },
            connectionId
          )
        return [frame(snapshot(workspaceId)), frame({ type: "resync" })]
      },
      // The other streams (on every replica) learn about the newcomer; this one hears its own echo.
      onOpen: () => {
        if (isNew) publishSnapshot(workspaceId)
      },
      onClose: (publish) => {
        // An impersonation stream never joined, so this is false for it and publishes nothing.
        const left = deps.presence.leave(workspaceId, user.id, connectionId)
        if (left && publish) publishSnapshot(workspaceId)
      },
      recheck: async () => {
        const again = await authorize(token, workspaceId)
        return typeof again !== "string" && again.session.id === session.id
      },
    })
  }

  /**
   * `GET /events/me`: the caller's own `user:<id>` channel — `notification.created` events after
   * `retry: 3000` and a `resync`; no presence, no workspace. An impersonation session's user is
   * the impersonated one (`resolveSession`), so it hears that user's channel and never the
   * admin's own, while its stream counts against the admin's caps. The session is re-checked
   * every `recheckMs`, like a workspace stream's.
   */
  async function handleMe(req: Request, socket?: StreamSocket): Promise<Response> {
    if (closed) return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    const token = req.headers.get("x-session-token")
    const resolved = await resolveSession(deps.db, token, deps.superadminEmails, deps.now())
    if (!resolved) return unauthorized()
    if (closed) return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    const { session, user } = resolved
    return openStream({
      req,
      socket,
      session,
      capKey: capKeyOf(session, user),
      kind: "user",
      channel: userChannel(user.id),
      first: () => [frame({ type: "resync" })],
      recheck: async () => {
        const again = await resolveSession(deps.db, token, deps.superadminEmails, deps.now())
        return again !== null && again.session.id === session.id
      },
    })
  }

  return {
    handle,
    handleMe,
    closeAll() {
      closed = true
      // No presence publishes: the broadcaster closes right after the drain, and clients drop a
      // replica they have not heard from in 60 s anyway.
      for (const stream of [...open]) stream.close(false, "server")
      stopPing()
    },
    openCount: () => open.size,
  }
}
