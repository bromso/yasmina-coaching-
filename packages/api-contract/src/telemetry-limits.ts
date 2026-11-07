/**
 * Zod-free telemetry constants: safe for a browser bundle that must not pull in zod or the oRPC
 * contract (both are rooted in `@repo/api-contract`'s index, which this module is not part of).
 * `telemetry.ts` imports these and re-exports them, so every existing `@repo/api-contract` import
 * keeps working; `@repo/telemetry/browser` imports only from here.
 */

/** Size caps, shared by the browser client (truncate), the route (reject) and the api (reject). */
export const TELEMETRY_LIMITS = {
  bodyBytes: 8192,
  batch: 20,
  message: 500,
  stack: 4000,
  digest: 64,
  route: 200,
  userAgent: 300,
  navigationType: 30,
} as const

export const ERROR_KINDS = ["boundary", "unhandled", "server"] as const

export const VITAL_NAMES = ["CLS", "INP", "LCP", "FCP", "TTFB"] as const

/** web.dev thresholds: [good ≤, needs-improvement ≤]; above is poor. */
export const VITAL_THRESHOLDS: Record<"LCP" | "INP" | "CLS", readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
}
export function rateVital(name: keyof typeof VITAL_THRESHOLDS, value: number) {
  const [good, ok] = VITAL_THRESHOLDS[name]
  return value <= good ? "good" : value <= ok ? "needs-improvement" : "poor"
}
