import { z } from "zod"
import {
  ERROR_KINDS,
  rateVital,
  TELEMETRY_LIMITS,
  VITAL_NAMES,
  VITAL_THRESHOLDS,
} from "./telemetry-limits"

/** Re-exported so every existing `@repo/api-contract` import keeps working unchanged. */
export { ERROR_KINDS, rateVital, TELEMETRY_LIMITS, VITAL_NAMES, VITAL_THRESHOLDS }

/** Where an event came from: the eight Next apps and the two Bun services. */
export const TELEMETRY_APPS = [
  "www",
  "app",
  "auth",
  "account",
  "docs",
  "help",
  "jobs",
  "blog",
  "api",
  "ai",
] as const
export const TelemetryAppSchema = z.enum(TELEMETRY_APPS)
export type TelemetryApp = z.infer<typeof TelemetryAppSchema>

export const ErrorEventSchema = z.object({
  kind: z.enum(ERROR_KINDS),
  message: z.string().min(1).max(TELEMETRY_LIMITS.message),
  stack: z.string().max(TELEMETRY_LIMITS.stack).optional(),
  digest: z.string().max(TELEMETRY_LIMITS.digest).optional(),
  route: z.string().max(TELEMETRY_LIMITS.route).optional(),
  /** Only present when the visitor consented to "all" (see the consent rule). */
  userAgent: z.string().max(TELEMETRY_LIMITS.userAgent).optional(),
})
export type ErrorEvent = z.infer<typeof ErrorEventSchema>

export const VitalRatingSchema = z.enum(["good", "needs-improvement", "poor"])
export const VitalEventSchema = z.object({
  name: z.enum(VITAL_NAMES),
  value: z.number().min(0),
  rating: VitalRatingSchema,
  navigationType: z.string().max(TELEMETRY_LIMITS.navigationType).optional(),
  route: z.string().max(TELEMETRY_LIMITS.route),
})
export type VitalEvent = z.infer<typeof VitalEventSchema>

/** What a browser posts to its own app's /api/telemetry: the route stamps the app. */
export const BrowserBatchSchema = z.object({
  errors: z.array(ErrorEventSchema).max(TELEMETRY_LIMITS.batch),
  vitals: z.array(VitalEventSchema).max(TELEMETRY_LIMITS.batch),
})
export type BrowserBatch = z.infer<typeof BrowserBatchSchema>
/** What the api accepts: the same, from a known app. */
export const TelemetryBatchSchema = BrowserBatchSchema.extend({ app: TelemetryAppSchema })
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>

export const TelemetryErrorSummarySchema = z.object({
  fingerprint: z.string(),
  app: TelemetryAppSchema,
  kind: z.enum(ERROR_KINDS),
  message: z.string(),
  route: z.string().nullable(),
  digest: z.string().nullable(),
  count: z.number().int(),
  firstSeen: z.iso.datetime(),
  lastSeen: z.iso.datetime(),
})
export const TelemetryErrorsSchema = z.object({
  window: z.literal("24h"),
  distinct: z.number().int(),
  total: z.number().int(),
  top: z.array(TelemetryErrorSummarySchema),
})
export type TelemetryErrors = z.infer<typeof TelemetryErrorsSchema>

export const TelemetryVitalsSchema = z.object({
  window: z.literal("7d"),
  apps: z.array(
    z.object({
      app: TelemetryAppSchema,
      samples: z.number().int(),
      lcp: z.number().nullable(),
      inp: z.number().nullable(),
      cls: z.number().nullable(),
    })
  ),
})
export type TelemetryVitals = z.infer<typeof TelemetryVitalsSchema>
