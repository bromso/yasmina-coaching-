# Product Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-party product analytics — cookieless pageviews from every app, authoritative product
events from the api, a superadmin dashboard, and a provider seam forwarding to PostHog or Plausible.

**Architecture:** The vocabulary lives in `@repo/api-contract/analytics`. `apps/api` stores
pageviews and events (migration `0016_analytics`), derives a daily-salted visitor hash, records
product events through the jobs queue, rolls them up daily, prunes raw rows and forwards to a
provider via jobs. Browsers beacon to each app's own `/api/analytics` (a route from
`@repo/telemetry/server`); `<Analytics />` lives in `@repo/ui` beside `WebVitals`. The dashboard is
`apps/auth` `/admin/analytics`.

**Tech Stack:** Bun 1.4.2, `Bun.sql` (SQLite + Postgres), oRPC 1.15, Zod 4, the jobs queue from
sub-project C, Next 16.2, the bklit charts in `@repo/ui`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-analytics-design.md`

## Global Constraints

- Code style: Biome, double quotes, no semicolons, 2-space indent, 100-char lines; `bunx biome ci .`
  clean with zero warnings.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new npm dependency (no PostHog / Plausible SDKs — `fetch` only).
- `@repo/telemetry` keeps no React or Next dependency (ruling: the `<Analytics />` component lives
  in `@repo/ui/components/analytics`, next to `web-vitals.tsx`, and calls `@repo/telemetry/analytics`).
- Never store or forward a client ip or user agent; no email, name or free text in any row.
- `visitor_id` = first 16 hex chars of `sha256(salt + ":" + app + ":" + ip + ":" + userAgent)`; salt
  random per UTC day.
- Consent: user/workspace ids on pageviews and client events only when the `consent` cookie is
  `all`.
- Props ≤ 1 KB, allowlisted per event; client `track()` only for `client: true` events.
- Env: `ANALYTICS_PROVIDER` (`store` | `posthog` | `plausible`, default `store`),
  `ANALYTICS_RETENTION_DAYS` (default 90), `ANALYTICS_RATE_LIMIT` (default 120 per minute per
  client id; per-app cap 6000 per minute), `POSTHOG_KEY` + `POSTHOG_HOST`, `PLAUSIBLE_DOMAIN` +
  `PLAUSIBLE_HOST` (required iff that provider); blank values mean unset.
- Schedules: `analytics.rollup` `10 0 * * *`, `analytics.prune` `20 0 * * *`.
- The route always answers 204 and never throws; refuses non-JSON content types and
  `sec-fetch-site` other than `same-origin` / `none`.

## Review Focus

1. **A burst of beacons from one tab** (fast client navigations, a script loop) — the route and
   ingest rate-limit per browser and per app; nothing errors visibly. (Task 1 limiter test; Task 4
   route test)
2. **Midnight UTC** — the salt rolls over; a pageview right after midnight creates the new salt
   once even with concurrent requests (no duplicate-key error), and the rollup for yesterday sees
   the whole day. (Task 1 concurrent salt creation test; Task 2 rollup test across the boundary)
3. **A rollup that runs twice** (a retried job, two workers) — `analytics_daily` counts stay
   correct, not doubled. (Task 2)
4. **A path carrying a token** (`/invitations/<token>`, `/magic?token=…`) — never stored raw:
   collapsed segments and no query string. (Task 1 ingest test; Task 4 browser test)
5. **The provider is down for an hour** — forwards retry through the job queue and give up after
   the job's attempts; the tables and dashboard are unaffected. (Task 3)

---

### Task 1: Vocabulary, storage, visitor id and ingest

**Files:**
- Create: `packages/api-contract/src/analytics.ts` (+ `"./analytics"` export in package.json,
  re-export from `index.ts`), `packages/api-contract/src/analytics.test.ts`,
  `apps/api/src/migrations/0016_analytics.ts`, `apps/api/src/queries/analytics.ts`,
  `apps/api/src/analytics/visitor.ts`, `apps/api/src/analytics/ingest.ts`,
  `apps/api/src/analytics/ingest.test.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/db.ts`, `apps/api/src/router.ts`
  (`analytics.ingest` handler), `packages/api-contract/src/index.ts` (procedure),
  `apps/api/src/env.ts` (+ test: `ANALYTICS_RATE_LIMIT`), `apps/api/src/server.ts` (limiters)

**Interfaces — Produces:**

```ts
// @repo/api-contract/analytics (zod-only, no other contract imports)
export const ANALYTICS_EVENTS = {
  signed_up: { client: false, props: { method: z.enum(["password", "google", "github", "apple", "magic_link"]) } },
  email_verified: { client: false, props: {} },
  workspace_created: { client: false, props: {} },
  member_invited: { client: false, props: { role: z.string().max(20) } },
  invitation_accepted: { client: false, props: {} },
  note_created: { client: false, props: {} },
  plan_changed: { client: false, props: { plan: z.string().max(20), interval: z.string().max(10) } },
  two_factor_enabled: { client: false, props: {} },
  pricing_viewed: { client: true, props: {} },
} as const
export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS
export const ANALYTICS_PROPS_MAX_BYTES = 1024
export function parseEventProps(name: AnalyticsEventName, props: unknown): Record<string, unknown> | null // strict: unknown keys refused
export const AnalyticsIngestSchema = z.object({
  app: TelemetryAppSchema,            // reuse the telemetry app list
  kind: z.enum(["pageview", "event"]),
  path: z.string().max(300).optional(),
  referrerHost: z.string().max(253).optional(),
  name: z.string().max(40).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  userId: z.number().int().positive().optional(),
  workspaceId: z.number().int().positive().optional(),
  ip: z.string().max(45).optional(),
  userAgent: z.string().max(500).optional(),
})
// api
export function visitorId(salt: string, app: string, ip: string, userAgent: string): string // 16 hex
analyticsQueries(sql): {
  saltFor(day: string): Promise<string>            // creates today's salt on first use; concurrent-safe (INSERT … ON CONFLICT DO NOTHING then SELECT)
  insertPageview(row): Promise<void>
  insertEvent(row): Promise<void>
  // rollup / prune / summary queries are added in Tasks 2 and 5
}
```

`analytics.ingest` (service token; procedure `analytics.ingest`, route `POST /analytics/ingest`):
for `pageview`, require `path`; collapse it with the same rule telemetry uses
(`collapseRoute` from `@repo/telemetry/browser` — if importing it into the api is awkward, move the
pure function into `@repo/api-contract/analytics` and re-export it from telemetry) and drop any
query string; for `event`, require a known `name` with `client: true` (the route is the browser's
path; server events never come through ingest) and valid props. Compute `visitor_id` when `ip` and
`userAgent` are present (else null); store `userId` / `workspaceId` only as given; never store `ip`
/ `userAgent`. Limiters: `analytics:<client id>` at `ANALYTICS_RATE_LIMIT` per minute and
`analytics-app:<app>` at 6000 per minute — a tripped limit answers success silently (like telemetry).

- [ ] **Step 1: Failing tests** — `analytics.test.ts` (contract): every event's props schema;
  `parseEventProps` refuses unknown keys and oversized JSON (> 1024 bytes). `ingest.test.ts` (real
  server via `start()`, SQLite + Postgres):
  1. a pageview with ip/ua stores `visitor_id` (16 hex) and no ip/ua anywhere in the row (select all
     columns).
  2. same ip/ua/app/day → same visitor id; another app or ip → different.
  3. `/invitations/abc123def456ghi789` with `?token=x` stores `/invitations/:id` (Review Focus 4).
  4. a client event `pricing_viewed` is stored; `signed_up` via ingest is refused; unknown name
     refused; a non-allowlisted prop refused.
  5. userId/workspaceId stored only when sent.
  6. limiter: with a limit of 2, the third ingest answers success but stores nothing (Review Focus 1).
  7. concurrent `saltFor(today)` × 10 → one salt row, all equal (Review Focus 2).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the contract file, migration `0016_analytics` (tables and indexes exactly
  as the spec's table; `analytics_daily` unique on `(day, kind, app, key)`), queries, `visitor.ts`
  (`Bun.CryptoHasher("sha256")`), `ingest.ts` (pure validation + shaping, used by the handler), the
  procedure and handler, env + limiters.
- [ ] **Step 4: Run** — `cd apps/api && bun test src/analytics`, `cd packages/api-contract && bun test`,
  full api suite once (+ Postgres via `TEST_DATABASE_URL` or a throwaway container, removed after),
  root typecheck, `bunx biome ci .`.
- [ ] **Step 5: Commit** — `feat(api,api-contract): analytics storage, visitor hash and ingest`

---

### Task 2: Product events, rollup and prune

**Files:**
- Create: `apps/api/src/analytics/record.ts`, `apps/api/src/jobs/builtin/analytics.ts`,
  `apps/api/src/analytics/record.test.ts`, `apps/api/src/jobs/builtin/analytics.test.ts`
- Modify: `apps/api/src/router.ts` (instrument the procedures), `apps/api/src/billing/mirror.ts`
  (plan change), `apps/api/src/jobs/registry.ts`, `apps/api/src/queries/analytics.ts`

**Interfaces — Produces:**

```ts
export function recordEvent<N extends AnalyticsEventName>(
  context: { enqueue: Enqueue }, name: N, ids: { userId: number | null; workspaceId: number | null },
  props: Record<string, unknown>, options?: { tx?: Queries }
): Promise<void> // enqueues analytics.event; never throws to the caller (logs via recordFailure)
export const analyticsEventJob: JobDefinition<{ name: AnalyticsEventName; userId: number | null; workspaceId: number | null; props: Record<string, unknown>; at: string }>
export const analyticsRollupJob: JobDefinition<{ day?: string }> // default: yesterday (UTC)
export const analyticsPruneJob: JobDefinition<Record<string, never>>
// queries
rollup(day: string): Promise<void>   // delete-then-insert the day's analytics_daily rows in one transaction (idempotent)
prune(before: string, saltsBefore: string): Promise<{ pageviews: number; events: number; salts: number }>
```

Instrument (after the write; inside `tx` when the write is transactional): `auth.signUp`
(`method: "password"`), provider sign-up / magic-link account creation (`method` = provider or
`magic_link` — find where `users.create` runs in those paths), `auth.verifyEmail`,
`workspaces.create`, `workspaces.invitations.create` (`role`), `invitations.accept` and
`acceptById`, `notes.create`, the billing mirror when the plan changes (`plan`, `interval`),
`account.twoFactor.enable`. Schedules `analytics.rollup` `10 0 * * *` and `analytics.prune`
`20 0 * * *` added to `SCHEDULES`. Retention from `ANALYTICS_RETENTION_DAYS` (pass through the job
context or read once at boot).

- [ ] **Step 1: Failing tests** — `record.test.ts`: each instrumented procedure, after `drain()`,
  leaves exactly one `analytics_events` row with the right name/ids/props; a procedure whose write
  fails or rolls back leaves none. `analytics.test.ts` (jobs): rollup of a day with 3 pageviews from
  2 visitors on `/notes` and 2 `note_created` → `analytics_daily` page row count 3 visitors 2, event
  row count 2; running it twice → same rows (Review Focus 3); rows at 23:59:59 and 00:00:01 land in
  their own days (Review Focus 2); prune deletes raw rows older than retention and salts older than
  today, keeps `analytics_daily`.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `cd apps/api && bun test src/analytics src/jobs`, full api suite (+ Postgres),
  root typecheck, `bunx biome ci .`.
- [ ] **Step 5: Commit** — `feat(api): record product events, roll up and prune analytics`

---

### Task 3: Provider seam (PostHog, Plausible)

**Files:**
- Create: `apps/api/src/analytics/providers/{provider,posthog,plausible,create-provider}.ts`,
  `apps/api/src/analytics/providers/providers.test.ts`
- Modify: `apps/api/src/env.ts` (+ test), `apps/api/src/server-options.ts` (+ test),
  `apps/api/src/server.ts`, `apps/api/src/jobs/builtin/analytics.ts` (`analytics.forward`),
  `apps/api/src/analytics/ingest.ts` and the event job (enqueue a forward when the provider isn't
  `store`), root and `apps/api/.env.example`

**Interfaces — Produces:**

```ts
export type AnalyticsProvider = {
  kind: "store" | "posthog" | "plausible"
  forward(item: ForwardItem): Promise<void> // throws on network error / 5xx / 429 (retried); 4xx logged and dropped
}
export type ForwardItem =
  | { kind: "pageview"; app: string; path: string; referrerHost: string | null; visitorId: string | null; userId: number | null; at: string }
  | { kind: "event"; name: string; props: Record<string, unknown>; visitorId: string | null; userId: number | null; at: string }
export function createAnalyticsProvider(env, opts: { fetch?: typeof fetch; siteUrl: (app: string) => string }): AnalyticsProvider
export const analyticsForwardJob: JobDefinition<ForwardItem>
```

PostHog: `POST ${POSTHOG_HOST}/i/v0/e/` body `{ api_key, event, distinct_id, properties, timestamp }`
— `event` is `$pageview` (with `properties.$current_url = siteUrl(app) + path`) or the event name;
`distinct_id` = `user:<id>` when `userId` else `visitor:<visitorId>` else `anonymous`;
`properties.$ip = null`; no user agent. Plausible: `POST ${PLAUSIBLE_HOST}/api/event` with headers
`content-type: application/json`, `user-agent: boilerplate-bun analytics` and body
`{ domain: PLAUSIBLE_DOMAIN, name: "pageview" | <event>, url: siteUrl(app) + path, referrer?, props? }`;
no `X-Forwarded-For`. `store` forwards nothing (no job enqueued). Env refuses a chosen provider whose
vars are missing (naming them).

- [ ] **Step 1: Failing tests** — with a fake `fetch`: exact PostHog and Plausible request shapes
  for a pageview and an event; `distinct_id` rules; no ip / user agent of the client anywhere in the
  request; 503 → `forward` throws (the job retries; drive it to dead after maxAttempts with the
  injected clock — Review Focus 5); 400 → resolves and logs; env errors for missing vars; `store`
  enqueues no forward.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `cd apps/api && bun test src/analytics`, full api suite, root typecheck,
  `bunx biome ci .`.
- [ ] **Step 5: Commit** — `feat(api): forward analytics to PostHog or Plausible`

---

### Task 4: Browser beacons, the route and `<Analytics />`

**Files:**
- Create: `packages/telemetry/src/analytics.ts` (+ `"./analytics"` export),
  `packages/telemetry/src/analytics.test.ts`, `packages/ui/src/components/analytics.tsx`
  (+ test), `apps/{www,app,auth,account,docs,help,jobs}/src/app/api/analytics/route.ts`
- Modify: `packages/telemetry/src/server.ts` (`createAnalyticsRoute`) + `server.test.ts`, the seven
  root layouts (`apps/account`'s `(account)` layout like `WebVitals`/`CookieConsent`)

**Interfaces — Produces:**

```ts
// @repo/telemetry/analytics (browser; no React)
export function sendPageview(pathname: string, referrer: string): void // sendBeacon to /api/analytics; skips when navigator.doNotTrack === "1"
export function track(name: string, props?: Record<string, unknown>): void
// @repo/telemetry/server
export function createAnalyticsRoute(options: {
  app: TelemetryApp
  identity?: (req: Request) => Promise<{ userId: number; workspaceId: number | null } | null> // signed-in apps only
  env?: () => { API_URL: string; API_SERVICE_TOKEN: string } | null
  fetch?: typeof fetch
}): (req: Request) => Promise<Response>
// @repo/ui/components/analytics
export function Analytics(): null // client component: sendPageview on mount and on usePathname() change; nothing in development
```

Route rules: refuse (204, no forward) a non-JSON content type or a cross-site `sec-fetch-site`;
drop bots (user agent matching `/bot|crawl|spider|preview|headless/i`); parse the body (pageview
or event, size-capped like telemetry); referrer reduced to its host and dropped when it equals the
request's host; read the `consent` cookie with `parseConsent` — only when `all` call `identity(req)`;
forward to `analytics.ingest` with the service token, ip (`clientIp`) and user agent, client id
`analytics:<ip hash>`; outside production fall back to the dev api URL/token like
`createTelemetryRoute`; swallow every error; always 204. Signed-in apps (`app`, `auth`, `account`)
pass `identity` built from their `getAuth()` (user + `resolveWorkspaceFromRequest`); the static apps
pass none.

- [ ] **Step 1: Failing tests** — `analytics.test.ts` (telemetry browser): `sendPageview` posts the
  collapsed path without the query string (Review Focus 4) and is skipped with Do Not Track; `track`
  posts name/props. `server.test.ts`: 204 always (including a throwing upstream); cross-site and
  non-JSON refused (no forward); bots dropped; with consent `necessary` the forward has no ids and
  `identity` is not called; with `all` ids are included; referrer host same-origin dropped.
  `analytics.tsx` test via `renderToStaticMarkup`: renders nothing.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the modules, the seven route files and the seven layout additions.
- [ ] **Step 4: Run** — `cd packages/telemetry && bun test`, `cd packages/ui && bun test`, root
  typecheck, `bun run --filter @repo/ui typecheck`, `bunx biome ci .`, and build all seven Next
  apps (the static apps must stay static: check the build output marks `www`'s pages `○`).
- [ ] **Step 5: Commit** — `feat(telemetry,ui): cookieless pageviews and client events from every app`

---

### Task 5: The analytics dashboard

**Files:**
- Modify: `packages/api-contract/src/admin.ts` + `index.ts` (`admin.analytics.summary`),
  `apps/api/src/queries/analytics.ts` (summary queries), `apps/api/src/router.ts`,
  `apps/api/src/admin-api.test.ts`
- Create: `apps/auth/src/app/admin/(gated)/analytics/page.tsx`,
  `apps/auth/src/views/admin-analytics-view.tsx`; link from the `/admin` home view

**Interfaces — Produces:**

```ts
export const AnalyticsSummarySchema = z.object({
  days: z.array(z.object({ day: z.string(), visitors: z.number().int(), pageviews: z.number().int() })),
  topPages: z.array(z.object({ app: z.string(), path: z.string(), pageviews: z.number().int() })), // top 10
  topReferrers: z.array(z.object({ host: z.string(), pageviews: z.number().int() })),              // top 10
  events: z.array(z.object({ day: z.string(), name: z.string(), count: z.number().int() })),
  funnel: z.array(z.object({ step: z.string(), users: z.number().int() })), // signed_up, email_verified, workspace_created, activated
})
admin.analytics.summary({ days: 7 | 30 | 90 }) → AnalyticsSummary
```

Data: past days from `analytics_daily`, today from raw rows (same aggregation). Visitors per day are
summed across apps (the hash is per app, as the spec states — note it in the view's help text).
Funnel: users with `signed_up` in range; of those, users with `email_verified`; then
`workspace_created`; then `invitation_accepted` or `note_created` ("activated"). Top referrers from
raw rows within retention. The page: a range selector (links `?days=7|30|90`), an area chart of
visitors and pageviews (`@repo/ui/components/charts`), two tables, an events table and the funnel
with percentages; works without JavaScript except the chart's tooltip.

- [ ] **Step 1: Failing tests** — api: seeded pageviews/events across days produce the expected
  series, top lists and funnel (including a user who verified but never signed up in range — not
  counted); NOT_FOUND for a non-admin and an impersonation session.
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `cd apps/api && bun test src/admin-api.test.ts src/analytics`, `cd apps/auth &&
  bun test`, root typecheck, `bunx biome ci .`, `bun --filter @repo/auth build`.
- [ ] **Step 5: Commit** — `feat(api,auth): superadmin analytics dashboard`

---

### Task 6: e2e, privacy text, docs, full gate

**Files:**
- Create: `apps/e2e/tests/analytics.spec.ts`, `docs/guides/analytics.md`
- Modify: `apps/www/src/content/` privacy content (an "Analytics" section with owner placeholders),
  CLAUDE.md, `packages/telemetry/README.md`, `apps/api/README.md`, `apps/auth/README.md`,
  `apps/e2e/README.md`, `docs/guides/deploying.md`, `docs/ROADMAP.md`, root and
  `apps/api/.env.example`

- [ ] **Step 1: e2e** — visit `www` `/` (pageview); sign up and verify (`signed_up`,
  `email_verified`); as the e2e superadmin (the admin spec's fixture) open `/admin/analytics` → today
  shows at least one visitor and pageview, and the funnel's `signed_up` step is ≥ 1. The e2e api runs
  the in-process worker, so the event jobs drain on their own (poll the page with `expect.poll` /
  reload rather than sleeping).
- [ ] **Step 2: Docs**
  - CLAUDE.md: an **Analytics.** paragraph in the house style (vocabulary and the client/server
    split, cookieless visitor hash and salt rotation, consent rule, never-stored fields, storage and
    retention, rollup/prune schedules, `recordEvent` via the queue, the route and `<Analytics />`,
    the provider seam, the dashboard, migration `0016`); env rows; "Adding a new subdomain app" gains
    the `/api/analytics` route and `<Analytics />`; the Telemetry and Cookie consent paragraphs
    mention analytics; e2e counts (`--list`).
  - READMEs: telemetry (`analytics` module and `createAnalyticsRoute`), api (ingest, jobs, providers,
    summary), auth (dashboard). `docs/guides/analytics.md`: adding a product event (contract →
    `recordEvent` → dashboard), client events, PostHog / Plausible setup, consent, the privacy text to
    adapt. Deploying guide env rows. ROADMAP: tick **E Product analytics**.
- [ ] **Step 3: Full gate** — `bun run ci` exit 0; build www/app/auth/account and
  `cd apps/e2e && CI=1 bunx playwright test --retries=0` — every test passes.
- [ ] **Step 4: Commit** — `test(e2e): analytics journey` and `docs: analytics guide and privacy
  text` (two commits).
