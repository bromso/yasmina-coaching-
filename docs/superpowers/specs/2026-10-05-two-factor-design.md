# Two-factor authentication — design

Sub-project A of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content: `apps/blog` + docs engine → G i18n), agreed
2026-10-05. Each is its own spec, plan and PR. Approved in chat section by section.

## Intent

A user can protect their account with an authenticator app. Once on, no sign-in method issues a
session without a second factor; losing the phone has a recovery path that does not weaken it.

Decided with the owner:

- Factors: **TOTP + recovery codes** (no passkeys, no email codes).
- Enforcement: **every sign-in method** — password, magic link, Google/GitHub/Apple.
- State between the two steps: **a challenge token** (no session until the code is right).

## 1. Data model and secret storage

Migration `0013_two_factor`:

| Change | Purpose |
|---|---|
| `users.two_factor_secret TEXT NULL` | the TOTP secret, encrypted (`v1:<iv b64>:<ciphertext b64>`) |
| `users.two_factor_enabled_at TEXT NULL` | null = off; what every sign-in path checks |
| `users.two_factor_last_step INTEGER NULL` | last accepted TOTP time step (replay protection) |
| `two_factor_recovery_codes (id, user_id → users ON DELETE CASCADE, code_hash, used_at, created_at)` | one row per code; `code_hash` = SHA-256 (high-entropy codes, like tokens) |
| `tokens.purpose` gains `two_factor_challenge` | the challenge, hashed, single-use (CHECK extended as `0005` did) |

- **Encryption:** AES-256-GCM via Web Crypto, random 12-byte IV per secret, key from
  `TWO_FACTOR_ENCRYPTION_KEY` (32 bytes, base64). Required in production: the api exits at
  startup without it (like the other secrets); outside production a fixed dev key. Not derived
  from `API_SERVICE_TOKEN` (rotating it would lock every 2FA user out). The `v1:` prefix leaves
  room for key rotation.
- **Two-step enablement:** setup stores the encrypted secret with `two_factor_enabled_at` null;
  only a correct first code sets it. An abandoned setup cannot lock anyone out; setup again
  replaces an unconfirmed secret.
- **TOTP:** RFC 6238 defaults (SHA-1, 6 digits, 30 s), ±1 step window, a code whose step is not
  greater than `two_factor_last_step` is refused (no replay within its window).
- **Library:** `@oslojs/otp` (and `@oslojs/encoding` for base32), from the author of Arctic;
  checked against the RFC 6238 test vectors.

## 2. The api (`@repo/api-contract`, `apps/api`)

- `auth.signIn`, `auth.magicLink.consume`, `auth.oauth.callback` return
  `{ user, session } | { twoFactor: { challenge, expiresAt } }`. The challenge (32 random bytes,
  stored hashed, 5 minutes, bound to the user and the would-be session's client info) replaces the
  session when `two_factor_enabled_at` is set. Everything before it (password check, unverified-
  account purge, provider linking, rate limits) is unchanged. `auth.signUp` and admin
  impersonation never challenge.
- `auth.twoFactor.verify({ challenge, code })` (anonymous) — the only way past a challenge. Accepts
  a 6-digit TOTP code or a recovery code (`xxxxx-xxxxx`, 10 lowercase base32 chars; a used one is
  marked `used_at`). Five wrong codes burn the challenge; a per-user limiter allows 10 attempts per
  15 minutes across challenges. Wrong code, expired, burnt and unknown challenge all answer the
  same `UNAUTHORIZED` message. Success issues the session exactly as `issueSession` does today.
- `account.twoFactor` (⚑):
  - `get` → `{ enabled, recoveryCodesLeft }`
  - `setup` → `{ secret, otpauthUrl }` (refused while enabled; replaces an unconfirmed secret).
    The `otpauth://` label is `BRAND_NAME:<email>`, issuer `BRAND_NAME`.
  - `enable({ code })` → `{ recoveryCodes: string[10] }` (shown once)
  - `disable({ code })` — TOTP or recovery code required; clears secret, last step and codes
  - `regenerateRecoveryCodes({ code })` → `{ recoveryCodes }` (replaces all)
  - The four writes answer `FORBIDDEN` "Not available while impersonating" for an impersonation
    session, like `account.changePassword`.
- `admin.users.resetTwoFactor({ userId, reason })` — superadmin; reason 3–200 chars; never
  yourself or another superadmin; clears 2FA, ends the user's sessions, writes audit
  `user.two_factor_reset`, mails the user.
- Mail (`@repo/email`, each with a test and a story): `twoFactorEnabled`, `twoFactorDisabled`,
  `twoFactorReset`; sent detached like `passwordChanged`.

## 3. The sign-in step (`apps/auth`)

- The password action, the magic-link **Continue** action and the OAuth callback route, on
  `{ twoFactor }`: set cookie `two_factor` (challenge; host-only on auth, HttpOnly, SameSite=Lax,
  Path=/, Secure over https, Max-Age 300) and redirect to `/login/verify?next=<next>`.
- `/login/verify`: one form — a 6-digit code (`inputmode="numeric"`, `autocomplete="one-time-code"`)
  or, with `?recovery=1` (a link, no JS), a recovery code. The action calls `auth.twoFactor.verify`:
  success → clear the cookie, set the session cookie as password sign-in does (ending a previous
  session), redirect to the safe `next`; wrong code → message on the page; burnt/expired → redirect
  to `/login?error=two_factor_expired` ("Your sign-in timed out. Sign in again."). Without the
  cookie the page redirects to `/login`.
- `form-feedback` components; `robots` disallows `/login/verify`; no root `loading.tsx`.

## 4. Enrolment and management (`apps/account`)

- A "Two-step verification" card on the Security page, server-rendered, works without JS.
- Off → **Turn on** → setup on one page: (1) QR as inline SVG from the `otpauth://` URL, rendered
  on the server with `uqr` (added to `apps/account` only) plus the secret in groups of four;
  (2) a code field → `enable`; (3) the ten recovery codes, once, with **Copy** and **Download .txt**
  and a "you will not see these again" note. Reloading restarts setup.
- On → status, codes left (warning at ≤ 3), **Regenerate recovery codes** and **Turn off**, each
  asking for a current code.
- While impersonating: read-only with the impersonation note.
- The QR never leaves the account server's HTML (no third-party QR service), and the private
  service worker never caches documents.

## 5. Recovery, limits, testing, docs

- Lost phone: a recovery code; with none left, an admin reset (§2). No email bypass of 2FA.
- Password reset by email sets a new password only; 2FA stays on and the next sign-in still asks.
  Turning 2FA on keeps existing sessions; turning it off needs a code.
- Tests:
  - api (SQLite + Postgres): each sign-in path challenges a 2FA account and issues no session
    before `verify`; wrong / expired / replayed code refused; burnt challenge refused; per-user
    limiter; recovery codes single-use; `disable` needs a code; impersonation refused for the
    writes; admin reset audited and ends sessions; the stored secret is not the base32 secret.
  - TOTP against the RFC 6238 vectors (SHA-1).
  - `apps/auth` and `apps/account` action cores (fake api).
  - `@repo/email` templates; Storybook stories for the account card's states.
  - e2e: enable in account (in-test TOTP from the shown secret), sign out, sign in → code step;
    wrong code refused, right code signs in; a recovery code works once.
- Docs: CLAUDE.md (an Authentication paragraph, `TWO_FACTOR_ENCRYPTION_KEY` in the env table,
  `0013`), `apps/api/README.md`, `apps/auth/README.md`, `apps/account/README.md`, the deploying
  guide's env table, `.env.example` files, ROADMAP (this row ticked; i18n and background jobs moved
  out of "decisions for the owner"; the A–G list).

## Out of scope

Passkeys / WebAuthn; email or SMS codes; "remember this device"; workspace-level 2FA
enforcement; requiring 2FA for superadmins (a sensible follow-up once this lands).
