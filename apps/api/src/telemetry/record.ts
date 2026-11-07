import {
  type ErrorEvent,
  TELEMETRY_LIMITS,
  type TelemetryApp,
  type TelemetryBatch,
} from "@repo/api-contract"
import { collapseRoute } from "@repo/api-contract/route"
import type { Db } from "../db"
import { telemetryForwardJob } from "../jobs/builtin/telemetry"
import type { Enqueue } from "../jobs/enqueue"
import { detach } from "../mail/mailer"
import { fingerprint } from "./fingerprint"
import type { TelemetryProvider } from "./provider"

export type RecordDeps = {
  db: Pick<Db, "telemetry">
  provider: TelemetryProvider
  /** Queues `telemetry.forward` for a new row; skipped entirely for the keyless `store` provider. */
  enqueue: Enqueue
  log: (message: string, error: unknown) => void
}

/**
 * Routes are pathnames only — a query string or hash (`/magic?token=…`) never reaches a table —
 * with every opaque segment (`/invitations/<token>`, `/notes/42`) collapsed to `:id`. The one
 * `collapseRoute` implementation lives in @repo/api-contract/analytics, shared with
 * @repo/telemetry/browser's `stripRoute` and apps/api/src/analytics/ingest.ts; this just adds the
 * length cap telemetry rows need.
 */
export const sanitizeRoute = (route: string) =>
  collapseRoute(route).slice(0, TELEMETRY_LIMITS.route)

/**
 * Writes a batch. New error rows queue a `telemetry.forward` job each — skipped for the keyless
 * `store` provider, whose `onNewError` is a no-op, so nothing is queued for the common case of no
 * provider configured. Retention pruning moved to the `telemetry.prune` schedule (jobs/registry.ts).
 */
export async function recordBatch(deps: RecordDeps, batch: TelemetryBatch): Promise<void> {
  const now = new Date().toISOString()
  const created = []
  for (const raw of batch.errors) {
    const event = raw.route === undefined ? raw : { ...raw, route: sanitizeRoute(raw.route) }
    const result = await deps.db.telemetry.upsertError({
      fingerprint: fingerprint(batch.app, event.kind, event.message, event.stack, event.digest),
      app: batch.app,
      event,
      now,
    })
    if (result.created) created.push(result.row)
  }
  if (batch.vitals.length > 0) {
    const vitals = batch.vitals.map((v) => ({ ...v, route: sanitizeRoute(v.route) }))
    await deps.db.telemetry.insertVitals(batch.app, vitals, now)
  }
  if (deps.provider.kind === "store") return
  for (const row of created) {
    // The row is already committed: a failure to enqueue its forward (a database hiccup) must not
    // fail telemetry ingest itself, which has nothing to do with the provider. This one row's
    // forward is lost (nothing else enqueues it), but that is better than a telemetry batch —
    // every caller swallows its errors anyway — answering 500.
    await deps.enqueue(telemetryForwardJob, { errorId: row.id }).catch((error) => {
      deps.log("telemetry.forward enqueue failed", error)
    })
  }
}

/** `String(value)`, or "Unknown error" for a value it cannot convert (`Object.create(null)`). */
function describe(value: unknown): string {
  try {
    return String(value)
  } catch {
    return "Unknown error"
  }
}

/** A real address shape: a scoped-package path (`node_modules/@orpc/server/…`) is not one. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/**
 * 16+ url-safe chars with at least one digit: a token or key. An identifier without digits
 * (`ERR_INVALID_ARG_TYPE`, a constraint name) is what a 5xx diagnosis needs, so it stays.
 */
const OPAQUE_TOKEN = /(?<![A-Za-z0-9_-])(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_-])/g
/** A failure message often quotes its input: a mail provider's bounce names the address. */
const maskMessage = (message: string) =>
  message.replace(EMAIL, "<email>").replace(OPAQUE_TOKEN, "<token>")

/** The stack's head (`Error: <message>`) masked; its `at …` frames are file paths, left intact. */
function maskStack(stack: string): string {
  const frames = stack.search(/\n\s+at /)
  return frames === -1
    ? maskMessage(stack)
    : maskMessage(stack.slice(0, frames)) + stack.slice(frames)
}

/**
 * Turns a thrown value into a `server` event. The message is masked (addresses, long tokens)
 * before truncating; so is the stack's head, which repeats the message, while its frames stay
 * intact for the fingerprint.
 */
export function toErrorEvent(error: unknown, route?: string): ErrorEvent {
  const e = error instanceof Error ? error : new Error(describe(error))
  const message = maskMessage(e.message || e.name || "Error")
  const stack = e.stack === undefined ? undefined : maskStack(e.stack)
  return {
    kind: "server",
    message: message.slice(0, TELEMETRY_LIMITS.message),
    stack: stack?.slice(0, TELEMETRY_LIMITS.stack),
    route: route === undefined ? undefined : sanitizeRoute(route),
  }
}

/**
 * For the services' own failures: never throws and never awaits on the caller's path, so a
 * telemetry problem cannot turn a 500 into a crash.
 */
export function recordServerError(
  deps: RecordDeps,
  app: TelemetryApp,
  error: unknown,
  route?: string
): void {
  detach(
    () => recordBatch(deps, { app, errors: [toErrorEvent(error, route)], vitals: [] }),
    (failure) => deps.log("telemetry record failed", failure)
  )
}
