# Telemetry: error tracking and a destination for web vitals (Phase 5)

**Status:** implemented
**Date:** 2026-10-04
**Origin:** `docs/ROADMAP.md` Phase 5 — "Error tracking and a production destination for web vitals";
`docs/superpowers/research/2026-10-01-boilerplate-benchmark.md` item 6
**Builds on:** `@repo/ui/components/web-vitals` (the hook point with its `consent` prop), the
`error.tsx` / `global-error.tsx` boundaries in every Next app, the `log(message, error)` seam in
`apps/api` and `apps/ai`, the consent cookie (6c), the `/admin` overview (6f), the provider-seam
shape of `Mailer` (`log|smtp|resend`) and billing (`mock|stripe`)

## Intent

Today an error in any app ends in a browser console and a web vital in a dev-only `console.log`.
This phase makes both land somewhere a person can look, out of the box and without an account: the
browsers report to their own app, the apps and services report to `apps/api`, `apps/api` stores the
events and shows the last day's errors and the week's p75 vitals on the `/admin` overview. One env
var forwards errors to Sentry in production. The consent cookie keeps "necessary only" honest.

## Decisions

- **One egress.** Browsers post to their own origin (`/api/telemetry`); every Next app forwards
  server-to-server to `apps/api`; `apps/api` is the only thing that talks to a third party. No SDK in
  any browser, no key outside the api, no CSP change. Frontends stay thin; the api stays the backend.
- **Provider seam in the api only:** `TELEMETRY_PROVIDER=store` (default: the tables and the admin
  cards) or `sentry` (the tables **and** each new error forwarded to Sentry's envelope endpoint over
  `fetch`; vitals never leave). There is no `log` mode: every error is also written to the api log as
  today, in every mode.
- **Capture scope:** Next — every `error.tsx` / `global-error.tsx` render (`boundary`) and the
  browser's `window.onerror` / `unhandledrejection` (`unhandled`); Bun services — every 5xx the
  existing `log("rpc failed" | "unhandled", error)` seam sees, plus the api's detached failures
  (mail, webhook, prune) (`server`). Plus Core Web Vitals (CLS, INP, LCP, FCP, TTFB) from every page.
  Not captured: Next server actions and route handlers outside a boundary, 4xx, `console.error`.
- **Consent rule, stated once:** an event always may carry `app`, `route` (pathname only), `kind`,
  `message`, `stack`, `digest` and the metric fields. `userAgent` only when the `consent` cookie is
  `all`. The api never stores an ip on these tables (the ip only keys the limiter). No user id, no
  cookies, no request bodies, ever.
- **Reporting never breaks what it reports on**: every client swallows its own failures; the route
  answers `204` for anything; the api's own recording is wrapped.
- **Bounded by construction:** caps on body, batch, message and stack sizes; dedupe in the browser;
  a per-browser limiter at the api; `count` upserted per fingerprint-day; retention 30 days (errors)
  and 7 days (vitals) pruned on ingest.
- Out of scope: source maps / releases, breadcrumbs, session replay, alerting, per-user views,
  retention settings, a vitals time series, analytics beyond vitals, OpenTelemetry.

## Components

### `packages/telemetry` (`@repo/telemetry`, pure TypeScript, two entry points)

- `@repo/telemetry/browser` (`"use client"`-safe, no React):
  - `reportError(error: unknown, ctx?: { digest?: string; kind?: "boundary" | "unhandled" })` and
    `reportVital(metric: { name, value, rating, navigationType? })`. Both shape an event, read `app`
    from `document.documentElement.dataset.app`, `route` from `location.pathname`, `consent` from the
    `consent` cookie (`parseConsent` logic duplicated as a tiny pure function — this package does not
    depend on `@repo/ui`), and send with `navigator.sendBeacon("/api/telemetry", blob)` falling back
    to `fetch(…, { method: "POST", keepalive: true })`. Never throws, never returns a promise the
    caller must handle.
  - `installBrowserHandlers()`: idempotent; `window.onerror` + `unhandledrejection` → `reportError(…,
    { kind: "unhandled" })`; drops events whose every stack frame is cross-origin (extensions,
    third-party scripts) and `Script error.` messages; dedupes by `message + first frame` for 60 s;
    stops after 10 events per page load.
  - Pure helpers, exported for tests: `shapeError`, `shapeVital`, `stripRoute(pathname)`,
    `isForeignStack(stack, origin)`, `readConsent(cookieHeader)`.
- `@repo/telemetry/server` (Node/Bun):
  - `createTelemetryClient({ apiUrl, serviceToken, app, fetch? })` → `{ report(batch) }`: posts
    `telemetry.ingest` with the service bearer and `x-api-client-id: telemetry:<app>` (or a given
    client id), 5 s timeout, fire-and-forget, failures to `console.error` throttled to once a minute.
  - `createTelemetryRoute({ app, env? })` → the Next `POST` route handler: parses JSON ≤ 8 KB, validates
    with `TelemetryBatchSchema`, **overwrites `app`** with the configured one, derives the client id
    from `requestInfo`'s ip (`anon:<hash>`, as the waitlist action does — the api's limiter is then
    per browser behind a proxy that sets the ip), forwards with the server client, answers `204` in
    every case; without `API_URL` / `API_SERVICE_TOKEN` it drops and logs once.

### `packages/api-contract/src/telemetry.ts`

- `TelemetryAppSchema = z.enum(["www", "app", "auth", "account", "docs", "help", "jobs", "api", "ai"])`
- `ErrorEventSchema { kind: "boundary" | "unhandled" | "server", message ≤ 500, stack? ≤ 4000,
  digest? ≤ 64, route? ≤ 200, userAgent? ≤ 300 }`
- `VitalEventSchema { name: "CLS" | "INP" | "LCP" | "FCP" | "TTFB", value ≥ 0, rating: "good" |
  "needs-improvement" | "poor", navigationType? ≤ 30, route ≤ 200 }`
- `TelemetryBatchSchema { app, errors: ErrorEvent[] (≤ 20), vitals: VitalEvent[] (≤ 20) }`
- `TelemetryErrorSummarySchema { fingerprint, app, kind, message, route, digest, count, firstSeen,
  lastSeen }`; `TelemetryErrorsSchema { window: "24h", distinct, total, top: Summary[] }`
- `TelemetryVitalsSchema { window: "7d", apps: { app, samples, lcp, inp, cls }[] }` (p75 values,
  `null` when no samples)
- Procedures: `telemetry.ingest` (`POST /telemetry`, service token, no session, errors
  `TOO_MANY_REQUESTS`, output `void`); `admin.telemetry.errors` and `admin.telemetry.vitals`
  (`GET /admin/telemetry/errors|vitals`, `ADMIN_ERRORS`, behind the `superadmin` middleware).

### `apps/api`

- **Env:** `TELEMETRY_PROVIDER` (`store` default | `sentry`), `SENTRY_DSN` (required iff `sentry`,
  at any `NODE_ENV`; parsed at boot), `SENTRY_ENVIRONMENT` (optional, default `NODE_ENV`).
- **Migration `0012_telemetry`:** `telemetry_errors (id, fingerprint TEXT NOT NULL, day TEXT NOT NULL,
  app, kind, message, stack, digest, route, user_agent, count INTEGER NOT NULL, first_seen, last_seen,
  UNIQUE (fingerprint, day))`, index `(last_seen)`; `telemetry_vitals (id, app, route, name, value
  REAL, rating, navigation_type, at)`, index `(app, name, at)`.
- **`queries/telemetry.ts`:** `upsertError` (`INSERT … ON CONFLICT (fingerprint, day) DO UPDATE SET
  count = count + 1, last_seen = …` — both engines; returns whether the row is new),
  `insertVitals`, `errorSummary(since, limit)` (grouped by fingerprint across days), `vitalSamples
  (since)` (app, name, value — p75 picked in JS: small windows, no `percentile_cont` on SQLite),
  `prune(errorsBefore, vitalsBefore)`.
- **`src/telemetry/`:** `fingerprint(app, kind, message, stack)` = sha256 of app + kind + normalised
  message (digits and hex runs collapsed) + first own frame; `provider.ts` (`TelemetryProvider { kind;
  onNewError(row): Promise<void> }`), `store.ts` (no-op `onNewError`), `sentry.ts` (DSN → envelope
  URL + auth header; one `event` envelope per new fingerprint-day with `level: "error"`, `platform:
  "javascript"` / `"node"`, `environment`, `tags { app, kind, route }`, `exception { type, value,
  stacktrace from the raw stack }`, `fingerprint: [fingerprint]`; `fetch` with a 5 s timeout; never
  throws), `create-provider.ts` from env, `record.ts` (`recordServerError(db, provider, app, error,
  route?)` shared by `ingest` and the api's own `log` seam; wrapped so it cannot throw).
- **Wiring:** `Context.telemetry: TelemetryProvider`, `Context.telemetryLimiter` (60 per minute per
  client id, default); `ServerOptions.telemetry?` (a factory like `billing?`) and
  `telemetryLimiter?`; `createServer`'s `log` for `"rpc failed"` / `"unhandled"` also calls
  `recordServerError` with `app: "api"`. `apps/ai` gets a server client (`app: "ai"`) called from its
  `logUnexpected` seam, configured by new **optional** `API_URL` / `API_SERVICE_TOKEN` in its env
  (unset → no reporting, one log line at boot; Compose passes both).
- **`telemetry.ingest`:** limiter first; `app` from the body (the route already overwrote it);
  `upsertError` per error and `insertVitals` for the vitals; detached: `provider.onNewError` for each
  new row and `prune(now − 30 d, now − 7 d)`.

### `packages/ui`

- `components/web-vitals.tsx`: production branch calls `reportVital(metric)`; dev keeps the console
  log; consent read with `useConsent()` (the `consent` prop stays as the initial value) and passed
  into the shaping so `userAgent` is dropped unless `all`.
- `components/browser-telemetry.tsx` (`BrowserTelemetry`, client, renders null): calls
  `installBrowserHandlers()` once on mount. Every root layout renders it next to `<WebVitals />`.
- `blocks/status-page` unchanged; the apps' `error.tsx` swaps `console.error(error)` for
  `reportError(error, { digest: error.digest, kind: "boundary" })` — dev still logs. The seven
  `error.tsx` files stay byte-identical: `app` comes from `<html data-app="<name>">`, which each root
  layout sets (the one per-app line).

### `apps/auth` — `/admin` overview

Two cards under the existing sections, fed by `admin.telemetry.errors` and `admin.telemetry.vitals`
loaded in parallel with `metrics`:

- **Errors (24 h)** — `distinct` fingerprints · `total` events; a table of the top five by count: app,
  kind, message (truncated to 80 chars, full text in `title`), route, count, last seen. Empty state
  `No errors in the last 24 hours.`
- **Web vitals (7 d)** — one row per app: samples, p75 LCP (s), p75 INP (ms), p75 CLS, each with a
  rating label *and* colour by the official thresholds (LCP 2.5 s / 4 s, INP 200 / 500 ms, CLS 0.1 /
  0.25); `—` when no samples. Empty state `No vitals reported yet.`

No new admin pages.

### Every Next app (seven, identical files)

- `src/app/api/telemetry/route.ts`: `export const POST = createTelemetryRoute({ app: "<name>" })`
  (the one line that differs per app, like `/api/health`'s `app:` field).
- Root layout: `<html lang="en" data-app="<name>">`, `<BrowserTelemetry />` next to `<WebVitals />`.
- `apps/docs`, `apps/help`, `apps/jobs` gain **optional** `API_URL` / `API_SERVICE_TOKEN` (the route
  drops when unset); Compose passes both to every Next service. Their pages stay static.

## Data flow

1. A page throws → `error.tsx` renders → `reportError` → `sendBeacon` to `/api/telemetry` on the same
   origin → the route validates, stamps `app` and the client id → `telemetry.ingest` on the api →
   `upsertError` → (sentry) envelope for a new fingerprint-day → the row counts up on repeats.
2. A page loads → `WebVitals` reports CLS/INP/LCP/FCP/TTFB as they settle → the same path →
   `insertVitals`.
3. An api handler throws → `log("rpc failed", error)` → `recordServerError(app: "api")` → the same
   table, no HTTP. `apps/ai` → server client → `telemetry.ingest`.
4. A superadmin opens `/admin` → the two cards.

## Error handling

- Browser: `sendBeacon` false → one `fetch keepalive` → give up silently. Handlers never rethrow.
- Route: invalid JSON, oversized body, schema failure, missing env, forward failure → `204`; each
  reason logged at most once a minute.
- Server client: never throws; throttled log.
- Api: a telemetry write failure inside `ingest` answers `INTERNAL_SERVER_ERROR` like any write (the
  route still answers 204 to the browser); `recordServerError` from the `log` seam is wrapped so a
  telemetry failure cannot turn a 500 into a crash; the Sentry forward and the prune are detached and
  logged on failure.
- Storms: browser dedupe (60 s, 10 per page), limiter 60/min per browser, fingerprint-day `count`,
  size caps → `BAD_REQUEST` from the contract (the route turns it into a `204`).

## Security

- The api accepts telemetry only with the service token; browsers reach it only through their own
  app's route, so the limiter, the caps and the prune are the defence against a visitor filling the
  tables. The route overwrites `app`, so no page impersonates another app.
- Stored: app, kind, message, stack, digest, route, (consented) user agent, counts, times. Never: ip,
  user id, cookies, headers, bodies. The admin cards render messages as text.
- Sentry sees app, kind, message, stack, route, digest, environment — nothing identifying; the DSN
  lives only in the api env.
- The admin procedures sit behind the same `superadmin` middleware (NOT_FOUND to everyone else).

## Tests

- `@repo/telemetry`: shaping (consent gating of `userAgent`, `stripRoute`, caps), `isForeignStack`,
  dedupe window and the 10-per-page cap, `installBrowserHandlers` idempotence (jsdom-free: the
  handlers are pure functions over a fake `window`), `createTelemetryRoute` with a fake forwarder
  (`204` on garbage / oversize / unconfigured, `app` overwrite, client id from the ip), server client
  (never throws, throttled logging, timeout).
- api (both engines): `ingest` (upsert count and `new` flag, fingerprint stability across digits /
  hex, caps → `BAD_REQUEST`, limiter → `TOO_MANY_REQUESTS`, prune windows), `recordServerError` from a
  throwing handler (a `server` row with `app: "api"`), the Sentry adapter against a fake `fetch`
  (envelope shape and auth header, DSN parsing incl. a bad DSN at boot, timeout, forwarded only for
  new fingerprint-days), `admin.telemetry.*` (p75 math incl. the odd/even sample edge, 24 h / 7 d
  windows, NOT_FOUND for non-admins).
- ui: `WebVitals` production branch with a fake `reportVital`, `BrowserTelemetry` installs once, the
  two admin cards (empty states, threshold labels and colours, message truncation with `title`).
- Planner: `scripts/ci-plan.test.ts` identical-files check covers `error.tsx` (still identical) and
  the per-app `route.ts` line.
- Browser pass: throw from a page → the Errors card shows it with the right app and route; browse a
  few pages → the vitals card fills; `TELEMETRY_PROVIDER=sentry` with a DSN pointing at a local
  listener prints the envelope; "necessary only" consent → events without `userAgent`.

## Docs

CLAUDE.md: a **Telemetry** entry under **Design System Single Points** (the seam, the consent rule,
the one per-app line, `data-app`), the env table rows, the Apps/Packages lists (`packages/telemetry`),
"Adding a new subdomain app" step (route + `data-app` + `BrowserTelemetry`); `.env.example`,
`apps/api/.env.example`, Compose; `packages/telemetry/README.md`; api README section;
`docs/guides/sentry.md`; ROADMAP tick.

## Out of scope

Source maps and releases, breadcrumbs, session replay, alerting, per-user error views, retention
settings, a vitals time series, analytics beyond vitals, OpenTelemetry, server-side Next errors
outside a boundary.

## Deviations

Rulings made during execution that depart from the design above:

1. **No `data-app`.** Browser batches carry no `app` field and no layout sets `<html data-app="…">`.
   Instead, each app's `src/app/api/telemetry/route.ts` stamps `app` itself (`createTelemetryRoute({
   app: "<name>" })`), the same one-line-per-app pattern as `/api/health`; `global-error.tsx` still
   replaces `<html>` (it must — the root layout may be what threw), it just carries no extra
   attribute. One fewer per-app line to keep identical, and the app identity now lives in exactly
   one place (the route) instead of two (the route and the layout's `<html>` tag).
2. **`WebVitals` does not call `useConsent()`.** `@repo/telemetry/browser` reads the `consent` cookie
   itself at send time (`readConsent`, duplicated from `@repo/ui/lib/consent`'s rule so the package
   stays React-free) rather than receiving it as a prop threaded through a hook. Same source of
   truth, no React dependency inside `@repo/telemetry`, and no risk of a stale consent value from a
   component that rendered before the banner's choice landed.
3. **The api strips `?`/`#` from every `route` on ingest too**, not only in the browser and the Next
   route — `sanitizeRoute` in `apps/api/src/telemetry/record.ts` runs on every error and vital before
   it is written. Defence in depth: a route string reaching the api by any other path (a future
   direct caller, a bug upstream) still never lands a query string or hash in the table.
4. **Limits live in a zod-free subpath.** `TELEMETRY_LIMITS`, `VITAL_NAMES` and `VITAL_THRESHOLDS`
   are in `@repo/api-contract/telemetry-limits`, not the main `@repo/api-contract` index — `zod` and
   the oRPC contract are both rooted there, and `@repo/telemetry/browser` (which ships in every Next
   app's client bundle) must not pull either in just to read a size cap. `telemetry.ts` imports and
   re-exports them, so every existing `@repo/api-contract` import keeps working unchanged.
5. **`apps/ai` reports only request failures, reduced.** Not every recovered stream error, only the
   ones that end the request as a failure (an unexpected 5xx, `GENERATION_FAILED`, a chat stream that
   finishes failed) — see `createServer`'s `logUnexpected` and `createChatHandler`'s `reportFailure`
   calls in `apps/ai/src/server.ts` / `chat.ts`. Each is reduced to `"<log key>: <ErrorName>"`
   (`toAiErrorEvent`) with no message and no stack: a provider's error text or a model's stack frame
   can carry secrets or raw model output, neither of which belongs in a shared errors table (or
   forwarded on to Sentry). The unreduced error still reaches the service's own log.
6. **`detach` (api) now catches a synchronous throw**, not only a rejected promise — `Promise.resolve
   ().then(work).catch(onError)` routes a throw from `work` itself through the same `onError` path
   instead of escaping the timer callback as an uncaught exception. The telemetry route also streams
   the request body under `TELEMETRY_LIMITS.bodyBytes` with a `content-length` pre-check
   (`readCapped` in `packages/telemetry/src/server.ts`) rather than buffering an unbounded body
   before checking its size — the cap holds even when the header is absent (a chunked body) or lies.
7. **Opaque path segments collapse to `:id`.** Pathname-only was not enough: `/invitations/<token>`
   and `/reset-password/<token>`-style paths carry the secret in the path itself. `collapseRoute`
   (`@repo/telemetry/browser`, called by `stripRoute`) and `sanitizeRoute` (api, the same regex set
   duplicated) replace every segment that is all digits, a UUID, or 16+ characters of
   `[A-Za-z0-9_-]` with `:id`. It also groups `/notes/42` and `/notes/43` under one route.
8. **The telemetry route refuses cross-site writes.** It answers 204 without forwarding unless the
   `content-type` starts with `application/json` (what a CORS-free cross-site form or `no-cors`
   fetch cannot send) and `sec-fetch-site`, when present, is `same-origin` or `none` — checked
   before the body is read. `sendBatch` already sends `application/json` on both paths.
9. **A distinct limiter identity for telemetry.** The route's per-browser client id is
   `telemetry:<32 hex of sha256(ip)>`, not `anon:…`, so under the api's global `API_RATE_LIMIT` a
   page's telemetry never shares (and exhausts) the bucket `@repo/session` uses for sign-in and
   password reset. The api adds a per-app backstop limiter (`telemetry:app:<app>`, 3000 a minute)
   behind the per-client one.
10. **The digest is part of the fingerprint.** `fingerprint(app, kind, message, stack, digest?)`
    keys on the digest when present — production server-component errors share one generic message
    and differ only there — and normalises the first frame like the message, so a content-hashed
    chunk name does not split a group on every deploy.
11. **p75 is picked in SQL.** `vitalP75` counts each (app, metric) over the window and reads the
    single value at offset `ceil(0.75 · n) − 1` (`ORDER BY value LIMIT 1 OFFSET ?`, both engines)
    instead of loading every sample into the api. The Health cards also degrade independently:
    a failed `errors` or `vitals` call renders "Could not load …" in its card, not a 500 page.
12. **Detached failures are captured, masked.** Mail sends, token prunes and the billing webhook's
    write failure go through `Context.recordFailure`, which logs and records a `server` row for app
    `api` (telemetry's own failures stay log-only, so nothing recurses). `toErrorEvent` masks
    email addresses and 16+ character tokens in the message (and the stack's copy of it) before
    truncating, since a provider's bounce text quotes the recipient.
