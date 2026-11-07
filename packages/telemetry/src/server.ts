import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  AnalyticsBeaconSchema,
  type AnalyticsIngestInput,
  type ApiClient,
  type BrowserBatch,
  BrowserBatchSchema,
  DEV_API_TOKEN,
  TELEMETRY_LIMITS,
  type TelemetryApp,
  type TelemetryBatch,
} from "@repo/api-contract"
import { createLogger, REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { readConsent } from "./consent"

const logger = createLogger({ service: "telemetry" })

type Log = (message: string, error?: unknown) => void
/**
 * A fetch-shaped function, structurally — not `typeof fetch` itself, which (in Bun) also requires
 * a `preconnect` method that a plain mock or wrapper has no reason to carry.
 */
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** The default sink: one structured `@repo/log` error line, the error (if any) as its field. */
const logSink: Log = (message, error) =>
  logger.error(message, error === undefined ? undefined : { error })

/** Logs a message at most once per interval per key: a flood of identical failures is one line. */
export function throttledLogger(intervalMs = 60_000, sink: Log = logSink): Log {
  const last = new Map<string, number>()
  return (message, error) => {
    const t = Date.now()
    if (t - (last.get(message) ?? 0) < intervalMs) return
    last.set(message, t)
    if (error === undefined) sink(message)
    else sink(message, error)
  }
}

/** The request's own `x-request-id` (the app's security proxy sets it) when well-formed. */
const requestIdOf = (req: Request): string | undefined =>
  validRequestId(req.headers.get(REQUEST_ID_HEADER)) ?? undefined

/** The browser's ip as the proxy reports it (informational; the limiter key only). */
export function clientIp(headers: Headers): string | undefined {
  const real = headers.get("x-real-ip")?.trim()
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return (real || forwarded || undefined)?.slice(0, 45)
}

/** The first 32 hex characters of sha256(input) — shared by every per-browser client id below. */
async function hashHex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
}

/**
 * `telemetry:<32 hex of sha256(ip)>` — one limiter bucket per browser, and the ip itself never
 * travels. The prefix keeps the bucket apart from `@repo/session`'s `anon:<hash>` (sign-in, reset),
 * so a page's telemetry can never use up a browser's sign-in allowance under `API_RATE_LIMIT`.
 */
export async function anonymousClientId(ip: string | undefined): Promise<string | undefined> {
  if (!ip) return undefined
  return `telemetry:${await hashHex(ip)}`
}

/**
 * One oRPC client against `apiUrl`, authenticated as the service token — the shared shape behind
 * `createTelemetryClient`'s `clientFor` and `createAnalyticsRoute`'s forward. `clientId` is
 * omitted from the headers entirely when there is none (rather than falling back to some shared
 * default): a missing per-browser id must never silently become a shared bucket. A fresh client
 * per call (never cached): the only thing that varies between calls is `clientId`, and a client is
 * cheap to build. `requestId`, when given, is sent as `x-request-id`, so the api's log lines for
 * the forward carry the id of the browser request it came from.
 */
function rpcClient(
  apiUrl: string,
  serviceToken: string,
  clientId: string | undefined,
  f: FetchLike,
  timeoutMs: number,
  requestId?: string
): ApiClient {
  const headers: Record<string, string> = { authorization: `Bearer ${serviceToken}` }
  if (clientId) headers["x-api-client-id"] = clientId
  const forwardedRequestId = validRequestId(requestId)
  if (forwardedRequestId) headers[REQUEST_ID_HEADER] = forwardedRequestId
  return createORPCClient<ApiClient>(
    new RPCLink({
      url: `${apiUrl.replace(/\/+$/, "")}/rpc`,
      headers,
      fetch: (request, init) =>
        f(request, {
          ...init,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
        }),
    })
  )
}

export function createTelemetryClient(options: {
  apiUrl: string
  serviceToken: string
  app: TelemetryApp
  fetch?: FetchLike
  timeoutMs?: number
  log?: Log
}) {
  const log = options.log ?? throttledLogger()
  const f: FetchLike = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const clientFor = (clientId: string, requestId?: string) =>
    rpcClient(options.apiUrl, options.serviceToken, clientId, f, timeoutMs, requestId)
  return {
    /** Fire-and-forget: the caller's request never waits on telemetry. */
    report(batch: BrowserBatch, opts: { clientId?: string; requestId?: string } = {}): void {
      try {
        const body: TelemetryBatch = {
          app: options.app,
          errors: batch.errors,
          vitals: batch.vitals,
        }
        clientFor(opts.clientId ?? `telemetry:${options.app}`, opts.requestId)
          .telemetry.ingest(body)
          .catch((error: unknown) => log("ingest failed", error))
      } catch (error) {
        // Building the client (or a synchronous throw inside it) must not reach the caller either.
        log("ingest failed", error)
      }
    },
  }
}

type ApiEnv = { API_URL?: string; API_SERVICE_TOKEN?: string; NODE_ENV?: string }
/** `@repo/session`'s `loadEnv` dev default, verbatim (`@repo/sites` has no `api` entry). */
const DEV_API_URL = "http://api.brand.localhost:3007"

/**
 * Shared by `createTelemetryRoute` and `createAnalyticsRoute`'s own default: outside production,
 * a missing `API_URL` / `API_SERVICE_TOKEN` falls back to the dev api url/token (like
 * `@repo/session`'s `loadEnv`); in production, either missing resolves to `null` so the caller
 * drops instead of forwarding to nowhere.
 */
function resolveApiEnv(env: ApiEnv): { API_URL: string; API_SERVICE_TOKEN: string } | null {
  const dev = env.NODE_ENV !== "production"
  const apiUrl = env.API_URL || (dev ? DEV_API_URL : undefined)
  const serviceToken = env.API_SERVICE_TOKEN || (dev ? DEV_API_TOKEN : undefined)
  return apiUrl && serviceToken ? { API_URL: apiUrl, API_SERVICE_TOKEN: serviceToken } : null
}

/**
 * True when a beacon must be refused before its body is even read — shared by `createTelemetryRoute`
 * and `createAnalyticsRoute`: not the page's own `application/json` POST (a cross-site page can
 * otherwise send a "simple request" — a `text/plain` form or a `no-cors` fetch — without a CORS
 * preflight), or a `sec-fetch-site` other than `same-origin`/`none` (absent on older browsers,
 * which is allowed).
 */
function refusesCrossSite(req: Request): boolean {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return true
  }
  const site = req.headers.get("sec-fetch-site")
  return site !== null && site !== "same-origin" && site !== "none"
}

/**
 * The Next apps' `POST /api/telemetry`: validates, stamps the app, forwards. Answers 204 for every
 * body — a page must never see a telemetry failure. Without API_URL / API_SERVICE_TOKEN it falls
 * back to the dev api URL and token outside production (like `@repo/session`'s `loadEnv`), and
 * drops in production.
 */
export function createTelemetryRoute(options: {
  app: TelemetryApp
  env?: ApiEnv
  forward?: (
    batch: TelemetryBatch,
    clientId: string | undefined,
    requestId?: string
  ) => Promise<void>
  log?: Log
}): (req: Request) => Promise<Response> {
  const log = options.log ?? throttledLogger()
  let forward = options.forward
  if (!forward) {
    const creds = resolveApiEnv(options.env ?? process.env)
    if (creds) {
      const client = createTelemetryClient({
        apiUrl: creds.API_URL,
        serviceToken: creds.API_SERVICE_TOKEN,
        app: options.app,
        log,
      })
      forward = async (batch, clientId, requestId) => client.report(batch, { clientId, requestId })
    } else {
      forward = async () => log("API_URL / API_SERVICE_TOKEN not set — dropping telemetry")
    }
  }
  const done = () => new Response(null, { status: 204 })
  return async (req) => {
    try {
      if (refusesCrossSite(req)) return done()
      const text = await readCapped(req, TELEMETRY_LIMITS.bodyBytes)
      if (text === null) return done()
      const parsed = BrowserBatchSchema.safeParse(JSON.parse(text))
      if (!parsed.success) return done()
      const clientId = await anonymousClientId(clientIp(req.headers))
      await forward({ app: options.app, ...parsed.data }, clientId, requestIdOf(req))
    } catch (error) {
      // A constant key: `log` (typically `throttledLogger`) throttles by message string, so a
      // request-dependent message here (the parsed body, say) would give every distinct bad
      // request its own throttle bucket — one log line per request and an unbounded Map, plus
      // attacker-controlled text reaching the logs.
      log("route failed", error)
    }
    return done()
  }
}

/** Known bots, crawlers, link-unfurling previews and headless browsers: never counted. */
const BOT_USER_AGENT = /bot|crawl|spider|preview|headless/i

type Identity = { userId: number; workspaceId: number | null }

/**
 * The Next apps' `POST /api/analytics`: validates a pageview or client-event beacon (see
 * `@repo/telemetry/analytics`), resolves consent and — only when it is `"all"` — identity, and
 * forwards to `analytics.ingest` with the service token, the browser's ip and user agent (the api
 * consumes both only to compute a visitor hash; it never stores them) and a per-browser client id
 * (omitted when there is no ip — never a shared per-app fallback). Always 204, never throws;
 * refuses a non-JSON content type, a cross-site `sec-fetch-site`, and a bot user agent before the
 * body is even read. The beacon itself carries only a referrer *host* (never the raw URL — see
 * `@repo/telemetry/analytics`'s `sendPageview`), dropped entirely when that host is this app's
 * own. `env`, when given, replaces the default dev-fallback-or-drop resolution below (like
 * `createTelemetryRoute`, but as a thunk — called fresh per request rather than captured once — so
 * a caller can resolve it lazily, e.g. through `@repo/session`'s `loadEnv`).
 */
export function createAnalyticsRoute(options: {
  app: TelemetryApp
  identity?: (req: Request) => Promise<Identity | null>
  env?: () => { API_URL: string; API_SERVICE_TOKEN: string } | null
  fetch?: FetchLike
  log?: Log
}): (req: Request) => Promise<Response> {
  const log = options.log ?? throttledLogger()
  const f: FetchLike = options.fetch ?? fetch
  const resolveEnv = options.env ?? (() => resolveApiEnv(process.env))
  const done = () => new Response(null, { status: 204 })
  return async (req) => {
    try {
      if (refusesCrossSite(req)) return done()
      const userAgent = req.headers.get("user-agent") ?? ""
      if (BOT_USER_AGENT.test(userAgent)) return done()
      const text = await readCapped(req, TELEMETRY_LIMITS.bodyBytes)
      if (text === null) return done()
      const parsed = AnalyticsBeaconSchema.safeParse(JSON.parse(text))
      if (!parsed.success) return done()
      const beacon = parsed.data

      // Already reduced to a host, never the raw URL, by the browser's own sendPageview — this
      // only applies the same-origin drop.
      let referrerHost: string | undefined
      if (beacon.kind === "pageview" && beacon.referrerHost) {
        if (beacon.referrerHost !== new URL(req.url).host) referrerHost = beacon.referrerHost
      }

      // Identity is resolved — and the browser's own ids are only ever forwarded — when the
      // visitor has consented to "all". `identity` itself must never throw out of this route.
      let ids: Identity | null = null
      if (options.identity && readConsent(req.headers.get("cookie") ?? "") === "all") {
        try {
          ids = await options.identity(req)
        } catch (error) {
          log("identity failed", error)
        }
      }

      const ip = clientIp(req.headers)
      const input: AnalyticsIngestInput = {
        app: options.app,
        kind: beacon.kind,
        path: beacon.kind === "pageview" ? beacon.path : undefined,
        name: beacon.kind === "event" ? beacon.name : undefined,
        props: beacon.kind === "event" ? beacon.props : undefined,
        referrerHost,
        userId: ids?.userId,
        workspaceId: ids?.workspaceId ?? undefined,
        ip,
        // The ingest schema caps it at 500 characters: an over-long one (some embedded browsers
        // send more) would otherwise fail validation and lose the whole pageview. It only feeds
        // the day's visitor hash, so the first 500 characters identify the browser just as well.
        userAgent: userAgent.slice(0, 500) || undefined,
      }

      const creds = resolveEnv()
      if (!creds) {
        log("API_URL / API_SERVICE_TOKEN not set — dropping analytics")
        return done()
      }
      const clientId = ip ? `analytics:${await hashHex(ip)}` : undefined
      await rpcClient(creds.API_URL, creds.API_SERVICE_TOKEN, clientId, f, 5_000, requestIdOf(req))
        .analytics.ingest(input)
        .catch((error: unknown) => log("ingest failed", error))
    } catch (error) {
      log("route failed", error)
    }
    return done()
  }
}

/**
 * Reads a request body up to `maxBytes`, counting bytes rather than characters, so an
 * unauthenticated endpoint never buffers an arbitrarily large request. Two layers: a
 * `content-length` above the cap is rejected before anything is read, and — because that header
 * is absent for a chunked body and cannot be trusted anyway — the stream itself is cut off the
 * moment the running total exceeds the cap. Returns `null` (the caller's drop-and-204 path) when
 * either check trips.
 */
async function readCapped(req: Request, maxBytes: number): Promise<string | null> {
  const announced = req.headers.get("content-length")
  if (announced !== null && Number(announced) > maxBytes) return null
  if (!req.body) return ""
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done: finished, value } = await reader.read()
    if (finished) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const buffer = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(buffer)
}
