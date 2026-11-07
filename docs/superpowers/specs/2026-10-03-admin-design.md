# Admin: superadmins, impersonation, audit (Phase 6f)

**Status:** implemented
**Date:** 2026-10-03
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — sub-project 6f
**Builds on:** 6b (sessions, `auth.me`, `requestInfo`), 6e (workspaces, roles), 6d (billing mirror,
entitlements), `apps/auth` (sign-in origin), `@repo/ui` status pages
**Reference shape:** the product grown from this repo (`singularorg`): the platform-admin surface on
the auth origin (`/admin/*`), impersonation as a session that carries `impersonatedBy`, audit
events that record the impersonator, and an impersonation banner shared with the product apps.

## Intent

Nobody can look at the system from above: there is no list of users or workspaces, no way to see
what a user sees when they report a problem, and no record of who did what on their behalf. This
phase adds the smallest admin layer a starter needs: a computed **superadmin** role, read-only
views of users, workspaces, billing state and metrics, **impersonation** with a reason, a hard time
limit, a visible banner and api-enforced limits, and an **audit log** that records every privileged
action and every mutation made while impersonating. It completes Phase 6.

## Decisions

- **Superadmin is configuration, not data**: `isSuperadmin(user) = SUPERADMIN_EMAILS includes
  normalizeEmail(user.email) && user.email_verified_at !== null`. No column, no seeding; removing
  an address revokes at the next request.
- **The admin UI lives in `apps/auth` under `/admin`** — impersonation is session minting, the auth
  app's job; no new app, deploy or subdomain.
- **Impersonation swaps the shared `session` cookie** to a 60-minute session row that carries
  `impersonated_by` and `reason`; the admin's own token is stashed in a host-only `admin_session`
  cookie on the auth app. The api enforces what an impersonator may not do from the session row —
  never from a cookie or a client flag.
- **An impersonator may act as the user** (notes, memberships, invitations — all audited) but
  **security and money mutations are blocked**: `account.changePassword`, `account.setPassword`,
  `account.sessions.*`, `account.identities.disconnect`, `account.resendVerification`,
  `billing.checkout`, `billing.portal`, `billing.mockChange`, `workspaces.delete`,
  `workspaces.transferOwnership`.
- **Nothing in the admin namespace exists for non-admins**: `NOT_FOUND`, in the api and on the pages
  — the same no-oracle posture as workspaces. Impersonation sessions cannot reach it either.
- **Audit is append-only** in this phase; no retention or export.
- Out of scope: banning/suspending/deleting users, editing user data, plan overrides, audit
  retention/export, admin-defined roles, a separate admin app, 2FA for admins.

## Components

### `packages/api-contract`

- `UserSchema` gains `superadmin: z.boolean()`.
- `MeSchema` gains `impersonation: z.object({ by: { id, name, email }, reason, expiresAt }).nullable()`.
- `src/admin.ts`: `AdminMetricsSchema { users, verifiedUsers, signUps7d, signUps30d, workspaces,
  workspacesByPlan: { free, pro, team }, pastDueWorkspaces, pendingInvitations, waitlist,
  activeSessions }`; `AdminUserSchema { id, email, name, emailVerified, createdAt, hasPassword,
  providers: ProviderId[], workspaceCount, superadmin }`; `AdminUserDetailSchema` = user + `memberships:
  { workspace: { id, name, slug }, role, plan }[]` + `sessions: { count, lastSeenAt: iso | null,
  impersonations: number }` + `audit: AuditEntry[]`; `AdminWorkspaceSchema { id, name, slug,
  owners: { id, email }[], memberCount, plan, status, createdAt }`; `AdminWorkspaceDetailSchema` =
  workspace + `members: { userId, email, role }[]` + `billing: { provider, subscriptionId,
  status, interval, currentPeriodEnd } | null` + `audit`; `AuditEntrySchema { id, at, actor: { id,
  email }, impersonated: { id, email } | null, action, targetType, targetId, reason, metadata }`;
  list inputs `{ q?: string max 100, cursor?: number, limit?: 1..100 default 50 }` and page outputs
  `{ items, nextCursor }`; `ImpersonateSchema { id, reason: z.string().trim().min(3).max(200) }`;
  `ImpersonationResultSchema { token, expiresAt, user: UserSchema }`.
- `ADMIN_ERRORS = { ...AUTH_ERRORS, NOT_FOUND: { message: "Not found" } }`;
  `IMPERSONATING_MESSAGE = "Not available while impersonating"`;
  `SUPERADMIN_TARGET_MESSAGE = "Superadmins cannot be impersonated"`.

### `apps/api`

**Env:** `SUPERADMIN_EMAILS` (optional, comma-separated, normalised; empty → nobody). Exposed on
`Context.superadminEmails: Set<string>`.

**Migration `0011_admin`:**
- `sessions` gains `impersonated_by INTEGER NULL REFERENCES users(id) ON DELETE CASCADE` and
  `reason TEXT NULL`; index `(impersonated_by)`.
- `audit_log (id PK, at TEXT NOT NULL, actor_user_id INTEGER NULL REFERENCES users ON DELETE SET
  NULL, impersonated_user_id INTEGER NULL REFERENCES users ON DELETE SET NULL, action TEXT NOT
  NULL, target_type TEXT NULL, target_id TEXT NULL, reason TEXT NULL, ip TEXT NULL, user_agent TEXT
  NULL, metadata TEXT NULL)`; indexes `(at)`, `(actor_user_id, at)`, `(impersonated_user_id, at)`,
  `(target_type, target_id, at)`.

**Sessions:** `issueSession` takes an optional `{ impersonatedBy, reason, ttlMs }`; impersonation
sessions use `IMPERSONATION_TTL_MS = 60 * 60_000` and are **never touched/extended** by the
`TOUCH_INTERVAL` logic. `requireSession` puts `context.impersonating = session.impersonated_by !==
null` and `context.impersonator` (the admin's user row, loaded only when set) on the context.

**Helpers (`src/admin.ts`):** `isSuperadmin(user, emails)`; `superadmin` middleware on top of
`requireSession` — `!isSuperadmin(user) || context.impersonating` → `NOT_FOUND`;
`refuseWhileImpersonating(context)` → `FORBIDDEN` `IMPERSONATING_MESSAGE`; `audit(context, {
action, targetType?, targetId?, reason?, metadata? })` writes a row with actor = the session's user
(or the impersonator when impersonating, with `impersonated_user_id` = the session's user), ip/UA
from the forwarded `client` info where a procedure carries it (the Next apps already send
`requestInfo`), else null.

**Blocked while impersonating** (`refuseWhileImpersonating` as the first line): the ten procedures
in Decisions. **Audited while impersonating** (handlers call `audit` after a successful write):
`notes.create`, `notes.delete`, `workspaces.create`, `workspaces.update`, `workspaces.leave`,
`workspaces.members.setRole`, `workspaces.members.remove`, `workspaces.invitations.create`,
`workspaces.invitations.revoke`, `invitations.accept`, `invitations.acceptById`,
`account.updateProfile`. Always audited: `admin.*` mutations.

**Procedures** (`admin` namespace, all `authed.use(superadmin)`; REST under `/admin/...`):

| Procedure | Behaviour |
|---|---|
| `admin.metrics` | the counts in `AdminMetricsSchema` (plan counts from the billing mirror's live row per workspace; `pastDueWorkspaces` counted separately) |
| `admin.users.list` | keyset by id desc; `q` → `email LIKE q% OR lower(name) LIKE %q%`; `limit ≤ 100` |
| `admin.users.get` | detail incl. last 20 audit rows where the user is actor or impersonated |
| `admin.users.revokeSessions` | `sessions.deleteForUser(id)`; audit `user.sessions_revoked` |
| `admin.users.impersonate` | `{ id, reason }`; target = self → `FORBIDDEN` "You cannot impersonate yourself"; target superadmin → `FORBIDDEN` `SUPERADMIN_TARGET_MESSAGE`; limiter `impersonate:<adminId>` 10 / hour → `TOO_MANY_REQUESTS`; revokes the admin's other live impersonation sessions (audited `impersonation.replaced`); issues the session; audit `impersonation.started` (target, reason); returns `{ token, expiresAt, user }` |
| `admin.stopImpersonation` | **called with the impersonation token** (plain `authed`, not `superadmin`): the session must have `impersonated_by` else `NOT_FOUND`; delete it; audit `impersonation.stopped`; `{ ok: true }` |
| `admin.workspaces.list` | keyset; `q` on name/slug; plan/status from the live mirror row |
| `admin.workspaces.get` | detail incl. members, billing row, last 20 audit rows for the workspace |
| `admin.audit.list` | newest first; filters `actorId?`, `targetType?`, `targetId?`; `limit ≤ 100` |

`auth.me` returns `impersonation` when the session has `impersonated_by` (by = the admin's id,
name, email; reason; the session's `expiresAt`), and `user.superadmin`.

### `@repo/session`

- `ADMIN_SESSION_COOKIE = "admin_session"`: host-only (no `Domain`), `HttpOnly`, `SameSite=Lax`,
  `Path=/admin`, `Secure` in production, `Max-Age` 3600.
- `createAuth` gains `startImpersonation({ token, expiresAt })` — stash the current `session`
  token into `admin_session`, set `session` to the impersonation token with `expires` =
  `expiresAt`; `endImpersonation()` — read `admin_session`, clear it, set `session` back to it (or
  clear `session` when missing); `readAdminSession()`.
- `User.superadmin` and `Me.impersonation` flow through `getUser()` unchanged (`getUser` returns
  `me.user`; add `getMe()` returning the whole `Me` for the layouts' banner).

### `packages/ui`

`components/impersonation-banner.tsx`: `ImpersonationBanner({ name, email, reason, expiresAt,
stopUrl })` — a fixed top bar above the header, amber, `role="status"`, text `Viewing as <name>
(<email>) · ends <time> · <reason>` and a link **Stop impersonating** → `stopUrl`. Story + test.
`UserMenu` label gets the suffix ` (impersonating)` via a new optional `note?: string` prop.

### `apps/auth` — `/admin/*`

Every page: `requireUser()`; `!user.superadmin || me.impersonation` → render `StatusPage` 404
("This page could not be found"). The header shows **Admin** (link to `/admin`) only to superadmins
who are not impersonating.
- `/admin` — metrics cards + links.
- `/admin/users` — GET search form (`?q=`), table (email, name, verified, providers, workspaces,
  created), **Older** pager; rows link to the detail.
- `/admin/users/[id]` — profile card; workspaces (name, role, plan); sessions (count, last seen,
  impersonations); recent audit; **Sign out everywhere** (confirm); **Impersonate** form (reason,
  3–200 chars) → action → `admin.users.impersonate` → `startImpersonation` → audit happens in the
  api → `redirect(${APP_URL}/notes)`; disabled with `SUPERADMIN_TARGET_MESSAGE` for superadmins and
  "This is you" for the admin's own row.
- `/admin/workspaces`, `/admin/workspaces/[id]`, `/admin/audit` — read-only tables with the pager
  and the audit filters as GET params.
- `/admin/stop` — reachable by **anyone impersonating** (it checks `me.impersonation`, not
  `superadmin`): "You are impersonating **<name>** (<reason>, ends <time>)" and a same-origin
  **Stop impersonating** form → action → `admin.stopImpersonation` (as the impersonation session)
  → `endImpersonation()` → redirect to `/admin/users/<id>`; `admin_session` missing/expired →
  still revoke, then `/login?signedout=1`; not impersonating → redirect `/admin`.
- Action cores in `src/lib/admin-actions.ts` with fake-api tests.

### `apps/app`, `apps/account`, `apps/auth` layouts

Fetch `getMe()`; when `me.impersonation` is set render `<ImpersonationBanner … stopUrl={`${AUTH_URL}/admin/stop`} />` above `SiteHeader` and pass `note="(impersonating)"` to `UserMenu`. Nothing else changes; the api blocks what must be blocked and the forms show its message.

## Copy (exact)

`Not available while impersonating` · `Superadmins cannot be impersonated` · `You cannot
impersonate yourself` · banner `Viewing as <name> (<email>) · ends <time> · <reason>` · button
**Stop impersonating** · **Sign out everywhere** · reason field label **Reason** with hint "Shown to
the user in the audit log" · impersonate button **Impersonate** · `This is you`.

## Security (review focus)

- Superadmin computed per request from env + verified email; the admin namespace and pages answer
  `NOT_FOUND` to everyone else and to impersonation sessions.
- Impersonation sessions: 60-minute hard expiry, never extended; `impersonated_by` immutable; no
  self or superadmin targets; reason required; one live impersonation per admin; limiter 10/h.
- Blocked mutations enforced in the api from the session row; one helper, one table test.
- The admin's own token is host-only on the auth app and never on the parent domain.
- Every start/stop/revoke and every listed mutation while impersonating writes an audit row with
  actor, impersonated user, ip/UA when known; append-only.
- Admin reads never expose password hashes, token hashes or raw provider user ids; search is
  parameterised and bounded.
- Sign-out while impersonating ends the impersonation session only (the admin's own session is
  untouched; `admin_session` lets them return via `/admin/stop`).

## Tests

- api: `isSuperadmin`; the `superadmin` middleware (non-admin, admin, impersonation session);
  metrics on seeded data (both engines); lists with search + pagination; `impersonate` (row shape,
  TTL ≈ 60 min, no touch extension, self/superadmin refusals, replacement of a previous
  impersonation, limiter, audit rows); the blocked table (ten procedures → `FORBIDDEN`
  `IMPERSONATING_MESSAGE`); allowed mutations audited with actor + impersonated; `stopImpersonation`
  (only impersonation tokens; second call `NOT_FOUND`); `auth.me.impersonation`; `admin.audit.list`
  filters.
- session: `startImpersonation` / `endImpersonation` / missing-stash paths.
- ui: banner render + story; `UserMenu` note.
- auth app: action cores (impersonate, stop, revoke) with fake apis; non-admin `/admin` → 404 copy.
- Browser pass: admin (listed in `SUPERADMIN_EMAILS`) signs in → **Admin** → metrics → users search
  → detail → Impersonate with a reason → lands on app `/notes` as the user with the banner → account
  `/security` change-password refused with `Not available while impersonating` → create a note
  (audited) → banner **Stop** → auth `/admin/stop` → back as admin; audit shows started / note
  created / stopped → a non-admin opens `/admin` → 404; Lighthouse accessibility ≥ 95 on
  `/admin/users` and `/admin/users/[id]`.

## Docs

CLAUDE.md **Admin** paragraph under **Authentication** (env, the computed rule, impersonation
mechanics and the blocked list, audit table, where the UI lives, the banner); env table row;
Apps list (`auth` gains `/admin`); ROADMAP (6f ticked — **Phase 6 complete**); READMEs (api, session,
auth, app, account).

## Out of scope

Banning, suspending or deleting users; editing user data; plan overrides; audit retention/export;
admin-defined roles; a separate admin app; 2FA for admins; impersonating into a specific workspace
(the user's current-workspace cookie rule applies as for the user).

## Deviations

Rulings made during execution, where the shipped behaviour differs from the design above:

- **The blocked set is eleven handlers, not ten.** The design's bullet list reads as ten items
  because `account.sessions.*` was written as one bullet; `sessions.revoke` and
  `sessions.revokeOthers` are two separate handlers, both carrying `refuseWhileImpersonating`.
  `account.sessions.list` stays readable while impersonating — the design never called for blocking
  it, and the UI needs it to show the user's own session. Separately, `auth.oauth.callback` is
  refused the same way (`optionalSessionUser` throws `IMPERSONATING_MESSAGE`) for a signed-in
  browser connecting a provider during an impersonation session — not in the original blocked list,
  added because linking an identity is a security mutation like the others.
- **Non-admins (and impersonation sessions) opening `/admin/*` get a real 404 via `notFound()`**
  (the app's `not-found.tsx`), not a 200 response rendering `StatusPage` inline as the design's
  "render `StatusPage` 404" phrasing suggested.
- **`ImpersonateSchema` carries an optional `client` field** (UA/IP, `ClientInfoSchema`) beyond the
  design's `{ id, reason }`, so the issued session row and the audit rows it produces
  (`impersonation.started`, `impersonation.replaced`) record the admin's own browser, the same as
  any other sign-in.
- **`AuditEntry.actor` is nullable**, not the design's `{ id, email }`: `actor_user_id` is `ON DELETE
  SET NULL`, so a row survives its actor's account being deleted with `actor: null`.
- **An impersonation session whose admin is gone or no longer a superadmin answers `UNAUTHORIZED`**
  at the next request — a consequence of computing superadmin per request that the design did not
  spell out explicitly.
- **`/admin/stop` works even when the api cannot answer `auth.me`**: it falls back to the parked
  `admin_session` cookie (`shouldStop(me, parked)` in `apps/auth/src/lib/admin-actions.ts`), so a
  browser whose impersonation session has already expired or whose api call fails never stays signed
  in as the user — it still ends the impersonation and signs out, rather than stranding the browser
  mid-impersonation as a strict `me.impersonation`-only check would.
