# Workspace Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workspace admins and owners see the last 90 days of their workspace's administrative actions — who changed membership, roles, invitations, keys, webhooks, settings and plan — on the Workspace page.

**Architecture:** `audit_log` gains a nullable `workspace_id`; a new `auditWorkspace()` always records the admin actions with it set; `workspaces.activity.list` reads them back through an allowlist (no ip, user agent or reason) and resolves actors (member, by support, API key, system, deleted); `apps/account` renders an Activity card with plain GET paging and filtering.

**Tech Stack:** Bun.sql (SQLite + Postgres), oRPC, Next 16 + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-19-workspace-activity-design.md`

## Global Constraints

- Migration `0029_audit_workspace`: nullable `audit_log.workspace_id INTEGER`, no FK, index `audit_log_workspace (workspace_id, at)`; no backfill.
- Recorded actions (`WORKSPACE_ACTIVITY_ACTIONS` in `@repo/api-contract`): `workspace.created`, `workspace.renamed`, `workspace.logo_set`, `workspace.logo_removed`, `workspace.ownership_transferred` (new), `workspace.plan_changed` (new, mock and Stripe mirror writes, system actor for the webhook), `invitation.accepted` (displayed "joined"), `member.role_changed`, `member.removed`, `workspace.left`, `invitation.created`, `invitation.revoked`, `workspace.api_key_created`, `workspace.api_key_revoked`, `workspace.webhook_created`, `workspace.webhook_updated`, `workspace.webhook_secret_rotated`, `workspace.webhook_deleted`, `workspace.webhook_disabled`. Existing stored action names unchanged. Notes keep impersonation-only rows and never appear. `privacy.purge` records nothing new.
- Display metadata allowlist per spec §2 table (`from`/`to`, `name`, `role`, masked `email`, `scopes`, `host`, `events`, `plan`/`interval`/`status`, `reason` only for `workspace.webhook_disabled` as `failures|gone`).
- `workspaces.activity.list({ workspaceId, cursor?, limit? 1–100 default 50, action? })` ⚑ `member("admin")`, every plan, readable while impersonating; keyset `(at, id)` desc; `at >= now − 90 days` (`WORKSPACE_ACTIVITY_DAYS = 90`, `Context.now()`); never returns `ip`, `user_agent`, `reason`, a staff id or name, or a non-allowlisted metadata key.
- Actor union: `member {userId,name,email|null,bySupport}` | `apiKey {id,name}` | `system` | `deleted`.
- UI: `apps/account` Workspace page Activity card below Webhooks, admin+ only (absent below), UTC times via `formatUtcDate`, translated sentence per action, "by support" badge, type filter + Older/Newer links as GET, no JS needed, en + sv, empty state "No activity in the last 90 days.", i18n guard clean.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; commit with `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly (never docker prune/rm/rmi/system prune; if Docker is out of disk, stop and report BLOCKED). Client components never import `@repo/sites` root or contract roots. Postgres tests use `[::1]:5432`.

## Review Focus

1. A superadmin impersonating → the log shows the member + `bySupport`, and the superadmin's id, name or email appears nowhere in the response (Task 2).
2. A row from another workspace, or a workspace-less platform row (suspension, job retry), never appears in any workspace's list, including via a forged cursor (Task 2).
3. A change that rolls back records nothing; an audit written inside the change's transaction commits with it (Task 1).
4. A member later purged, or an API key later deleted with its workspace → the row still renders (`deleted` actor / key name kept from metadata), never a 500 (Task 2).
5. A row exactly 90 days old, and the cutoff moving with `Context.now()` (Task 2).

---

### Task 1: Record workspace activity

Migration `0029_audit_workspace` (+ migrate test both engines; list in `migrations/index.ts`); `AuditInput.workspaceId`; `db.audit.create` writes it; `auditWorkspace(context, workspaceId, input, client?)` in `apps/api/src/admin.ts` (always writes; system/API-key callers pass a context with no user → actor null, `metadata.apiKeyId`); switch every call site for the actions above from `auditWhileImpersonating`/`audit` to `auditWorkspace`, inside the change's `tx` where one exists; add `workspace.ownership_transferred` and `workspace.plan_changed` (mock `billing.mockChange` and the Stripe webhook's mirror write); `WORKSPACE_ACTIVITY_ACTIONS` constant in `@repo/api-contract`. Tests: each action writes one row with `workspace_id`; rollback writes none (Review Focus 3); notes still impersonation-only.
- [ ] Commit `feat(api): record workspace administrative actions with their workspace`.

### Task 2: Read the activity log

Contract `workspaces.activity.list` + schemas (`WorkspaceActivityItemSchema`, actor union, cursor), messages en + sv; `queries/audit.ts` `listForWorkspace`; handler with the 90-day cutoff, keyset paging, action filter, allowlisted `details`, actor resolution (member name/email by role rule, `bySupport` from `impersonated_user_id`, API key name from metadata/`api_keys`, `system`, `deleted`) and target labels. Tests both engines incl. Review Focus 1, 2, 4, 5, role gating (viewer/member `FORBIDDEN`, non-member `NOT_FOUND`), impersonation read.
- [ ] Commit `feat(api): list a workspace's activity for its admins`.

### Task 3: Activity card

`apps/account` Workspace page: server-loaded Activity card (admin+), filter select + submit and Older/Newer links via `searchParams`, translated sentences (`account.json` en + sv), "by support" badge, empty state; view/action-core tests; i18n guard; bundle budget (controller adds if a route changes).
- [ ] Commit `feat(account): show workspace activity to admins`.

### Task 4: e2e

`apps/e2e/tests/workspace-activity.spec.ts`: an owner renames the workspace and invites a member → both appear in Activity; a member does not see the card. Controller runs Playwright.
- [ ] Commit `test(e2e): workspace activity log`.

### Task 5: Docs

CLAUDE.md (**Activity log.** paragraph, migration, Admin and Jobs/retention cross-refs, e2e counts), `apps/api` + `apps/account` READMEs, `docs/guides/operations.md` retention note, `/privacy` template line (workspace admins see members' administrative actions), ROADMAP Phase 12 section (A unticked; ticked on merge).
- [ ] Commit `docs: workspace activity log`.
