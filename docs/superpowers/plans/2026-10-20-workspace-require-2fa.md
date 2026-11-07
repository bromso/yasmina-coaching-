# Enforced Two-Step Verification per Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace owner can require two-step verification; members without it (no TOTP and no passkey) stay members but are blocked from the workspace until they set it up.

**Architecture:** `workspaces.require_two_factor` + a `satisfiesTwoFactor(user)` check in the router's `member(min)` middleware and the realtime stream; `workspaces.security.get/set` (owner sets, audited, mails non-compliant members); account Security card + members badge; a shared `TwoFactorRequiredNotice` block shown by `app` and `account` in place of workspace pages.

**Tech Stack:** Bun.sql (SQLite + Postgres), oRPC, React Email, Next 16 + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-workspace-require-2fa-design.md`

## Global Constraints

- Migration `0030_workspace_require_two_factor`: `workspaces.require_two_factor` boolean default false (repo's boolean pattern).
- Satisfied = two-step (TOTP) on **or** ≥ 1 passkey, read fresh per request; `User.twoFactorSatisfied`, `WorkspaceSummary.requireTwoFactor`.
- Blocked: every `member(min)` procedure → `FORBIDDEN`, `data: { reason: "two_factor_required" }`, message key `workspaceTwoFactorRequired` "Turn on two-step verification to access {workspace}." (en + sv). Exempt: `workspaces.list`, `workspaces.leave`, `invitations.preview`/`accept`/`acceptById`, all `account.*` / `auth.*`. Impersonation follows the member. Realtime stream `403` (re-checked every 60 s), relay passes `403` through, client stops reconnecting. `/v1` and webhooks unaffected.
- `workspaces.security.set({ workspaceId, requireTwoFactor })` owner only, every plan, refused while impersonating; turning on when the owner is not satisfied → `FORBIDDEN` `data.reason: "owner_two_factor"` "Turn on two-step verification for your own account first."; no-op writes nothing; audit `workspace.two_factor_requirement_changed` `details: { enabled }` via `auditWorkspace` (added to `WORKSPACE_ACTIVITY_ACTIONS`, Activity card sentences + filter en/sv, GDPR export allowlist `enabled`); turning on enqueues `workspaceTwoFactorRequired` mail (en + sv, saved locale else English, link `${ACCOUNT_URL}/security`) in the same transaction to exactly the non-satisfying members. `workspaces.security.get` admin+: `{ requireTwoFactor, membersWithoutTwoFactor }`.
- `workspaces.members.list` gains `twoFactor: boolean | null` (null below admin). `invitations.preview` gains `requireTwoFactor`.
- UI: account Workspace **Security** card above API keys (owner toggle with a no-JS two-step confirmation naming "N members will be blocked…"; admin read-only + count; below admin state only); members list "No two-step" badge (admin+); account Security page warning naming requiring workspaces before turning two-step off / removing the last passkey when that drops compliance (still allowed); `@repo/ui` block `TwoFactorRequiredNotice` (props only) shown by `app` (`/notes`, `/chat`) and `account` (`/workspace`, `/payments`) instead of the page, with Set up / Switch workspace / Leave workspace; invitation page line "This workspace requires two-step verification."; en + sv everywhere, i18n guards clean.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; commit with `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly (never docker prune/rm/rmi/system prune; if Docker is out of disk, stop and report BLOCKED). Client components never import `@repo/sites` root or contract roots (Zod-free subpaths only). Never `mock.module` a first-party module that has its own test (Bun mocks are process-wide). Postgres tests use `TEST_DATABASE_URL="postgres://jonasbroms@[::1]:5432/postgres"` with `--timeout 30000`.

## Review Focus

1. A member who turns two-step off (or removes their last passkey) mid-session → blocked on the very next request and the open realtime stream closes within 60 s (Tasks 1, 4).
2. The owner can never lock the workspace out: turning on while unsatisfied is refused; an owner who later disables their own two-step is blocked like anyone, but can still reach `account.*` to fix it and `workspaces.leave` (Tasks 1–2).
3. A blocked member can always recover: the exempt procedures pass, and the app/account pages render the notice instead of a 500 or a redirect loop (Tasks 1, 4).
4. The mail goes to exactly the non-satisfying members, once, only when the setting actually turns on (no-op, turning off, and a repeat on → no mail) (Task 2).
5. Below-admin callers never learn other members' two-step status (members list `null`, `security.get` refused) (Task 2).

---

### Task 1: Require it and enforce it in the api

Migration 0030 (+ migrate test both engines); `satisfiesTwoFactor`; `User.twoFactorSatisfied`, `WorkspaceSummary.requireTwoFactor`; `member(min)` refusal + declared errors; exemptions; message key en + sv; realtime stream 403 + 60 s recheck; `createEventsRoute` passes 403. Tests both engines incl. Review Focus 1–3 (api side), impersonation, `/v1` unaffected.
- [ ] Commit `feat(api): block workspace access until a member has two-step verification`.

### Task 2: Owner control, audit, mail, members status

`workspaces.security.get/set`; audit action + `WORKSPACE_ACTIVITY_ACTIONS` + export allowlist; `workspaceTwoFactorRequired` template (en + sv, test, story) and enqueue in the set transaction; `members.list` `twoFactor`; `invitations.preview` `requireTwoFactor`. Tests both engines incl. Review Focus 2, 4, 5.
- [ ] Commit `feat(api): let an owner require two-step verification for a workspace`.

### Task 3: Account settings UI

Workspace Security card (owner toggle with confirmation, admin/below views), members "No two-step" badge, Activity card sentence + filter option for the new action, Security page warning before dropping compliance; en + sv; action cores and view tests; i18n guard. Bundle budget (controller adds if a route changes).
- [ ] Commit `feat(account): require two-step verification from the Workspace page`.

### Task 4: Blocked notice in app and account

`@repo/ui` `TwoFactorRequiredNotice` block + story; `app` `/notes`, `/chat` and `account` `/workspace`, `/payments` render it when required and unsatisfied (server-side, from `me` + the current workspace); `LiveNotes` treats a stream `403` as permanent; invitation page line; en + sv; tests; i18n guards.
- [ ] Commit `feat(app): show a blocked member how to turn on two-step verification`.

### Task 5: e2e

`apps/e2e/tests/workspace-require-2fa.spec.ts`: owner (with two-step) turns the requirement on; a member without two-step sees the notice on `/notes`; sets up two-step on account `/security`; then sees `/notes`; the owner's Activity card shows the change. Update e2e counts in README and CLAUDE.md. Controller runs Playwright.
- [ ] Commit `test(e2e): require two-step verification for a workspace`.

### Task 6: Docs

CLAUDE.md (**Required two-step.** paragraph; migration; Two-factor, Activity log, Realtime cross-refs), `apps/api`, `apps/account`, `apps/app`, `packages/email` READMEs, a short guide section, `/privacy` line (admins see whether members have two-step on), ROADMAP (tick A as merged in #112; B unticked).
- [ ] Commit `docs: enforced two-step verification per workspace`.
