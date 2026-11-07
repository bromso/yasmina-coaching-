# Email Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user changes their account email from account → Personal info; the new address is proven first, the old one is told before (with cancel) and after (with a 7-day undo), and an undo locks out whoever made the change.

**Architecture:** `apps/api` owns the flow: three one-time `tokens` purposes, five procedures (`account.email.get/requestChange/confirmChange`, `auth.emailChange.cancel/revert`), four mail templates, audit rows. `apps/account` gets the Email address card and `/email/confirm`; `apps/auth` gets anonymous `/email/cancel` and `/email/revert`. Every link is consumed by a button, never on load.

**Tech Stack:** Bun.sql (SQLite + Postgres), oRPC, React Email, Next 16 + next-intl, Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-17-email-change-design.md`

## Global Constraints

- Migration `0025_email_change`: `tokens` purposes `email_change` (user id + new address, 24 h), `email_change_cancel` (user id, 24 h), `email_change_revert` (user id + old address, 7 days). Hashed, single use. Purpose CHECK rebuild exactly like 0013/0024 on SQLite; ALTER on Postgres.
- Re-authentication for `requestChange`: the shared fresh-credential helper (password → `UNAUTHORIZED` `data.reason: "password"`; passwordless session ≥ `REAUTH_WINDOW_MS` → `FORBIDDEN` `data.reason: "reauth"`) AND, when two-step is on, a current TOTP/recovery code through the same path and limiter as `account.twoFactor.disable` (`2fa:manage:<id>`; wrong → `UNAUTHORIZED` `data.reason: "code"`).
- Limiter `email-change:<userId>` 3 per 15 min. Refused while impersonating (`FORBIDDEN` IMPERSONATING_MESSAGE) for requestChange/confirmChange.
- No account-existence oracle: a taken `newEmail` answers exactly like success (same shape, same work order up to sending) and sends nothing.
- Lock order: every new transaction locks the user row first (as passkeys/purge do).
- Every user-facing api message through `apiMessage` with contract constants and en/sv catalog keys; every UI string en + sv; i18n guards stay green with empty allowlists.
- Mail locale: the account's saved locale, else the request locale (same helper the existing mails use).
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings. Implementers never run Playwright, `bun run ci`/`validate`, or docker commands of any kind (never prune).
- Client components import contract VALUES only through Zod-free subpaths (the `client-safe-imports.test.ts` guard enforces it).

## Review Focus

1. A confirm link used by a different signed-in account, or after a newer request replaced it → refused (Task 2 test).
2. The address taken by another account between request and confirm → `CONFLICT`, nothing changes (Task 2 test, incl. a Postgres race of two confirms of different accounts to one address).
3. An undo after the attacker changed the email again / after a confirm raced the undo → the undo still restores the original owner's address or refuses cleanly; never two accounts on one address (Task 3 test).
4. The taken-address path leaking existence by timing/shape → same answer and code path up to the send (Task 2 test).
5. Sessions: confirm keeps exactly the caller's session; cancel and revert end all; a session started before revert cannot survive (Task 3 test).

---

### Task 1: Contract, migration, tokens, templates

**Files:** `packages/api-contract/src/email-change.ts` (schemas: `EmailChangeRequestSchema { newEmail, password?, code? }`, `EmailChangePendingSchema`, `EmailChangeTokenSchema { token }`, message constants), wired into the contract index (procedures added in Tasks 2–3 with their handlers, like the passkeys plan); `apps/api/src/migrations/0025_email_change.ts` + index + `migrate.test.ts`; `apps/api/src/queries/tokens.ts` purposes and payload columns (reuse the existing token row shape; store the address in the existing payload/`email` column if one exists — check `tokens` schema); `packages/email` templates `emailChangeConfirm`, `emailChangeRequested`, `emailChanged`, `emailChangeReverted` (en + sv, tests, stories in `apps/story/stories/email/`, the email README list); `packages/i18n/messages/{en,sv}/{api,email}.json` keys pinned by the existing tests.
- [ ] Tests: migration on both engines; token purposes; templates render en/sv with masked addresses and no secrets.
- [ ] Commit `feat(api): email change storage, contract and templates`.

### Task 2: requestChange, get, confirmChange

**Files:** `apps/api/src/router.ts` (+ a small `apps/api/src/email-change.ts` helper module if the router section grows), contract entries for `account.email.get/requestChange/confirmChange`, `apps/api/src/email-change.test.ts`.
- [ ] Tests (SQLite + Postgres): reauth (password, passwordless fresh/stale), 2FA code required when on (right/wrong/limiter shared with disable), impersonation refused, limiter, same address `BAD_REQUEST`, taken address identical answer + no mail + no token, replace-pending voids old tokens, both mails sent with the right locale and masked addresses; confirm: wrong caller, expired, used, replaced token, taken meanwhile (`CONFLICT`, unchanged), success sets email + verified, voids reset/verify/magic/cancel tokens, ends all other sessions only, issues revert token + `emailChanged` mail, audit row with masked metadata, billing_customers.email follows; Postgres race: two accounts confirming the same new address.
- [ ] Commit `feat(api): request and confirm an email change`.

### Task 3: cancel and revert

**Files:** router/contract `auth.emailChange.cancel/revert`, tests.
- [ ] cancel: voids the pending change, ends every session, audit; used/expired token `BAD_REQUEST`.
- [ ] revert: restores old address (verified), ends every session, deletes passkeys and pending tokens, clears password + mails `resetPassword` when one existed, mails `emailChangeReverted`, audit; old address now taken → `CONFLICT`, nothing changes; a second change after the first (revert token of change 1 used after change 2) restores the address from change 1's token — define and test the behaviour (spec: restore the token's old address if free; document it); Postgres race confirm-vs-revert.
- [ ] Commit `feat(api): cancel or undo an email change from the old address`.

### Task 4: account UI

**Files:** `apps/account` Personal info **Email address** card (client component; values via Zod-free subpaths), server actions + cores, `/email/confirm` page (button-consumed), i18n (account.json en/sv), tests (action cores, render tests like neighbours), page added to the e2e a11y manifest (`apps/e2e/a11y/routes.ts`) or its EXCLUDED list with reason (scripts/a11y.test.ts enforces).
- [ ] Commit `feat(account): change your email`.

### Task 5: auth UI

**Files:** `apps/auth` `/email/cancel` and `/email/revert` (anonymous, button-consumed, translated), action cores + tests, robots disallow `/email/` (`src/lib/routes.ts` / robots), a11y manifest entry or exclusion.
- [ ] Commit `feat(auth): cancel or undo an email change`.

### Task 6: e2e journey

**Files:** `apps/e2e/tests/email-change.spec.ts`: sign up + verify; request change (password); read both mails from `MAIL_DIR` (fixtures/mail.ts); confirm from the new-address link; sign out; sign in with the new address; then use the old address's undo link → restored; sign in via the reset link to the old address. Plus the cancel path in a second test.
- [ ] Typecheck → commit `test(e2e): change an email and undo it`.

### Task 7: Docs

CLAUDE.md (**Email change.** paragraph under Authentication; update the **Email.** paragraph's "When an email-change flow lands" sentence; e2e counts), apps/api / account / auth READMEs, `docs/guides/` (where account security flows are documented — check), help center article (account-security), packages/email README templates, docs/ROADMAP.md: a "Phase 10 — deepen what exists" section listing A email change, B suspend users, C audit retention and export (unticked; A ticked on merge).
- [ ] Commit `docs: email change`.
