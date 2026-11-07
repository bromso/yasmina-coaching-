# Product analytics

`apps/api` keeps its own first-party record of visitors, pages and the product events that matter
(sign-ups, verifications, workspaces, invitations, notes, plan changes) — shown on a superadmin
dashboard — and can additionally forward the same events to PostHog or Plausible over plain
`fetch` (no SDK, no extra dependency). Nothing here needs a cookie: a pageview is counted with a
daily salted hash of the visitor's IP address and browser, never a cookie, and the tables are
always written regardless of which provider (if any) is configured.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | the root `.env` (copy `.env.example`); `docker-compose.yml` passes `ANALYTICS_PROVIDER`, `ANALYTICS_RETENTION_DAYS`, `ANALYTICS_RATE_LIMIT`, `POSTHOG_KEY`, `POSTHOG_HOST`, `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_HOST` to `api` |
| Production | the api service's environment |

## Adding a product event

1. Add the name to `ANALYTICS_EVENTS` in `packages/api-contract/src/analytics.ts`: `client: false`
   (the api is the only one allowed to send it) unless a browser genuinely needs to, and an
   allowlist of prop keys with simple zod types (strings, enums, numbers — nothing free-text,
   nothing that could carry personal data). Keep every event's encoded props well under 1 KB
   (`ANALYTICS_PROPS_MAX_BYTES`); a prop outside the allowlist, or over the cap, is refused rather
   than silently dropped.
2. Call `recordEvent(context, "your_event", { userId, workspaceId }, props)` from
   `apps/api/src/analytics/record.ts` right after the write it reports on — inside the same
   transaction via `{ tx }` (the `db.transaction` callback's argument) when there is one, so a
   rolled-back write enqueues nothing. `context` just needs `enqueue` and `recordFailure` (every
   router handler and job context already has both). Pass the procedure's own `context`: on an
   impersonation session it carries `impersonating: true`, and `recordEvent` then records nothing
   — what an admin does while acting as a user is never credited to that user — so no call site
   has to remember that check. See `auth.signUp`, `workspaces.create` or `notes.create` in
   `apps/api/src/router.ts` for the pattern.
3. Add a test in `apps/api/src/analytics/record.test.ts` (or alongside the procedure's own test)
   asserting exactly one row with the right name, ids and props lands after `drain()`, and that a
   rolled-back call enqueues none.
4. The event shows up on `/admin/analytics` automatically — the dashboard's events table and funnel
   both read from `ANALYTICS_EVENTS`' names, not a hand-maintained list. Add it to the funnel itself
   only by editing `admin.analytics.summary`'s handler in `apps/api/src/router.ts` (the funnel is a
   fixed four-step sequence, not configurable from the contract).

## Client events

Only an event marked `client: true` in `ANALYTICS_EVENTS` may come from a browser — today, just
`pricing_viewed`. A browser calls:

```ts
import { track } from "@repo/telemetry/analytics"
track("pricing_viewed")
```

`track` (and `sendPageview`, which `<Analytics />` already calls for you) beacons to the app's own
`POST /api/analytics`, which refuses to forward anything that isn't a known `client: true` name with
allowlisted props. See `apps/www/src/components/pricing-view-tracker.tsx` for a complete example: an
`IntersectionObserver` that fires `track("pricing_viewed")` at most once per page load, when the
pricing section scrolls into view.

Adding a client event is the same first step as a product event (name, `client: true`, prop
allowlist) — there is no second contract to update; the browser's `track()` call and the route's own
validation are the only two places that need to agree on the name.

## PostHog

1. Create a project; copy its **Project API Key** and ingestion host (`https://us.i.posthog.com` or
   `https://eu.i.posthog.com`, or your self-hosted instance's URL).
2. Set on the api:
   ```
   ANALYTICS_PROVIDER=posthog
   POSTHOG_KEY=<project api key>
   POSTHOG_HOST=https://us.i.posthog.com
   ```
3. Restart the api. A malformed `POSTHOG_HOST` (not a URL) or a missing `POSTHOG_KEY` fails at
   startup, naming what's missing.

Every pageview and event already written to the first-party tables is also forwarded as a
`analytics.forward` job (retried with backoff on a network error, a timeout, a `5xx` or a `429`; a
dead job shows on `/admin`). PostHog never receives an ip (`$ip: null`) or a user agent, and never
geolocates the api server's own ip onto a visitor (`$geoip_disable: true`). A pageview arrives as
`$pageview` with `$current_url` built from the app's own site URL; a product event keeps its name
and props. `distinct_id` is `user:<id>` when the row has a user; else `workspace:<id>` when it has
a workspace (a Stripe webhook's `plan_changed` has no user); else `visitor:<visitorId>` for a
cookieless pageview or client event; else `"anonymous"`, sent with
`properties.$process_person_profile: false` so PostHog never folds every anonymous hit into one
person. The workspace id is used only for that fallback, never sent as a property. Every forward carries a `uuid` fixed when the
job was enqueued, so a redelivered job (the queue is at-least-once) reaches PostHog as one event,
not two.

## Plausible

1. Add your site in Plausible (or self-host); note the registered domain and the instance's host
   (`https://plausible.io` for the hosted service, or your own URL).
2. Set on the api:
   ```
   ANALYTICS_PROVIDER=plausible
   PLAUSIBLE_DOMAIN=<your registered domain>
   PLAUSIBLE_HOST=https://plausible.io
   ```
3. Restart the api.

Two accepted limitations, deliberately not worked around (see `apps/api/src/analytics/providers/
plausible.ts`'s doc comment): Plausible's event API has no idempotency key, so a redelivered
forward can double-count on Plausible's side — the first-party `analytics_daily` tables never
double-count (the insert that produced a row already committed exactly once) and remain the source
of truth; and every forward carries the api's own honest user agent, `boilerplate-bun analytics`,
never a faked browser one, which Plausible's own (undocumented) bot filtering may classify as a bot
and drop silently — again harmless, since the hit was already counted first-party before the
request to Plausible was ever made.

## What the numbers mean

- **Every verified account counts as verified.** `email_verified` is recorded wherever an email
  becomes verified, not only by `auth.verifyEmail`: an account created by Google, GitHub or Apple
  sign-in or by a magic link (created verified), and an unverified account a magic link or a
  verified provider email takes over (`purgeUnverifiedAccount`, inside its transaction). Each
  account gets it once: the purge only runs on a never-verified account, and `auth.verifyEmail`
  skips the event for an account that is already verified (an old verify link followed after a
  magic link, say). So an OAuth or magic-link sign-up moves through the funnel like a password one.
- **Counts are at least once.** An event row is written by an `analytics.event` job and the queue
  delivers at least once (see `docs/guides/background-jobs.md`), so a worker that crashes after the
  insert but before the job is marked done runs it again and the event is counted twice. That
  touches the events table and its daily totals, never the funnel: each funnel step counts
  distinct users, so a duplicate row changes nothing there.
- **The nightly rollup rebuilds two days.** `analytics.rollup` (`10 0 * * *`) rebuilds yesterday
  and the day before (UTC). An event job still queued or retrying at 00:10 lands its row on
  yesterday after that day's first rollup; the next night rebuilds that day again, so the late row
  reaches the dashboard instead of being lost. Each rebuild is idempotent. A payload naming one
  day (`{ day: "YYYY-MM-DD" }`, enqueued by hand) still rebuilds only that day. A day with no raw
  rows left (past retention) is skipped, so its existing `analytics_daily` rows, by then its only
  record, are never wiped.
- **Retention limits the funnel and top referrers.** `ANALYTICS_RETENTION_DAYS` (default 90) is
  how long `analytics.prune` keeps the raw pageview and event rows. The days chart, top pages and
  events table read `analytics_daily`, which is kept indefinitely, but the funnel and top referrers
  read raw rows. With a retention shorter than the selected range they cover only the retained
  days, and the dashboard says so under the range picker.
- **Prune never outruns the rollup.** `analytics.prune` (`20 0 * * *`) floors its cutoff at the
  older of the retention cutoff and the oldest day the nightly rollup still rebuilds (`rollupDays`'
  first entry, the day before yesterday) — never yesterday or today's raw rows, however short
  `ANALYTICS_RETENTION_DAYS` is set. With `ANALYTICS_RETENTION_DAYS=1`, raw rows are therefore kept
  two days in practice: the setting still governs retention past that floor.
- **Our own apps are not referrers.** Ingest drops a referrer host that is the `SITE_DOMAIN` parent
  domain or any `*.<domain>` (from `@repo/sites`' `siteDomain()`), so moving from www to app is not
  counted as an external referral.
- **Impersonation records nothing.** A product event done in an impersonation session is skipped
  (see step 2 of *Adding a product event*), and the browser sends no ids on pageviews then either.
- **The visitor hash is best-effort.** The per-browser rate-limit key and the visitor hash are
  only as trustworthy as the `x-forwarded-for` / `x-real-ip` the app sees, the same best-effort as
  telemetry (see **Authentication** in `CLAUDE.md`).

## Switching back to `store`

`ANALYTICS_PROVIDER=store` (the default, or simply unsetting it) stops every forward; nothing
already written to `analytics_pageviews` / `analytics_events` / `analytics_daily` is deleted or
backfilled, and the dashboard is unaffected either way — it always reads the first-party tables,
never a provider.

## Consent

A pageview and a client event need no consent at all: the visitor is counted with
`visitorId(dailySalt, app, ip, userAgent)` — the first 16 hex characters of a sha256 hash, salted
per UTC day (`analytics_daily_salts`, deleted the day after) — and the ip and user agent themselves
are discarded the instant the hash is computed, never written anywhere. Only when the existing
`consent` cookie (the same one the cookie banner writes) is `all` does a pageview or client event
also carry the signed-in visitor's user id and current workspace id, resolved by each app's own
`/api/analytics` route (`identity`, `@repo/session`'s `getMeFromRequest` + `analyticsIdentity`) —
and never while an admin is impersonating, even with consent `all`. A product event recorded by the
api itself (`recordEvent`) always carries the account's ids regardless of consent: it is already
account-tied data the api holds for its own purposes, not something the visitor's browser disclosed.
If a provider is configured, those account-linked product events are forwarded to it as well.

## Privacy text

The `/privacy` template (`apps/www/src/content/privacy.ts`) has an **Analytics** section stating
exactly this: what is collected without consent (the page path, the referrer's host, a one-day
visitor hash, and — for a signed-in account — the product events it takes, linked to the account
whatever the visitor chose), what consent `all` adds (user and workspace ids on pageviews and
client events), that a configured provider receives that account-linked data too, and what is
never collected (an ip
address, a browser user agent, a name, an email address or anything typed into a form). It carries
the same `[Placeholder]` convention as the rest of the template — a retention day count and an
optional sentence naming a configured provider — for the owner to fill in or delete before
publishing; have counsel review the whole page first, as the template's own header note says.
