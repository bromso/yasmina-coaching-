# Product analytics — design

Sub-project E of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content → G i18n). Approved in chat section by section on
2026-10-06.

## Intent

The starter counts what its owners need to run a product — visitors, pages, and the product events
that matter (sign-ups, verifications, workspaces, invitations, notes, plan changes) — in its own
database, shown on a superadmin dashboard, without cookies by default and without anything
identifying unless the visitor consented. A provider seam forwards the same data to PostHog or
Plausible for teams that want a hosted tool.

Decided with the owner:

- Scope: **first-party storage + dashboard + a provider seam** (not provider-only, not first-party
  only).
- Product events come from **the api** (authoritative, not blockable, not forgeable); pageviews and
  UI-only events come from the browser.

## 1. Data, identity and privacy

**Cookieless visitors** — a pageview carries a `visitor_id` the api computes as the first 16 hex
chars of `sha256(daily salt + app + client ip + user agent)`. The salt is random per UTC day, stored
in `analytics_daily_salts`, and deleted the day after; unique visitors are countable per day and
app, nobody is followable across days or apps, and no cookie is set — so pageviews need no consent.
The ip and user agent are used for the hash and never stored.

**With consent `all`** (the existing `consent` cookie) — a signed-in user's pageviews and client
events also carry `user_id` and the current `workspace_id`.

**Product events** from the api always carry `user_id` / `workspace_id` (actions on the account,
data the app already holds) and never an ip, user agent, email, name or free text.

**Storage** — migration `0016_analytics`:

| Table | Columns |
|---|---|
| `analytics_pageviews` | `id`, `app`, `path` (opaque segments collapsed to `:id`, as telemetry does), `referrer_host` (host only, or null), `visitor_id`, `user_id` (consent only), `workspace_id` (consent only), `day` (`YYYY-MM-DD`), `created_at` |
| `analytics_events` | `id`, `name`, `source` (`api` or the app id), `user_id`, `workspace_id`, `props` (JSON, ≤ 1 KB), `visitor_id` (client events only), `day`, `created_at` |
| `analytics_daily_salts` | `day` (PK), `salt` |
| `analytics_daily` | `day`, `kind` (`page` / `event`), `app`, `key` (path or event name), `count`, `visitors` — unique per (`day`, `kind`, `app`, `key`) |

Indexes on `day` (both raw tables) and `(name, day)` for events. Raw rows are kept
`ANALYTICS_RETENTION_DAYS` (default 90); `analytics_daily` is kept indefinitely.

**Event vocabulary** — `ANALYTICS_EVENTS` in `@repo/api-contract` (`analytics.ts`): each entry has a
name, `client: boolean` (may the browser send it), and an allowlist of prop keys with simple types:

| Event | Source | Props |
|---|---|---|
| `signed_up` | api | `method`: `password` \| `google` \| `github` \| `apple` \| `magic_link` |
| `email_verified` | api | — |
| `workspace_created` | api | — |
| `member_invited` | api | `role` |
| `invitation_accepted` | api | — |
| `note_created` | api | — |
| `plan_changed` | api | `plan`, `interval` |
| `two_factor_enabled` | api | — |
| `pricing_viewed` | client | — |

Client `track()` accepts only `client: true` names; anything else is refused at ingest.

## 2. Collecting, the provider seam, the dashboard

**Browser** — `@repo/telemetry` gains `analytics` exports:

- `<Analytics />` (`@repo/telemetry/analytics` client component, re-exported for layouts) next to
  `<WebVitals />` in all seven root layouts: a pageview on load and on every client navigation
  (`usePathname`); skipped in development and when `navigator.doNotTrack === "1"`.
- `track(name, props?)` for client events.
- Both `sendBeacon` to the app's own `POST /api/analytics`; payload: `{ kind: "pageview", path,
  referrer }` or `{ kind: "event", name, props }`.

**Route** — `createAnalyticsRoute({ app })` from `@repo/telemetry/server`, a three-line
`src/app/api/analytics/route.ts` per app (like `/api/telemetry`): refuses a non-JSON content type or
`sec-fetch-site` other than `same-origin` / `none`; drops bots (user agent check); reads the consent
cookie and, only when it is `all`, resolves the session's user and current workspace (the static
apps have no session and send none); forwards `{ app, kind, path, referrerHost, name?, props?,
userId?, workspaceId?, ip, userAgent }` to `analytics.ingest` with the service token and an
`analytics:<ip hash>` client id. Always answers 204; never throws.

**api**

- `analytics.ingest` (service token): validates against `ANALYTICS_EVENTS` (client-allowed names,
  allowlisted props, ≤ 1 KB), collapses the path, keeps the referrer host only when it differs from
  the app's own host, computes `visitor_id` from today's salt (creating it on first use), writes the
  row, discards ip and user agent. Rate-limited per client id (`ANALYTICS_RATE_LIMIT`, default 120
  per minute) and per app (6000 per minute).
- `recordEvent(context, name, props)`: enqueues an `analytics.event` job after the write commits
  (inside the caller's `tx` when there is one), so it never slows or fails the request. Called from
  the procedures behind each api event (`auth.signUp` and the provider/magic-link account creation,
  `auth.verifyEmail`, `workspaces.create`, `workspaces.invitations.create`, `invitations.accept` /
  `acceptById`, `notes.create`, the billing mirror on a plan change, `account.twoFactor.enable`).
- Jobs and schedules (sub-project C): `analytics.event` (insert + provider forward),
  `analytics.forward` (provider delivery, retried), `analytics.rollup` daily at 00:10 UTC (rebuilds
  yesterday's `analytics_daily` rows idempotently), `analytics.prune` daily at 00:20 UTC (raw rows
  past retention; salts older than today).

**Provider seam** — `ANALYTICS_PROVIDER=store|posthog|plausible` (default `store`); the tables are
always written.

- `posthog`: `POST ${POSTHOG_HOST}/i/v0/e/` (or `/capture/`) per event with `api_key`
  (`POSTHOG_KEY`); `distinct_id` = `user:<id>` when the row has a user, else `visitor:<visitor_id>`;
  pageviews as `$pageview` with `$current_url` built from the app's site URL and the collapsed path;
  never an ip (`$ip` explicitly null) or user agent.
- `plausible`: `POST ${PLAUSIBLE_HOST}/api/event` with `domain` = `PLAUSIBLE_DOMAIN`, `name`
  (`pageview` or the event), `url`; the api sends its own placeholder user agent and no client ip, so
  Plausible's own visitor counting is not used — counts come from our tables.
- Forwarding runs as an `analytics.forward` job (retries with backoff). The api exits at startup when
  the chosen provider's variables are missing (`POSTHOG_KEY` + `POSTHOG_HOST`, or
  `PLAUSIBLE_DOMAIN` + `PLAUSIBLE_HOST`).

**Dashboard** — `apps/auth` `/admin/analytics` (a link from `/admin`), superadmin only, backed by
`admin.analytics.summary({ days: 7 | 30 | 90 })` (NOT_FOUND to anyone else, like every `admin.*`):

- visitors and pageviews per day (an area chart from `@repo/ui/components/charts`)
- top pages and top referrer hosts
- product event counts per day (a small table)
- a fixed funnel within the range: users with `signed_up` → of those, `email_verified` →
  `workspace_created` → `invitation_accepted` or `note_created`; counts and step percentages
- served from `analytics_daily` plus today's raw rows; no per-person views

## 3. Testing, privacy notes, docs

**Testing**

- visitor id: same inputs same day/app → same id; another day, app or ip → different; yesterday's
  salt is deleted by the prune; no stored row holds an ip or user agent
- ingest: unknown name refused; a client-sent `signed_up` refused; non-allowlisted or oversized props
  refused; paths collapsed; referrer reduced to host; user/workspace ids present only when the route
  sent them (consent `all`)
- product events: each instrumented procedure enqueues its event; a rolled-back write enqueues none
- rollup idempotent and correct (views, distinct visitors, event counts); prune keeps rollups and
  deletes old salts; funnel counts users in order within the range; `admin.analytics.summary`
  NOT_FOUND to non-admins and impersonation sessions
- providers: PostHog and Plausible payloads checked against a fake `fetch` (shape, `distinct_id`
  rule, no ip / user agent); a provider failure retries via the job
- route: consent handling (ids only with `all`), cross-site refused, bots dropped, always 204
- browser module: skips Do Not Track and development; one pageview per navigation
- e2e: visit `www`, sign up and verify; as the superadmin open `/admin/analytics` → at least one
  pageview and visitor today and a `signed_up` in the funnel

**Privacy notes** — the guide states what is collected without consent (path, referrer host, a
daily visitor hash, account-tied product events), what consent `all` adds (user and workspace ids on
pageviews and client events), and what is never collected (ip, user agent, cookies, email, free
text). The www `/privacy` template gains an "Analytics" section with placeholders the owner fills in.

**Docs** — CLAUDE.md (an **Analytics.** paragraph; env rows `ANALYTICS_PROVIDER`,
`ANALYTICS_RETENTION_DAYS`, `ANALYTICS_RATE_LIMIT`, `POSTHOG_KEY`, `POSTHOG_HOST`, `PLAUSIBLE_DOMAIN`,
`PLAUSIBLE_HOST`; "Adding a new subdomain app" gains the analytics route and `<Analytics />`;
migration `0016`; the Telemetry and Cookie consent paragraphs mention analytics),
`packages/telemetry/README.md`, `apps/api/README.md`, `apps/auth/README.md`, a new
`docs/guides/analytics.md` (adding a product event, client events, PostHog / Plausible, consent and
privacy text), the deploying guide, `.env.example` files, ROADMAP (tick E).

## Out of scope

Session replay, heatmaps, A/B tests and feature flags, per-person timelines, custom funnels or
cohorts in the UI, attribution beyond the referrer host, server-rendered analytics in the static
apps.
