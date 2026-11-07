# Data & privacy (Phase 8 A) — design

Phase 8 finishes what is unfinished: A Data & privacy (this spec) → B Help center → C Jobs board,
each its own spec, plan and pull request. Approved in chat on 2026-10-10.

## Intent

`apps/account`'s `/data-privacy` page is the last mockup in the signed-in apps (static history, ads
and connected-apps rows). A user should be able to take their data with them and delete their
account themselves — the GDPR basics every SaaS needs — and see and change the one privacy setting
that exists today (the consent cookie). Success: every row on the page does what it says; no data
tied to a deleted user remains linked to them.

Decided with the owner: deletion is a **7-day grace period, then a purge**; the export is **one
JSON file built by a background job**, downloaded through the account app with the user's session.

## 1. The page (`apps/account` `/data-privacy`)

Three cards, each a plain form that works without JavaScript, English and Swedish (`account`
namespace), the guard clean.

1. **Your data.** **Request an export** → `account.export.request` (⚑). The card shows the latest
   export's state: *Preparing…*, **Download** (with "available until <date>"), or *Expired* with the
   button again. One request per 24 h: `CONFLICT` carrying the time the next request is allowed. When
   the file is ready the user gets the `dataExportReady` email (link to `/data-privacy`, never to the
   file).
2. **Cookies and analytics.** The visitor's current `consent` choice (`all` / `necessary`), from the
   request's cookie, with a two-option form whose server action writes the same `consent` cookie the
   banner writes (`consentCookie` from `@repo/ui/lib/consent`, `COOKIE_DOMAIN`), so the choice holds
   on every subdomain. A short line says what each choice means (the `/privacy` template's wording).
3. **Delete account.** Type your email to confirm → **Delete my account** → `account.delete` (⚑).
   - Refused while impersonating (`FORBIDDEN` `IMPERSONATING_MESSAGE`).
   - Needs a recent sign-in: the session under `REAUTH_WINDOW_MS` (10 minutes), else `FORBIDDEN`
     `data.reason: "reauth"`; the card shows the existing `ReauthNotice` (`/login?reauth=1&next=…`).
   - Refused while the user is the only owner of a workspace that has other members: `CONFLICT`
     listing those workspaces' names ("Transfer ownership or delete these workspaces first: …").
   - Otherwise: `users.deletion_scheduled_at = now + 7 days`, every session ended through
     `users.revokeSessions` (so open two-step challenges die too), the `accountDeletionScheduled`
     email with the date, and the browser signed out (`clearSession()`, redirect to
     `${AUTH_URL}/login?deleted=1`, which shows "Your account is scheduled for deletion on …" —
     the date passed is display-only and re-read from the api after sign-in).

**During the grace period** the user can sign in normally. Every page of `app` and `account` shows a
banner — "Your account will be deleted on <date>." with **Cancel deletion** (a form posting to a
`cancelDeletion` server action → `account.cancelDeletion` (⚑), allowed for any live session of that
user, not while impersonating). `Me` carries `user.deletionScheduledAt: string | null`.

## 2. The api

**Migration `0019_privacy`**
- `users.deletion_scheduled_at` (nullable timestamp, indexed — the purge scans it).
- `data_exports`: `id`, `user_id` (FK, cascade), `status` (`pending` | `ready` | `expired`),
  `storage_key` (nullable until ready), `created_at`, `ready_at`, `expires_at`.

**Procedures** (all ⚑; contract in `@repo/api-contract`, messages through `apiMessage` en + sv)
- `account.export.request()` → `{ id, status }`; refused while impersonating; `CONFLICT` within 24 h
  of the previous request (any status). Enqueues `privacy.export` with the export id (in the same
  transaction as the row).
- `account.export.get()` → the latest export `{ id, status, readyAt, expiresAt } | null`.
- `account.export.download({ id })` → the file's bytes (`application/json`, `content-disposition:
  attachment; filename="<brand>-data-<date>.json"`); `NOT_FOUND` unless the export is the caller's,
  `ready` and unexpired. Refused while impersonating (an admin never downloads a user's export).
- `account.delete({ email })` / `account.cancelDeletion()` as in §1. `account.delete` re-validates
  `email` against the account (case-insensitive) — `BAD_REQUEST` otherwise.

**Jobs** (`src/jobs/builtin/privacy.ts`, listed in `JOBS`)
- `privacy.export` `{ exportId }`: loads the user and collects, into one JSON object with a
  top-level `exportedAt` and `format: 1`:
  - `profile` (id, email, name, locale, created, email verified, two-step on/off — never secrets,
    hashes or the TOTP secret), `avatarUrl`;
  - `signInMethods` (provider names and when connected; whether a password is set);
  - `sessions` (created, last seen, device/user agent, ip — the user's own);
  - `workspaces` (name, slug, role, joined) and `invitationsSent`;
  - `notes` the user authored (workspace name, body, created);
  - `auditLog` rows where the user is the actor or the impersonated subject;
  - `analyticsEvents` and `pageviews` carrying the user's id.
  Writes `exports/<userId>/<random>.json` through the `Storage` seam (`FILE_KEY_PATTERN` gains the
  `exports/` prefix with `.json`), marks the row `ready` (`expires_at = ready_at + 7 days`), enqueues
  the `dataExportReady` mail in the user's locale. Idempotent: a redelivered job for a `ready` row
  does nothing.
- `privacy.export.prune` schedule `40 3 * * *`: rows past `expires_at` → `expired`, their files
  queued for `storage.delete`. (The `storage.sweep` job must not delete `exports/` objects a live
  row references — extend its reference check.)
- `privacy.purge` schedule `25 * * * *`: for each user with `deletion_scheduled_at <= now`, in one
  transaction per user:
  1. Re-check ownership: if the user is now the only owner of a workspace with other members, skip
     and `recordFailure` (never orphan a workspace).
  2. Delete each workspace where the user is the only member (cancelling a live subscription with
     the provider first, exactly as `workspaces.delete`; if the cancel fails, skip the user and
     record a failure).
  3. De-link analytics: `user_id = NULL` on the user's pageviews and events.
  4. Queue `storage.delete` for the avatar and every export file.
  5. Delete the user row (sessions, identities, tokens, memberships, recovery codes, exports cascade).
     Every foreign key to `users` is listed in the plan with its `ON DELETE` behaviour; one that would
     block the delete or cascade away something that must stay (audit rows, invitations sent, billing
     rows) is handled explicitly in this step, not discovered in production.
     Notes in shared workspaces keep `user_id`, which now matches no row: the UI and the api show the
     author as "Deleted user" (`notes.list` returns `author: null`; `apps/app` renders the translated
     label).
  6. Audit `user.deleted` (actor null — the system; impersonated null; the user id in the target).
- The audit log stays append-only and keeps numeric ids; admin views render an id with no user row
  as "Deleted user".

**Email** (`@repo/email`, en + sv, a test and a story each): `dataExportReady`,
`accountDeletionScheduled` (the date, and that signing in lets you cancel), `accountDeleted` (sent
to the address after the purge, from the job, before the row goes — enqueued with the address as
the payload).

**Admin**: `/admin/users/<id>` shows "Scheduled for deletion on <date>" when set.

## 3. Edge cases

- The email becomes free again the moment the purge runs; a new sign-up gets an unrelated account.
- Pending invitations addressed to the email stay valid (they belong to the address).
- A user scheduled for deletion who accepts an invitation and becomes the only owner of a shared
  workspace is caught by the purge's re-check (skipped, failure recorded; the banner still shows).
- A second `account.delete` while already scheduled is a no-op success that returns the same date.
- Concurrent purge workers: the per-user transaction re-reads `deletion_scheduled_at` and locks the
  row (`lockForSession`'s no-op update pattern) before deleting.

## 4. Testing and delivery

- api (SQLite and Postgres): export contents (nothing secret; only the caller's data), access
  (another user's id `NOT_FOUND`, impersonation refused), the 24 h limit, prune; delete refusals
  (impersonation, reauth, only owner), scheduling, cancel, a second delete; purge (sole-member
  workspaces deleted with the subscription cancelled, shared notes kept with `author: null`, avatar
  and exports queued for deletion, analytics de-linked, the re-check skip, the `accountDeleted` mail).
- account action cores en + sv; the consent form writes the same cookie as the banner.
- e2e: request an export → download it (JSON parses, has the email); delete → `/login?deleted=1` →
  sign in → banner → cancel → banner gone.
- Docs: a **Privacy** paragraph in CLAUDE.md; `apps/api/README.md`, `apps/account/README.md`,
  `apps/auth/README.md`, `packages/email/README.md`; www's `/privacy` template gains export and
  deletion; ROADMAP gains Phase 8 (A privacy, B help, C jobs).

## Out of scope

Exporting other people's content in shared workspaces, data retention policies beyond the existing
prunes, a GDPR "restrict processing" switch, an admin-initiated deletion (superadmins can already
revoke sessions; adding admin deletion is a follow-up), legal text beyond the template sentence.
