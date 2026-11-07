import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
  type AnalyticsIngestInput,
  isAnalyticsEventName,
  parseEventProps,
} from "@repo/api-contract/analytics"
import { collapseRoute } from "@repo/api-contract/route"
import { siteDomain } from "@repo/sites"
import type { ForwardItem } from "./providers/provider"

const HOSTNAME_PATTERN = /^[a-z0-9.-]+$/

/** One of our own hosts: the SITE_DOMAIN parent domain itself or any subdomain of it. */
function isOwnHost(host: string): boolean {
  const domain = siteDomain()
  return host === domain || host.endsWith(`.${domain}`)
}

/**
 * `referrerHost` is kept only when it looks like a real hostname (lowercase letters, digits, dots
 * and hyphens, at most 253 chars — the schema already caps the length, this adds the shape) and
 * is not one of our own apps' hosts (the SITE_DOMAIN parent domain or any `*.<domain>`, from
 * `@repo/sites`): navigation from www to app is not an external referral, and anything else
 * (mixed case, a stray scheme or path that slipped through) is dropped rather than guessed at.
 */
function normaliseReferrerHost(referrerHost: string | undefined): string | null {
  if (!referrerHost) return null
  if (referrerHost.length > 253 || !HOSTNAME_PATTERN.test(referrerHost)) return null
  return isOwnHost(referrerHost) ? null : referrerHost
}

export type ShapedPageview = {
  kind: "pageview"
  app: string
  path: string
  referrerHost: string | null
  visitorId: string | null
  userId: number | null
  workspaceId: number | null
}

export type ShapedEvent = {
  kind: "event"
  name: AnalyticsEventName
  /** The reporting app: ingest only ever carries client events, so `source` is always the app id. */
  source: string
  props: Record<string, unknown>
  visitorId: string | null
  userId: number | null
  workspaceId: number | null
}

export type ShapedIngest = ShapedPageview | ShapedEvent

/**
 * Pure validation and shaping for one `analytics.ingest` call — no I/O, so the handler supplies
 * `visitorId` (computed from the day's salt) and does the actual writes. A pageview needs `path`,
 * collapsed the same way telemetry collapses routes (opaque segments to `:id`, query/hash
 * dropped). An event needs a known, client-allowed name (a server-only event, e.g. `signed_up`,
 * never reaches ingest — it is written directly by `recordEvent`) and props that match its
 * allowlist within `ANALYTICS_PROPS_MAX_BYTES`. Returns null for anything that fails either rule;
 * the caller throws BAD_REQUEST for that, distinct from a tripped rate limit (which answers
 * success without storing anything).
 */
export function shapeIngest(
  input: AnalyticsIngestInput,
  visitorId: string | null
): ShapedIngest | null {
  const userId = input.userId ?? null
  const workspaceId = input.workspaceId ?? null

  if (input.kind === "pageview") {
    if (!input.path) return null
    return {
      kind: "pageview",
      app: input.app,
      path: collapseRoute(input.path),
      referrerHost: normaliseReferrerHost(input.referrerHost),
      visitorId,
      userId,
      workspaceId,
    }
  }

  const name = input.name
  if (!name || !isAnalyticsEventName(name) || !ANALYTICS_EVENTS[name].client) return null
  const props = parseEventProps(name, input.props)
  if (props === null) return null
  return {
    kind: "event",
    name,
    source: input.app,
    props,
    visitorId,
    userId,
    workspaceId,
  }
}

/**
 * Builds the `analytics.forward` job's payload from one shaped, already-stored row: `at` is the
 * row's own `createdAt` (not `new Date()` again) and `uuid` is generated once by the caller
 * (`crypto.randomUUID()`), so a redelivered job forwards the exact same timestamp and id.
 * `workspaceId` rides along only for PostHog's `distinct_id` (`workspace:<id>` when a row has no
 * user; never sent as a property, and Plausible ignores it); an event's `source` (the reporting
 * app) is kept: Plausible needs it to attribute the event to a site (see plausible.ts).
 */
export function toForwardItem(shaped: ShapedIngest, at: string, uuid: string): ForwardItem {
  if (shaped.kind === "pageview") {
    return {
      kind: "pageview",
      app: shaped.app,
      path: shaped.path,
      referrerHost: shaped.referrerHost,
      visitorId: shaped.visitorId,
      userId: shaped.userId,
      workspaceId: shaped.workspaceId,
      at,
      uuid,
    }
  }
  return {
    kind: "event",
    name: shaped.name,
    source: shaped.source,
    props: shaped.props,
    visitorId: shaped.visitorId,
    userId: shaped.userId,
    workspaceId: shaped.workspaceId,
    at,
    uuid,
  }
}
