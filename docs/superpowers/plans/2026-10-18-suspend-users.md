# Suspend Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Superadmins suspend and unsuspend accounts (optional end date); a suspended account cannot sign in by any path or act on any session; its workspaces keep working; the user is told by mail and at sign-in, never the internal reason.

**Architecture:** four columns on `users` and one pure rule `isSuspended(user, now)`; refusals at every session-issuing point and in `resolveSession`; two admin procedures; two mail templates; an admin card in `apps/auth`.

**Tech Stack:** Bun.sql (SQLite + Postgres), oRPC, React Email, Next 16 + next-intl, Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-18-suspend-users-design.md`

## Global Constraints

- Migration `0026_suspensions`: `users.suspended_at`, `suspended_until`, `suspension_reason` (TEXT, nullable), `suspended_by` (INTEGER, nullable, no cascading FK). ISO UTC strings like every other timestamp.
- `isSuspended(user, now)`: `suspended_at` set and (`suspended_until` null or > now). Expiry is never written back by a job.
- `ACCOUNT_SUSPENDED_MESSAGE` = "This account is suspended. Contact support." — `FORBIDDEN`, en + sv through `apiMessage`, declared on every procedure that can return it.
- Refuse only after the path's own credential check passes (a wrong credential answers exactly as before). Sessions of a suspended user resolve as invalid (`UNAUTHORIZED`) everywhere a session is resolved.
- `admin.users.suspend({ userId, reason, until? })` / `unsuspend({ userId, reason })`: superadmin only, `NOT_FOUND` otherwise (impersonation included); never self or another superadmin; reason 3–200; `until` future and ≤ 365 days; limiter `suspend:<adminId>` 20/h; user row locked first; sessions ended + `sessions_revoked_at` stamped in the same transaction; audit `user.suspended` / `user.unsuspended`; mails enqueued in the transaction, saved locale else English, never the reason.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings. Implementers never run Playwright, `bun run ci`/`validate`, or any docker command. Client components import contract values only via Zod-free subpaths and never `@repo/sites` root (scripts/client-imports.test.ts).

## Review Focus

1. A sign-in path that issues a session or a two-step challenge without the suspension check (password, magic link, OAuth sign-in and connect, passkey, two-step verify, impersonation) → each refused, each tested (Task 2).
2. A session created just before the suspension committing → refused by `resolveSession`, and the Postgres race test leaves no usable session (Task 2).
3. The suspended message leaking account existence before a correct credential → identical answers until the credential is right (Task 2).
4. An admin suspending themselves / another superadmin / with an impersonation session → refused (Task 1).
5. The internal reason or admin id reaching the user (mail, sign-in message, export) → never (Tasks 1, 3).

---

### Task 1: Data, rule, admin procedures, mails

Migration 0026 (+ index/migrate test), `isSuspended` (pure, tested), queries, contract (`AdminUser.suspended`, `admin.users.suspend/unsuspend`, users-list filter, `ACCOUNT_SUSPENDED_MESSAGE`), handlers with all rules above, templates `accountSuspended` / `accountUnsuspended` (en + sv, tests, stories, email README), i18n api keys pinned, privacy export fields (status + dates only). Tests on SQLite and Postgres.
- [ ] Commit `feat(api): suspend and unsuspend accounts`.

### Task 2: Enforcement

`resolveSession` and every session-issuing path listed in Review Focus 1; the declared errors on each affected procedure; tests per path (refused after a correct credential, identical before), expiry by `until` (injected clock), existing sessions refused (procedures, events stream, file/analytics identity), Postgres race sign-in vs suspend.
- [ ] Commit `feat(api): a suspended account cannot sign in or act`.

### Task 3: apps/auth UI

Sign-in error mapping for the suspended message on every sign-in page (password, magic link, provider callback redirect, passkey, two-step) en + sv; admin `/admin/users/<id>` Suspension card (suspend with reason + optional end date; unsuspend with reason; disabled for self/superadmins) and `/admin/users` badge + filter; action cores + tests; i18n guard; bundle-budget for auth (controller adds budgets for any new route).
- [ ] Commit `feat(auth): suspend users from the admin and tell them at sign-in`.

### Task 4: e2e

`apps/e2e/tests/suspend.spec.ts`: superadmin (existing admin fixture) suspends a fresh user, that user's password sign-in shows the message, superadmin unsuspends, the user signs in. Controller runs Playwright.
- [ ] Commit `test(e2e): suspend and unsuspend a user`.

### Task 5: Docs

CLAUDE.md (**Suspension.** paragraph; the Admin paragraph's out-of-scope list; e2e counts), apps/api and auth READMEs, a guide section (admin/operations), help center note if an account article fits ("Why can't I sign in?" line), ROADMAP B unticked (ticked on merge).
- [ ] Commit `docs: suspend users`.
