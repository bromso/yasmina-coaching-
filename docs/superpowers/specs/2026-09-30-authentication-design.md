# Authentication (Phase 4)

**Status:** implemented (4a #41, 4b #42, 4c this PR). The 4b section below is amended to what
shipped (see "Amended in 4b").
**Date:** 2026-09-30
**Roadmap:** `docs/ROADMAP.md`, Phase 4. Builds on Phase 3b (PR #37: migrations + Postgres) and
3c (PR #38: security headers + status pages).

## Intent

The boilerplate has no accounts. `apps/api` is bearer-only and stateless, `apps/app`'s
`requireUser()` is a stub that admits a fixed user outside production and nobody in production,
`apps/auth`'s forms `console.log`, and `apps/account` is static. This gives the boilerplate real
email + password accounts stored in `apps/api`, an opaque server-side session carried by a cookie
on the parent domain — so a user who signs in at `auth.` is signed in at `app.` and `account.` —
one `requireUser()` every Next app uses, CSRF-safe mutations, and `apps/auth` / `apps/account`
wired to it.

**Success criteria**

- Sign up on `auth.` → land on `app.` signed in → notes and `/api/chat` are per-user → `account.`
  shows the real profile, changes the password, and ends other sessions → sign out signs out
  everywhere.
- Forgot-password works end-to-end in development: the reset link appears in the api log through
  the `Mailer` seam; a real provider slots in without touching the flow.
- Every Next app authenticates through `@repo/session`; the browser never calls `apps/api`.
- A production deploy without `COOKIE_DOMAIN` (or any other required auth env) fails closed at
  boot. `apps/api` refuses to start (4a). A Next app (`apps/auth` and `apps/app` from 4b, through
  `assertAuthEnv()` in each app's `instrumentation.ts`; `apps/account` in 4c) keeps listening but
  answers every request, `/api/health` included, with 500 until the variable is set.
- The database holds only hashes of passwords, session tokens and reset tokens.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Scope | Sign up / in / out, forgot + reset password with a pluggable mailer, profile, change password, sessions list | The owner's choice; email verification, OAuth and 2FA are out (below). |
| Session model | Opaque token, sessions table in `apps/api`, forwarded server-to-server by the Next apps | The api stays the only holder of state; revocation is a row delete; the browser trust model is unchanged. A signed stateless cookie would still need a store for revocation and spreads a secret across seven deployments. Browser→api calls would make the api browser-facing. |
| Cookie | `session`; `HttpOnly; Path=/; SameSite=Lax; Max-Age=30d`; `Secure` in production; `Domain=<COOKIE_DOMAIN>` | `Lax` lets the cookie flow between our subdomains (one site) and stops cross-site POSTs carrying it. Trust model: every host under `COOKIE_DOMAIN` is fully trusted — a compromised or dangling sibling subdomain can set the `session` cookie (login CSRF / cookie tossing), and `__Host-` prefixes are unavailable by design; never serve user-controlled content under the parent domain. |
| Dev hostnames | `<name>.brand.localhost` | Measured in Chrome: `Domain=localhost` is rejected, so `<name>.localhost` cannot share a cookie; `Domain=brand.localhost` is accepted and delivered to sibling subdomains. Still resolves with no `/etc/hosts` edits; mirrors `<name>.brand.com`. |
| CSRF | `SameSite=Lax` + Next server actions (Origin check built in) + `assertSameOrigin()` in route handlers | Three independent layers; no token plumbing. |
| Passwords | `Bun.password` (argon2id); 8–128 chars, no composition rules | NIST 800-63B; Bun built-in, no dependency. |
| Tokens | 32 random bytes, base64url; stored as SHA-256 | A database dump yields nothing usable. |
| Email | `Mailer` interface in `apps/api`; default `logMailer` | No provider exists; the seam is the deliverable. |
| Shipping | One spec, three plans/PRs: 4a core, 4b auth+app, 4c account | Each PR ships working software; 4a needs #37's migration runner. |

## Architecture

```
browser ── cookie: session=<token> ──► auth./app./account. (Next, server side)
                                            │  authorization: Bearer <service token>
                                            │  x-session-token: <token>
                                            ▼
                                        apps/api ── users / sessions / password_resets
```

`@repo/session` (server-only) is the one place a Next app reads or writes the cookie and talks to
`apps/api` about users. `apps/api` resolves `x-session-token` into `context.user` for the
procedures that need it.

## Sub-project 4a — the core

### `apps/api`

**Migrations** (`src/migrations/`, forward-only, both engines):
- `0002_auth.ts`: `users (id serialId, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`; `sessions (id serialId, token_hash TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL, created_at, last_seen_at, expires_at TEXT NOT NULL, user_agent TEXT, ip TEXT)` + index on `user_id`; `password_resets (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)`.
- `0003_notes_owner.ts`: `ALTER TABLE notes ADD COLUMN user_id INTEGER` + index. Existing ownerless notes are no longer listed.

Emails are stored lower-cased and trimmed; uniqueness is on that form.

**Tokens.** `newToken()` → 32 bytes from `crypto.getRandomValues`, base64url (43 chars), returned
once; `tokenHash(token)` → SHA-256 hex, the only thing stored or looked up. Sessions expire 30 days
after creation; `auth.me` refreshes `last_seen_at` at most once per 24 h. Reset tokens expire after
1 hour and are single-use (`used_at`).

**Passwords.** `Bun.password.hash(password)` (argon2id defaults) / `Bun.password.verify`. Sign-in
with an unknown email verifies against a fixed dummy hash so timing does not reveal accounts. A
per-email sign-in limiter (`createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 })`, key
`signin:<email>`) answers `TOO_MANY_REQUESTS` before verifying. A second, per-email reset-request
limiter (`createMemoryRateLimiter({ limit: 3, windowMs: 15 * 60_000 })`, key `reset:<email>`) is
silent: a tripped limit answers exactly like success and sends nothing, so it cannot enumerate
accounts. Reset mail is sent without awaiting the provider; a failure is logged.

**Context.** `createServer` passes `{ db, sessionToken: req.headers.get("x-session-token") }` to
both oRPC handlers. A `requireSession` middleware loads the session by hash, rejects missing,
unknown or expired tokens with `UNAUTHORIZED`, and sets `context.user` and `context.session`.

**Mailer.** `src/mailer.ts`: `type Mailer = { send(message: { to: string; subject: string; text: string }): Promise<void> }`;
`createServer({ mailer })`; default `logMailer(log)` prints the message to the api log. In
production, startup logs a warning when no mailer other than `logMailer` is configured. Reset link:
`${AUTH_URL}/reset-password?token=<token>`.

**Env.** `AUTH_URL` (default `http://auth.brand.localhost:3002` outside production), same
fail-closed rule as the tokens: in production `apps/api` refuses to start without it. `HOST` default becomes `api.brand.localhost`.

### `packages/api-contract`

All procedures stay behind the service token. ⚑ = also requires `x-session-token`.

| Procedure | Input → output | Errors / notes |
|---|---|---|
| `auth.signUp` | `{ email, password, name?, client?: { userAgent?, ip? } }` → `{ user, session: { token, expiresAt } }` | `CONFLICT` when the email exists |
| `auth.signIn` | `{ email, password, client? }` → same | `UNAUTHORIZED` "Invalid email or password"; `TOO_MANY_REQUESTS` |
| `auth.me` ⚑ | `{}` → `{ user, session: { id, expiresAt } }` | |
| `auth.signOut` ⚑ | `{}` → `void` | deletes the current session |
| `auth.requestPasswordReset` | `{ email }` → `void` | always succeeds; never reveals whether the email exists; silently limited (3 per email / 15 min); mail sent off the response path |
| `auth.resetPassword` | `{ token, password }` → `void` | `BAD_REQUEST` invalid/used/expired; revokes every session and every other reset link of the user |
| `account.updateProfile` ⚑ | `{ name }` → `user` | |
| `account.changePassword` ⚑ | `{ currentPassword, newPassword }` → `void` | `FORBIDDEN` on wrong current password (`UNAUTHORIZED` is reserved for a missing session); revokes all other sessions and every outstanding reset link |
| `account.sessions.list` ⚑ | `{}` → `{ items: [{ id, current, createdAt, lastSeenAt, userAgent }] }` | |
| `account.sessions.revoke` ⚑ | `{ id }` → `void` | own sessions only; `NOT_FOUND` otherwise |
| `account.sessions.revokeOthers` ⚑ | `{}` → `void` | |
| `notes.*` ⚑ | unchanged shapes | scoped to `context.user.id` |

`UserSchema`: `{ id, email, name, createdAt }`. Password schema: `z.string().min(8).max(128)`.

### `packages/session` (`@repo/session`, server-only)

```ts
createAuth({ apiUrl, serviceToken, cookieDomain, authUrl, appUrl }) => {
  getUser(): Promise<User | null>            // cookie → api.auth.me, memoised per request (React cache)
  requireUser({ next }?): Promise<User>      // or redirect(`${authUrl}/login?next=<target>`)
  getUserFromRequest(req: Request): Promise<User | null>   // route handlers
  setSession(session: { token; expiresAt }): Promise<void> // cookies().set with the fixed options
  clearSession(): Promise<void>
  assertSameOrigin(req: Request): Response | null          // 403 errorResponse or null
  safeNextUrl(candidate: string | null): string            // a COOKIE_DOMAIN subdomain, else appUrl
  api: ApiClient                                           // sends the bearer + x-session-token
  anonymousApi({ ip }?): Promise<ApiClient>                // 4b: bearer only, x-api-client-id anon:<hash(ip)>
}
loadAuthEnv(keys): the env loader from apps/app/src/lib/env.ts, moved here
```

Cookie options: `{ name: "session", httpOnly: true, path: "/", sameSite: "lax", secure: NODE_ENV === "production", domain: cookieDomain, maxAge: 30 * 24 * 3600 }`.
`assertSameOrigin`: `Sec-Fetch-Site` ∈ {`same-origin`, `none`} or `Origin` equal to the request's own origin; otherwise 403.
`safeNextUrl`: absolute URLs whose host ends in `COOKIE_DOMAIN` (leading dot, so a subdomain of it — never the bare parent domain or a look-alike such as `app.brand.localhost.evil.com`) and whose scheme is `https:` in production, `http:` otherwise; credentials in the URL are stripped; anything else → `appUrl`. Rejects protocol-relative (`//`) forms.
`requireUser` target: the explicit `next`, else the `x-url` request header — set by the shared security proxy (`@repo/ui/lib/security-proxy`) to the request URL, overwriting any client value — else `appUrl`. `referer` is never used.
Any api error or network failure in `getUser` → `null`.

### Dev hosts and env

Every dev script defaults to `<name>.brand.localhost` (Next: `--hostname ${DEV_HOSTNAME:-<name>.brand.localhost}`; `api`/`ai`: `HOST` default). Ports unchanged. `service-kit`'s dev-origin rule already matches; one test pins it. Docs say `brand.localhost` wherever they said `<name>.localhost`.

| Var | Apps | Dev default | Production |
|---|---|---|---|
| `COOKIE_DOMAIN` | app, auth, account | `.brand.localhost` | required |
| `AUTH_URL` | app, account, api | `http://auth.brand.localhost:3002` | required |
| `APP_URL` | auth | `http://app.brand.localhost:3001` | required |
| `API_URL`, `API_SERVICE_TOKEN` | app, auth, account | as `apps/app` today | required |

`docker-compose.yml` sets them on `app`, `auth`, `account`, `api` (service names, as `app` does today).

Fail-closed rules: `apps/api` validates at startup and requires `AUTH_URL` (and its token) in
production. The Next apps read their keys lazily through `@repo/session`'s `loadEnv`, so in 4a a
missing key fails the first request that needs it, not the boot (`next build` runs with no env).
4b adds the boot-time check: `assertAuthEnv()` in each app's `instrumentation.ts`.

## Sub-project 4b — `apps/auth` and `apps/app`

**`apps/auth`.** Forms are server actions validating with the contract's Zod schemas
(`FormData` + `safeParse`, as `apps/app`'s note form does). Each action is a thin wrapper around a
tested core in `src/lib/actions.ts` (`signInCore`, `signUpCore`, `forgotPasswordCore`,
`resetPasswordCore`) that takes its api, `setSession` and `safeNextUrl` as injected deps.
Sign-in/up → api → `setSession` → `redirect(safeNextUrl(next))`. Forgot-password →
`requestPasswordReset` → always the same "if an account exists…" sentence, whatever the api says
(including nothing, because it is down). `/reset-password?token=` → `resetPassword` →
`/login?reset=1`. The anonymous calls (sign-in, sign-up, forgot, reset) go through
`anonymousApi({ ip })`: the service token and no session, with `x-api-client-id:
anon:<hash of the browser ip>` so the api's rate limit is per browser, not one bucket for the whole
app. `/signup` redirects to `safeNextUrl(next)` when already signed in; `/login` does so only when
it carries a `next`, and otherwise shows a **signed-in card** (name, email, **Continue** to
`appUrl`, **Sign out**). Field errors and the generic sign-in error render inline; social buttons
stay mock with a note. Sign-in/up pass `client: { userAgent, ip }` from the request headers.

**Sign-out is a server action in each app**, not a `/logout` route: `signOut` in
`src/app/actions.ts` (`apps/auth` and `apps/app`; `apps/account` in 4c) calls `auth.signOut` as
the user, clears the cookie whatever the api answered, and redirects to `/login?signedout=1` on the
auth app ("You are signed out."). A shared `/logout` POST on `auth.` would be a cross-subdomain
POST from `app.`/`account.`, which `assertSameOrigin` refuses by design, and `www` has no header to
return to.

**`apps/app`.** `src/lib/auth.ts` = `createAuth(...)`. `requireUser()` guards `/notes`, `/chat` and
the note actions; `/api/chat` calls `assertSameOrigin` then `getUserFromRequest`; the root layout
renders a header with the user's name and the sign-out action, or a **Sign in** link back to the
current page. Notes are per-user end to end.

**Boot check.** `@repo/session/env` exports `assertAuthEnv()`; `apps/auth` and `apps/app` call it
from `src/instrumentation.ts`, so `next start` in production without `API_URL`,
`API_SERVICE_TOKEN`, `COOKIE_DOMAIN`, `AUTH_URL` or `APP_URL` fails at boot instead of on the
first signed-in request. `next build` never runs it. Measured on the standalone build: Next 16 does
not exit — it logs `Failed to prepare server … COOKIE_DOMAIN is not set` and answers every
request, `/api/health` included, with 500, so the container's health check fails.

**Amended in 4b** (from the approved design): no `/logout` route — per-app sign-out actions landing
on `/login?signedout=1` instead of a redirect to `www`; `/login` with a session and no `next` shows
the signed-in card rather than redirecting; `anonymousApi` added to `@repo/session` for the
anonymous calls; `assertAuthEnv` + `instrumentation.ts` as the boot check.

## Sub-project 4c — `apps/account`

All pages behind `requireUser()`. `personal-info`: shows the user, edits `name`. `security`:
change-password form; sessions list with "This device" marked, **Sign out** per row,
**Sign out all other devices**. Other pages remain mockups. Sign-out action in the header.

## Tests

**`apps/api`** (both engines via `start()` / `testDatabase()`): sign-up → `me`; duplicate email →
`CONFLICT`; wrong password and unknown email → identical `UNAUTHORIZED` bodies; limiter trips on the
11th attempt; `signOut` invalidates the token; garbage/expired token → `UNAUTHORIZED`; reset flow
through a capturing test mailer (single-use, expiry, revokes all sessions); `changePassword` keeps
the current session and drops others; `sessions.revoke` across users → `NOT_FOUND`; notes of user A
invisible to user B; raw tokens never appear in the database. The migrations directory test covers
the new files automatically.

**`@repo/session`** (`bun test`): cookie options per environment; `assertSameOrigin` accept/reject
matrix; `safeNextUrl` accept/reject matrix (incl. `//evil.com`); `getUserFromRequest` against a
stubbed `auth.me`. **`service-kit`**: `*.brand.localhost` passes the dev-origin rule.

**Apps:** `apps/app/src/lib/auth.test.ts` rewritten for the real helper; `apps/auth` action tests
(validation, redirect targets). `test:services` gains `@repo/session`, `@repo/auth`, `@repo/account`.

**Manual (each sub-project's last task):** the success-criteria walk on `bun dev`, plus one
production-like `docker compose up` for the cookie/`Secure`/env wiring.

## Docs

CLAUDE.md: "Adding Auth" replaced by how auth works (`@repo/session`, the cookie, the env);
"Adding a new subdomain app" gains the `createAuth` step and the new env vars; dev URLs updated.
`apps/api/README.md`, `apps/auth/README.md`, `apps/account/README.md`, `apps/app/README.md`.
`docs/ROADMAP.md`: Phase 4 ticked at 4c.

## Out of scope

OAuth / social sign-in, email verification, 2FA / passkeys, "remember me" variants, a real mail
provider, per-user rate limiting beyond the sign-in limiter, roles / admin, account deletion.
