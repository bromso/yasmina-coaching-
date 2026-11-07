import type { User } from "@repo/api-contract"
import { createLogger, REQUEST_ID_HEADER } from "@repo/log"
import { eventsClientId, requestIdFromRequest } from "./client"
import { loadEnv } from "./env"
import { requestInfo } from "./request-info"

const logger = createLogger({ service: "session" })

/**
 * An upstream status a caller should see as-is; anything else (network failure included) is 502.
 * 403: the workspace requires two-step verification and the caller has neither it nor a passkey —
 * a permanent refusal the client stops reconnecting on. Both relays use the same set, so a client
 * reads a refusal the same way whichever stream it follows: 401/403/404 stop it for good, 429/503
 * (and a 502) back off and retry.
 */
const PASSTHROUGH_STATUSES = new Set([401, 403, 404, 429, 503])

const miss = (status: number) =>
  new Response(null, { status, headers: { "cache-control": "no-store" } })

type RelayDeps = {
  env: () => { API_URL: string; API_SERVICE_TOKEN: string }
  fetch: typeof fetch
  readSessionToken: (req: Request) => string | null
}

/**
 * Relays one `apps/api` SSE path for an already-signed-in caller: the service token, the session
 * token, a per-browser `events:<hash>` client id and the request id go upstream; the browser's
 * disconnect aborts it (499, unlogged); an upstream status in `passthrough` is relayed as-is, any
 * other non-OK status or a network failure is 502; a stream is passed through unread.
 */
async function relay(
  req: Request,
  path: string,
  passthrough: ReadonlySet<number>,
  deps: RelayDeps
): Promise<Response> {
  const { API_URL, API_SERVICE_TOKEN } = deps.env()
  const token = deps.readSessionToken(req)
  const clientId = await eventsClientId(requestInfo(req.headers).ip)
  const requestId = requestIdFromRequest(req)

  let upstream: Response
  try {
    upstream = await deps.fetch(`${API_URL}${path}`, {
      headers: {
        authorization: `Bearer ${API_SERVICE_TOKEN}`,
        ...(token ? { "x-session-token": token } : {}),
        ...(clientId ? { "x-api-client-id": clientId } : {}),
        ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
      },
      signal: req.signal,
      cache: "no-store",
    })
  } catch (error) {
    // The browser dropped the request (an EventSource closed, or the page navigated away)
    // while the upstream fetch was still waiting for headers: `fetch` rejects with its abort
    // error. Nobody is listening for the response, and the api was never actually at fault, so
    // this is not logged as a failure — only a genuine api/network failure is.
    if (req.signal.aborted) return miss(499)
    logger.error("events: api call failed", { error, ...(requestId ? { requestId } : {}) })
    return miss(502)
  }

  if (!upstream.ok) {
    await upstream.body?.cancel()
    return miss(passthrough.has(upstream.status) ? upstream.status : 502)
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  })
}

/** The query's workspace id when given (404 unless a positive integer), else the cookie's. */
async function pickWorkspace(
  req: Request,
  getWorkspace: (req: Request) => Promise<{ workspace: { id: number } | null; error?: unknown }>
): Promise<number | { status: 404 | 503 }> {
  const raw = new URL(req.url).searchParams.get("workspace")
  if (raw !== null) {
    const id = /^\d{1,15}$/.test(raw) ? Number(raw) : 0
    return id > 0 ? id : { status: 404 }
  }
  const { workspace, error } = await getWorkspace(req)
  if (error !== undefined) return { status: 503 }
  return workspace ? workspace.id : { status: 404 }
}

/**
 * `GET /api/events` on the app's own origin: relays `apps/api`'s `GET /events/workspaces/:id`
 * SSE stream unchanged, like `createFileRoute` relays `/files/<key>`. The browser never calls
 * `apps/api` directly — this route carries the service token, the caller's session token and a
 * per-browser `events:<hash>` client id (see `eventsClientId`), so one visitor cannot exhaust the
 * rate-limit bucket every other visitor of this app shares.
 *
 * Which workspace: `?workspace=<id>` when the page passes the one it rendered (the client does, so
 * a tab keeps following its own workspace after another tab switches the `workspace` cookie) —
 * `apps/api` still checks the membership, and a value that is not a positive integer is 404
 * without an upstream call, like the api's own answer for one. Without the parameter, the
 * cookie's workspace (`getWorkspace`).
 *
 * No session → 401; no usable workspace → 404 (the same rule `resolveWorkspaceFromRequest`
 * applies elsewhere: no existence oracle); a workspace lookup that could not reach the api (an
 * outage, a 5xx — `error` set, as `resolveWorkspaceFromRequest` and `chatEntitlementGate` report
 * it) → 503, without an upstream call, so an outage is never told to the caller as "not found".
 * An upstream 401/403/404/429/503 is relayed with that exact status; any other non-OK status, or a
 * failure to reach the api at all, is 502. The browser's disconnect (`req.signal`) aborts the
 * upstream request: that abort surfaces as the upstream `fetch` rejecting, answered 499 with no
 * log line (nobody is listening, and the api was never at fault) rather than the 502 a genuine
 * api/network failure gets. On success the upstream body streams through unread — this route
 * never buffers it.
 */
export function createEventsRoute(options: {
  getUser: (req: Request) => Promise<User | null>
  getWorkspace: (req: Request) => Promise<{ workspace: { id: number } | null; error?: unknown }>
  readSessionToken: (req: Request) => string | null
  env?: () => { API_URL: string; API_SERVICE_TOKEN: string }
  fetch?: typeof fetch
}): (req: Request) => Promise<Response> {
  const env = options.env ?? (() => loadEnv(["API_URL", "API_SERVICE_TOKEN"]))
  const f = options.fetch ?? fetch

  return async (req: Request): Promise<Response> => {
    const user = await options.getUser(req)
    if (!user) return miss(401)

    const workspaceId = await pickWorkspace(req, options.getWorkspace)
    if (typeof workspaceId !== "number") return miss(workspaceId.status)

    return relay(req, `/events/workspaces/${workspaceId}`, PASSTHROUGH_STATUSES, {
      env,
      fetch: f,
      readSessionToken: options.readSessionToken,
    })
  }
}

/**
 * `GET /api/events/me` on the app's own origin: relays `apps/api`'s `GET /events/me` — the
 * signed-in user's own notification stream — exactly as `createEventsRoute` relays a workspace
 * stream (service token, session token, a per-browser `events:<hash>` client id, the request id;
 * the browser's disconnect aborts the upstream request; the body streams through unread). No
 * workspace is involved. No session → 401 without an upstream call; an upstream 401/403/404/429/503
 * is relayed with that exact status (the same set `createEventsRoute` relays, so a client stops
 * for good on 401/403/404 either way), any other non-OK status (or the api unreachable) is 502.
 */
export function createUserEventsRoute(options: {
  getUser: (req: Request) => Promise<User | null>
  readSessionToken: (req: Request) => string | null
  env?: () => { API_URL: string; API_SERVICE_TOKEN: string }
  fetch?: typeof fetch
}): (req: Request) => Promise<Response> {
  const env = options.env ?? (() => loadEnv(["API_URL", "API_SERVICE_TOKEN"]))
  const f = options.fetch ?? fetch

  return async (req: Request): Promise<Response> => {
    const user = await options.getUser(req)
    if (!user) return miss(401)
    return relay(req, "/events/me", PASSTHROUGH_STATUSES, {
      env,
      fetch: f,
      readSessionToken: options.readSessionToken,
    })
  }
}
