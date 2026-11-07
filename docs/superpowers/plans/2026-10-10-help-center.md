# Help center (Phase 8 B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `apps/help` shell into a static help center (MDX articles in categories, search,
related articles) with a contact form whose requests are stored by the api, emailed to support,
confirmed to the sender and resolved on `/admin/support`.

**Architecture:** Content on fumadocs `defineDocs` + `@repo/content` like `apps/docs`, with
help-specific modules in `apps/help/src/lib/`. The api gains `support_requests` (migration `0020`),
`support.create`, `admin.support.*`, two emails and a `replyTo` on the `Mailer` seam; the privacy
export and purge learn the new table.

**Tech Stack:** Bun 1.4.2, Next 16.2 (`next build --webpack`, static), fumadocs-mdx 15 / fumadocs-core
16 (catalog), `@repo/content`, oRPC, `Bun.sql`, React Email, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-help-center-design.md`

## Global Constraints

- Branch `feat/help-center` from `main` (ac21c2a + spec 7cf1356); never stacked.
- Biome zero diagnostics; Conventional Commits ≤ 100-char headers, one type each, ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependency except catalog entries already used by `apps/docs` (fumadocs-mdx, fumadocs-core,
  `@repo/content`), added to `apps/help` via `catalog:` / `workspace:*`.
- `apps/help` stays fully static (`○` for every route in `next build` output) except the contact
  server action; no `cookies()`/`headers()` in a page.
- One new env var only: `SUPPORT_EMAIL` (api, optional). `apps/help` gains optional `API_URL` /
  `API_SERVICE_TOKEN`.
- A schema change is a new migration listed in `apps/api/src/migrations/index.ts`; behaviour holds
  on SQLite and Postgres.
- Every user-facing api message through `apiMessage`, en + sv, pinned where a contract constant
  exists. Email templates en + sv. `help` UI copy English (static app).
- Implementers never run the Playwright e2e suite (10-minute no-progress watchdog); the controller
  runs `bun run ci` and e2e. Short steps; long commands in the background.

## Review Focus

1. A contact message with a script tag or markdown in it is stored and mailed as plain text, never
   rendered as HTML in the support mail or the admin page.
2. A bot filling the honeypot gets the success screen and nothing is stored or sent.
3. A `from` value that is an absolute URL or `//evil` is dropped, not stored as the page.
4. A visitor whose `session` cookie belongs to an impersonation session is not linked as the user.
5. `next build` of `apps/help` lists every route as static (`○`/`●`), `/contact` included.

Tests: Tasks 3/6, 5, 5, 4, 2.

---

### Task 1: The help content engine (`@repo/content` schema + `apps/help/src/lib`)

**Files:**
- Modify: `packages/content/src/schema.ts` (`helpFrontmatterSchema`, `HelpFrontmatter`), its tests
- Create: `apps/help/source.config.ts` (copy `apps/docs/source.config.ts`, relative schema import, `content/articles`)
- Create: `apps/help/src/lib/source.ts`, `help-core.ts` (+ test), `help.ts`, `nav.ts` (+ test), `search-results.ts` (+ test), `related.ts` (+ test)
- Modify: `apps/help/package.json` (`postinstall: fumadocs-mdx`, deps `fumadocs-mdx`, `fumadocs-core`, `@repo/content` via catalog/workspace; remove dead deps after `grep` confirms), `apps/help/next.config.mjs` (fumadocs `createMDX` wrapper as docs'), `.gitignore` (`.source/`)

**Interfaces (produced):**
- `helpFrontmatterSchema`: strict `{ title: string, description: string, updated?: date, tags: string[] (lowercase kebab, default []), popular?: boolean, type: string (default "Help Article") }`.
- `assembleHelp(input) → { categories: HelpCategory[], articles: HelpArticle[] }` throwing one
  `ContentError` listing every problem (spec §1 list), where
  `HelpCategory = { slug, title, description, articles: HelpArticle[] }` (order from `meta.json`;
  category `description` from its `meta.json`) and
  `HelpArticle = { slug, category, path: "/<category>/<slug>", title, description, updated?, tags, popular, toc }`.
- `relatedArticles(article, all, max = 3)`: shared tags, same category first, then other categories, never itself.
- `searchResults(...)` mirroring `apps/docs/src/lib/search-results.ts`.

- [ ] Step 1: failing tests for the schema and for `assembleHelp` (each problem class, including
  nesting deeper than `<category>/<article>` and the reserved names `all`, `contact`, `og`, `api`,
  `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml`, `robots.txt`), `nav`,
  `related`, `search-results` — modelled on the matching `apps/docs/src/lib/*.test.ts`.
- [ ] Step 2: run → FAIL. Step 3: implement, reusing `@repo/content/checks` and `links` (no copied
  logic). Step 4: run `bun test packages/content apps/help` → PASS; typecheck.
- [ ] Step 5: Commit — `feat(help): the help content engine on @repo/content`

---

### Task 2: Pages, starter content, search, OG, sitemap

**Files:**
- Create: `apps/help/content/articles/{getting-started,account-security,workspaces-billing,troubleshooting}/` with `meta.json` (title, description, pages) and 2–3 `.mdx` each (spec §1 list), plus `content/articles/meta.json`
- Create/Modify: `apps/help/src/app/page.tsx`, `[category]/page.tsx`, `[category]/[article]/page.tsx`, `all/page.tsx`, `api/search/route.ts`, `og/[...path]/image.png/route.ts` (copy docs' approach), `sitemap.ts`, `robots.ts`, `src/lib/routes.ts`
- Create: `apps/help/src/views/{home,category,article,all}-view.tsx`; remove the shell `home-view.tsx` content
- Test: view tests (`renderToStaticMarkup`, as docs/blog do), sitemap/og tests

**Articles must be accurate** to this repo (read the matching CLAUDE.md sections and code before
writing each): create an account (sign-up, verify email), invite your team (roles, 7-day links,
seats), two-step verification (setup needs current password or a recent sign-in, recovery codes),
export or delete your data (Data & privacy: JSON export 7 days; deletion after 7 days, cancel by
signing in), roles (viewer/member/admin/owner), change your plan (Payments page, owner only),
didn't get the email (spam, resend verification, rate limits), signed out unexpectedly (sessions
revoked by a password change/reset or "sign out everywhere else", 30-day sessions — check the real
TTL). Mark two `popular: true`.

- [ ] Step 1: failing view tests (home shows popular + category cards with counts; category lists
  in order; article shows breadcrumbs, toc only with ≥ 2 `##`, related, contact link with `from`).
- [ ] Step 2: run → FAIL. Step 3: implement pages/views/content. Step 4: `bun test apps/help`,
  typecheck, then `bun --filter @repo/help build` (background) and confirm every route is static
  (Review Focus 5 — paste the route table into the report).
- [ ] Step 5: Commit — `feat(help): categories, articles, search and related articles`

---

### Task 3: Two emails and `replyTo` on the Mailer seam

**Files:**
- Create: `packages/email/src/templates/support-request.tsx`, `support-received.tsx`; register in `packages/email/src/index.tsx`; `packages/i18n/messages/{en,sv}/email.json`; stories under `apps/story/stories/email/`; tests
- Modify: `apps/api/src/mail/` (`Message.replyTo?: string`; log, file, smtp (Nodemailer `replyTo`), resend (`reply_to`) providers pass it through), `apps/api/src/jobs/builtin/mail.ts` (payload carries `replyTo`), tests

**Interfaces:** `emails.supportRequest({ reference, topic, email, name?, page?, message, adminUrl }, locale)`;
`emails.supportReceived({ reference, name?, message }, locale)`. The message is rendered as **text**
(escaped by React; `white-space: pre-wrap`), never as HTML (Review Focus 1 — test that `<script>`
appears escaped in `html` and verbatim in `text`).
Copy (en / sv): supportRequest subject "New support request {reference}: {topic}" / "Ny supportförfrågan
{reference}: {topic}"; supportReceived subject "We've received your request ({reference})" / "Vi har tagit
emot din förfrågan ({reference})", body: we'll reply to this address; a copy of your message.

- [ ] Steps: failing tests (templates en/sv; existing English snapshots unchanged; each provider passes
  `replyTo`) → implement → `bun test packages/email apps/api/src/mail` → PASS → Commit —
  `feat(email): support request emails and a reply-to on outgoing mail`

---

### Task 4: `support.create`, the table, privacy tie-in

**Files:**
- Create: `apps/api/src/migrations/0020_support.ts`; Modify `migrations/index.ts`
- Create: `apps/api/src/queries/support.ts`; wire in `db.ts`
- Create: `packages/api-contract/src/support.ts` (schemas, `SUPPORT_TOPICS`, `supportReference(id)`), export from index; contract procedure `support.create`
- Modify: `apps/api/src/router.ts`, `apps/api/src/env.ts` (`SUPPORT_EMAIL` optional; startup warning in production when unset), `server.ts` (limiter `support`), `jobs/builtin/privacy.ts` (`supportRequests` in the export), `queries/users.ts` (`purge` sets `support_requests.user_id = NULL`, inventory comment updated)
- Modify: `packages/i18n/messages/{en,sv}/api.json`, `apps/api/src/i18n.test.ts`
- Test: `apps/api/src/support.test.ts` (new), `privacy.test.ts`, `queries.test.ts`

**Interfaces:** `support.create({ email, name?, topic, message, page? }) → { reference: string }`
(anonymous, bearer-guarded like `waitlist.join`; reads optional `x-session-token`: links `user_id`
only for a live, non-impersonation session — Review Focus 4). Limits: `support:<ip hash>` 5/hour,
api-wide 100/hour (`TOO_MANY_REQUESTS` `supportRate`: "Too many requests, try again later." / "För många
förfrågningar – försök igen senare." — or reuse `tooManyRequests` if it says the same). Validation:
email, name ≤ 100, topic ∈ `SUPPORT_TOPICS = ["account","billing","bug","other"]`, message 10–5000,
page ≤ 200 and root-relative (`/^\/[a-z0-9/-]*$/`) else dropped. Stores the row and enqueues both mails
in the same transaction (`supportRequest` to `SUPPORT_EMAIL ?? MAIL_FROM address`, `replyTo` = sender,
`adminUrl = ${AUTH_URL}/admin/support`; `supportReceived` to the sender in `context.requestedLocale ?? "en"`).

- [ ] Steps: failing tests (create stores and queues both mails with the right recipients/`replyTo`;
  invalid page dropped (Review Focus 3, at the api too); each validation error; both limits; session
  links, impersonation session does not, no session does not; export contains linked requests; purge
  nulls `user_id` and keeps the row) → implement → `apps/api` suite (background; Postgres via pg-test
  if up) → Commit — `feat(api): store support requests and email them to support`

---

### Task 5: The contact page and its action

**Files:**
- Create: `apps/help/src/app/contact/page.tsx`, `contact/actions.ts`, `src/views/contact-view.tsx`, `src/components/contact-form.tsx` (client, `useActionState`), `src/lib/contact.ts` (core) + test, `src/lib/api.ts` (anonymous client with service token; env fallback as www)
- Modify: `apps/help/package.json` (`@repo/session`, `@repo/api-contract` if not present), `next.config.mjs` `transpilePackages`; `apps/help/src/instrumentation.ts` only if www has the equivalent and it is optional here — `API_URL`/`API_SERVICE_TOKEN` are optional (production without them → "Support is unavailable right now.")
- Test: `apps/help/src/lib/contact.test.ts`, a view test

**Interfaces:** `submitContactCore(deps: { api, ip, sessionToken?, locale? }, fd: FormData) → FormState & { reference?: string }`.
Honeypot field `website`: non-empty → success shape with a fake-free message ("Thanks — we've got
it.") and **no api call** (Review Focus 2). `page` from the hidden field validated root-relative
(Review Focus 3). Locale: from the `locale` cookie / `Accept-Language` like `resolveWaitlistLocale`
(extract to `@repo/i18n` or `@repo/session` if it fits without pulling session-only code into a
static page; otherwise copy with a comment pointing at the original). Session token: from the shared
`session` cookie (read in the action only — never in the page).

Copy (English): heading "Contact support"; labels "Email", "Name (optional)", "Topic", "Message";
topics "Account", "Billing", "Something isn't working", "Something else"; button "Send"; success
"Thanks — we've got it. Your reference is #{reference}. We've sent a copy to {email}."; errors from
the api's field messages / "Support is unavailable right now. Try again in a moment.".

- [ ] Steps: failing core tests (success with reference; honeypot; invalid email/message field errors;
  unavailable; session token forwarded; page sanitised) → implement → `bun test apps/help`, typecheck,
  `bun --filter @repo/help build` (background) — `/contact` static → Commit —
  `feat(help): a contact form that reaches support`

---

### Task 6: `/admin/support`

**Files:**
- Modify: contract (`admin.support.list/resolve/reopen`), `apps/api/src/router.ts`, `queries/support.ts`
- Create: `apps/auth/src/app/admin/support/page.tsx` + actions + view; Modify `AdminNav`
- Test: `apps/api/src/admin-support.test.ts` (or extend the admin tests), `apps/auth` view test

**Interfaces:** `admin.support.list({ status?: "open"|"resolved"|"all" = "open", cursor?: number }) → { items: SupportRequest[], nextCursor: number | null }` (newest first, 50 per page);
`resolve({ id })` / `reopen({ id })` → `{}`, audited `support.resolved` / `support.reopened`; every
`admin.*` answers `NOT_FOUND` to non-superadmins (and impersonation), as the existing admin procedures.
The page renders `message` as text in a `<pre>`-like block with `white-space: pre-wrap` (Review Focus 1).
English only (admin is internal).

- [ ] Steps: failing tests (list filters and paginates; resolve/reopen + audit; non-admin 404) →
  implement → `apps/api` + `apps/auth` tests, typechecks → Commit — `feat(auth): resolve support requests on /admin/support`

---

### Task 7: e2e, docs, roadmap

**Files:**
- Create: `apps/e2e/tests/help.spec.ts`; Modify `apps/e2e/playwright.config.ts` and its `e2e` build script if `help` is not yet started there (add it like `docs`: port 3005, static build with `COOKIE_DOMAIN=.brand.localhost`), CI's e2e build list (`.github/workflows/ci.yml`) and `scripts/ci-plan.ts` e2e trigger set if they enumerate apps (keep `scripts` tests green)
- Modify: CLAUDE.md (`apps/help` description; a **Support.** paragraph; env table `SUPPORT_EMAIL`; Commands' e2e app list; "Adding a new subdomain app" step 10 mentions help as a content app), `apps/help/README.md` (new), `apps/api/README.md`, `apps/auth/README.md`, `packages/email/README.md`, `docs/guides/content.md`, `docs/ROADMAP.md` (tick A; B listed)

- [ ] Step 1: e2e spec — home → a category → an article; search (⌘K/Ctrl K) finds an article; contact
  form → reference shown; sign in as the e2e superadmin (existing fixture) → `/admin/support` shows the
  request → **Mark resolved**. Typecheck + Biome; do **not** run Playwright.
- [ ] Step 2: docs, verifying against code. Step 3: `bun run ci` (background) → exit 0.
- [ ] Step 4: Commits — `test(e2e): browse, search and contact on the help center`, `docs: the help center`
