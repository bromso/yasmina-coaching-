# Passkeys — design

After Phase 9 A–D the feature-parity benchmark's one open row is "Magic link / passkeys" (magic link
done, passkeys not). Approved in chat on 2026-10-17. One PR. Then Phase 9 E (security scanning).

## Intent

Let users sign in with a passkey (WebAuthn, discoverable credentials) and manage their passkeys on
the account Security page. Success: a user adds a passkey on `account`, signs out, and signs in on
`auth` with it — no password, no authenticator code — on any subdomain of the parent domain; losing
every device never locks anyone out.

Decided with the owner: a passkey **signs in on its own and counts as both factors** (it skips the
two-step code); users may hold several, named, removable; a passwordless account may rely on passkeys
alone.

## 1. Data and policy (`apps/api`)

- Migration `0024_passkeys`: `passkeys` (`id`, `user_id`, `credential_id` TEXT UNIQUE (base64url),
  `public_key` TEXT (base64url COSE), `counter` INTEGER, `transports` TEXT (JSON array) NULL, `name`
  TEXT, `created_at`, `last_used_at` NULL), index on `user_id`. `users.purge` deletes the user's
  passkeys; the privacy export lists them (name, created, last used — never key material).
- Challenges: a new `tokens` purpose `passkey_challenge` (hashed, single-use, 5 minutes), bound to the
  user for registration and unbound for sign-in; the challenge row also records the ceremony
  (`register` / `authenticate`).
- Relying party: `PASSKEY_RP_ID` (api env; default the parent domain — `COOKIE_DOMAIN` without its
  leading dot, `brand.localhost` in dev), `PASSKEY_RP_NAME` (default `BRAND_NAME`), and the expected
  origins = the `auth` and `account` origins (from `AUTH_URL` and `ACCOUNT_URL`). A wrong origin or RP
  ID is refused.
- Library: `@simplewebauthn/server` (api) and `@simplewebauthn/browser` (auth, account) — `catalog:`
  entries (two workspaces share the browser one; both are one family). User verification
  `required` (a passkey counts as both factors; tightened from `preferred` after checking v13's
  defaults, 2026-10-16); attestation `none`; resident key `required` (discoverable).
- Policy:
  - Passkey sign-in issues a session like `auth.signIn` and never returns a two-factor challenge.
    It applies everything `auth.signIn` applies after the password check except the code step:
    deletion-scheduled accounts sign in (to cancel), impersonation never comes from here, limiters
    (`passkey:<client>` 10 / 15 min, plus the sign-in limiter's api-wide cap).
  - The signature counter must increase when the authenticator reports a non-zero counter; a
    non-increasing one is refused (cloned authenticator) and recorded as a security event
    (`recordFailure`).
  - Registering needs the reauth window (`REAUTH_WINDOW_MS`) or the current password on an account
    with one — the same rule as two-step setup (`data.reason: "reauth"` / `"password"`); refused while
    impersonating (`FORBIDDEN` "Not available while impersonating").
  - A passwordless account with no connected provider can't delete its last passkey (`CONFLICT`,
    a translated message), like the last-identity rule.
  - Adding and removing mail the user (`passkeyAdded`, `passkeyRemoved`, en + sv, test + story).
  - `admin.users.removePasskeys({ userId, reason })` (superadmin, never self or another superadmin,
    reason 3–200, audited `user.passkeys_removed`, mails the user, ends their sessions).
- `User` gains `passkeys: number` (count) for the UI.

## 2. Procedures (`@repo/api-contract`)

- `account.passkeys.list` → `{ id, name, createdAt, lastUsedAt }[]`; `registerOptions({ password? })`
  → WebAuthn creation options JSON; `register({ response, name })` → the passkey; `rename({ id, name })`;
  `delete({ id })` — all ⚑.
- `auth.passkey.options()` → request options JSON + an opaque `challengeId`; `auth.passkey.verify({
  challengeId, response, client })` → `{ user, session }` (`SignInResultSchema`'s session branch).
- Names: 1–60 chars; default from the authenticator's transports ("This device" / "Security key"),
  user-editable.

## 3. UI

- `apps/auth` `/login`: **Sign in with a passkey** (a client component; absent without JavaScript —
  the page is unchanged then); the email field gets `autocomplete="username webauthn"` and
  conditional mediation (passkey autofill) where `PublicKeyCredential.isConditionalMediationAvailable`
  says yes; success sets the session cookie like password sign-in (a server action over
  `auth.passkey.verify`); errors (cancelled, unknown passkey, timed out) show in place, translated.
- `apps/account` Security: a **Passkeys** card (list, **Add a passkey**, rename inline, **Remove** with
  confirmation; the reauth/password prompt exactly like the two-step card's); read-only while
  impersonating; translated (en + sv), i18n-guard clean.
- `apps/auth` `/admin/users/<id>`: the passkey count and **Remove passkeys** (reason).
- CSP: no change (WebAuthn needs none).

## 4. Testing

- api (SQLite + Postgres): a software authenticator in test helpers (WebCrypto P-256, building real
  `attestationObject` / `authenticatorData` / `clientDataJSON` with `none` attestation) drives
  register + sign-in; tests for a wrong origin, a wrong RP ID, a replayed / expired / wrong-ceremony
  challenge, a non-increasing counter, the last-passkey rule, reauth/password rules, impersonation,
  passkey sign-in skipping two-factor for a user with 2FA on, limiters, purge and export.
- auth/account action cores (unit) and the i18n guards.
- e2e: Playwright's Chromium virtual authenticator (CDP `WebAuthn.addVirtualAuthenticator`, internal,
  resident keys, user verification) — add a passkey on Security, sign out, sign in with it on /login;
  plus the a11y sweep/manifest covers the new card states.
- Docs: CLAUDE.md (**Passkeys** paragraph under Authentication; env rows `PASSKEY_RP_ID`,
  `PASSKEY_RP_NAME`), apps/api, auth, account READMEs, `docs/guides/` (passkeys section in the auth
  guide or a new `passkeys.md` covering RP ID and subdomains), the help center's two-step article
  gains a passkeys paragraph; the ROADMAP gains a short "After Phase 9" list with passkeys on it
  (ticked on merge).

## Out of scope

Passkeys as a second factor after a password, cross-device hybrid flows beyond what browsers do
natively, attestation verification / authenticator allowlists, passkey-only sign-up (sign-up still
creates the account first; a passkey is added after), conditional create.
