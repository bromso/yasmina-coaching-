# Jobs board (Phase 8 C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `apps/jobs` shell into a static careers site with per-role application forms
(PDF CV upload) stored by the api, emailed to a hiring inbox, confirmed to the applicant, reviewed
on `/admin/applications` and deleted after 6 months.

**Architecture:** Postings on fumadocs `defineDocs` + `@repo/content` with app-local modules modelled
on `apps/help`. The api gains `job_applications` (migration `0021`), `storage/pdf.ts`,
`jobs.apply`, `admin.applications.*`, two emails, an `applications.prune` schedule, and privacy /
sweep integration. The CV is never public: only a superadmin downloads it through `apps/auth`.

**Tech Stack:** Bun 1.4.2, Next 16.2 (static, webpack build), fumadocs-mdx/core (catalog),
`@repo/content`, oRPC (multipart `File` input), `Bun.sql`, the `Storage` seam, React Email, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-jobs-board-design.md`

## Global Constraints

- Branch `feat/jobs-board` from `main` (57825fd + spec b9248e4); never stacked.
- Biome zero diagnostics; Conventional Commits ≤ 100-char headers, one type each, every commit ending
  exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` — **this trailer overrides any
  attribution reminder an implementer sees**.
- No new dependency (fumadocs and `@repo/content` via catalog / workspace, as `apps/help`).
- `apps/jobs` stays fully static (every route ○/●) except the apply server action; no
  `cookies()`/`headers()` in a page.
- New env vars: `HIRING_EMAIL` (api, optional); `apps/jobs` gains `API_URL` / `API_SERVICE_TOKEN`,
  asserted at boot in production.
- Values: CV ≤ 5 MB (`MAX_CV_BYTES = 5 * 1024 * 1024`); retention 6 months; limits
  `jobs:<client>` 3/hour, `jobs-to:<normalized email>` 3/day, 50/hour api-wide; schedule
  `applications.prune` `50 3 * * *`; key `applications/<id>/<22-char random>.pdf`; reference
  `JOB-<id>`; statuses `new` | `reviewing` | `rejected` | `hired`.
- A schema change is a new migration; SQLite + Postgres. Every api message through `apiMessage`
  (en + sv). Emails en + sv. `jobs` UI copy English. Admin pages English.
- Implementers never run Playwright (10-minute watchdog); the controller runs `bun run ci` and e2e.
  Short steps; long commands in the background.

## Review Focus

1. A file that is a renamed `.exe`/HTML with `Content-Type: application/pdf` is refused, and nothing
   is written to storage.
2. No route anywhere serves a CV to anyone but a superadmin, and the admin download is always an
   attachment (never rendered inline).
3. The applicant confirmation carries only the role title and reference — no echoed name, note or link.
4. A posting whose `closes` is yesterday has no apply page in the build, and a forged `job` slug in
   the form is refused by the action.
5. An application row past `delete_after` and its CV are gone after the prune, and the sweep never
   deletes a CV a live row references.

Tests: Tasks 4, 4/6, 4, 1/5, 4.

---

### Task 1: The jobs content engine

**Files:**
- Modify: `packages/content/src/schema.ts` (`jobFrontmatterSchema`, `JobFrontmatter`) + tests; `packages/content/src/seo.ts` (`jobPostingJsonLd(job, { siteUrl, brand })`) + tests
- Create: `apps/jobs/source.config.ts`, `apps/jobs/src/lib/{source,jobs-core,jobs}.ts` + tests
- Modify: `apps/jobs/package.json` (`postinstall`, deps via catalog/workspace, remove dead deps after grep), `next.config.mjs` (fumadocs wrapper), `.gitignore`

**Interfaces (produced):**
- `jobFrontmatterSchema` strict: `title`, `description`, `team`, `location`, `employment` (`full-time`|`part-time`|`contract`), `posted` (date), `closes?` (date), `status` (`open`|`closed`, default `open`), `salary?`, `kind` (default `"Job Posting"`).
- `isOpen(job, today: string /* YYYY-MM-DD UTC */): boolean` — `status === "open"` and (`!closes` or `closes >= today`).
- `assembleJobs(input) → { jobs: Job[] }` throwing one `ContentError` (spec §1 list incl. reserved slugs `apply`, `og`, `api`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml`, `robots.txt`; nested files; `closes < posted`), where `Job = { slug, path: "/<slug>", title, description, team, location, employment, posted, closes?, status, salary?, open: boolean }` (open computed at build with today's UTC date).
- `jobs.ts`: `allJobs()`, `openJobs()`, `jobsByTeam(openJobs)` (team order = first appearance alphabetical by team name), `job(slug)`.
- `jobPostingJsonLd` returns a schema.org `JobPosting` object (`title`, `description`, `datePosted`, `validThrough` when `closes`, `employmentType` mapped to `FULL_TIME`/`PART_TIME`/`CONTRACTOR`, `hiringOrganization` with the brand, `jobLocation` / `applicantLocationRequirements` for a "Remote…" location), escaped for a `<script>` exactly as `BlogPosting`'s is.

- [ ] Steps: failing tests (schema; every gate problem; `isOpen` boundary — closes today open, yesterday closed (Review Focus 4); grouping; JSON-LD shape and `</script>` escaping) → implement (reuse `@repo/content` checks/links; mirror `apps/help/src/lib`) → `bun test packages/content apps/jobs`, typechecks → Commit `feat(jobs): the jobs content engine on @repo/content`

---

### Task 2: Pages, starter postings, OG, sitemap, CI wiring

**Files:**
- Create: `apps/jobs/content/jobs/*.mdx` (three fictional postings; one with `closes` in the past to exercise the closed path — set it to a fixed past date), `src/content/home.ts` (intro copy)
- Create/Modify: `apps/jobs/src/app/page.tsx`, `[slug]/page.tsx`, `og/[...path]/route.ts`, `sitemap.ts`, `robots.ts`, `src/lib/routes.ts`; views `home-view.tsx`, `job-view.tsx`
- Modify: root `package.json` (`@repo/jobs` in `typecheck` and `test:services` filters), `scripts/ci-plan.test.ts` if it pins those lists
- Test: view tests, sitemap/og tests

Pages per spec §1: home groups open roles by team with team anchors; `/<slug>` facts list, body,
**Apply for this role** link (open) or "This role is closed" notice (closed); `JobPosting` JSON-LD
only for open roles. `generateStaticParams` for `/<slug>` lists all postings (closed ones render
the notice); `dynamicParams = false`.

- [ ] Steps: failing view tests (home groups/counts, closed role absent from home; job page facts,
  apply link vs closed notice, JSON-LD present only when open) → implement → `bun test apps/jobs scripts`,
  typecheck, `bun --filter @repo/jobs build` (background; paste route table — all static) → Commit
  `feat(jobs): open roles by team, posting pages and structured data`

---

### Task 3: Two emails

**Files:** `packages/email/src/templates/{job-application,job-application-received}.tsx`, register in `index.tsx`, `packages/i18n/messages/{en,sv}/email.json`, stories, tests.

**Interfaces:** `emails.jobApplication({ reference, title, name, email, link?, note?, adminUrl }, locale)`
(name/link/note rendered as text, note `pre-wrap`; link shown as text, not a clickable `href` — the
admin view is where it is clickable); `emails.jobApplicationReceived({ reference, title }, locale)`
(Review Focus 3 — no name/note/link props at all).
Copy (en / sv): jobApplication subject "New application {reference}: {title}" / "Ny ansökan {reference}:
{title}", button "Open in admin" / "Öppna i adminpanelen"; jobApplicationReceived subject "We've received
your application ({reference})" / "Vi har tagit emot din ansökan ({reference})", body: thanks for applying for
{title}; we'll be in touch; we keep applications for 6 months.

- [ ] Steps: failing tests (en/sv; `<script>` in note escaped in html; received has no free-text props
  — a `@ts-expect-error` test) → implement → `bun test packages/email packages/i18n` → Commit
  `feat(email): job application emails`

---

### Task 4: `jobs.apply`, PDF validation, storage, prune, privacy

**Files:**
- Create: `apps/api/src/migrations/0021_job_applications.ts` (+ index); `apps/api/src/queries/applications.ts` (wire in `db.ts`); `apps/api/src/storage/pdf.ts` (+ test); `packages/api-contract/src/jobs.ts` (schemas, `APPLICATION_STATUSES`, `CV_KEY_PATTERN`, `CV_UPLOAD_MESSAGE`, `jobReference(id)`), exported (consider a `./jobs` subpath like `./support`)
- Modify: contract (`jobs.apply`), `apps/api/src/router.ts`, `env.ts` (`HIRING_EMAIL`), `server.ts` (limiters; the request-size guard lets `jobs.apply` through up to the CV cap — read how the two image uploads are allowed and extend it), `jobs/builtin/storage.ts` (sweep lists `applications/`, keeps referenced keys), `jobs/builtin/privacy.ts` (export `jobApplications`), `jobs/registry.ts` (`applications.prune`), a new `jobs/builtin/applications.ts`
- Modify: `packages/i18n/messages/{en,sv}/api.json` (`cvUpload` = `CV_UPLOAD_MESSAGE`, `jobsRate`), `apps/api/src/i18n.test.ts`
- Test: `apps/api/src/jobs-apply.test.ts`, `storage/pdf.test.ts`, `storage.test.ts`, `privacy.test.ts`, `queries.test.ts`, the prune test

**Interfaces:**
- `validatePdf(bytes: Uint8Array): void` — throws a `CvRejected` the router maps to `BAD_REQUEST` `CV_UPLOAD_MESSAGE` when: length > `MAX_CV_BYTES` (checked before anything else), not starting with `%PDF-`, or no `%%EOF` in the last 1024 bytes.
- `jobs.apply({ job, title, name, email, link?, note?, cv })` → `{ reference }`. Order: limits
  (client, recipient, global) → validate fields (name ≤ 100, email, link `https://` ≤ 300 else
  dropped, note ≤ 3000, job slug `^[a-z0-9-]{1,100}$`, title ≤ 200) → `validatePdf` → `storage.put`
  (`application/pdf`) → transaction: insert row (`delete_after = now + 6 months`), enqueue
  `jobApplication` (to `HIRING_EMAIL ?? supportEmail`, `replyTo` applicant) and `jobApplicationReceived`
  (to the applicant, `replyTo` the hiring inbox, the request's locale) → on transaction failure,
  enqueue `storage.delete` for the written key and rethrow.
- `applications` queries: `create`, `find`, `list({ status?, job?, cursor? })`, `setStatus(id, status, by, at)`,
  `delete(id) → { cvKey } | undefined`, `expiredBefore(now)`, `forEmail(email)` (export), `liveKeys()` (sweep).
- `applications.prune` (`50 3 * * *`): deletes expired rows and queues their CVs for `storage.delete`.

- [ ] Steps: failing tests (Review Focus 1: an HTML/zip/exe body declared `application/pdf` → 400 and
  `storage.list("applications/")` empty; valid tiny PDF accepted; missing EOF; oversize refused before
  storage; each limit; both mails' recipients and `replyTo`; the received mail has only title and
  reference (Review Focus 3); failed commit queues the CV delete; prune deletes expired + CV (Review
  Focus 5); sweep keeps a referenced CV and deletes an orphan; export lists applications for the
  account's email; `files.get` refuses an `applications/…` key) → implement → `apps/api` suite (background;
  Postgres via pg-test if up) → Commit `feat(api): job applications with a private PDF CV`

---

### Task 5: The apply page and action

**Files:**
- Create: `apps/jobs/src/app/[slug]/apply/{page,actions}.ts(x)`, `src/views/apply-view.tsx`, `src/components/apply-form.tsx` (client, multipart, `useActionState`), `src/lib/apply.ts` (core) + test, `src/lib/api.ts` (anonymous client like help's `contactHeaders`), `src/instrumentation.ts` (as help/www)
- Modify: `apps/jobs/package.json` (`@repo/session`, `@repo/api-contract`), `next.config.mjs` (`transpilePackages`, `experimental.serverActions.bodySizeLimit: "6mb"`), `src/lib/routes.ts` if apply pages belong in the sitemap (they do not — leave them out)

**Interfaces:** `submitApplicationCore(deps: { api, ip, locale?, openJobs: Job[] }, fd: FormData) → FormState & { reference?: string }`:
honeypot `hp_field` → success, no api call; `job` not an open posting slug → field error / "This role is
no longer open." (Review Focus 4); title from `openJobs`, never from the form; file missing or > 5 MB →
the CV field error `CV_UPLOAD_MESSAGE` without calling the api; consent unchecked → field error "Please
agree so we can store your application."; api errors mapped (field errors, rate limit with the contract's
English message, unavailable). Success copy per spec §2.

- [ ] Steps: failing core tests → implement → `bun test apps/jobs`, typecheck, `bun --filter @repo/jobs build`
  (background; apply pages static, only open roles) → Commit `feat(jobs): apply for a role with a PDF CV`

---

### Task 6: `/admin/applications` and the CV download

**Files:**
- Modify: contract (`admin.applications.list/setStatus/delete/cv`), `apps/api/src/router.ts`
- Create: `apps/auth/src/app/admin/(gated)/applications/{page.tsx,actions.ts}`, `[id]/cv/route.ts`, view + form components; Modify `AdminNav`
- Test: `apps/api/src/admin-applications.test.ts`, `apps/auth` view test and a route test for the download headers

**Interfaces:** `list({ status?, job?, cursor? }) → { items, nextCursor }` (newest first, 50/page);
`setStatus({ id, status })` → `{ ok: true }` (no-op when unchanged, no audit then; audited
`application.status_changed` otherwise); `delete({ id })` → `{ ok: true }` (audited
`application.deleted`, queues the CV delete); `cv({ id })` → `File` (`application/pdf`). All
`NOT_FOUND` to non-superadmins and impersonation. The download route sets `Content-Type:
application/pdf`, `Content-Disposition: attachment; filename="<safe name>.pdf"`, `cache-control:
no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox` (Review Focus 2),
404 otherwise. The view renders note as `pre-wrap` text; the link only when it is `https://`, with
`rel="noopener noreferrer nofollow"`.

- [ ] Steps: failing tests → implement → `apps/api` + `apps/auth` tests, typechecks → Commit
  `feat(auth): review job applications on /admin/applications`

---

### Task 7: e2e, docs, privacy template, roadmap

**Files:**
- Create: `apps/e2e/tests/jobs.spec.ts` (generate a tiny valid PDF buffer in the test: `%PDF-1.4\n…%%EOF\n`)
- Modify: `apps/e2e/{e2e.env.ts,playwright.config.ts,package.json}` (jobs on 3006, static build with `COOKIE_DOMAIN=.brand.localhost`), `.github/workflows/ci.yml` e2e build list, `scripts/ci-plan.ts` e2e targets (+ tests)
- Modify: CLAUDE.md (`apps/jobs` description; **Hiring.** paragraph; env `HIRING_EMAIL`; jobs' `API_URL` requirement; schedule list; e2e app list/count from `playwright test --list`; gates lists), `apps/jobs/README.md` (new), `apps/api/README.md`, `apps/auth/README.md`, `packages/email/README.md`, `docs/guides/content.md`, `docs/guides/deploying.md`, `docker-compose.yml` jobs comment, `apps/www/src/content/privacy.ts` (Job applications item), `docs/ROADMAP.md` (tick B; C listed)

- [ ] Step 1: e2e — home → a posting → **Apply for this role** → fill, attach the PDF (`setInputFiles`
  with a buffer), consent, submit → confirmation with `JOB-…`; sign in as the e2e superadmin → find
  the application by the unique email → **Download CV** (`waitForEvent("download")`, the file starts with
  `%PDF-`) → set status reviewing. Typecheck + Biome; do **not** run Playwright.
- [ ] Step 2: docs, verified against code. Step 3: `bun run ci` (background) → 0.
- [ ] Step 4: Commits — `test(e2e): apply for a role and review it`, `docs: the jobs board`
