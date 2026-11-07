# Security follow-ups (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the security follow-ups Phase 7 left open: re-auth before two-step setup, a fair
two-factor limiter, the recovery-code race, no session surviving a reset, image metadata by
allowlist, Compose ports on loopback, plus `apps/app`'s dead dependencies and two stale comments.

**Architecture:** All server changes live in `apps/api` (router handlers, queries, one migration)
and `@repo/service-kit`'s limiter; the UI changes are `apps/account`'s two-step card and
`apps/auth`'s `/login` (`reauth=1`). Contract changes go through `@repo/api-contract`; every new
user-facing message gets an `api`/`account`/`auth` catalog key in English and Swedish.

**Tech Stack:** Bun 1.4.2, oRPC, `Bun.sql` (SQLite + Postgres), Next 16.2, next-intl, Zod 4,
`bun test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-followups-sweep-design.md` (§1–§7 only; §8–§11 are
PR 2 and out of scope here).

## Global Constraints

- Branch `fix/security-followups`; never stack on another branch.
- Biome clean with zero warnings/infos (`bunx biome ci .`); double quotes, no semicolons, 2 spaces, 100 columns.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new environment variable. No new dependency.
- Every api test that touches the database must pass on SQLite and on Postgres (the `start()`
  helper in `apps/api/src/test-server.ts` runs both when `TEST_DATABASE_URL` is set; CI's
  `api-postgres` job does).
- A schema change is a new migration file listed in `apps/api/src/migrations/index.ts`; never edit
  a merged migration.
- Every user-facing api message goes through `apiMessage(context, key)`; every new key exists in
  `packages/i18n/messages/en/*.json` and `sv/*.json` (the parity test fails otherwise). The
  English text of an api key that has a contract constant must equal that constant
  (`apps/api/src/i18n.test.ts`).
- The hard-coded-string guard (`src/i18n-guard.test.ts` in `auth`, `account`) stays green with an
  empty allow-list.
- `REAUTH_WINDOW_MS = 10 * 60 * 1000`; two-factor limiter budget 10 per 15 minutes per key; keys
  `2fa:verify:<userId>` and `2fa:manage:<userId>`.

## Review Focus

1. A correct code after nine wrong ones still signs in (the tenth slot is a failure budget, not an
   attempt budget) — and an eleventh wrong code is refused before the code is even checked.
2. A passwordless account whose session is 9 minutes old can start setup; at 11 minutes it gets
   `reason: "reauth"`, and the account card shows the sign-in-again link instead of an error.
3. A password account that omits `currentPassword` (an old client, or a form posted without the
   field) is refused, not let through.
4. A challenge issued *before* a password change cannot become a session afterwards, even when the
   right TOTP code arrives.
5. A PNG whose first chunk is not `IHDR` (or that has two) is refused, and a WebP with an unknown
   chunk is stored without it.

Each line has a test in the owning task (Tasks 1, 3, 3, 2, 5).

---

### Task 1: A two-factor limiter that counts failures only

**Files:**
- Modify: `packages/service-kit/src/rate-limit.ts`
- Test: `packages/service-kit/src/rate-limit.test.ts`
- Modify: `apps/api/src/server.ts:117,227-228` (type of `twoFactorUserLimiter`)
- Modify: `apps/api/src/context.ts` (wherever `twoFactorUserLimiter` is typed — `grep -n twoFactorUserLimiter apps/api/src`)
- Modify: `apps/api/src/router.ts` (`auth.twoFactor.verify` ~1049, `account.twoFactor.enable` ~1268, `disable` ~1306, `regenerateRecoveryCodes` ~1323)
- Test: `apps/api/src/two-factor.test.ts`

**Interfaces:**
- Produces: `RateLimiter` gains an optional `check?(key: string): RateLimitResult | Promise<RateLimitResult>`
  (peek: is the key over budget, without counting). `createMemoryRateLimiter` implements it.
  A new exported type `FailureLimiter = { check(key: string): RateLimitResult | Promise<RateLimitResult>; hit(key: string): RateLimitResult | Promise<RateLimitResult> }`.
- Produces (api, used by Task 3): a router-local helper
  `async function twoFactorBudget(context: Context, key: string): Promise<boolean>` returning
  `false` when the key is over budget, and `async function spendTwoFactorFailure(context: Context, key: string): Promise<void>`;
  keys built by `const verifyKey = (id: number) => \`2fa:verify:${id}\`` and
  `const manageKey = (id: number) => \`2fa:manage:${id}\``.

- [ ] **Step 1: Write the failing limiter test** in `packages/service-kit/src/rate-limit.test.ts`:

```ts
test("check peeks without counting", () => {
  let t = 0
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => t })
  expect(limiter.check("k")).toEqual({ allowed: true })
  expect(limiter.check("k")).toEqual({ allowed: true })
  limiter.hit("k")
  limiter.hit("k")
  expect(limiter.check("k").allowed).toBe(false) // the budget is spent
  expect(limiter.hit("k").allowed).toBe(false)
  t = 1000
  expect(limiter.check("k")).toEqual({ allowed: true }) // the window passed
  expect(limiter.size()).toBe(1) // check never creates a window
})
```

`check` is allowed exactly when the next `hit` would be allowed (no live window, or
`count < limit`), and it never creates or changes a window.

- [ ] **Step 2: Run it** — `bun test packages/service-kit/src/rate-limit.test.ts` → FAIL (`check` is not a function).

- [ ] **Step 3: Implement `check`** in `createMemoryRateLimiter` (return type adds `check(key: string): RateLimitResult`), and add `check?` to the `RateLimiter` interface plus the `FailureLimiter` type:

```ts
    check(key) {
      const t = now()
      const current = windows.get(key)
      if (!current || t - current.start >= windowMs || current.count < limit) return { allowed: true }
      const retryAfterSeconds = Math.max(1, Math.ceil((current.start + windowMs - t) / 1000))
      return { allowed: false, retryAfterSeconds }
    },
```

Export `FailureLimiter` from the package's entry the same way `RateLimiter` is exported.

- [ ] **Step 4: Run** the service-kit tests → PASS.

- [ ] **Step 5: Write the failing api tests** in `apps/api/src/two-factor.test.ts`, next to the
existing limiter tests (around line 312, which builds a server with
`twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 })` — reuse its setup
helpers for "enable 2FA, sign in, get a challenge"):

```ts
test("a correct code never spends the verify budget", async () => {
  // limit 2: two right codes in a row on two challenges both sign in
  // (today the second is TOO_MANY_REQUESTS because successes count)
})
test("after `limit` wrong codes the next verify is refused before the code is checked", async () => {
  // limit 2: wrong, wrong → third attempt (even with the right code) is TOO_MANY_REQUESTS
})
test("management calls do not spend the sign-in budget", async () => {
  // limit 2: two wrong codes to account.twoFactor.disable, then a sign-in challenge + right code succeeds
})
```

Write each body with the file's own helpers (the existing test at ~312 shows how to sign up,
enable 2FA with `totpNow(secret)`, sign in to get `{ twoFactor: { challenge } }`, and call
`client.auth.twoFactor.verify`). Use separate challenges where one challenge's 5-wrong-code burn
would interfere (limit 2 keeps you under 5).

- [ ] **Step 6: Run** `bun test apps/api/src/two-factor.test.ts` → the new tests FAIL.

- [ ] **Step 7: Implement in the router.** Type `twoFactorUserLimiter` as `FailureLimiter` in the
context and `server.ts` (`createMemoryRateLimiter` already satisfies it; the option in
`ServerOptions` becomes `FailureLimiter`). Add next to `wrongCode`:

```ts
const verifyKey = (id: number) => `2fa:verify:${id}`
const manageKey = (id: number) => `2fa:manage:${id}`

/** Whether `key` still has failure budget. Only a wrong code (or password) spends it. */
async function twoFactorBudget(context: Context, key: string) {
  return (await context.twoFactorUserLimiter.check(key)).allowed
}

async function spendTwoFactorFailure(context: Context, key: string) {
  await context.twoFactorUserLimiter.hit(key)
}
```

In `verify`: replace `const limit = await context.twoFactorUserLimiter.hit(\`2fa:user:${pending.userId}\`)`
and its `if (!limit.allowed)` with `if (!(await twoFactorBudget(context, verifyKey(pending.userId))))`
throwing the same `TOO_MANY_REQUESTS`; in the wrong-code branch call
`await spendTwoFactorFailure(context, verifyKey(user.id))` before the per-challenge limiter. In
`enable`, `disable`, `regenerateRecoveryCodes`: the same with `manageKey(context.user.id)`, spending
only in the wrong-code branch. Update the comments above `verify` and `enable` that describe the
order ("the per-user limiter runs before the code is looked at") to say it is checked before and
spent only on a wrong code, with separate sign-in and management budgets.

- [ ] **Step 8: Run** `bun test apps/api/src/two-factor.test.ts` → PASS, and `bun run --filter @repo/api typecheck`.

- [ ] **Step 9: Commit**

```bash
git add packages/service-kit apps/api/src
git commit -m "fix(api): count only wrong two-factor codes, with separate sign-in and account budgets"
```

---

### Task 2: No session survives a reset; recovery codes are spent only by the winner

**Files:**
- Create: `apps/api/src/migrations/0018_sessions_revoked_at.ts`
- Modify: `apps/api/src/migrations/index.ts`
- Modify: `apps/api/src/queries/users.ts` (`UserRow`, new `revokeSessions`, `lockForSession`)
- Modify: `apps/api/src/queries/tokens.ts` (`consume` also returns `createdAt`)
- Modify: `apps/api/src/queries/two-factor.ts` (new `findUnusedRecoveryCode`)
- Modify: `apps/api/src/router.ts` (`checkSecondFactor`, `issueSession`, `auth.twoFactor.verify`,
  `auth.resetPassword`, `account.changePassword`, `account.setPassword`,
  `account.sessions.revokeOthers`, `admin.users.revokeSessions`, `admin.users.resetTwoFactor`,
  `purgeUnverifiedAccount`)
- Test: `apps/api/src/two-factor.test.ts`, `apps/api/src/migrations.test.ts` (or wherever migration
  lists are asserted — `grep -rn "0017_user_locale" apps/api/src`)

**Interfaces:**
- Produces: `UserRow.sessions_revoked_at: string | null`.
- Produces: `users.stampSessionsRevoked(userId: number, at: string): Promise<void>`.
- Produces: `users.revokeSessions(userId: number, at: string, opts?: { except?: number }): Promise<void>` —
  in one transaction: `UPDATE users SET sessions_revoked_at = at`, invalidate the user's
  `two_factor_challenge` tokens, delete the sessions (but `except`).
- Produces: `users.lockForSession(userId: number): Promise<{ sessionsRevokedAt: string | null } | undefined>` —
  a no-op `UPDATE … RETURNING` that takes the user row's write lock inside a transaction.
- Produces: `tokens.consume(...)` result gains `createdAt: string`.
- Produces: `twoFactor.findUnusedRecoveryCode(userId: number, hash: string): Promise<boolean>`.
- Consumes: Task 1's `verifyKey`/`spendTwoFactorFailure` in `verify`.

- [ ] **Step 1: Write the failing tests** in `apps/api/src/two-factor.test.ts`:

```ts
test("a challenge issued before a password change never becomes a session", async () => {
  // enable 2FA; sign in → challenge; with the user's own session call account.changePassword;
  // then verify(challenge, right code) → BAD_REQUEST twoFactorTimedOut, and no new session row
})
test("a challenge issued before admin revokeSessions never becomes a session", async () => {
  // same with admin.users.revokeSessions (use the file's superadmin helper)
})
test("two recovery codes racing on one challenge spend only the winner's", async () => {
  // enable 2FA, keep two recovery codes a and b; sign in → challenge;
  // Promise.all([verify(challenge, a), verify(challenge, b)]) → exactly one succeeds;
  // then recoveryCodesLeft === 9 (10 minus the one that won)
})
```

Also assert, in the existing migration list test, that `0018_sessions_revoked_at` is applied.

- [ ] **Step 2: Run** → FAIL. `changePassword` already invalidates open challenges, so to prove
the stamp (not the invalidation) is what refuses, the first two tests re-open the challenge after
the reset: `UPDATE tokens SET consumed_at = NULL WHERE token_hash = <hash of the challenge>` through
the test database handle (`start()` in `test-server.ts` returns it — check its return type), then
verify → must be `BAD_REQUEST`. Today that verify succeeds. The recovery race test fails today
with `recoveryCodesLeft === 8`.

- [ ] **Step 3: Migration** `apps/api/src/migrations/0018_sessions_revoked_at.ts`:

```ts
import type { Migration } from "../migrate"

// When the user's sessions were last ended (a reset, a password change, "sign out everywhere
// else", an admin revoke or two-step reset). A two-factor challenge created before it can never
// become a session. Null = never.
const sessionsRevokedAt: Migration = {
  name: "0018_sessions_revoked_at",
  async up(sql) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN sessions_revoked_at TEXT")
  },
}

export default sessionsRevokedAt
```

List it last in `migrations/index.ts` (import as `sessionsRevokedAt`). Check how other `users`
timestamps are typed in earlier migrations (`grep -n "email_verified_at" apps/api/src/migrations/*.ts`);
if Postgres uses `TIMESTAMPTZ` there, follow that type per dialect exactly as the earlier migration
does, otherwise `TEXT`.

- [ ] **Step 4: Queries.** In `queries/users.ts` add `sessions_revoked_at: string | null` to
`UserRow` and:

```ts
    /**
     * Ends the user's sessions (all, or all but `except`) and every open two-step challenge, and
     * stamps `sessions_revoked_at` — in one transaction, stamp first, so a concurrent
     * `auth.twoFactor.verify` either commits its session before this deletes it or sees the stamp.
     */
    async revokeSessions(userId: number, at: string, opts: { except?: number } = {}): Promise<void> {
      await sql.begin(async (tx) => {
        await tx`UPDATE users SET sessions_revoked_at = ${at} WHERE id = ${userId}`
        await tx`
          UPDATE tokens SET consumed_at = ${at}
          WHERE user_id = ${userId} AND purpose = 'two_factor_challenge' AND consumed_at IS NULL
        `
        if (opts.except === undefined) await tx`DELETE FROM sessions WHERE user_id = ${userId}`
        else await tx`DELETE FROM sessions WHERE user_id = ${userId} AND id <> ${opts.except}`
      })
    },

    /** Takes the user row's write lock for the rest of the caller's transaction (a no-op update,
     * portable to SQLite) and returns the revocation stamp it guards. */
    async lockForSession(userId: number): Promise<{ sessionsRevokedAt: string | null } | undefined> {
      const [row]: Array<{ sessions_revoked_at: string | null }> = await sql`
        UPDATE users SET sessions_revoked_at = sessions_revoked_at WHERE id = ${userId}
        RETURNING sessions_revoked_at
      `
      return row && { sessionsRevokedAt: row.sessions_revoked_at }
    },
```

Match how this file's other multi-statement helpers open a transaction (if they call
`sql.begin`, as `two-factor.ts` does, use that; it is the gated begin on SQLite).

In `queries/tokens.ts`, `consume` returns `RETURNING user_id, email, created_at` and maps
`createdAt: rows[0].created_at`. In `queries/two-factor.ts`:

```ts
    /** Read-only: whether `hash` is one of the user's unused recovery codes. */
    async findUnusedRecoveryCode(userId: number, hash: string): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        SELECT id FROM two_factor_recovery_codes
        WHERE user_id = ${userId} AND code_hash = ${hash} AND used_at IS NULL
      `
      return rows.length > 0
    },
```

- [ ] **Step 5: Router — every revocation goes through `revokeSessions`.** Replace the
"invalidate `two_factor_challenge` + `sessions.deleteForUser`" pairs with one call:
- `auth.resetPassword`: `await context.db.users.revokeSessions(consumed.userId, at)` in place of
  lines ~810–811 (keep the `password_reset` invalidation).
- `account.changePassword`: `revokeSessions(context.user.id, at, { except: context.session.id })`.
- `account.setPassword`: it ends no session today and must not start to; keep its two
  invalidations and add `await context.db.users.stampSessionsRevoked(context.user.id, at)`.
- `account.sessions.revokeOthers`: `revokeSessions(context.user.id, at, { except: context.session.id })`.
- `admin.users.revokeSessions`, `admin.users.resetTwoFactor`: `revokeSessions(target.id, at)`.
- `purgeUnverifiedAccount`: `revokeSessions` opens its own transaction and must not nest, so
  inside the purge's existing transaction add `await tx.users.stampSessionsRevoked(user.id, at)`
  and keep its delete/invalidate lines.

Add to `queries/users.ts`, next to `revokeSessions`:

```ts
    /** Only the stamp, for callers already inside a transaction or that end no session. */
    async stampSessionsRevoked(userId: number, at: string): Promise<void> {
      await sql`UPDATE users SET sessions_revoked_at = ${at} WHERE id = ${userId}`
    },
```

- [ ] **Step 6: Router — `verify` issues the session in one transaction.** Change
`checkSecondFactor` to *match* without spending a recovery code, returning which kind matched:

```ts
/** Whether `code` is a valid second factor right now. A TOTP code spends its step here (the
 * replay guard); a recovery code is only matched — the caller spends it, in the transaction that
 * also consumes the challenge, so a losing request in a race spends nothing. */
async function matchSecondFactor(
  context: Context,
  user: UserRow,
  code: string
): Promise<{ kind: "totp" } | { kind: "recovery"; hash: string } | null> {
  if (looksLikeRecoveryCode(code)) {
    const normalized = normalizeRecoveryCode(code)
    if (normalized === null) return null
    const hash = tokenHash(normalized)
    return (await context.db.twoFactor.findUnusedRecoveryCode(user.id, hash))
      ? { kind: "recovery", hash }
      : null
  }
  return (await checkTotpCode(context, user, code)) ? { kind: "totp" } : null
}

/** For `disable` and `regenerateRecoveryCodes`: match and, for a recovery code, spend it now. */
async function checkSecondFactor(context: Context, user: UserRow, code: string, at: string) {
  const matched = await matchSecondFactor(context, user, code)
  if (!matched) return false
  if (matched.kind === "recovery") return context.db.twoFactor.useRecoveryCode(user.id, matched.hash, at)
  return true
}
```

Make `issueSession` take the queries to write with: `issueSession(context, user, client, impersonation?, db = context.db)`
and use `db.sessions.deleteExpired` / `db.sessions.create` inside it. Then the tail of `verify`
(after the user/enabled checks) becomes:

```ts
        const matched = await matchSecondFactor(context, user, input.code)
        if (!matched) {
          await spendTwoFactorFailure(context, verifyKey(user.id))
          const attempt = await context.twoFactorChallengeLimiter.hit(`2fa:challenge:${hash}`)
          if (attempt.allowed) throw errors.UNAUTHORIZED(wrongCode(context))
          await context.db.tokens.consume(hash, "two_factor_challenge", at)
          throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        }
        // One transaction: the challenge (single use), the revocation stamp (a reset since the
        // challenge was issued wins), the recovery code (spent only by the winner) and the session.
        const issued = await context.db.transaction(async (tx) => {
          const won = await tx.tokens.consume(hash, "two_factor_challenge", at)
          if (!won) return null
          const lock = await tx.users.lockForSession(user.id)
          if (lock?.sessionsRevokedAt && lock.sessionsRevokedAt >= won.createdAt) return null
          if (matched.kind === "recovery" && !(await tx.twoFactor.useRecoveryCode(user.id, matched.hash, at)))
            return null
          return issueSession(context, user, input.client, undefined, tx)
        })
        if (!issued) throw errors.BAD_REQUEST({ message: apiMessage(context, "twoFactorTimedOut") })
        return issued
```

ISO-8601 strings with the same `toISOString()` format compare correctly as strings. If a
transaction returning `null` should roll back the consume for the recovery-race loser — it should
not: the loser's challenge is already consumed by the winner, so `won` is null first. Keep it.

- [ ] **Step 7: Run** `bun test apps/api/src` (whole api suite: revocation paths are exercised in
`auth.test.ts`, `admin.test.ts` and others) → PASS; with Postgres too if `TEST_DATABASE_URL` is
available locally (see `apps/api/README.md`), otherwise CI's `api-postgres` covers it — say which in
the report. `bun run --filter @repo/api typecheck`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src
git commit -m "fix(api): no two-factor session survives a reset, and only the winning recovery code is spent"
```

---

### Task 3: Re-authentication before two-step setup (api)

**Files:**
- Modify: `packages/api-contract/src/auth.ts` (constants, `TwoFactorSetupSchema`)
- Modify: `packages/api-contract/src/index.ts:356-369` (`account.twoFactor.setup`)
- Modify: `apps/api/src/router.ts` (`setup`, export-free const `REAUTH_WINDOW_MS`)
- Modify: `packages/i18n/messages/en/api.json`, `packages/i18n/messages/sv/api.json`
- Modify: `apps/api/src/i18n.test.ts` (pin the new key)
- Test: `apps/api/src/two-factor.test.ts`

**Interfaces:**
- Consumes: Task 1's `twoFactorBudget`, `spendTwoFactorFailure`, `manageKey`.
- Produces (contract, used by Task 4): `TwoFactorSetupSchema = z.object({ currentPassword: z.string().max(200).optional() })`;
  `TWO_FACTOR_REAUTH_REASON = "reauth"`; `TWO_FACTOR_REAUTH_MESSAGE = "Sign in again to turn on two-step verification."`;
  `REAUTH_WINDOW_MS = 10 * 60 * 1000` exported from `packages/api-contract/src/auth.ts` (so the
  api and tests share it). `setup` declares `UNAUTHORIZED` with
  `data: z.object({ reason: z.literal("password") }).optional()` — reason `TWO_FACTOR_PASSWORD_REASON = "password"` —
  `FORBIDDEN` with `data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional()`,
  and `TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" }`.
- Produces (api catalog): key `twoFactorReauth` (en = `TWO_FACTOR_REAUTH_MESSAGE`).

- [ ] **Step 1: Write the failing tests** (two-factor.test.ts):

```ts
test("setup needs the current password on an account that has one", async () => {
  // signUp (verified email); setup({}) → UNAUTHORIZED reason "password", message currentPasswordIncorrect;
  // setup({ currentPassword: "wrong" }) → same; setup({ currentPassword: <right> }) → { secret, otpauthUrl }
})
test("a wrong setup password spends the management budget", async () => {
  // server with twoFactorUserLimiter limit 2: two wrong passwords → third call (right password) TOO_MANY_REQUESTS
})
test("a passwordless account needs a session under 10 minutes old", async () => {
  // create a passwordless verified account the way existing magic-link tests do;
  // fresh session → setup({}) succeeds;
  // age the session: UPDATE sessions SET created_at = <now - 11 min> (through the test db handle) →
  // setup({}) → FORBIDDEN, data.reason "reauth", message TWO_FACTOR_REAUTH_MESSAGE
  // at 9 minutes old → succeeds (Review Focus 2)
})
test("a passwordless account's currentPassword is ignored", async () => {
  // fresh passwordless session, setup({ currentPassword: "anything" }) succeeds
})
```

If the test file reaches the database through `app.db` (check `test-server.ts`'s `start()` return),
age the session with `await app.db.sql\`UPDATE sessions SET created_at = ${iso} WHERE …\``; follow
whatever the file already does for similar time travel.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Contract.** In `auth.ts`, next to `TWO_FACTOR_VERIFY_EMAIL_MESSAGE`:

```ts
/** `account.twoFactor.setup` re-checks who is asking: the current password when the account has
 * one, else a session younger than this. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000
export const TWO_FACTOR_REAUTH_REASON = "reauth"
export const TWO_FACTOR_REAUTH_MESSAGE = "Sign in again to turn on two-step verification."
/** A missing or wrong `currentPassword` on setup: `data.reason` tells it apart from "Sign in
 * required" (also `UNAUTHORIZED`). */
export const TWO_FACTOR_PASSWORD_REASON = "password"
export const TwoFactorSetupSchema = z.object({ currentPassword: z.string().max(200).optional() })
```

In `index.ts`'s `setup`: `.input(TwoFactorSetupSchema)` and errors:

```ts
        .errors({
          ...AUTH_ERRORS,
          UNAUTHORIZED: {
            message: "Sign in required",
            data: z.object({ reason: z.literal(TWO_FACTOR_PASSWORD_REASON) }).optional(),
          },
          CONFLICT: { message: "Two-step verification is already on" },
          // Also thrown with IMPERSONATING_MESSAGE / TWO_FACTOR_REAUTH_MESSAGE (reason "reauth").
          FORBIDDEN: {
            message: TWO_FACTOR_VERIFY_EMAIL_MESSAGE,
            data: z.object({ reason: z.literal(TWO_FACTOR_REAUTH_REASON) }).optional(),
          },
          TOO_MANY_REQUESTS: { message: "Too many attempts, try again later" },
        })
```

Export the new constants from the package entry like the existing `TWO_FACTOR_*` ones.

- [ ] **Step 4: Catalog.** `en/api.json`: `"twoFactorReauth": "Sign in again to turn on two-step verification."`;
`sv/api.json`: `"twoFactorReauth": "Logga in igen för att aktivera tvåstegsverifiering."`.
In `i18n.test.ts` add `["twoFactorReauth", TWO_FACTOR_REAUTH_MESSAGE]` to the constants list (and
import it).

- [ ] **Step 5: Router `setup`.** Signature `async ({ input, context, errors })`; after the
already-on check, before minting the secret:

```ts
        if (context.user.password_hash) {
          if (!(await twoFactorBudget(context, manageKey(context.user.id))))
            throw errors.TOO_MANY_REQUESTS({ message: apiMessage(context, "tooManyAttempts") })
          if (!(await verifyPassword(input.currentPassword ?? "", context.user.password_hash))) {
            await spendTwoFactorFailure(context, manageKey(context.user.id))
            throw errors.UNAUTHORIZED({
              message: apiMessage(context, "currentPasswordIncorrect"),
              data: { reason: TWO_FACTOR_PASSWORD_REASON },
            })
          }
        } else if (Date.now() - Date.parse(context.session.created_at) >= REAUTH_WINDOW_MS) {
          throw errors.FORBIDDEN({
            message: apiMessage(context, "twoFactorReauth"),
            data: { reason: TWO_FACTOR_REAUTH_REASON },
          })
        }
```

Check that `context.session` exposes `created_at` (it is a `SessionRow` in the authed context —
confirm with `grep -n "session:" apps/api/src/context.ts`). Update the comment above `setup`.

- [ ] **Step 6: Run** `bun test apps/api/src/two-factor.test.ts apps/api/src/i18n.test.ts packages/i18n` → PASS;
`bun run --filter @repo/api typecheck && bun run --filter @repo/api-contract typecheck`.
If `apps/account`'s typecheck now fails because `setup` takes an input, make the one-line fix
there — `deps.api.twoFactor.setup({})` in `setupTwoFactorCore` — and nothing else (Task 4 does the
real UI). Run `bun run --filter @repo/account typecheck`.

- [ ] **Step 7: Commit**

```bash
git add packages/api-contract packages/i18n apps/api/src apps/account/src/lib/actions.ts
git commit -m "fix(api): re-check the password, or a recent sign-in, before two-step setup"
```

---

### Task 4: Re-authentication in the account card and `/login?reauth=1`

**Files:**
- Modify: `apps/account/src/lib/actions.ts:288-305` (`setupTwoFactorCore`)
- Modify: `apps/account/src/app/(account)/security/actions.ts:65-70`
- Modify: `apps/account/src/components/two-factor-card.tsx` (`OffStep`, `TwoFactorCard` props)
- Modify: `apps/account/src/views/security-view.tsx:65-70`
- Modify: `packages/i18n/messages/{en,sv}/account.json`, `{en,sv}/auth.json`
- Modify: `apps/auth/src/app/login/page.tsx`
- Test: `apps/account/src/lib/actions.test.ts`, `apps/account/src/lib/actions-sv.test.ts`,
  `apps/account/src/views/views.test.tsx`, `apps/auth` page/view test (find with
  `grep -rln "LoginView" apps/auth/src --include=*.test.*`), `apps/e2e/tests/` (the two-factor spec)

**Interfaces:**
- Consumes: Task 3's `TwoFactorSetupSchema`, `TWO_FACTOR_REAUTH_REASON`, `TWO_FACTOR_PASSWORD_REASON`.
- Produces: `TwoFactorSetupState = { ok: true; secret; otpauthUrl; qrSvg } | { ok: false; message?: string; fieldErrors?: Record<string, string>; reauthHref?: string }`;
  `setupTwoFactorCore(deps: ActionDeps & { reauthHref?: string }, fd: FormData)`; `TwoFactorCard`
  gains `hasPassword: boolean`.

- [ ] **Step 1: Failing core tests** (`actions.test.ts`, in `describe("setupTwoFactorCore")`):

```ts
test("sends the current password", async () => {
  // fake api.twoFactor.setup records its input; fd has currentPassword=pw → called with { currentPassword: "pw" }
})
test("a wrong password is a field error on currentPassword", async () => {
  // fake throws ORPCError UNAUTHORIZED { message: "Current password is incorrect", data: { reason: "password" } }
  // → { ok: false, fieldErrors: { currentPassword: "Current password is incorrect" } }
})
test("reauth is a notice with the sign-in link", async () => {
  // fake throws ORPCError FORBIDDEN { message: "Sign in again to turn on two-step verification.", data: { reason: "reauth" } }
  // deps.reauthHref = "http://auth.brand.localhost:3002/login?reauth=1&next=…"
  // → { ok: false, message: <that message>, reauthHref: deps.reauthHref }
})
test("no password field sends no currentPassword", async () => {
  // fd without currentPassword → called with {}
})
```

Swedish twin in `actions-sv.test.ts` for the reauth notice (message passes through from the api).

- [ ] **Step 2: Run** `bun test apps/account/src/lib` → FAIL.

- [ ] **Step 3: Core.** In `lib/actions.ts`:

```ts
export type TwoFactorSetupState =
  | { ok: true; secret: string; otpauthUrl: string; qrSvg: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string>; reauthHref?: string }

export async function setupTwoFactorCore(
  deps: ActionDeps & { reauthHref?: string },
  fd: FormData
): Promise<TwoFactorSetupState> {
  const t = accountTranslator(deps.locale)
  const currentPassword = str(fd, "currentPassword")
  try {
    const { secret, otpauthUrl } = await deps.api.twoFactor.setup(
      currentPassword ? { currentPassword } : {}
    )
    return { ok: true, secret, otpauthUrl, qrSvg: renderSVG(otpauthUrl) }
  } catch (error) {
    const known = apiError(error, ["UNAUTHORIZED", "FORBIDDEN"])
    const reason = (known?.data as { reason?: unknown } | undefined)?.reason
    if (known && reason === TWO_FACTOR_PASSWORD_REASON)
      return { ok: false, fieldErrors: { currentPassword: known.message } }
    if (known && reason === TWO_FACTOR_REAUTH_REASON)
      return { ok: false, message: known.message, reauthHref: deps.reauthHref }
    return {
      ok: false,
      message: failure(error, ["CONFLICT", "FORBIDDEN", "TOO_MANY_REQUESTS"], "twoFactor.setup", t),
    }
  }
}
```

The page action (`security/actions.ts`) becomes `setupTwoFactor(_prev, fd)` passing
`{ ...(await accountApi()), reauthHref }` and `fd`, where
`reauthHref = \`${authUrl}/login?reauth=1&next=${encodeURIComponent(\`${accountUrl}/security\`)}\``
built from the app's existing env helpers (`grep -rn "AUTH_URL\|authUrl" apps/account/src/lib` —
reuse whatever builds the sign-in link today; the account's own origin likewise).

- [ ] **Step 4: Card.** `TwoFactorCard` takes `hasPassword` (pass `user.hasPassword` from
`security-view.tsx`). `OffStep` renders, inside its existing form, when `hasPassword`:

```tsx
      {hasPassword ? (
        <div className="grid max-w-72 gap-2">
          <Label htmlFor="2fa-current-password">{t("currentPassword")}</Label>
          <Input
            id="2fa-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            {...fieldAria("currentPassword", setupFieldErrors, { idPrefix: "2fa" })}
          />
          <FieldError name="currentPassword" errors={setupFieldErrors} idPrefix="2fa" />
        </div>
      ) : null}
```

(Use the exact `Label`/`Input`/`fieldAria`/`FieldError` imports and call shapes the card already
uses for its code fields — copy the enable step's code field block and rename.) When
`setupState.reauthHref` is set, render the message with a link
`<a href={setupState.reauthHref}>{t("signInAgain")}</a>` instead of the plain notice. Keys in
`account.json` under `twoFactor`: `currentPassword` ("Current password" / "Nuvarande lösenord"),
`signInAgain` ("Sign in again" / "Logga in igen"). The field is always in the form when the account
has a password, so it works without JavaScript.

- [ ] **Step 5: View test** (`views.test.tsx`): the off state with `hasPassword: true` renders an
input named `currentPassword`; with `hasPassword: false` it does not.

- [ ] **Step 6: Auth `/login?reauth=1`.** In `apps/auth/src/app/login/page.tsx`:

```ts
  const reauth = first(params.reauth) === "1"
  // Re-authentication (e.g. before two-step setup): show the form even to a signed-in visitor.
  if (user && next && !reauth) redirect(auth.safeNextUrl(next))
  ...
  const notice = reauth ? t("login.reauth") : params.reset ? … : …
  const providers = user && !reauth ? [] : await getProviders(requestInfo(await headers()).ip)
  return <LoginView … user={reauth ? undefined : user} … />
```

`auth.json` `login.reauth`: "Sign in again to continue." / "Logga in igen för att fortsätta.".
Add a page/view test that `reauth=1` with a user renders the sign-in form (email field present) and
the notice. Confirm the sign-in action still honours `next` (it already reads the hidden field).

- [ ] **Step 7: e2e.** In the two-factor spec (`grep -ln "two-step\|twoFactor" apps/e2e/tests/*.spec.ts`),
the step that clicks **Turn on** now fills **Current password** first (the journey's account has a
password). Add nothing else.

- [ ] **Step 8: Run** `bun test apps/account apps/auth packages/i18n`; both apps' typecheck;
the i18n guards; `bun --filter @repo/e2e e2e` for the two-factor spec only if quick (see
`apps/e2e/README.md` for running one spec), otherwise leave the full run to Task 6.

- [ ] **Step 9: Commit**

```bash
git add apps/account apps/auth packages/i18n apps/e2e
git commit -m "feat(account): ask for the password, or a fresh sign-in, before two-step setup"
```

---

### Task 5: PNG and WebP metadata by allowlist

**Files:**
- Modify: `apps/api/src/storage/image.ts:28-53` (`png`), `:231-283` (`webp`)
- Test: `apps/api/src/storage/image.test.ts`

**Interfaces:** none new; `png`/`webp` keep their `Parsed | null` contract.

- [ ] **Step 1: Failing tests** in `image.test.ts`, using the file's existing PNG/WebP fixture
builders (it already builds chunked PNGs for the `tEXt` test — reuse that helper):

```ts
test("a PNG keeps only the allowlisted chunks", () => {
  // IHDR, caBX (C2PA), prVt (private), tIME, IDAT, IEND → stored bytes contain IHDR, IDAT, IEND only
})
test("a PNG whose first chunk is not IHDR is refused", () => {
  // signature, IDAT, IHDR, IEND → validate refuses (IMAGE_UPLOAD_MESSAGE)
})
test("a PNG with two IHDR chunks is refused", () => { /* … */ })
test("a WebP drops an unknown chunk and keeps ICCP", () => {
  // VP8X (ICC flag set), ICCP, ABCD (unknown), VP8 → stored: VP8X, ICCP, VP8; no ABCD
})
```

Use the module's public entry the existing tests use (`validateImage` or similar — check the
top of the test file).

- [ ] **Step 2: Run** `bun test apps/api/src/storage/image.test.ts` → FAIL.

- [ ] **Step 3: PNG.**

```ts
// Allowlisted like JPEG: everything a decoder needs to draw the image (and APNG frames) stays;
// every other chunk — text, eXIf, tIME, C2PA (caBX), vendor/private chunks — is dropped.
const PNG_KEEP = new Set([
  "IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs",
  "acTL", "fcTL", "fdAT",
])
```

In the loop: `if (type === "IHDR") { if (i !== 8 || length < 8) return null; … }` and
`if (i === 8 && type !== "IHDR") return null`; push only `PNG_KEEP.has(type)`. A second `IHDR`
has `i !== 8` → refused. Let Biome format the set.

- [ ] **Step 4: WebP.**

```ts
// Allowlisted like PNG and JPEG; the VP8X flags for EXIF and XMP are cleared below because those
// chunks never survive (ICC, alpha and animation chunks are kept, so their flags stay true).
const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"])
```

Replace `else if (!WEBP_DROP.has(type))` with `else if (WEBP_KEEP.has(type))` (VP8X and the image
chunks keep their own branches).

- [ ] **Step 5: Run** the image and storage tests → PASS (`bun test apps/api/src/storage`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storage
git commit -m "fix(api): keep only allowlisted PNG and WebP chunks, and require IHDR first"
```

---

### Task 6: Compose on loopback, `apps/app` cleanup, stale comments, docs, full gate

**Files:**
- Modify: `docker-compose.yml` (every `ports:` entry)
- Modify: `scripts/docker.test.ts`
- Modify: `apps/app/package.json`, `apps/app/next.config.mjs`, `bun.lock` (via `bun install`)
- Delete: `apps/app/src/lib/utils.ts`, `apps/app/src/lib/filter-countries.ts`,
  `apps/app/src/hooks/use-mobile.tsx`, `apps/app/src/hooks/use-dialog-state.tsx`
- Modify: `apps/api/src/migrate.ts:14-22`, `apps/api/src/billing/entitlements.ts:19-21`
- Modify: `CLAUDE.md`, `apps/api/README.md`, `apps/account/README.md`, `apps/auth/README.md`,
  `packages/service-kit/README.md` (if it documents the limiter), `docs/guides/deploying.md` (if it
  shows Compose ports)

- [ ] **Step 1: Failing docker test** in `scripts/docker.test.ts`:

```ts
test("every port docker-compose.yml publishes is bound to loopback", () => {
  // parse docker-compose.yml the way this file already does; for each service's `ports` entry
  // (string form "host:container" or "ip:host:container"), expect it to start with "127.0.0.1:"
})
```

- [ ] **Step 2: Run** `bun test scripts/docker.test.ts` → FAIL. **Step 3:** prefix every port in
`docker-compose.yml` with `127.0.0.1:` (the eight Next apps, `api`, `ai`, Mailpit `8025`; SeaweedFS
already is), keeping SeaweedFS's comment style. **Step 4:** run → PASS.

- [ ] **Step 5: `apps/app` cleanup.** Re-confirm each is unused:
`for d in cmdk vaul @hookform/resolvers react-hook-form recharts next-themes @iconify/react country-region-data clsx tailwind-merge; do echo "== $d"; grep -rn "from \"$d\|require(\"$d\|'$d'" apps/app --include=*.ts --include=*.tsx --include=*.mjs --exclude-dir=node_modules --exclude-dir=.next; done`
— the only hits allowed are in the four files being deleted and `next.config.mjs`. Delete the four
files (confirm nothing imports them: `grep -rn "lib/utils\|filter-countries\|use-mobile\|use-dialog-state" apps/app/src`),
remove the ten deps from `package.json`, the `@iconify/react` `modularizeImports` entry and the
`recharts` `splitChunks` cache group (drop the `webpack` override entirely if that group was all it
did — read it first), then `bun install`. **Do not** remove a catalog entry from the root
`package.json` another workspace still uses.

- [ ] **Step 6: Comments.** `migrate.ts`: "A second writer on the same SQLite file waits on
`busy_timeout` (see `db.ts`) and then finds the migration already applied, rather than
double-applying." `entitlements.ts`: "Sequential on purpose: this also runs on a transaction-bound
`Queries`, and concurrent statements on one Postgres transaction connection hung on Bun 1.3's
driver; kept sequential until that is re-verified on the pinned Bun." Comment text only.

- [ ] **Step 7: Docs** (verify each claim against the code you are describing):
- CLAUDE.md **Two-factor**: limiter keys `2fa:verify:<id>` (sign-in) and `2fa:manage:<id>`
  (enable, disable, regenerate, setup's password check), 10 *wrong* codes per 15 minutes each, a
  correct code spends nothing; setup asks for the current password, or for a passwordless account a
  session under 10 minutes old (`REAUTH_WINDOW_MS`, `data.reason: "reauth"` → the card links to
  `/login?reauth=1&next=…`); `users.sessions_revoked_at` (migration `0018`) set by every path that
  ends sessions, and a challenge created before it never becomes a session; a recovery code is
  spent only by the request that wins the challenge.
- CLAUDE.md **Storage**: PNG and WebP by allowlist (list the kept chunks), `IHDR` first and once.
- CLAUDE.md **Docker**: every published port binds `127.0.0.1` (name the test that enforces it).
- CLAUDE.md env/auth table and **Authentication** prose: `/login?reauth=1`.
- `apps/api/README.md`, `apps/account/README.md`, `apps/auth/README.md`: the same facts where those
  files describe two-factor, the security card and `/login`.

- [ ] **Step 8: Full gate.** `bun run ci` exits 0; build `www app auth account blog docs` and run
`CI=1 bunx playwright test --retries=0` in `apps/e2e` per `apps/e2e/README.md` (static apps built
with `COOKIE_DOMAIN=.brand.localhost`, as its `e2e` script does). Kill only processes you start.

- [ ] **Step 9: Commits** (separate):

```bash
git commit -m "fix(docker): publish every Compose port on loopback only"
git commit -m "chore(app): drop the unused dependencies and the dead files that used them"
git commit -m "docs: two-factor re-auth, revocation stamp, image allowlist and loopback ports"
```

(The two comment fixes go in the docs commit or their own `docs(api)` commit.)
