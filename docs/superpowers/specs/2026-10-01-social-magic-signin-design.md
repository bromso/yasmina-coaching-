# Social sign-in and magic link (Phase 6b)

**Status:** implemented (Phase 6b)
**Date:** 2026-10-01
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — sub-project 6b
**Builds on:** Phase 4 (sessions in `apps/api`, `@repo/session`), Phase 6a (`@repo/email`, mailers,
`tokens` table, soft verification)

## Intent

Sign-in today is email + password only; the auth pages show Apple/Google buttons that do nothing.
This phase makes **Google, GitHub and Apple** sign-in real and adds **magic-link** (passwordless)
sign-in, both issuing the same opaque sessions `apps/api` already owns. Provider secrets and the
token exchange live in `apps/api`; the browser legs (redirects, cookies) live in `apps/auth`, which
already owns the session cookie. Accounts link by provider-verified email; new users arriving this
way get passwordless accounts and can set a password later in `apps/account`.

**Success criteria**

- "Continue with Google / GitHub / Apple" on login and sign-up works end to end against the real
  providers when their keys are configured, and the buttons disappear when they are not.
- A provider login with a verified email links to the existing account with that email, or creates
  a passwordless, verified account; unverified provider emails are refused without creating anything.
- "Email me a sign-in link" signs an existing user in and creates a verified passwordless account
  for a new address; the link is consumed by a button press, not by loading the page.
- `apps/account` → Security shows sign-in methods: set/change password, connected accounts with
  connect/disconnect; the last way into an account cannot be removed.
- Password sign-in on a passwordless account fails exactly like a wrong password.
- Every secret stays in `apps/api`; state/PKCE are bound to the browser by an HttpOnly cookie.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Providers | Google, GitHub, Apple | Owner's choice; the three the auth pages already imply plus the developer-audience one |
| OAuth client | [Arctic](https://arcticjs.dev) 3.x in `apps/api` | Fetch-based, runtime-agnostic, typed; has Google (PKCE), GitHub, Apple (ES256 client secret) adapters; ~30 kB; no framework |
| Where the dance runs | Token exchange in `apps/api`; redirects + cookies in `apps/auth` route handlers | Secrets never reach a Next app; cookies stay where `@repo/session` already writes them; the api keeps no browser-facing surface |
| Linking | By provider-verified email; identity (`provider`, `provider_user_id`) is the key afterwards. Linking (or a magic-link consume) into an account whose email was never verified first runs `purgeUnverifiedAccount`: password cleared, sessions, identities and reset tokens deleted, email marked verified | Standard across the benchmarked kits; verified-only closes provider-side takeover; the purge closes pre-account hijack (a squatter who signed up with the victim's address and their own password keeps no way in); identity-first survives provider-side email changes |
| Unverified provider email | `FORBIDDEN`, nothing created | No silent account on an unproven address; message tells the user to sign in with email first |
| Passwordless accounts | Allowed (`password_hash NULL`); `setPassword` in account | Required for "Continue with Google" as a sign-up path and for magic link |
| Magic link consumption | GET page with a **Continue** button → POST server action | 6a lesson: mail-client link scanners burn GET-consumed tokens |
| Magic link for unknown emails | Sends; consume creates the account | Clicking the link proves ownership; the request stays silent like the reset request |
| State storage | HttpOnly cookie on the auth host, `SameSite=None; Secure`, `Path=/oauth`, 10 min | Apple's `form_post` is a cross-site POST; `*.localhost` is a secure context in Chromium so it works in dev |
| Provider tokens | Not stored | Nothing in this phase needs provider APIs after sign-in |
| Connect while signed in | Same callback procedure with the session token forwarded | One code path; the api decides link / connect / conflict |

## Components

### Schema — migration `0005_identities`

- `users.password_hash` → nullable. SQLite: rebuild (`CREATE TABLE users_new …`, copy, drop, rename,
  recreate the unique index); Postgres: `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`.
- `identities (id, user_id INTEGER NOT NULL, provider TEXT NOT NULL CHECK (provider IN ('google','github','apple')), provider_user_id TEXT NOT NULL, email TEXT, created_at TEXT NOT NULL, UNIQUE (provider, provider_user_id))`
  + index on `user_id`. No foreign keys, like the rest of the schema.
- `tokens`: `purpose` CHECK gains `'magic_link'`; new nullable `email TEXT` column (set only for
  magic-link tokens requested for an address with no account yet). SQLite: table rebuild; Postgres:
  drop/add the CHECK constraint and `ADD COLUMN`.
- Queries: `queries/identities.ts` (`create`, `findByProviderUser`, `listForUser`,
  `deleteForUser(userId, provider)`, `countForUser`); `queries/tokens.ts` `create` accepts
  `email?`; `consume` returns `{ userId, email }`; `users.create` accepts `passwordHash: string | null`
  and `emailVerifiedAt?`; `users.update` keeps `passwordHash`.

### `apps/api/src/oauth/`

```ts
type Profile = { providerUserId: string; email: string | null; emailVerified: boolean; name: string | null }
type Provider = {
  id: "google" | "github" | "apple"
  pkce: boolean
  start(state: string, codeVerifier?: string): URL
  exchange(input: { code: string; codeVerifier?: string; appleUser?: { name?: { firstName?: string; lastName?: string } } }): Promise<Profile>
}
```
- `google.ts` — `new arctic.Google(id, secret, redirect)`; scopes `openid email profile`; PKCE;
  profile from `arctic.decodeIdToken(tokens.idToken())`: `sub`, `email`, `email_verified`, `name`.
- `github.ts` — `new arctic.GitHub(id, secret, redirect)`; scopes `read:user user:email`; after
  exchange, `GET https://api.github.com/user` (id, name/login) and `GET /user/emails`; email = the
  entry with `primary && verified`, else `email: null, emailVerified: false`.
- `apple.ts` — `new arctic.Apple(clientId, teamId, keyId, pkcs8Key, redirect)`; scopes `name email`;
  `response_mode=form_post`; profile from the id token (`sub`, `email`, `email_verified` — Apple
  sends it as `true`/`"true"`, normalise); name from `appleUser` on first consent, else null.
- `providers.ts` — `createProviders(env)` → `Map<ProviderId, Provider>` containing only the fully
  configured ones; redirect URI `${AUTH_URL}/oauth/<id>/callback`.
- Arctic errors: `OAuth2RequestError` → `BAD_REQUEST`; `ArcticFetchError` → `BAD_GATEWAY`; logged with
  the provider id only, never codes or tokens.

### Env (`apps/api/src/env.ts`)

| Var | Rule |
|---|---|
| `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` | both or neither |
| `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` | both or neither |
| `OAUTH_APPLE_CLIENT_ID`, `OAUTH_APPLE_TEAM_ID`, `OAUTH_APPLE_KEY_ID`, `OAUTH_APPLE_PRIVATE_KEY` | all four or none; the key is PEM (PKCS#8) with `\n` escapes allowed; parsed at boot |

A partially configured provider throws in `loadEnv` naming the missing key; an unconfigured one is
absent from `auth.providers()`.

### Contract and procedures (`packages/api-contract`, `apps/api/src/router.ts`)

- `ProviderIdSchema = z.enum(["google","github","apple"])`; `User` gains `hasPassword: boolean`.
- `auth.providers()` — public → `{ providers: ProviderId[] }` (enabled ones, fixed order google,
  github, apple).
- `auth.oauth.start({ provider })` — public → `{ url, state, codeVerifier? }`; `NOT_FOUND` for a
  disabled provider.
- `auth.oauth.callback({ provider, code, codeVerifier?, appleUser?, client })` — public, reads the
  optional `x-session-token` → `AuthResult`. Order:
  1. `exchange` → `Profile`.
  2. `identities.findByProviderUser` → known: if a session user is present and differs → `CONFLICT`
     ("already connected to another account"); else the identity's user.
  3. Unknown identity, session user present (connecting): create the identity for the session user
     (its `email` column = profile email, may differ from the account's) → that user.
  4. Unknown identity, no session: `emailVerified && email` and a user with that email exists →
     if its `email_verified_at` is null, `purgeUnverifiedAccount` (clear the password, delete its
     sessions and identities, invalidate reset tokens, mark the email verified); create identity →
     that user. `emailVerified && email` and no
     user → `users.create({ email, passwordHash: null, name: profile.name ?? "", emailVerifiedAt: now })`
     + identity. Otherwise → `FORBIDDEN` ("That `<provider>` account's email is not verified — sign
     in with your email first, then connect it in your account").
  5. `issueSession(user, client)`.
- `auth.magicLink.request({ email })` — public, silent; limiter `magic:<email>` 3/15 min (same
  silent behaviour as the reset limiter); token purpose `magic_link`, TTL 15 min, `email` stored on
  the row when no user exists; mail `MagicLink` with `${AUTH_URL}/magic?token=…` through `detach()`.
- `auth.magicLink.consume({ token, client })` — public → `AuthResult`; `BAD_REQUEST` unless a live
  `magic_link` token; user = row's `user_id`, or `users.findByEmail(row.email)`, or
  `users.create({ email: row.email, passwordHash: null, emailVerifiedAt: now })`; if
  `email_verified_at` is null, `purgeUnverifiedAccount` as in callback step 4 (the link proved the
  email; the password may be a squatter's); invalidates the user's other `magic_link`
  tokens; `issueSession`.
- `auth.signIn` — unchanged signature; a user with `password_hash NULL` verifies against
  `DUMMY_HASH` and fails `UNAUTHORIZED` like a wrong password.
- `account.identities.list()` → `{ items: [{ provider, email, createdAt }] }`.
- `account.identities.disconnect({ provider })` → void; `NOT_FOUND` if none; `FORBIDDEN` when the
  user has no password and this is the last identity.
- `account.setPassword({ password })` → void; `CONFLICT` when a password exists; hashes, sets,
  invalidates `password_reset` tokens, sends the password-changed notice (no session revocation —
  nothing was compromised).
- `toUser` adds `hasPassword: row.password_hash !== null`.

### `apps/auth`

Route handlers:
- `GET /oauth/[provider]/start?next=` — provider not in `auth.providers()` → 404; else
  `auth.oauth.start`, set cookie `oauth` = JSON `{ provider, state, codeVerifier?, next }`
  (HttpOnly, Secure, `SameSite=None`, `Path=/oauth`, `Max-Age=600`), 302 to `url`.
- `GET /oauth/[provider]/callback` and `POST /oauth/apple/callback` (`application/x-www-form-urlencoded`:
  `code`, `state`, `user?`) — read + clear the cookie; missing cookie / state mismatch / provider
  mismatch → 302 `/login?error=state`; `error=access_denied` → `/login?error=cancelled`; else
  `auth.oauth.callback` with the session token forwarded when the browser has one, then
  `endCurrentSession` when a different user signs in (as the sign-in action does), `setSession`,
  302 `safeNextUrl(next)`. Api errors: `FORBIDDEN` → `/login?error=unverified&provider=<p>`,
  `CONFLICT` → `/login?error=claimed&provider=<p>` (or back to the account page when connecting),
  `BAD_GATEWAY` → `/login?error=provider&provider=<p>`, anything else → `/login?error=failed`.
  Pure core: `oauthCallbackCore(deps, input)` returning `{ redirectTo }` so the state/body/error
  mapping is unit-tested without a browser.
- Login page reads `error` + `provider` and shows one line per code via `FormMessage`'s error role.

Forms and pages:
- `SocialButtons({ providers, label, next })` — server-rendered from `auth.providers()`; links
  `/oauth/<p>/start?next=…`; nothing (and no divider) when empty.
- Login page: **Email me a sign-in link** form below the password form (`requestMagicLinkCore`,
  neutral success "Check your inbox for a sign-in link.").
- `/magic?token=` — token shape check; page renders a card with **Continue** (server action →
  `consumeMagicLinkCore` → `setSession` → redirect `safeNextUrl(next)`); failure state "This link
  has expired or was already used" → "Request a new one" (`/login`).

### `apps/account`

Security view adds **Sign-in methods**: password card (`SetPasswordForm` when `!user.hasPassword`,
the existing change form otherwise) and **Connected accounts** (`account.identities.list()`;
per provider: connected row with **Disconnect** — disabled with "This is your only way to sign in"
when `!hasPassword && items.length === 1` — or **Connect** → `${AUTH_URL}/oauth/<p>/start?next=<security page>`;
providers come from `auth.providers()`).

### `@repo/email`

`MagicLink({ link, brand? })`, subject "Your sign-in link", "works for 15 minutes", ignore-if-not-you
line; test + story.

### Docs

CLAUDE.md Authentication: **Social sign-in and magic link** paragraph (flow, where secrets live,
linking rule, env rows, redirect URIs, Apple key handling); `docs/guides/oauth-providers.md`
(Google Cloud, GitHub OAuth App, Apple Services ID + key: redirect URI `https://auth.<domain>/oauth/<p>/callback`,
dev `http://auth.brand.localhost:3002/oauth/<p>/callback`, scopes, Apple's 6-month secret note is
moot because Arctic signs per request); `apps/auth`, `apps/account`, `apps/api` READMEs; ROADMAP tick.

## Security rules (each with a test)

1. State random, cookie-bound, single-use, 10 min; mismatch never reaches the api. PKCE for Google.
2. Linking only on provider-asserted verified email; GitHub via `/user/emails` primary+verified.
   Linking or a magic-link consume into a never-verified account purges it first
   (`purgeUnverifiedAccount`): a squatter's password, sessions and identities do not survive.
3. Identity is the key: a provider-side email change does not create or re-link accounts.
4. Connecting: unclaimed identity only; claimed → `CONFLICT`; email mismatch with the signed-in user
   is allowed.
5. Magic link: 32-byte token, SHA-256 stored, 15 min, single use, others invalidated on consume;
   request silent + limited per email; unknown email creates on consume, verified.
6. Passwordless: `signIn` timing-equal failure; `setPassword` refuses an existing hash; last-method
   disconnect refused.
7. Secrets only in `apps/api`; Apple key parsed at boot; logs carry provider ids, never codes/tokens.

## Tests

- `apps/api`: provider adapters with fake `fetch` (Google id-token decode; GitHub emails choice;
  Apple id-token + `appleUser` name; `email_verified` string normalisation); callback matrix on
  SQLite + Postgres with an injected fake `Provider` (`createServer({ providers })`): new verified →
  passwordless verified account; existing email → linked + verified; known identity after email
  change → same user; unverified → `FORBIDDEN`, no rows; connect new → linked; connect claimed →
  `CONFLICT`; magic link request/consume/reuse/expiry/limiter/new-email creation; `setPassword` /
  `disconnect` rules; passwordless `signIn` fails like wrong password; migration rebuild keeps rows
  and the unique email index on SQLite, Postgres column nullable; `loadEnv` partial-provider matrix
  incl. PEM parse failure.
- `apps/auth`: `oauthCallbackCore` (missing cookie, state mismatch, provider mismatch, Apple body,
  each error code's redirect, `next` safety), `requestMagicLinkCore`, `consumeMagicLinkCore`, magic
  token shape.
- `apps/account`: `setPasswordCore`, `disconnectIdentityCore`.
- `@repo/email`: `MagicLink`; Storybook story.
- Browser pass: keyless state (no social block, no divider); magic link for an existing and a new
  address end to end from the api log (Continue button, reuse fails); set password on the new
  account, then password sign-in works; connected-accounts card renders with no providers. With
  Google/GitHub credentials in `apps/api/.env` (optional — the fake-provider tests are the gate):
  sign in with each, link to an existing account, connect/disconnect from the account page, Apple
  only if a Services ID exists.
- `bun run ci` green; Postgres run green.

## Out of scope

2FA, passkeys, further providers, email change, storing provider tokens / calling provider APIs
after sign-in, org invitations (6e), hard verification gates.
