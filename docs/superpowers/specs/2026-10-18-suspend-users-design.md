# Suspend users — design (Phase 10 B)

Phase 10 "deepen what exists": A email change (#104, merged) → **B suspend users** → C audit
retention and export. Approved in chat on 2026-10-18. One PR.

## Intent

Give superadmins a way to stop an account from signing in — for abuse, fraud or a compromised
account — without deleting anything. Today they can only end sessions, reset two-step or remove
passkeys, and the user signs straight back in. No external library is involved (nothing to check in
Context7).

Decided with the owner:
- **Scope:** only the person. Their workspaces, memberships, billing and data keep working for
  everyone else.
- **Duration:** indefinite by default, with an optional end date after which the suspension lifts
  itself (computed per request — no job).
- **Messaging:** the user is mailed on suspend and on unsuspend (end date if any, a support line,
  never the admin's internal reason); every sign-in attempt by a suspended account answers "This
  account is suspended. Contact support."

## 1. Data and enforcement (`apps/api`)

- Migration `0026_suspensions`: `users.suspended_at` (TEXT, null = not suspended),
  `users.suspended_until` (TEXT, null = indefinite), `users.suspension_reason` (TEXT, internal),
  `users.suspended_by` (INTEGER, the admin; null after that admin is purged — no FK cascade issues,
  like `audit_log.actor_user_id`).
- One rule: `isSuspended(user, now)` = `suspended_at` set and (`suspended_until` null or later than
  `now`). Contract constant `ACCOUNT_SUSPENDED_MESSAGE` = "This account is suspended. Contact
  support." (en + sv via `apiMessage`).
- Sign-in refuses a suspended account with `FORBIDDEN` `ACCOUNT_SUSPENDED_MESSAGE`, applied at the
  point each path would issue a session or a two-step challenge, after its own credential check:
  password sign-in (a wrong password still answers as any wrong password — suspension shows only
  once the credential is right), magic-link consume, OAuth callback (sign-in and connect), passkey
  verify, two-step verify, admin impersonation (refused with its own admin message), email-change
  confirm (needs a session anyway). Sign-up with a suspended account's address behaves as for any
  existing address.
- Sessions: `resolveSession` (and everything that resolves a session: procedures, the events
  stream, the file and analytics routes' identity) treats a suspended user's session as invalid —
  `UNAUTHORIZED` like an expired one — so a session that raced the suspension can never act.
- `admin.users.suspend({ userId, reason, until? })`: superadmin only (`NOT_FOUND` to anyone else,
  impersonation sessions included), never yourself or another superadmin, reason 3–200, `until`
  optional, in the future and at most 365 days ahead; limiter `suspend:<adminId>` 20 per hour. One
  transaction, user row locked first: set the four columns, end every session and stamp
  `sessions_revoked_at` (so an outstanding two-step challenge can't become a session), audit
  `user.suspended` (reason, until), enqueue `accountSuspended` (saved locale else English; end date
  if any; support line; never the reason). Suspending an already-suspended account updates the
  reason/end date (audited as such, no second mail unless the end date changed).
- `admin.users.unsuspend({ userId, reason })`: clears the columns, audit `user.unsuspended`, mail
  `accountUnsuspended`. No-op success when not suspended (no audit, no mail). An expired suspension
  is treated as not suspended everywhere; unsuspend still clears its columns.
- Unaffected: workspaces (a sole owner who is suspended keeps owning; transfer needs them signed in,
  so it waits for an unsuspend — documented), memberships, billing, invitations (accepting needs a
  sign-in), scheduled deletion (the purge still runs), pending one-time tokens (a reset link still
  sets a password, but signing in stays refused).
- Admin views: `AdminUser` / the user detail carry `suspended: { at, until, reason, by } | null`;
  the users list gets a filter `suspended=true`.
- Privacy export: the account's own suspension status and dates, never the internal reason or the
  admin's id.

## 2. UI

- `apps/auth` sign-in pages (password, magic link, provider callback, passkey, two-step): the
  suspended message in place, translated (en + sv).
- `apps/auth` `/admin/users/<id>`: a **Suspension** card — status, reason, end date, who; **Suspend**
  form (reason, optional end date) or **Unsuspend** form (reason); disabled for yourself and
  superadmins like the other admin cards. `/admin/users`: a "Suspended" badge and a filter.
  English only, like the rest of `/admin`.
- Templates `accountSuspended`, `accountUnsuspended` (en + sv, test + story).

## 3. Testing

- api (SQLite + Postgres): every sign-in path refused with the message after a correct credential
  and silent-identical before it; existing sessions refused; self/superadmin/limiter/validation
  refusals; expiry by `until` (clock injected); re-suspend updates; unsuspend no-op; workspaces and
  memberships untouched; mails and audit rows; export fields; Postgres race of a sign-in against the
  suspension (no session survives).
- auth action cores (admin forms, the sign-in error mapping); i18n guard.
- e2e: a superadmin suspends a user (until empty), the user's sign-in shows the message, the
  superadmin unsuspends, the user signs in.
- Docs: CLAUDE.md (a **Suspension.** paragraph under Authentication/Admin; the Admin paragraph's
  "out of scope: banning, suspending…" updated), apps/api and auth READMEs, docs/guides (admin or
  operations guide section), ROADMAP ticks B on merge.

## Out of scope

Freezing workspaces; showing the reason to the user; suspending from the api by non-superadmins;
IP or device bans; automatic suspension rules.
