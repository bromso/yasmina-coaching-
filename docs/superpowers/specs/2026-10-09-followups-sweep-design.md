# Phase 7 follow-ups sweep — design

The follow-ups Phase 7's pull requests (#68 two-factor, #69 storage, #71 jobs, #72 realtime, #73
analytics) listed as "not in this PR", plus the unused dependencies G2 left in `apps/app`.
Approved in chat on 2026-10-09; the owner chose security + correctness (not the DX/polish tier).

## Intent

Ship the starter without the known gaps Phase 7 recorded. Success: every listed follow-up is fixed
here or recorded below as already handled; no new feature, no new environment variable.

Already handled on `main` (bc9a4a5), so not touched:

- "Purge could clear two-factor inside its transaction" — `purgeUnverifiedAccount` already calls
  `twoFactor.disable` outside, before, its transaction.
- Avatar/logo set races orphaning an object — the nightly `storage.sweep` deletes any unreferenced
  object older than 24 h.

Left as accepted (the DX/polish tier, not chosen): admin views without `useImageFallback`, the jobs
`counts()` scan, no worker nudge after an in-transaction enqueue, two-factor card stories, the
no-JavaScript retry after a wrong first setup code, unpaginated tag/author pages, build-time remote
image fetches, the UTC-midnight build clock.

Two pull requests, never stacked: PR 2 branches from `main` after PR 1 merges.

## PR 1 — security (`fix/security-followups`)

### 1. Re-authentication before two-step setup

A stolen session can today enrol the attacker's authenticator. `account.twoFactor.setup` gains an
optional `currentPassword` input:

- **Account with a password** (`password_hash` not null): `currentPassword` is required; it is
  checked exactly like `account.changePassword` (`verifyPassword`, against `DUMMY_HASH` when
  needed so timing does not leak). Missing or wrong → `UNAUTHORIZED` with the same translated
  message `changePassword` uses for a wrong current password.
- **Passwordless account**: the calling session's `created_at` must be under 10 minutes old
  (`REAUTH_WINDOW_MS = 10 * 60 * 1000`, exported for tests). Older → `FORBIDDEN` with
  `data: { reason: "reauth" }` and a translated message ("Sign in again to turn on two-step
  verification."); a `currentPassword` sent by a passwordless account is ignored.
- Checked after the existing guards (impersonation, verified email, already enabled) and before a
  secret is minted. `enable`, `disable` and `regenerateRecoveryCodes` are unchanged — each already
  needs a current code.
- The api counts a wrong `currentPassword` against the new `2fa:manage:<id>` limiter (§2).

UI (`apps/account`, Security page, the two-step card):

- Password account: **Turn on** reveals a "Current password" field in the same form (works without
  JavaScript: the field is always rendered inside the form, the action posts it).
- Passwordless account: the action maps `reason: "reauth"` to a notice "Sign in again to continue"
  with a link to `${AUTH_URL}/login?reauth=1&next=<account security URL>`.
- `apps/auth`'s `/login` with `reauth=1` shows the sign-in form even when a session exists (today a
  signed-in visitor with `next` is redirected away). Signing in issues a fresh session as usual;
  the old one is left to expire (sign-out is not forced). `reauth` accepts only `1`; `next` is
  validated by the existing `safeNextUrl`.
- New strings in `account`, `auth` and `api` namespaces, English and Swedish; the guard stays clean.

### 2. A two-factor limiter that counts failures only

Today `2fa:user:<id>` (10 per 15 minutes) is hit before every check, success included, and shared by
`verify`, `enable`, `disable` and `regenerateRecoveryCodes`, so someone holding only the password can
block the owner from finishing sign-in.

- Two keys: `2fa:verify:<id>` for `auth.twoFactor.verify` and `2fa:manage:<id>` for `enable`,
  `disable`, `regenerateRecoveryCodes` and §1's password check. Same budget each (10 per 15 min).
- A check first reads whether the key is already over budget (refuse with today's
  `TOO_MANY_REQUESTS` message without checking the code); only a **wrong** code (or wrong
  password) adds a hit. A correct code never spends budget.
- `@repo/service-kit`'s limiter gains whatever it needs for "peek without counting" (e.g.
  `check(key)` next to `hit(key)`), tested there.
- The per-challenge burn after 5 wrong codes is unchanged.

### 3. Recovery-code race

`checkSecondFactor` marks a recovery code used before the challenge token is consumed, so two
different codes racing on one challenge both get used while only one session is issued. Order
becomes: match the code (read-only), consume the challenge, then mark the code used; the code and
the session commit in one transaction with the challenge consume. A losing request uses no code.

### 4. No session survives a reset

Migration `0018_sessions_revoked_at`: nullable `users.sessions_revoked_at` (timestamp).

- Set to now, in the same statement batch as the session delete, by: `auth.resetPassword`,
  `account.changePassword`, `account.setPassword`, `account.sessions.revokeOthers`,
  `admin.users.revokeSessions`, `admin.users.resetTwoFactor`, and `purgeUnverifiedAccount`.
- `auth.twoFactor.verify` issues its session only if its challenge token was created after
  `sessions_revoked_at` (or the column is null), checked in the same transaction as the session
  insert; otherwise it answers the existing "Your sign-in timed out. Sign in again." `BAD_REQUEST`.
- `revokeSessions` keeps (and `resetPassword` already has) "invalidate challenges before deleting
  sessions"; the stamp closes the remaining window.
- Tests on SQLite and Postgres: a challenge issued before a reset cannot become a session after it.

### 5. Image metadata by allowlist

`apps/api/src/storage/image.ts`, PNG and WebP move from a drop list to a keep list, like JPEG:

- PNG keeps `IHDR`, `PLTE`, `tRNS`, `IDAT`, `IEND`, `gAMA`, `cHRM`, `sRGB`, `iCCP`, `sBIT`, `bKGD`,
  `pHYs`, and the APNG chunks `acTL`, `fcTL`, `fdAT`; everything else is dropped (C2PA `caBX`,
  private chunks, text, `eXIf`, `tIME`). `IHDR` must be the first chunk; a second `IHDR` refuses
  the file (`IMAGE_UPLOAD_MESSAGE`).
- WebP keeps `VP8 `, `VP8L`, `VP8X`, `ALPH`, `ANIM`, `ANMF`, `ICCP`; everything else is dropped
  and the VP8X flags are recomputed from what remains (ICC, alpha, animation; EXIF/XMP cleared).
- Fixtures: a PNG with `caBX` and a private chunk, a PNG with two `IHDR`, a WebP with an unknown
  chunk — each asserting the stored bytes.

### 6. Compose ports on loopback

Every published port in `docker-compose.yml` — the eight Next apps, `api`, `ai` and Mailpit's
`8025` — becomes `127.0.0.1:<port>:<port>`, like SeaweedFS's. `scripts/docker.test.ts` gains a
check that no published port lacks a host IP. `docker-compose.dev.yml` is unchanged (its ports are
for the dev container and its forwarded ports).

### 7. Cleanup

- `apps/app`: remove the unused dependencies (`cmdk`, `vaul`, `@hookform/resolvers`,
  `react-hook-form`, `recharts`, `next-themes`, `@iconify/react`, `country-region-data`, `clsx`,
  `tailwind-merge` — each re-confirmed unused by grep before removal), the dead local files that
  were their only users (`src/lib/utils.ts`, `src/lib/filter-countries.ts`,
  `src/hooks/use-mobile.tsx`, `src/hooks/use-dialog-state.tsx`) and their `next.config.mjs`
  entries (`optimizePackageImports` / `transpilePackages` naming them). `bun run build` for
  `apps/app` must still pass.
- Stale comments: `apps/api/src/migrate.ts` (a second writer now waits on `busy_timeout`, not
  `SQLITE_BUSY`) and `apps/api/src/billing/entitlements.ts` (the Bun version it names). Comment
  text only; the sequential workaround stays.

## PR 2 — correctness (`fix/correctness-followups`)

### 8. S3 reads

- `s3Storage.get` makes one request (`bytes()`); the content type comes from the key's validated
  extension, as `local` does.
- A missing object (`NoSuchKey` / 404) or a 403 (bucket without `s3:ListBucket`) returns `null`,
  so `files.get` answers `NOT_FOUND` and the app route `404`. A 403 is also recorded through
  `recordFailure` (log + telemetry `server` row), so wrong credentials do not hide behind 404s.
- `storage.test.ts`'s fake endpoint covers both.

### 9. SQLite transaction guard (`apps/api/src/db.ts`)

- A pool query created before `db.transaction` and awaited inside it completes instead of hanging
  (the gate binds a query to its context when it is created). The audit's repro becomes a
  regression test; every existing `db.test.ts` case still passes.
- `sql.transaction` is gated like `sql.begin`; `sql.file` and `sql.reserve` throw a clear error on
  the serialised SQLite client.
- A failing `PRAGMA` (WAL, `busy_timeout`) is logged and recorded instead of swallowed.

### 10. Analytics

- `analytics.prune` never deletes raw rows from the two days the nightly rollup rebuilds: its
  cutoff is the earlier of the retention cutoff and two days before today. With
  `ANALYTICS_RETENTION_DAYS=1` raw rows are effectively kept two days (documented in CLAUDE.md and
  `docs/guides/analytics.md`).
- `users.markEmailVerified` returns whether it changed the row; `auth.verifyEmail` records
  `email_verified` only then, so concurrent verifications record it once.

### 11. Realtime

- `server.ts`: the idle timeout is turned off before the stream is set up and restored when the
  answer is not a stream.
- `stream.ts`: an impersonation stream counts against the admin's per-user cap
  (`impersonatedBy ?? user.id`) at check, increment and decrement alike.
- `apps/app` `LiveNotes`: when the source is `CLOSED`, a `fetch` of the same URL (aborted once the
  headers arrive) learns the status. `401` stops reconnecting and shows "You've been signed out"
  with a sign-in link; `404` stops and shows "This workspace is no longer available"; anything
  else keeps today's backoff. Strings in `app`, English and Swedish. Pure helpers tested.
- `postgres.ts`: `publish` after `close()` is a no-op, like the memory bus.

## Testing and delivery

- Every fix has a test; database-touching fixes run on SQLite and Postgres (`api-postgres` job).
- Each PR: `bun run ci` green, the e2e suite green, Biome with zero diagnostics.
- Docs: CLAUDE.md's **Two-factor**, **Storage**, **Jobs**/**Analytics** and **Realtime**
  paragraphs, `apps/api/README.md`, `apps/account/README.md`, `apps/auth/README.md`,
  `docs/guides/analytics.md`, `docs/guides/realtime.md` updated where behavior changed.
