# @repo/telemetry

Error/web-vitals reporting and product analytics, both one way: browsers report to their own app,
apps and services report to `apps/api`. Three entry points, no dependency on `@repo/ui`,
`@repo/session`, React or Next.

## `@repo/telemetry/browser`

What pages call. Install once per app:

```ts
import { installBrowserHandlers } from "@repo/telemetry/browser"
installBrowserHandlers() // window.onerror + unhandledrejection
```

Error boundaries and `useReportWebVitals` call the one-shot reporters directly:

```ts
import { reportError, reportVital } from "@repo/telemetry/browser"
reportError(error, { kind: "boundary", digest })
reportVital({ name, value, rating, navigationType })
```

Every reporting path (`installBrowserHandlers`, `reportError`, `reportVital`, `sendBatch`) is
wrapped so it **never throws and never returns a promise the caller must handle** — reporting a
problem must not become a second problem. `sendBatch` tries `navigator.sendBeacon` first (it
survives page unload) and falls back to `fetch` with `keepalive: true`; it only ever POSTs to the
same-origin `/api/telemetry`.

**Consent.** `userAgent` is attached only when the `consent` cookie (read with `readConsent`,
mirroring `@repo/ui/lib/consent`'s rule so this package stays React-free) is `"all"`.

**Route shape.** `stripRoute` keeps the pathname only — never a query string or hash, which may
carry tokens or search terms — collapses opaque segments, and caps it at `TELEMETRY_LIMITS.route`.
`collapseRoute` replaces every path segment that is all digits, a UUID, or 16 or more characters of
`[A-Za-z0-9_-]` with `:id`: `/invitations/<token>` → `/invitations/:id`, `/notes/42` →
`/notes/:id`, `/login` unchanged. A token in the path therefore never leaves the browser, and one
page reports under one route. `apps/api` applies the same rule again on ingest.

**Noise control.**
- `Script error.` (the browser's generic cross-origin error message) is dropped.
- An error whose stack names only foreign script origins (a browser extension, a third-party
  tag) is dropped via `isForeignStack`; a stack with no recognizable origin at all (e.g. a local
  path, as in a non-browser test) is not treated as foreign.
- `createDedupe` collapses repeats of the same `message + first stack frame` within a 60 s window
  and caps every page load at 10 events total — a render loop sends 10 reports, not 10,000.

Every size cap (`message`, `stack`, `digest`, `route`, `userAgent`) comes from
`TELEMETRY_LIMITS` in `@repo/api-contract` and is truncated client-side before sending.

## `@repo/telemetry/analytics`

Cookieless pageviews and UI-only product events. Zero zod, like `browser.ts` — it imports only the
zod-free `@repo/api-contract/route`, guarded by a test that builds and measures the minified
bundle, so a change pulling zod back in (as `@repo/api-contract/analytics` would) fails loudly.

```ts
import { sendPageview, track } from "@repo/telemetry/analytics"
sendPageview(pathname, referrer) // <Analytics /> calls this on every usePathname() change
track("pricing_viewed") // a client event — only a `client: true` name in ANALYTICS_EVENTS means anything
```

Both route through one `beacon()`: nothing in development, nothing with
`navigator.doNotTrack === "1"`, `sendBeacon` to the app's own `POST /api/analytics` falling back to
`fetch(..., { keepalive: true })`, never throwing. `sendPageview` collapses the path the same way
`stripRoute` does and reduces `referrer` to its host (`toReferrerHost`) before it ever leaves the
browser — the full referrer URL can carry a same-origin one-time token (`/magic?token=…`) and must
never be sent. `<Analytics />` (`@repo/ui/components/analytics`, re-exported there rather than kept
here because this package stays React/Next-free) calls `sendPageview` on mount and on every
`usePathname()` change, passing `document.referrer` only for the first call of a page load.

## `@repo/telemetry/server`

The oRPC client and the Next route handlers, used by services and by each app's
`src/app/api/telemetry/route.ts` / `src/app/api/analytics/route.ts` (the same convention as
`src/app/api/health/route.ts`).

```ts
// apps/<app>/src/app/api/telemetry/route.ts
import { createTelemetryRoute } from "@repo/telemetry/server"
export const POST = createTelemetryRoute({ app: "app" })
```

```ts
// apps/<app>/src/app/api/analytics/route.ts
import { createAnalyticsRoute } from "@repo/telemetry/server"
export const POST = createAnalyticsRoute({ app: "app" })
// A signed-in app adds `identity`, resolving ids only when they end up used (see below):
// identity: async (req) => {
//   const me = await getAuth().getMeFromRequest(req)
//   const { workspace } = await getAuth().resolveWorkspaceFromRequest(req)
//   return analyticsIdentity(me, workspace?.id ?? null) // from @repo/session; null while impersonating
// }
```

`createAnalyticsRoute` shares the cross-site guard, bot check and dev-fallback env resolution with
`createTelemetryRoute` (`refusesCrossSite`, `resolveApiEnv`, private to `server.ts`) and always
answers **204**. It parses the body against `AnalyticsBeaconSchema` (`@repo/api-contract`), drops a
pageview's `referrerHost` when it equals the request's own host, reads the `consent` cookie
(`@repo/telemetry/consent`, a tiny DOM-free duplicate of `@repo/ui/lib/consent`'s rule) and calls
`options.identity(req)` — catching a throw as "no ids" — only when it is `"all"`, then forwards
`{ app, kind, path, referrerHost, name?, props?, userId?, workspaceId?, ip, userAgent }` to
`analytics.ingest` with the service token and a per-browser `analytics:<32-hex sha256(ip)>` client
id (no ip at all → no `x-api-client-id` header, rather than a shared fallback every browser of that
app would collide on).

`createTelemetryRoute` always answers **204** — a page must never see a telemetry failure — for a
cross-site write (a `content-type` other than `application/json`, which is what a CORS-free
cross-site form or `no-cors` fetch would send, or a `sec-fetch-site` header that is present and
neither `same-origin` nor `none`; both are checked before the body is read), garbage JSON, an
oversize body (> `TELEMETRY_LIMITS.bodyBytes`), a schema miss, or a downstream failure (logged, not
surfaced). On a valid `BrowserBatch` it overwrites `app` with the route's own configured value (a
browser cannot claim to be a different app) and forwards to `apps/api` with a per-browser rate-limit
key: `telemetry:<32 hex of sha256(ip)>` (`clientIp` reads `x-real-ip` first, then the first hop of
`x-forwarded-for`; `anonymousClientId` hashes it, so the raw ip never travels further and is
undefined when there is no ip to hash). The `telemetry:` prefix keeps that bucket apart from
`@repo/session`'s `anon:<hash>` sign-in bucket under the api's `API_RATE_LIMIT`. `next start` fills `x-forwarded-for` from the socket address when no proxy has set it, so there is normally an ip (best-effort: a client talking to Next directly can send its own header); behind a proxy that sets neither header, every browser arrives as the proxy and shares its bucket (raise `TELEMETRY_RATE_LIMIT` on the api, or fix the proxy). With no ip at all, the server client sends `telemetry:<app>`, which every browser of that app shares; the api skips its per-client limit for that id and relies on the per-app cap (3000 a minute). `apps/ai` reports as `telemetry:ai` and takes the same path. Without `API_URL` /
`API_SERVICE_TOKEN` set (`env`, default `process.env`) it falls back, outside production
(`NODE_ENV !== "production"`), to the dev api URL and token like `@repo/session`'s `loadEnv`
(`http://api.brand.localhost:3007`, `DEV_API_TOKEN`); in production it drops every batch with one
throttled log line instead of calling out.

`createTelemetryClient({ apiUrl, serviceToken, app, fetch?, timeoutMs?, log? })` is the thin oRPC
wrapper the route uses (and that `apps/api` / `apps/ai` can use directly for a server-side error):
fire-and-forget — `report()` never throws and the caller's request never awaits it — with a 5 s
default timeout and throttled error logging (`throttledLogger`, at most one line per distinct
message per interval, default 60 s).

## Caps

All from `TELEMETRY_LIMITS` (`@repo/api-contract`): `bodyBytes` 8192, `batch` 20 events per kind,
`message` 500, `stack` 4000, `digest` 64, `route` 200, `userAgent` 300, `navigationType` 30. The
browser truncates to these; the route rejects (silently, with a 204) anything that still violates
them.
