// Zero imports, on purpose: this is the one implementation of path collapsing, and it reaches
// every client bundle in the monorepo through `@repo/telemetry/browser` (every app, the static
// ones included). It must never pull in zod — that is why it is its own subpath rather than living
// in analytics.ts (which is zod-only but not zod-free): `packages/telemetry/src/browser.ts`'s
// minified, browser-target build was 3.33 KB with zero zod references before this module existed,
// and importing `collapseRoute` from analytics.ts instead of here regressed it to 62+ KB with zod
// bundled in. `packages/telemetry/src/browser.test.ts`'s bundle-size guard enforces this.

// A segment that names a record rather than a page: all digits, a UUID, or 16+ url-safe chars.
// The single implementation: `@repo/telemetry/browser`'s `stripRoute`,
// `apps/api/src/telemetry/record.ts`'s `sanitizeRoute`, and `apps/api/src/analytics/ingest.ts`
// all import `collapseRoute` from here rather than keeping their own copy, so this one rule never
// drifts.
const OPAQUE_SEGMENT = [
  /^\d+$/,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^[A-Za-z0-9_-]{16,}$/,
]

/**
 * Pathname only — a query string or hash (`/invitations/abc123def456ghi789?token=x`) never
 * reaches a table — with every opaque segment collapsed to `:id`.
 */
export function collapseRoute(path: string): string {
  return (path.split(/[?#]/)[0] ?? "")
    .split("/")
    .map((segment) => (OPAQUE_SEGMENT.some((rule) => rule.test(segment)) ? ":id" : segment))
    .join("/")
}
