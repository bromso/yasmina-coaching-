import type { ErrorRow } from "../queries/telemetry"
import type { TelemetryProvider } from "./provider"

type Log = (message: string, error: unknown) => void
/** Fetch-shaped, structurally: `typeof fetch` in Bun also demands `preconnect`, which a mock lacks. */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

/** `https://<publicKey>@<host>/<projectId>` → the envelope endpoint and the key for the auth header. */
export function parseDsn(dsn: string): { envelopeUrl: string; publicKey: string } {
  let url: URL
  try {
    url = new URL(dsn)
  } catch {
    throw new Error("SENTRY_DSN is not a URL")
  }
  const publicKey = url.username
  const projectId = url.pathname.replace(/^\/+/, "").split("/")[0]
  if (!publicKey || !projectId) throw new Error("SENTRY_DSN needs a public key and a project id")
  return { envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`, publicKey }
}

const FRAME = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?\s*$/
function parseFrames(stack: string | null) {
  const frames = []
  for (const line of (stack ?? "").split("\n")) {
    const m = FRAME.exec(line)
    if (!m) continue
    frames.push({
      function: m[1] ?? "<anonymous>",
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
    })
  }
  return frames.reverse() // Sentry wants the oldest call first.
}

/**
 * Deterministic from the row's identity (fingerprint + day), not random: a redelivered
 * `telemetry.forward` job (a crash after Sentry accepted the event but before the job was marked
 * succeeded) rebuilds the same envelope and the same `event_id`, so Sentry's own de-duplication
 * drops the resend instead of showing it twice.
 */
function eventIdFor(row: ErrorRow): string {
  return new Bun.CryptoHasher("sha256")
    .update(`${row.fingerprint}:${row.day}`)
    .digest("hex")
    .slice(0, 32)
}

export function buildEnvelope(row: ErrorRow, opts: { environment: string; dsn: string }): string {
  const eventId = eventIdFor(row)
  const typeMatch = /^([A-Za-z]*Error)\b/.exec(row.stack ?? "")
  const event = {
    event_id: eventId,
    timestamp: row.last_seen,
    platform: row.kind === "server" ? "node" : "javascript",
    level: "error",
    environment: opts.environment,
    tags: { app: row.app, kind: row.kind, route: row.route ?? "" },
    fingerprint: [row.fingerprint],
    exception: {
      values: [
        {
          type: typeMatch?.[1] ?? "Error",
          value: row.message,
          stacktrace: { frames: parseFrames(row.stack) },
        },
      ],
    },
    extra: { digest: row.digest, day: row.day },
  }
  return [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: opts.dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n")
}

/**
 * Forwards each new error row as one Sentry event, over plain fetch. A network failure, a
 * timeout, a 5xx or a 429 (Sentry down, unreachable, or rate-limiting) throws, so the
 * `telemetry.forward` job retries with backoff and eventually dies (recorded through
 * `recordFailure`) rather than silently losing the event. Any other 4xx (bad auth, a malformed
 * envelope) would just repeat on retry, so that is logged and treated as done.
 */
export function sentryProvider(options: {
  dsn: string
  environment: string
  fetch?: FetchLike
  timeoutMs?: number
  log: Log
}): TelemetryProvider {
  const { envelopeUrl, publicKey } = parseDsn(options.dsn)
  const f = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  return {
    kind: "sentry",
    async onNewError(row) {
      let res: Response
      try {
        res = await f(envelopeUrl, {
          method: "POST",
          headers: {
            "content-type": "application/x-sentry-envelope",
            "x-sentry-auth": `Sentry sentry_version=7, sentry_client=boilerplate-api/0.1, sentry_key=${publicKey}`,
          },
          body: buildEnvelope(row, { environment: options.environment, dsn: options.dsn }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch (error) {
        // Sentry never saw it (network error, timeout): retry.
        throw error instanceof Error ? error : new Error(String(error))
      }
      if (res.ok) return
      if (res.status === 429 || res.status >= 500) throw new Error(`sentry answered ${res.status}`)
      options.log(`sentry answered ${res.status}`, undefined)
    },
  }
}
