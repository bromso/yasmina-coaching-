# Two-factor authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TOTP + recovery-code two-factor authentication that gates every sign-in method behind a
challenge, with enrolment in `apps/account`, the code step in `apps/auth`, and an admin reset.

**Architecture:** `apps/api` owns everything security-relevant: an encrypted TOTP secret on
`users`, hashed recovery codes, and a hashed single-use challenge in `tokens`. The three sign-in
procedures return `{ twoFactor: { challenge } }` instead of a session for a 2FA account; only
`auth.twoFactor.verify` issues one. The Next apps only carry the challenge (a host-only cookie on
auth) and render forms.

**Tech Stack:** Bun 1.4.2, `Bun.sql` (SQLite + Postgres), oRPC contract, `@oslojs/otp` +
`@oslojs/encoding`, Web Crypto AES-GCM, Next 16.2 server actions, React Email, `uqr`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-two-factor-design.md`

## Global Constraints

- Branch `feat/two-factor` (spec commit 1567688 on main 0fcfbfa). One PR. Never stacked.
- Commit trailer, exactly: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  Conventional Commits (header ≤ 100 chars, commitlint); Biome clean with zero warnings.
- New deps through the root `catalog` when two workspaces use them, else local (CLAUDE.md
  "Dependency Versioning"): `@oslojs/otp`, `@oslojs/encoding` in `apps/api`; `uqr` in
  `apps/account`.
- Migration is a new file `apps/api/src/migrations/0013_two_factor.ts`, listed in
  `migrations/index.ts`; never edit a merged migration. Both dialects (look at `0005_identities.ts`
  for the SQLite table rebuild that extends the `tokens.purpose` CHECK).
- `TWO_FACTOR_ENCRYPTION_KEY`: 32 bytes base64; required when `NODE_ENV=production` (the api exits
  at startup naming it); a fixed dev key otherwise.
- TOTP: SHA-1, 6 digits, 30 s, window ±1 step, replay refused via `users.two_factor_last_step`.
- Recovery codes: 10, format `xxxxx-xxxxx` (lowercase base32 alphabet), SHA-256 hashed, single use.
- Challenge: purpose `two_factor_challenge` in `tokens`, 32 random bytes (`newToken()`), stored as
  `tokenHash()`, 5 minutes, at most 5 wrong codes, then burnt.
- Per-user verify limiter: 10 attempts / 15 min (`createMemoryRateLimiter`, key
  `2fa:user:<userId>`).
- One `UNAUTHORIZED` message for wrong / expired / burnt / unknown challenge:
  `"That code didn't work. Check your authenticator app and try again."`; a burnt or expired
  challenge is told apart only by a distinct error code `BAD_REQUEST`
  `"Your sign-in timed out. Sign in again."` (so the auth app can send the user back to /login).
- **Ruling (deviation from the spec's "bound to the would-be session's client info"):** the session
  issued by `verify` takes `client` from the `verify` input (same browser, one step later, exactly as
  `signIn` passes it today) — `tokens` has no client column and the binding adds nothing a
  challenge-holder could not supply.
- Impersonation sessions: the four `account.twoFactor` writes answer `FORBIDDEN`
  `"Not available while impersonating"` (reuse the existing guard used by `changePassword`).
- No root `loading.tsx` anywhere (CLAUDE.md Status pages). Forms use `@repo/ui` form-feedback.

## Review Focus

1. A 2FA account must never receive a session from `signIn`, `magicLink.consume` or `oauth.callback`
   (including the OAuth "connect while signed in" branch, which must keep working without a
   challenge because the caller already has a session) — pinned by api tests in Task 3.
2. Replay: the same TOTP code accepted twice within its window → refused — Task 1 unit + Task 3 api.
3. Disabling 2FA with only a session (no code) → refused; with a recovery code → allowed — Task 4.
4. An expired or burnt challenge in the auth app sends the user to `/login` with the timed-out
   message rather than an endless error on `/login/verify` — Task 5 action-core test.
5. The secret at rest is not the base32 secret, and `TWO_FACTOR_ENCRYPTION_KEY` missing in
   production fails at boot — Task 1 / Task 2 tests.

---

### Task 1: TOTP, secret encryption and recovery codes (pure modules)

**Files:**
- Create: `apps/api/src/two-factor/totp.ts`, `apps/api/src/two-factor/secret.ts`,
  `apps/api/src/two-factor/recovery.ts`, `apps/api/src/two-factor/two-factor.test.ts`
- Modify: `apps/api/package.json` (deps), `apps/api/src/env.ts` (+ `env.test.ts`),
  `apps/api/.env.example`

**Interfaces (Produces):**
```ts
// totp.ts
export const TOTP_PERIOD_SECONDS = 30
export function generateTotpSecret(): Uint8Array            // 20 random bytes
export function encodeSecret(secret: Uint8Array): string     // base32, no padding, upper
export function otpauthUrl(secret: Uint8Array, account: string, issuer: string): string
/** The matched time step, or null. Refuses steps <= lastStep (replay). Window ±1. */
export function verifyTotp(secret: Uint8Array, code: string, lastStep: number | null, now?: number): number | null
// secret.ts
export async function encryptSecret(secret: Uint8Array, keyB64: string): Promise<string>   // "v1:<iv>:<ct>"
export async function decryptSecret(stored: string, keyB64: string): Promise<Uint8Array>
// recovery.ts
export function generateRecoveryCodes(count?: number): string[]  // 10 × "xxxxx-xxxxx"
export function normalizeRecoveryCode(input: string): string | null // trims, lowercases, adds dash; null if malformed
export function looksLikeRecoveryCode(input: string): boolean
```
Hash recovery codes with the existing `tokenHash()` from `apps/api/src/credentials.ts`.

- [ ] **Step 1:** Write `two-factor.test.ts`: RFC 6238 Appendix B SHA-1 vectors (secret ASCII
  `"12345678901234567890"`, times 59 → 94287082, 1111111109 → 07081804, 1111111111 → 14050471,
  1234567890 → 89005924, 2000000000 → 69279037, 20000000000 → 65353130; compare the last 6 digits
  through `verifyTotp` at that `now`), window ±1 accepts the neighbouring steps and refuses ±2,
  replay (`lastStep` = matched step → null), malformed codes (`"12345"`, `"abcdef"`) → null;
  encrypt→decrypt round-trip, two encryptions of one secret differ (random IV), the stored string
  starts `v1:` and does not contain `encodeSecret(secret)`, decrypt with the wrong key throws;
  recovery codes: 10, unique, match `/^[a-z2-7]{5}-[a-z2-7]{5}$/`, normalize `" ABCDE FGHIJ "` →
  `"abcde-fghij"`. Run: `cd apps/api && bun test src/two-factor` → FAIL (missing modules).
- [ ] **Step 2:** `bun add @oslojs/otp @oslojs/encoding` in `apps/api`; implement the three modules
  (`@oslojs/otp`'s `generateTOTP` / `verifyTOTPWithGracePeriod` or compute per step for the
  last-step check; AES-GCM via `crypto.subtle.importKey("raw", …, "AES-GCM")`).
- [ ] **Step 3:** `env.ts`: `TWO_FACTOR_ENCRYPTION_KEY` — optional string; in the production branch
  of `loadEnv` throw `"TWO_FACTOR_ENCRYPTION_KEY is not set"` when missing; validate it decodes to
  32 bytes (throw a clear message otherwise); outside production default to a fixed dev key
  (`DEV_TWO_FACTOR_KEY`, 32 zero-free bytes, base64). Tests in `env.test.ts`. Document in
  `.env.example` (`openssl rand -base64 32`).
- [ ] **Step 4:** `bun test src/two-factor src/env.test.ts` → PASS; typecheck; commit
  `feat(api): TOTP, secret encryption and recovery codes for two-factor`.

### Task 2: Migration 0013 and queries

**Files:**
- Create: `apps/api/src/migrations/0013_two_factor.ts`, `apps/api/src/queries/two-factor.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/queries/users.ts` (UserRow + columns),
  `apps/api/src/queries/tokens.ts` (`TokenPurpose`, `peek`), `apps/api/src/db.ts` (wire the new
  query module), `apps/api/src/queries/queries.test.ts`

**Interfaces (Produces):**
```ts
// users.ts — UserRow gains:
two_factor_secret: string | null
two_factor_enabled_at: string | null
two_factor_last_step: number | null
// tokens.ts
export type TokenPurpose = "password_reset" | "email_verify" | "magic_link" | "two_factor_challenge"
peek(tokenHash: string, purpose: TokenPurpose, at: string): Promise<{ userId: number | null } | undefined> // no consume
// two-factor.ts → db.twoFactor
setPendingSecret(userId: number, encrypted: string): Promise<void>      // enabled_at stays null, last_step null
enable(userId: number, at: string, recoveryCodeHashes: string[]): Promise<void>  // transaction: enabled_at, replace codes
disable(userId: number): Promise<void>                                  // clears secret/enabled_at/last_step + codes
setLastStep(userId: number, step: number): Promise<boolean>              // UPDATE … WHERE last_step IS NULL OR last_step < step; false if lost the race
replaceRecoveryCodes(userId: number, hashes: string[]): Promise<void>
useRecoveryCode(userId: number, hash: string, at: string): Promise<boolean> // UPDATE … used_at WHERE unused; true if consumed
recoveryCodesLeft(userId: number): Promise<number>
```

- [ ] **Step 1:** Queries tests (both dialects via the existing `queries.test.ts` harness): pending
  secret leaves `two_factor_enabled_at` null; `enable` stores 10 codes and sets the timestamp;
  `useRecoveryCode` works once; `setLastStep` refuses a non-increasing step; `disable` clears all;
  `tokens.create` accepts `two_factor_challenge`; `peek` does not consume. Run → FAIL.
- [ ] **Step 2:** Migration 0013 (columns + table with `ON DELETE CASCADE` + index on `user_id`;
  extend the `tokens.purpose` CHECK as `0005` did for each dialect). Queries. Run → PASS on
  `bun test` and `bun run test:postgres` (needs `TEST_DATABASE_URL`, see apps/api/README.md).
- [ ] **Step 3:** Commit `feat(api): two-factor schema (0013) and queries`.

### Task 3: Contract and the challenge flow

**Files:**
- Modify: `packages/api-contract/src/auth.ts`, `packages/api-contract/src/index.ts`,
  `apps/api/src/router.ts`, `apps/api/src/server.ts` (verify limiter option + default),
  `apps/api/src/test-server.ts` (generous default limiter)
- Create: `apps/api/src/two-factor.test.ts`

**Interfaces (Produces):**
```ts
// auth.ts
export const TwoFactorChallengeSchema = z.object({ twoFactor: z.object({ challenge: z.string(), expiresAt: z.iso.datetime() }) })
export const SignInResultSchema = z.union([AuthResultSchema, TwoFactorChallengeSchema])
export const TwoFactorVerifySchema = z.object({ challenge: z.string().min(1).max(128), code: z.string().trim().min(6).max(20), client: ClientInfoSchema.optional() })
export const isTwoFactorChallenge = (r: z.infer<typeof SignInResultSchema>): r is z.infer<typeof TwoFactorChallengeSchema> => "twoFactor" in r
```
`auth.signIn`, `auth.magicLink.consume`, `auth.oauth.callback` output → `SignInResultSchema`
(`auth.signUp` stays `AuthResultSchema`). New `auth.twoFactor.verify` (POST `/auth/two-factor/verify`)
→ `AuthResultSchema`, errors `UNAUTHORIZED` and `BAD_REQUEST` with the Global Constraints messages,
and `TOO_MANY_REQUESTS`.

In `router.ts`: a helper `issueSessionOrChallenge(context, user, client)` used by the three paths in
place of `issueSession` — when `user.two_factor_enabled_at` is set, create a `two_factor_challenge`
token (5 min) and return `{ twoFactor }`; else `issueSession`. The OAuth **connect** branch (a
signed-in caller attaching a provider) returns its existing result without a challenge.
`verify`: per-user limiter → `peek` the challenge (missing/expired → `BAD_REQUEST`) → load the user
→ if `looksLikeRecoveryCode(code)` use `useRecoveryCode(tokenHash(normalized))`, else decrypt the
secret and `verifyTotp(…, user.two_factor_last_step)` then `setLastStep` (false → treat as wrong) →
wrong: count attempts on an in-memory limiter keyed `2fa:challenge:<hash>` (5 per 5 min); on the
5th, consume the token and answer `BAD_REQUEST`; otherwise `UNAUTHORIZED` → right: `consume` the
token, `issueSession(user, input.client)`.

- [ ] **Step 1:** Write `two-factor.test.ts` against the real server (`start()`, `signUp(app)`);
  enable 2FA for a user directly through `db`-free means: call `account.twoFactor.setup/enable` is
  Task 4, so here seed through a test helper in `test-server.ts` (`enableTwoFactor(app, userId)`
  that writes via the queries and returns the raw secret). Cases: signIn returns `{ twoFactor }`
  and no session row is created (count sessions before/after); magic-link consume likewise; OAuth
  callback likewise with the fake provider used in `auth.test.ts`; OAuth connect while signed in is
  unaffected; verify with the right TOTP → `{ user, session }` and `auth.me` works with it; same
  code twice → second `UNAUTHORIZED`; wrong code ×5 → `BAD_REQUEST` and the challenge is dead;
  expired challenge (advance time via a short TTL option or by editing `expires_at`) → `BAD_REQUEST`;
  recovery code works once; per-user limiter (inject a limit of 2) → `TOO_MANY_REQUESTS`; a non-2FA
  account still gets a session straight from signIn. Run → FAIL.
- [ ] **Step 2:** Implement contract + router; update every caller of the three procedures'
  outputs that the typecheck flags (`apps/auth` callers are Task 5 — make the typecheck pass there
  minimally by narrowing with `isTwoFactorChallenge` and treating a challenge as "not yet
  supported" ONLY IF needed to keep the build green; Task 5 replaces it).
- [ ] **Step 3:** `cd apps/api && bun test && bun run test:postgres`, `bun run typecheck` → PASS.
  Commit `feat(api,api-contract): two-factor challenge on every sign-in path; auth.twoFactor.verify`.

### Task 4: Managing 2FA, admin reset and the three emails

**Files:**
- Modify: `packages/api-contract/src/index.ts` (+ schemas in `auth.ts` or a new `two-factor.ts`),
  `apps/api/src/router.ts`, `packages/email/src/index.tsx`
- Create: `packages/email/src/templates/two-factor-enabled.tsx`, `two-factor-disabled.tsx`,
  `two-factor-reset.tsx` (+ tests in `packages/email/src/index.test.tsx`),
  `apps/story/stories/email/TwoFactor*.stories.tsx` (follow the existing email stories)
- Test: extend `apps/api/src/two-factor.test.ts`, `apps/api/src/admin.test.ts`

**Interfaces (Produces):** `account.twoFactor.get` → `{ enabled: boolean, recoveryCodesLeft: number }`;
`setup` → `{ secret: string, otpauthUrl: string }` (`CONFLICT` when enabled); `enable({ code })` →
`{ recoveryCodes: string[] }`; `disable({ code })` → void; `regenerateRecoveryCodes({ code })` →
`{ recoveryCodes: string[] }`; all ⚑, writes refused while impersonating; wrong code `UNAUTHORIZED`
`"That code didn't work. Check your authenticator app and try again."`. `admin.users.resetTwoFactor({ userId, reason })`
(superadmin middleware; reason 3–200; refuses self and other superadmins like impersonation does;
ends the user's sessions; audit action `user.two_factor_reset`; mails `twoFactorReset`).
`otpauthUrl` uses issuer `BRAND_NAME` (from `@repo/sites`) and account `user.email`.

- [ ] **Step 1:** Tests: setup→enable with a code from the returned secret → 10 codes, `get` shows
  enabled; enable with a wrong code refused and stays disabled; setup again while pending replaces
  the secret; setup while enabled → `CONFLICT`; disable without a valid code refused, with a TOTP or
  a recovery code allowed; regenerate invalidates old codes; impersonation session → `FORBIDDEN`
  for the four writes; admin reset: audited, sessions gone, user can sign in without a code after;
  mails sent (`mailsTo`) for enable, disable and reset; email templates render subject + text.
  Run → FAIL.
- [ ] **Step 2:** Implement; templates mirror `password-changed.tsx`. Run all api + email tests →
  PASS; commit `feat(api,email): manage two-factor, admin reset, notices`.

### Task 5: The code step in apps/auth

**Files:**
- Create: `apps/auth/src/app/login/verify/page.tsx`, `apps/auth/src/app/login/verify/actions.ts`,
  `apps/auth/src/views/verify-view.tsx`, `apps/auth/src/lib/two-factor.ts` (+ `.test.ts`)
- Modify: `apps/auth/src/lib/actions.ts` (signInCore, consumeMagicLinkCore), `apps/auth/src/lib/oauth.ts`
  (oauthCallbackCore), `apps/auth/src/app/oauth/[provider]/callback/route.ts`,
  `apps/auth/src/app/login/actions.ts`, `apps/auth/src/app/magic/actions.ts`,
  `apps/auth/src/lib/routes.ts` + `robots.ts` (disallow `/login/verify`), the login page/view
  (the `two_factor_expired` error message)

**Interfaces (Produces):** `TWO_FACTOR_COOKIE = "two_factor"`, `twoFactorCookieAttributes(secure: boolean)`
(HttpOnly, SameSite=Lax, Path=/, Max-Age 300, host-only); cores return a new variant
`{ challenge: string, next: string }` that the thin actions/route turn into `cookies().set(...)` +
`redirect("/login/verify?next=…")`; `verifyTwoFactorCore(deps, fd)` → `FormState | { redirectTo }`
(`BAD_REQUEST` → `{ redirectTo: "/login?error=two_factor_expired" }`, `UNAUTHORIZED` → field error
on `code`, success → set session, end previous, `{ redirectTo: safeNextUrl(next) }`).

- [ ] **Step 1:** Unit tests (fake api, like `actions.test.ts`): signInCore / consumeMagicLinkCore /
  oauthCallbackCore return the challenge variant on `{ twoFactor }` and never call `setSession`;
  verify core: success sets the session and redirects to next; wrong code keeps the user on the
  page with the message; `BAD_REQUEST` redirects to `/login?error=two_factor_expired`; recovery
  input passes through; missing cookie → redirect `/login`. Run → FAIL.
- [ ] **Step 2:** Implement; the verify page reads the cookie server-side (redirect to `/login`
  without it), renders the form with `form-feedback`, a `?recovery=1` link swaps the field. Run
  `cd apps/auth && bun test`, typecheck, Biome → PASS. Commit `feat(auth): two-factor code step`.

### Task 6: Enrolment in apps/account and the admin reset button

**Files:**
- Create: `apps/account/src/components/two-factor-card.tsx` (+ story
  `apps/story/stories/TwoFactorCard.stories.tsx` for off / setup / on), account action cores in
  `apps/account/src/lib/actions.ts` (+ tests)
- Modify: `apps/account/src/app/(account)/security/page.tsx` + `actions.ts`,
  `apps/account/src/views/security-view.tsx`, `apps/account/package.json` (`uqr`),
  `apps/auth/src/app/admin/(gated)/users/[id]/page.tsx` + `apps/auth/src/lib/admin-actions.ts`
  (+ tests)

- [ ] **Step 1:** Tests for the account cores (`setupTwoFactorCore`, `enableTwoFactorCore`,
  `disableTwoFactorCore`, `regenerateRecoveryCodesCore`): success paths return what the card needs
  (secret + QR SVG string, recovery codes), wrong code → field error, impersonation `FORBIDDEN` →
  the message; admin core `resetTwoFactorCore` validates the reason and calls the api. Run → FAIL.
- [ ] **Step 2:** Implement the card (server-rendered; QR via `uqr`'s `renderSVG(otpauthUrl)`;
  secret shown in groups of 4; recovery codes in a `<pre>` with Copy (progressive) and a
  `data:text/plain` Download link; warning when ≤ 3 left; read-only while impersonating). Admin user
  page: **Reset two-step verification** form with a reason, shown only when the user has 2FA (add
  `twoFactorEnabled` to the admin user detail output if missing — then it is a contract change in
  this task, with its api test). Run the account + auth + story tests (`cd apps/story && bunx vitest
  run stories/TwoFactorCard`), typecheck, Biome → PASS. Commit
  `feat(account,auth): two-factor enrolment and admin reset`.

### Task 7: e2e journey and docs

**Files:**
- Create: `apps/e2e/tests/two-factor.spec.ts`
- Modify: `apps/e2e/e2e.env.ts` (`TWO_FACTOR_ENCRYPTION_KEY` for the production-mode api),
  `apps/e2e/package.json` (`@oslojs/otp` for the in-test generator, via catalog if apps/api uses the
  same — then move both to the catalog), `apps/e2e/README.md`, CLAUDE.md, `apps/api/README.md`,
  `apps/auth/README.md`, `apps/account/README.md`, `docs/guides/deploying.md`, root `.env.example`,
  `docs/ROADMAP.md`

- [ ] **Step 1:** e2e: sign up + verify; account Security → Turn on; read the secret from the page,
  compute a code, confirm; read one recovery code; sign out; sign in with the password → lands on
  `/login/verify`; a wrong code shows the message; the right code (next step, to avoid replay)
  lands in the app; sign out, sign in, use the recovery code → in; reuse it → refused.
- [ ] **Step 2:** Docs per the spec §5 (CLAUDE.md Authentication paragraph + env table row
  `TWO_FACTOR_ENCRYPTION_KEY` | api | dev key | required; e2e counts; ROADMAP: tick "Two-factor",
  add the A–G list, move i18n and background jobs out of "decisions for the owner").
- [ ] **Step 3:** Full gate: `bun run ci` exit 0; build www/app/auth/account and
  `cd apps/e2e && CI=1 bunx playwright test --retries=0` all pass. Commit
  `test(e2e),docs: two-factor journey and docs`.
