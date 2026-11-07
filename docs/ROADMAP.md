# Roadmap

Polish and gaps found by a five-area audit (frontend, backend, tooling, docs, and a comparison with
current starter kits) on 2026-09-29. Phases run in order; each lands as its own pull request. Tick
an item when its PR merges.

## Phase 1 — Hygiene: things that are broken now

- [x] Dependabot uses the `bun` ecosystem (every run failed on `npm`) and proposes minor updates
- [x] Repo identity: `kitchensink-react` / `boilerplate` links → `bromso/boilerplate-bun`
- [x] `docs` / `help` / `jobs` health routes report their own name
- [x] App CHANGELOGs carry their own package name, without the Helm / `apps/legal` leftovers
- [x] `www`'s 404 page stops linking to a `/contact` page that does not exist
- [x] Every app's `.gitignore` lets `.env.example` through; `.gitignore` says why `.mcp.json` is committed
- [x] `apps/api/.env.example`
- [x] The api README stops promising Postgres/MySQL work unchanged (the table DDL is SQLite-only)
- [x] CLAUDE.md counts and slash-command list match the repo
- [x] Claude tooling: `feature-builder` agent, `/test`, `skills-lock.json`, `.claude/settings.json`,
      `add-mdx-page` eval fixtures
- [x] Shipped plans and specs move to `docs/archive/`, so nothing reads as open work
- [x] `apps/app` README lists its routes

## Phase 2 — Cleanup: dead weight and drift

- [x] Delete the unused `apps/app` scaffolding copied into `docs` / `help` / `jobs` (54 files), and
      the dependencies only it used
- [x] `packages/ui`: drop phantom dependencies
- [x] CI planner treats repo config (issue templates, commitlint, lint-staged, CODEOWNERS,
      `.editorconfig`) as lint-only instead of running everything
- [x] In-range tool updates (Biome 2.5, Tailwind 4.3 through the catalog, commit tooling)
- [x] Release story: `release.yml` repaired, kept disabled until the owner turns it on
- [x] CODEOWNERS covers every workspace
- [x] Every Next app keeps `console.error` / `console.warn` in production builds
- [x] One Base UI package instead of two: port the 16 animate-ui files from
      `@base-ui-components/react` (rc.0) to `@base-ui/react` (1.x) — the stable API changed
      (`Tooltip` lost `delay`, `Accordion` values are generic), so it is a port, not a rename
  - Follow-ups
    - [x] dead Tailwind selectors left from the Radix versions (the same on rc.0): Base `tabs`
          `data-[selected]` → `data-[active=true]` (the motion highlight sets `"true"` / `"false"`),
          `toggle` `data-[state=on]` → `data-[pressed]` (present only when pressed), `menu`
          `data-[state=open]` → `data-[popup-open]`, `dialog` Close's `data-[open]`
    - [x] Accordion: a cancelled change (`eventDetails.cancel()`) or a controlled parent that refuses
          it still flips the local open state (`useControlledState` sets it before `onChange`)

## Phase 3 — Hardening what already exists

- [x] `apps/api`: request guard, rate limit, body-size cap and a generic `error()` handler, like `apps/ai`
- [x] Security headers from one place in `@repo/ui`, applied to every Next app; no `unsafe-eval`
- [x] `error.tsx` and `not-found.tsx` in every Next app; no root `loading.tsx` in any of them since
      the e2e tests (it hides static pages without JavaScript and wedges revalidating server actions
      in the dynamic apps — see **Status pages** in CLAUDE.md)
- [x] Graceful shutdown (SIGTERM) and a readiness check that touches the database / provider
      — the ai readiness check deliberately does not call the provider
- [x] Versioned migrations instead of `CREATE TABLE IF NOT EXISTS`; Postgres actually works
- [x] `notes.list` pagination; one error shape across both services

## Phase 4 — Authentication (needs its own design)

- [x] Sessions in `apps/api` (`Bun.password`, cookies on the parent domain), CSRF protection,
      a shared `requireUser` every Next app can use, and `apps/auth` / `apps/account` wired to it
  - [x] 4a api sessions + @repo/session + brand.localhost
  - [x] 4b apps/auth + apps/app (+ boot-time env check via `instrumentation.ts`)
  - [x] 4c apps/account (name, password, devices with revoke; the other sections stay mockups)
  - Follow-ups
    - [x] api-side sign-up limiter independent of the client id
    - [x] api-wide magic-link cap (the same inbox-flooding path as sign-up)
    - [x] password-reset requests get an api-wide cap (`PASSWORD_RESET_RATE_LIMIT`)
    - [x] bound the in-memory limiters' key count (`maxKeys`, default 50,000)
    - [x] log (throttled) when a silent api-wide cap trips (`reset:global`, `magic:global`), so
          operators see that users are being refused

## Phase 5 — Features a builder will miss

- [x] Shared site header / footer and cross-app navigation
- [x] Error tracking and a production destination for web vitals
- [x] Browser end-to-end tests for the Next apps
- [x] Guides: deploying, renaming the brand, removing apps you do not need
  - Follow-ups
    - [x] `apps/auth`'s login form links `/terms` and `/privacy` on the auth host, where they
          404 (pre-existing)
    - [x] the `chat` feature vocabulary is spread across `apps/www` copy, `apps/account` labels
          and four test files
    - [x] `scripts/ci-plan.test.ts` hard-codes the app list in several places
    - [x] e2e logs "Too many telemetry events" on every run — `next start` fills `x-forwarded-for` from
          the socket, so every e2e browser is 127.0.0.1; e2e raises `TELEMETRY_RATE_LIMIT`

## Phase 6 — the week-one layer

What a builder otherwise writes in their first week, in six sub-projects, each its own spec and pull
request. Scope, order and dependencies: `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`.
**Phase 6 complete.**

- [x] 6a Email: `log` / `smtp` / `resend` providers, React Email templates in `@repo/email`, soft
      email verification
- [x] 6b Social and magic-link sign-in: Google, GitHub and Apple via `/oauth` in `apps/auth`,
      magic link, passwordless accounts, sign-in methods in `apps/account`
- [x] 6c Marketing kit: landing blocks in `@repo/ui`, `/terms` and `/privacy`, OG images,
      sitemaps and robots from `@repo/sites`, a waitlist backed by `apps/api`, cookie consent
- [x] 6d Billing: Free / Pro / Team plans in the contract, Stripe Checkout, Customer Portal and a
      signed webhook behind a provider seam with a keyless mock, seat limits and a paid `/chat`, the
      Payments section in `apps/account`, `apps/www` pricing from the plans
- [x] 6e Organisations: workspaces with `owner` / `admin` / `member` / `viewer` roles, email
      invitations, a switcher in `UserMenu`, notes per workspace, the Workspace section in `apps/account`
- [x] 6f Admin: computed superadmins (`SUPERADMIN_EMAILS`), `apps/auth` `/admin` (metrics, users,
      workspaces, audit log), time-limited impersonation with a banner and api-enforced limits on
      security and money mutations, an append-only audit log

## Phase 7 — feature parity

What the benchmark's fuller kits ship that this one still lacks, agreed with the owner on
2026-10-05. Seven sub-projects in order, each its own spec, plan and pull request.

- [x] A Two-factor: TOTP (authenticator app) and recovery codes on every sign-in method, a challenge
      token between the two steps, the `/login/verify` code step in `apps/auth`, the enrolment card
      on `apps/account`'s Security page, an audited admin reset for a lost phone
- [x] B File storage: one storage seam in `apps/api` (local disk by default, any S3-compatible
      bucket by env, SeaweedFS in Compose), profile photos and workspace logos uploaded through
      `apps/account`, validated by their bytes with metadata stripped, served from each signed-in
      app's own `/files` route and shown in the user menu and the admin views
- [x] C Background jobs: a durable queue in the api's own database (SQLite or Postgres), retries
      with backoff, cron schedules, a typed `defineJob` / `enqueue` API with transactional enqueue;
      every mail, storage delete, Sentry forward and prune moved onto it; in-process by default or a
      dedicated worker (`src/worker.ts`, the Compose `worker` profile); dead jobs with Retry and
      Discard on `/admin`
- [x] D Realtime: Server-Sent Events from `apps/api` relayed through each app's own `/api/events`
      (no CSP change), an in-process bus on SQLite and Postgres `NOTIFY` / `LISTEN` across
      replicas, events published after commit; live notes and a "Here now" presence row on
      `apps/app`'s `/notes`, unchanged without JavaScript
- [x] E Product analytics: first-party visitors, pages and product events (sign-ups,
      verifications, workspaces, invitations, notes, plan changes) in the api's own database,
      cookieless by default (a daily salted visitor hash, never an ip or user agent), consent-gated
      user/workspace ids, a superadmin dashboard on `apps/auth`'s `/admin/analytics` (traffic chart,
      top pages/referrers, events, a sign-up funnel), and a provider seam forwarding the same data
      to PostHog or Plausible
- [x] F Content: `apps/blog` (MDX posts, RSS/Atom/JSON feeds, tags and authors) and `apps/docs` (a
      docs engine — `defineDocs` over `content/docs/`, `meta.json` ordering tokens, a `/all` index,
      per-page OG images, a static `/api/search` index behind a ⌘K/Ctrl K dialog), both on
      `@repo/content` (strict frontmatter schemas, shared link/image/heading checks, one
      `ContentError` per build) and headless fumadocs-mdx (no `fumadocs-ui`)
- [x] G i18n: English and Swedish everywhere the product shows text — `@repo/i18n` (static ICU
      catalogs, `negotiateLocale`, the `locale` cookie), per-request resolution shared by every
      Next app (`@repo/session`'s `getLocale`/`setLocale`, cached apart from the signed-in-user
      memo), `apps/auth`, `apps/app` and `apps/account` fully translated (header switcher, a
      **Language** card on Personal info, translated action cores and Zod messages), the static
      apps' switcher writing the shared cookie from a page that itself stays English, the api's
      own messages and `@repo/email`'s templates in the visitor's language, and
      `@repo/i18n-guard`'s hard-coded-string check as each translated app's own test

## Phase 8 — finish what is unfinished

Loose ends from earlier phases: a section left as a mockup, and two apps that have been a shell
since Phase 2 scaffolded them.

- [x] A Data & privacy: a self-service data export and a 7-day-grace account deletion and purge in
      `apps/api`, replacing the `/data-privacy` mockup in `apps/account` with the real thing
      (merged as #82)
- [x] B Help center: categories and articles, search and a contact form that reaches support,
      replacing `apps/help`'s empty shell (merged as #83)
- [x] C Jobs board: open roles as MDX postings, a PDF-CV apply form that reaches a hiring inbox, and
      review on `apps/auth`'s `/admin/applications`, replacing `apps/jobs`'s empty shell (merged as
      #84)

## Phase 9 — production hardening

Four sub-projects in order (an optional fifth may follow), agreed with the owner on 2026-10-12.
Each is its own spec, plan and pull request.

- [x] A Accessibility on pages (merged as #88): every page in the eight Next apps passes WCAG 2.2
      A/AA as far as automation can tell — an axe sweep of a route manifest in light, dark and (on
      the translated apps) Swedish, plus a handful of journey-only states, run in `apps/e2e`; four
      keyboard-only journeys; a 320 px reflow check on every page; a reduced-motion check; a
      reviewed allowlist for what cannot be fixed now. See `docs/guides/accessibility.md`.
- [x] B Operations (merged as #89, #90): what running this in production needs beyond what
      already exists — likely structured logging, alerting on the telemetry and jobs the api
      already records, and a runbook.
- [x] C Load and resilience (merged as #91): load testing the api and ai services, and hardening
      whatever that finds (connection limits, backpressure, slow-query behaviour under the chosen
      database).
- [x] D Performance budgets (merged as #92): first-load JS per route, Lighthouse on six public pages,
      in-browser Web Vitals (signed-in pages included) and a p95 per api procedure, all from one
      committed `perf/budgets.json` that changes only through a reviewed diff. See
      `docs/guides/performance.md`.
- [x] E Security scanning (merged as #98): dependency (`bun audit`), container image (Trivy) and
      secrets (Gitleaks) scanning — a `security` job every PR must pass, the image scan in the
      `docker` job, and a weekly run on `main` — failing on high/critical findings and any secret,
      with accepted risks in `security/allowlist.json`, each with a reason and an expiry. See
      `docs/guides/security-scanning.md`.

**Phase 9 complete.**

## After Phase 9

- [x] Passkeys (merged as #96, #97): WebAuthn sign-in on `apps/auth`'s `/login` (skipping the
      two-step code — a passkey counts as both factors), managed on `apps/account`'s Security page
      (add, rename, remove), an audited admin removal for a lost device, and the closing of the
      benchmark's "Magic link / passkeys" row.
- [x] Follow-ups sweep (merged as #100): typecheck `scripts/` and `perf/` in CI; the `mathjs` and
      `style-dictionary` majors (clearing three allowlist entries); passkey hardening (a per-account
      cap of 10, the admin-removal race, provider disconnect counting passkeys, focus after
      removal); security-scan hardening (symlinked parents, the Trivy cache save, a reusable
      image-scan workflow).

## Phase 10 — deepen what exists

Three sub-projects in order, agreed with the owner on 2026-10-17. Each is its own spec, plan and
pull request.

- [x] A Email change (merged as #104): let a signed-in user change their account email from `apps/account` →
      Personal info — the new address proven by a confirm link before the switch, the old address
      told before and after with a single-use "This wasn't me" undo link valid 7 days, and no
      confirmation required from the old mailbox (a deliberate, documented departure from OWASP's
      stricter option — see `docs/guides/email-change.md`). A confirmed change ends every other
      session; an undo also rolls back whatever changed since the change was requested (a sign-in
      provider linked, two-step turned on, a deletion scheduled) and clears the account's password.
- [x] B Suspend users (merged as #105): a superadmin action to block a user's sign-in without deleting their data —
      reversible, short of the account-deletion purge.
- [x] C Audit-log retention and export (merged as #106): network details (ip, user agent) stripped
      after 90 days and entries deleted after 365 (bounded 180–1095 per CNIL 2021-122, longer only
      when justified), a nightly budgeted `audit.prune`, and a superadmin CSV / JSON Lines export
      from `/admin/audit` that is itself audited. Tamper evidence stays a documented gap.

Phase 10 is complete.

## Phase 11 — developer-facing API

Three sub-projects in order, agreed with the owner on 2026-10-18. Each is its own spec, plan and
pull request.

- [x] A API keys and /v1 (merged as #108): workspace-scoped, scoped, expiring keys
      (`bb_live_…`, hashed, shown once; a paid `api` feature) and a small versioned `/v1` REST API
      (workspace, members, notes) from its own `@repo/public-api-contract`.
- [x] B Outgoing webhooks (merged as #109): signed (Standard Webhooks) deliveries of workspace events to admin-chosen
      HTTPS endpoints on the job queue, with an SSRF guard, retries, auto-disable and a delivery log.
- [x] C Developer docs (merged as #110): a public Developers section at `/developers` in
      `apps/docs` — overview, authentication, rate limits, verifying signatures, and a `/v1`
      reference and webhook event pages generated from `@repo/public-api-contract`, with a drift
      test that fails when the committed pages disagree with the contract.

Phase 11 is complete.

## Phase 12 — workspace admin depth

Three sub-projects in order, agreed with the owner on 2026-10-19. Each is its own spec, plan and
pull request.

- [x] A Workspace activity log (merged as #112): who changed what in a workspace — membership,
      roles, invitations, API keys, webhooks, settings, plan — visible to its own admins and
      owners, every plan, for 90 days, with no ip or user agent ever shown.
- [x] B Enforced two-step verification per workspace (merged as #113): a workspace owner requires
      every member to have two-step verification (TOTP) or a passkey before they can open the
      workspace — blocked, never removed; owner only, every plan.
- [x] C Email-domain allowlists for invitations (merged as #114): a workspace owner limits
      invitations to the organisation's own domains — exact match, up to 20, a restriction never a
      grant (no auto-join, existing members untouched) — enforced on create, re-invite and accept,
      with a pending invitation outside the list left pending; audited, en + sv.

Phase 12 is complete.

## Phase 13 — notifications

Agreed with the owner on 2026-10-21. Each is its own spec, plan and pull request.

- [x] A Notification centre (merged as #116): a per-user in-app inbox — a bell with an unread
      count in `app`, `auth` and `account`, a `/notifications` page, live updates in `app` — for
      the things that happened to the signed-in person (invited to a workspace, a role change,
      removed, a workspace now requiring two-step verification, a ready export, a webhook
      auto-disabled, a plan change).
- [x] B Notification preferences and email delivery (merged as #117): per-type email choices for
      the three optional notifications (role changed, removed, plan changed), RFC 8058 one-click
      unsubscribe with an HKDF-signed token and a confirm page, essential mail locked on; en + sv.

Phase 13 is complete.

## Decisions for the owner

- The 62 MB `apps/api/.14bc3bbe4cf8595e-00000000.bun-build` binary is still in git history; every
  clone downloads it. Removing it means rewriting history and force-pushing `main`.
- Deliberately out of scope: feature flags, swapping `Bun.sql` for an ORM — product decisions a
  starter should not make for you. Payments were on this list; they shipped in 6d, as
  organisations did in 6e, because the benchmark (six of nine kits ship billing) and the product
  built from this repo showed every SaaS needs them; billing stays minimal (three flat plans) and
  Stripe stays behind a provider seam. i18n and a job queue were on it too: the owner decided on
  2026-10-05 to build them (Phase 7 C and G). The rest of the list stands.
