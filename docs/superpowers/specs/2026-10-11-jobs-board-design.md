# Jobs board (Phase 8 C) — design

Phase 8 finishes what is unfinished: A Data & privacy (#82) → B Help center (#83) → C Jobs board
(this spec). Approved in chat on 2026-10-11. Merging C completes Phase 8.

## Intent

`apps/jobs` is an empty shell. It becomes a careers site: open roles anyone can browse, each with an
application form whose submissions — including a CV — reach a hiring inbox and an admin list, and
are deleted after a fixed retention. Success: a candidate finds a role, applies with a PDF and gets
a confirmation; a superadmin reviews the application, downloads the CV and tracks its status.

Decided with the owner: the CV is **a PDF upload (≤ 5 MB), validated by its bytes and stored
privately**, downloadable only by superadmins through the auth app; postings reuse help's approach
(app-local modules over `@repo/content`).

## 1. Content and pages (`apps/jobs`)

**Content.** One MDX file per posting, `apps/jobs/content/jobs/<slug>.mdx` (flat). fumadocs
`defineDocs` + `@repo/content`, set up like `apps/help` (relative schema import in
`source.config.ts`, `postinstall: fumadocs-mdx`, `.source/` git-ignored).
- `jobFrontmatterSchema` in `@repo/content` (strict): `title`, `description` (one-line pitch),
  `team` (string), `location` (string), `employment` (`full-time` | `part-time` | `contract`),
  `posted` (date), `closes?` (date), `status?` (`open` | `closed`, default `open`), `salary?` (free
  text), `kind` (default `"Job Posting"`, OKF-ready).
- A posting is **open** when `status` is `open` and `closes` is absent or today or later (UTC, at
  build time). A closed posting still builds and renders with a "This role is closed" notice
  instead of the apply link; it is left out of the index, the sitemap and JSON-LD.
- Build gate (`assembleJobs` in `apps/jobs/src/lib/jobs-core.ts`, one `ContentError`): body `#` h1,
  broken / non-root-relative / local-host links, missing images, nested files, reserved slugs
  (`apply`, `og`, `api`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml`,
  `robots.txt`), `closes` before `posted`. Shared checks from `@repo/content`.
- Starter content: three clearly fictional sample postings (e.g. Senior Full-stack Engineer, Product
  Designer, Customer Support Specialist) across two teams and locations, one with `closes` set.

**Routes** (fully static except the apply action):
- `/` — "Join us", a short intro (copy in `src/content/home.ts`), open roles grouped by team (each a
  card: title, location, employment), team anchors as filter links (no JavaScript, no query).
- `/<slug>` — facts (team, location, employment, salary when set, posted, closes when set) as a
  description list, then the body, then **Apply for this role** (→ `/<slug>/apply`); closed → the
  notice. `JobPosting` JSON-LD for open roles (`jobPostingJsonLd` in `@repo/content/seo`, escaped as
  `BlogPosting`'s is).
- `/<slug>/apply` — §2's form; static; closed or unknown slug → `notFound()` at build
  (`generateStaticParams` lists open roles only, `dynamicParams = false`).
- Per-posting OG/Twitter images, `sitemap.ts` (open roles), `robots.ts` allowing everything.

**Reuse / housekeeping.** `@repo/ui` blocks; app-local `src/lib` (`jobs-core.ts`, `jobs.ts`,
`source.ts`, `og.ts`, `sitemap.ts`) modelled on `apps/help`. The shell's unused dependencies removed.
`@repo/jobs` joins the root `typecheck` / `test:services` lists and the e2e suite (port 3006, built
with `COOKIE_DOMAIN=.brand.localhost`), CI's e2e build list and `scripts/ci-plan.ts`'s e2e targets.
English, with the static language switcher.

## 2. Applying

**Form (`/<slug>/apply`)** — name (required, ≤ 100), email (required), CV (required, PDF,
`accept="application/pdf"`), link (optional URL, `https://` only, ≤ 300), note (optional,
≤ 3000), a required consent checkbox ("I agree that my application is stored for 6 months so it can
be assessed."), the off-screen honeypot (`hp_field`, as help), a hidden `job` (the slug). A plain
multipart `<form action>` with `useActionState`, works without JavaScript; the page stays static.
Success: "Thanks, {name} — we've received your application for {role}. We've sent a confirmation to
{email}." Copy English.

**Server action** (`apps/jobs/src/app/[slug]/apply/actions.ts`, core in `src/lib/apply.ts` with
tests): checks the `job` slug against the build's list of open postings (title taken from the
build, never from the form); refuses a file over 5 MB before calling the api (as `apps/account`'s
avatar action does); honeypot → success without an api call; calls `jobs.apply` with the service
token, `anon:<ip hash>` client id and `x-locale` from a real signal (help's pattern). `apps/jobs`
gains `API_URL` / `API_SERVICE_TOKEN`, asserted at boot in production (`src/instrumentation.ts`, as
www and help); `experimental.serverActions.bodySizeLimit` raised to cover a 5 MB file plus fields.

**API**
- Migration `0021_job_applications`: `job_applications` (`id`, `job_slug`, `job_title`, `name`,
  `email`, `link`, `note`, `cv_key`, `ip_hash`, `status` `new` | `reviewing` | `rejected` | `hired`,
  `created_at`, `status_changed_at`, `status_changed_by` nullable, `delete_after`).
- `storage/pdf.ts`: `validatePdf(bytes)` — at most 5 MB (`MAX_CV_BYTES`), starts with `%PDF-`,
  contains `%%EOF` within its last 1024 bytes; the declared type and name are ignored. Failure →
  `BAD_REQUEST` `CV_UPLOAD_MESSAGE` "Upload your CV as a PDF up to 5 MB.".
- Keys `applications/<id>/<22-char random>.pdf` (`CV_KEY_PATTERN` in `@repo/api-contract`; never
  matched by `FILE_KEY_PATTERN`, so `files.get` can never serve one). The api's per-route body cap
  allows `jobs.apply` up to `UPLOAD_MAX_BODY_BYTES`-style headroom for 5 MB (raise the upload cap or
  add a CV cap — the request-size guard lists `jobs.apply` next to the two image uploads).
- `jobs.apply({ job, title, name, email, link?, note?, cv: File })` → `{ reference: "JOB-<id>" }`.
  Anonymous, bearer-guarded. Limits: `jobs:<client>` 3/hour, `jobs-to:<normalized email>` 3/day,
  50/hour api-wide. Validates the PDF, writes the CV, then in one transaction stores the row
  (`delete_after = now + 6 months`) and enqueues `jobApplication` (to `HIRING_EMAIL ?? SUPPORT_EMAIL ??
  MAIL_FROM's address`, `Reply-To:` the applicant, link to `${AUTH_URL}/admin/applications`) and
  `jobApplicationReceived` (to the applicant: the role title and the reference only, `Reply-To:` the
  hiring inbox); a failed commit queues the written CV for `storage.delete`.
- `HIRING_EMAIL` (api, optional).
- `applications.prune` schedule `50 3 * * *`: deletes rows past `delete_after` and queues their
  CVs for `storage.delete`. `storage.sweep` lists `applications/` too and keeps keys a row references.
- Privacy: `privacy.export` adds `jobApplications` (rows whose email equals the account's, without
  `ip_hash`); the purge leaves them (address-keyed, deleted by retention) — documented.

**Admin** (`apps/auth` `/admin/applications`, superadmin only, `NOT_FOUND` otherwise, `AdminNav`):
newest first, filters by status and by role; each: reference, role, name, email, link (plain text +
`rel="noopener noreferrer nofollow"` link, `https://` only), note (pre-wrap text), dates, **Download
CV**, a status select (audited `application.status_changed`), **Delete** (audited
`application.deleted`, queues the CV for deletion). `admin.applications.list({ status?, job?,
cursor? })`, `setStatus({ id, status })`, `delete({ id })`, `cv({ id })` (the file). The download is
`apps/auth/src/app/admin/applications/[id]/cv/route.ts`: session-checked, `Content-Type:
application/pdf`, `Content-Disposition: attachment`, `cache-control: no-store`, `X-Content-Type-Options:
nosniff`, 404 for non-superadmins.

**Email** (`@repo/email`, en + sv, test + story each): `jobApplication`, `jobApplicationReceived`.

**Privacy template** (www): a "Job applications" item — what is stored, the 6-month retention, that
the CV is only seen by the hiring team.

## 3. Testing and delivery

- api (SQLite + Postgres): PDF validation (valid; wrong magic; missing EOF; oversize — refused before
  storage), each limit, the confirmation carries only the title and reference, `Reply-To`s, the
  failed-commit cleanup, admin list/filters/status/delete/cv and non-admin 404, prune, sweep, export.
- jobs: `assembleJobs` checks, open/closed logic (closes today is open; yesterday closed), grouping,
  JSON-LD, sitemap, OG, the apply core (slug check, title from the build, oversize, honeypot,
  unavailable, success).
- e2e: home → a posting → apply with a tiny generated PDF → confirmation; as a superadmin, find it on
  `/admin/applications`, download the CV (a PDF arrives), mark it reviewing.
- Docs: CLAUDE.md (`apps/jobs` description, a **Hiring.** paragraph, env `HIRING_EMAIL`, schedules,
  e2e lists/counts, gates lists), `apps/jobs/README.md` (new), `apps/api/README.md`,
  `apps/auth/README.md`, `packages/email/README.md`, `docs/guides/content.md`,
  `docs/guides/deploying.md` (jobs needs the api at runtime), www's privacy template; ROADMAP ticks B
  and lists C (ticked when merged — Phase 8 complete).

## Out of scope

An applicant tracking system (stages, interviews, scorecards, multiple reviewers), replying to
applicants from the app, job alerts, filtering beyond team anchors, file types other than PDF,
translated postings, scanning PDFs for malware (documented: the hiring team should open CVs with
care; the download is attachment-only).
