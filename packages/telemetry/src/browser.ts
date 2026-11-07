import type { BrowserBatch, ErrorEvent, VitalEvent } from "@repo/api-contract"
import { collapseRoute } from "@repo/api-contract/route"
import { TELEMETRY_LIMITS, VITAL_NAMES } from "@repo/api-contract/telemetry-limits"
// The one implementation lives in `./consent` (DOM-free, shared with `server.ts`'s reading of the
// `Cookie` header) — imported (and re-exported below) so every existing
// `@repo/telemetry/browser` import of `Consent` / `readConsent` keeps working.
import { type Consent, readConsent } from "./consent"

// Re-exported so every existing `@repo/telemetry/browser` import keeps working unchanged: the one
// implementation (and its OPAQUE_SEGMENT rules) lives in the zod-free `@repo/api-contract/route`,
// shared with apps/api/src/telemetry/record.ts's `sanitizeRoute` and
// apps/api/src/analytics/ingest.ts. Imported from `/route`, never `/analytics` (which is zod-only
// but not zod-free) — this file ships in every app's client bundle, static apps included, and
// must not pull zod into it. `browser.test.ts`'s bundle-size guard enforces this.
export { type Consent, collapseRoute, readConsent }

const ENDPOINT = "/api/telemetry"
const DEDUPE_WINDOW_MS = 60_000
const MAX_PER_PAGE = 10

/** Pathname only: never a query string or hash, which may carry tokens or search terms. */
export function stripRoute(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || "/"
  return collapseRoute(path).slice(0, TELEMETRY_LIMITS.route)
}

const frames = (stack: string | undefined) =>
  (stack ?? "").split("\n").filter((line) => /^\s*at\s/.test(line))

// A frame with no "/" at all carries no location to judge — a native/intrinsic V8 frame such as
// "at new Promise (<anonymous>)" or "at Array.forEach (<anonymous>)". It is excluded from the
// verdict entirely, in either direction, rather than counted as "ours" (which would let a native
// frame paper over an otherwise-foreign stack) or "foreign" (which would flag it baselessly).
const hasLocation = (frame: string) => frame.includes("/")

// A location-bearing frame is foreign only when it names an origin — via a URL scheme — that
// isn't ours. A frame with no scheme at all, whether a relative asset path ("/_next/...") or a
// local filesystem path (Node/Bun stack frames outside a browser), names no origin to compare
// against and so counts as "ours" by default rather than foreign.
const isForeignFrame = (frame: string, origin: string) =>
  frame.includes("://") && !frame.includes(origin)

/**
 * True when the stack has at least one location-bearing frame and every one of them is foreign
 * (extensions, third-party scripts). A stack with no location-bearing frames (native-only, or no
 * frames at all) is not foreign; a stack mixing a foreign URL frame with a same-origin or
 * schemeless frame is not foreign either — only when *every* located frame points elsewhere.
 */
export function isForeignStack(stack: string | undefined, origin: string): boolean {
  const located = frames(stack).filter(hasLocation)
  return located.length > 0 && located.every((frame) => isForeignFrame(frame, origin))
}

export function shapeError(
  error: unknown,
  ctx: {
    kind: "boundary" | "unhandled"
    digest?: string
    pathname: string
    consent: Consent
    userAgent?: string
  }
): ErrorEvent {
  const e = error instanceof Error ? error : undefined
  const message = (
    e?.message ||
    (typeof error === "string" ? error : "") ||
    e?.name ||
    "Unknown error"
  ).slice(0, TELEMETRY_LIMITS.message)
  return {
    kind: ctx.kind,
    message,
    stack: e?.stack?.slice(0, TELEMETRY_LIMITS.stack),
    digest: ctx.digest?.slice(0, TELEMETRY_LIMITS.digest),
    route: stripRoute(ctx.pathname),
    userAgent:
      ctx.consent === "all" && ctx.userAgent
        ? ctx.userAgent.slice(0, TELEMETRY_LIMITS.userAgent)
        : undefined,
  }
}

export function shapeVital(
  metric: { name: string; value: number; rating: string; navigationType?: string },
  ctx: { pathname: string }
): VitalEvent | null {
  if (!(VITAL_NAMES as readonly string[]).includes(metric.name)) return null
  if (!["good", "needs-improvement", "poor"].includes(metric.rating)) return null
  return {
    name: metric.name as VitalEvent["name"],
    value: Math.max(0, metric.value),
    rating: metric.rating as VitalEvent["rating"],
    navigationType: metric.navigationType?.slice(0, TELEMETRY_LIMITS.navigationType),
    route: stripRoute(ctx.pathname),
  }
}

/** A key may pass once per window; the total is capped (a page in a render loop sends 10, not 10,000). */
export function createDedupe({
  windowMs,
  max,
  now = Date.now,
}: {
  windowMs: number
  max: number
  now?: () => number
}) {
  const seen = new Map<string, number>()
  let sent = 0
  return (key: string): boolean => {
    const t = now()
    const last = seen.get(key)
    if (last !== undefined && t - last < windowMs) return false
    if (sent >= max) return false
    seen.set(key, t)
    sent++
    return true
  }
}

const firstFrame = (stack: string | undefined) => frames(stack)[0]?.trim() ?? ""

export function createBrowserHandlers(
  report: (event: ErrorEvent) => void,
  ctx: { origin: string; pathname: () => string; consent: () => Consent; userAgent?: string }
) {
  const allow = createDedupe({ windowMs: DEDUPE_WINDOW_MS, max: MAX_PER_PAGE })
  const handle = (error: unknown, fallbackMessage?: string) => {
    try {
      const value = error ?? fallbackMessage
      if (value === undefined || value === "Script error.") return
      if (error instanceof Error && isForeignStack(error.stack, ctx.origin)) return
      const event = shapeError(value, {
        kind: "unhandled",
        pathname: ctx.pathname(),
        consent: ctx.consent(),
        userAgent: ctx.userAgent,
      })
      if (!allow(`${event.message}|${firstFrame(event.stack)}`)) return
      report(event)
    } catch {
      // An Error with a throwing `message`/`stack` getter must not throw inside the listener.
    }
  }
  return {
    // `filename` is part of the native ErrorEvent shape (window.onerror); unused here because
    // `error.stack` already carries the file/line/column for every frame.
    onError: (event: { message?: string; error?: unknown; filename?: string }) =>
      handle(event.error, event.message),
    onUnhandledRejection: (event: { reason?: unknown }) => handle(event.reason),
  }
}

/** `sendBeacon` survives unload; `fetch keepalive` is the fallback. Never throws. */
export function sendBatch(batch: BrowserBatch): void {
  try {
    const body = JSON.stringify(batch)
    // The route's cap counts bytes; a string's length counts UTF-16 code units.
    const blob = new Blob([body], { type: "application/json" })
    if (blob.size > TELEMETRY_LIMITS.bodyBytes) return
    if (typeof navigator !== "undefined" && navigator.sendBeacon?.(ENDPOINT, blob)) return
    void fetch(ENDPOINT, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {})
  } catch {
    // Reporting must never break the page.
  }
}

const browserCtx = () => ({
  pathname: typeof location !== "undefined" ? location.pathname : "/",
  consent: typeof document !== "undefined" ? readConsent(document.cookie) : null,
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
})

/** For error boundaries: one event, now. */
export function reportError(
  error: unknown,
  ctx: { kind?: "boundary" | "unhandled"; digest?: string } = {}
): void {
  try {
    const { pathname, consent, userAgent } = browserCtx()
    sendBatch({
      errors: [
        shapeError(error, {
          kind: ctx.kind ?? "boundary",
          digest: ctx.digest,
          pathname,
          consent,
          userAgent,
        }),
      ],
      vitals: [],
    })
  } catch {
    // never throw
  }
}

/** For `useReportWebVitals`: one vital, now (they arrive one at a time as they settle). */
export function reportVital(metric: {
  name: string
  value: number
  rating: string
  navigationType?: string
}): void {
  try {
    const vital = shapeVital(metric, { pathname: browserCtx().pathname })
    if (vital) sendBatch({ errors: [], vitals: [vital] })
  } catch {
    // never throw
  }
}

let installed = false
/** window.onerror + unhandledrejection, once per page. */
export function installBrowserHandlers(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  const handlers = createBrowserHandlers((event) => sendBatch({ errors: [event], vitals: [] }), {
    origin: location.origin,
    pathname: () => location.pathname,
    consent: () => readConsent(document.cookie),
    userAgent: navigator.userAgent,
  })
  window.addEventListener("error", (event) => handlers.onError(event))
  window.addEventListener("unhandledrejection", (event) => handlers.onUnhandledRejection(event))
}
