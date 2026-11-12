import { z } from "zod"
// A narrow sibling import (never from "./index"): analytics.ts stays zod-only and otherwise
// import-free, but reuses the one app list rather than defining a second one (ruling R1).
import { LEAD_AUDIENCES, LEAD_NEEDS, LEAD_TIMELINES } from "./leads"
// Re-exported below so every existing `@repo/api-contract/analytics` import of `collapseRoute`
// keeps working unchanged. The implementation itself lives in the zod-free `./route` — never
// here — because this module reaches browser bundles (via `@repo/telemetry/browser`) that must
// not pull zod in; see route.ts's own comment for the measured regression this avoids.
import { collapseRoute } from "./route"
import { TelemetryAppSchema } from "./telemetry"

/**
 * Every product event the api and the browser may record, keyed by name. `client: true` events
 * may arrive through `analytics.ingest` from a browser beacon; `client: false` ones are written
 * only by `recordEvent` from inside the api itself (never forgeable by a client). `props` is the
 * allowlist of prop keys a client or server event may carry, each a simple zod type.
 */
export const ANALYTICS_EVENTS = {
  signed_up: {
    client: false,
    props: { method: z.enum(["password", "google", "github", "apple", "magic_link"]) },
  },
  email_verified: { client: false, props: {} },
  workspace_created: { client: false, props: {} },
  member_invited: { client: false, props: { role: z.string().max(20) } },
  invitation_accepted: { client: false, props: {} },
  note_created: { client: false, props: {} },
  plan_changed: {
    client: false,
    props: { plan: z.string().max(20), interval: z.string().max(10) },
  },
  two_factor_enabled: { client: false, props: {} },
  pricing_viewed: { client: true, props: {} },
  // The coaching site's contact form (`leads.create`): the three fixed answers only, never who
  // sent it (no user or workspace id, no address, nothing typed).
  lead_submitted: {
    client: false,
    props: {
      audience: z.enum(LEAD_AUDIENCES),
      need: z.enum(LEAD_NEEDS),
      timeline: z.enum(LEAD_TIMELINES),
    },
  },
} as const

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS
export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as AnalyticsEventName[]

/** Caps the JSON-encoded size of a stored event's props (the analytics_events.props column). */
export const ANALYTICS_PROPS_MAX_BYTES = 1024

export function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return Object.hasOwn(ANALYTICS_EVENTS, name)
}

/**
 * The JSON-encoded size of `value`, in bytes. Exported (rather than kept private to
 * `parseEventProps`) so the `ANALYTICS_PROPS_MAX_BYTES` cap is directly testable with a payload
 * that is oversized on its own terms — every current event's per-field `.max()` lengths are small
 * enough that no *valid* combination of them can actually reach 1 KB, so a test going through
 * `parseEventProps` alone would always fail on a field length first, never on this check.
 */
export function propsByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * Validates `props` against `name`'s allowlisted schema: an unknown key, a wrong type, or an
 * encoded size over `ANALYTICS_PROPS_MAX_BYTES` all refuse (return null) rather than silently
 * dropping what does not fit. Missing `props` is treated as `{}`.
 */
export function parseEventProps(
  name: AnalyticsEventName,
  props: unknown
): Record<string, unknown> | null {
  const schema = z.strictObject(ANALYTICS_EVENTS[name].props)
  const result = schema.safeParse(props ?? {})
  if (!result.success) return null
  return propsByteLength(result.data) > ANALYTICS_PROPS_MAX_BYTES ? null : result.data
}

/**
 * What a browser or the api's own `/analytics/ingest` route sends. Service token only, no
 * session: the caller (a Next app's `/api/analytics` route, or the api itself) resolves ids and
 * consent before this point — this schema just carries what it decided. `ip` / `userAgent` are
 * consumed only to compute `visitor_id` and are never stored.
 */
export const AnalyticsIngestSchema = z.object({
  app: TelemetryAppSchema,
  kind: z.enum(["pageview", "event"]),
  // A leading "/" is required: without it (e.g. a bare "?token=x" the caller forgot to resolve
  // against the pathname) `collapseRoute` would have nothing to collapse down to but "" — this
  // refuses that at the door instead of ever storing an empty path.
  path: z.string().max(300).regex(/^\//, "path must start with /").optional(),
  referrerHost: z.string().max(253).optional(),
  name: z.string().max(40).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  userId: z.number().int().positive().optional(),
  workspaceId: z.number().int().positive().optional(),
  ip: z.string().max(45).optional(),
  userAgent: z.string().max(500).optional(),
})
export type AnalyticsIngestInput = z.infer<typeof AnalyticsIngestSchema>

/**
 * What a Next app's own `POST /api/analytics` route accepts from its browser's beacon (see
 * `@repo/telemetry/analytics`): the path/referrer-host pair for a pageview, or the name/props pair
 * for a client event — never ids, a raw referrer URL (`@repo/telemetry/analytics`'s `sendPageview`
 * reduces it to a host before it ever leaves the browser — the full URL can carry a same-origin
 * one-time token, e.g. `/magic?token=…`), an ip or a user agent, which the route resolves itself
 * (session + consent, `clientIp`, the `user-agent` header). `referrerHost`'s cap matches
 * `AnalyticsIngestSchema`'s own `referrerHost` field. Mirrors `BrowserBatchSchema`'s role for
 * `/api/telemetry`.
 */
export const AnalyticsBeaconSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("pageview"),
    path: z.string().max(300).regex(/^\//).optional(),
    referrerHost: z.string().max(253).optional(),
  }),
  z.object({
    kind: z.literal("event"),
    name: z.string().max(40).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  }),
])
export type AnalyticsBeacon = z.infer<typeof AnalyticsBeaconSchema>

export { collapseRoute }
