# Notification Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-user in-app notification inbox — a bell with an unread count in every signed-in app, a `/notifications` page in account, live updates in app — for the events that happen to the signed-in person.

**Architecture:** `notifications` table + `notifyUser()` writing inside the change's transaction and publishing on a per-user channel after commit; `notifications.list/unreadCount/markRead`; a `/events/me` stream relayed only by `apps/app`; a `@repo/ui` `NotificationBell` block server-rendered by `app`, `auth`, `account`; the account page with mark-read actions calling `refresh()`.

**Tech Stack:** Bun.sql (SQLite + Postgres), the existing Broadcaster (memory / Postgres NOTIFY), oRPC, Next 16 (`refresh()` from `next/cache`) + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-notification-centre-design.md`

## Global Constraints

- Migration `0032_notifications`: `notifications(id, user_id NOT NULL, workspace_id NULL, type TEXT, data TEXT JSON, created_at, read_at NULL)`, no FKs, indexes `(user_id, created_at)` and `(user_id, read_at)`. `data` = ids and display names only — never an email, token or secret.
- `NOTIFICATION_TYPES` (`@repo/api-contract`, Zod-free `./notifications` subpath): `invitation.received`, `member.role_changed`, `member.removed`, `workspace.two_factor_required`, `export.ready`, `webhook.disabled`, `plan.changed`.
- `notifyUser(context, userId, type, data, { tx, workspaceId? })`: insert in the caller's transaction; publish `{ type: "notification.created", id }` on `userChannel(id)` = `user:<id>` after commit (fire-and-forget, `publishAfterCommit` pattern). Never notify the actor about their own action. Recipients per spec §2 (invitation only to an existing account holding the address, and only once its email is verified — ruling, overriding the spec's original "verified or not"; a role change also notifies `transferOwnership`'s new owner; removal not on leave; 2FA requirement to non-satisfying members; webhook disabled and plan changed to each owner).
- `notifications.list({ cursor?, limit? 1–50 default 20, unreadOnly? })`, `notifications.unreadCount()`, `notifications.markRead({ ids: 1–100 } | { all: true })` — all ⚑, own rows only, keyset `(created_at, id)` desc; `workspaceId` returned only while still a member; `markRead` refused while impersonating (`FORBIDDEN` "Not available while impersonating"), idempotent; others' ids ignored.
- Retention: `notifications.prune` `5 4 * * *` — read rows > 30 days, any row > 90 days. In the privacy export (type, created, read, data); deleted by `users.purge`.
- `GET /events/me`: same guard, limiter, session resolution, idle-timeout handling, pings, 60 s re-check as `/events/workspaces/:id`; `resync` on connect; no presence. Caps: 5/session, 10/user, kept in their own counters apart from the workspace stream's (ruling, overriding the spec's original "counted with workspace streams" — halving usable `/notes` tabs per session otherwise); the process-wide `REALTIME_MAX_STREAMS` cap stays shared. Relay `/api/events/me` in `apps/app` only; `auth` and `account` refresh their bell on a full load or a server action's `refresh()`, not on every client `<Link>` navigation.
- UI: `@repo/ui` `NotificationBell({ count, href, label })` (props only; `99+` cap; accessible name via ICU plural; polite live region on change) in `SiteHeader`'s `end` slot of `app`, `auth`, `account`, count fetched server-side (failure → bell without count). `apps/app` client wrapper: `router.refresh()` (debounced) on `notification.created`, stops on 401/403/404. `apps/account` `/notifications` (sidebar entry): translated sentence per type + target link + UTC date (`formatUtcDate`), unread marked, **Mark all as read**, per-row **Mark as read**, **Unread only** filter, **Older**/**Newest** GET paging; actions call `refresh()` from `next/cache`. No toasts or pop-ups. en + sv, no JS needed, labels unique.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly (never docker prune/rm/rmi/system prune; if Docker is out of disk, stop and report BLOCKED). Client components never import `@repo/sites` root or contract roots (Zod-free subpaths only). Never `mock.module` a first-party module that has its own test. Postgres tests: `TEST_DATABASE_URL="postgres://jonasbroms@[::1]:5432/postgres"`, `--timeout 30000`. Account `/security` has 0.4 KB of bundle headroom: any client JS added to the shared header must be measured; the bell is a server-rendered link and adds none.

## Review Focus

1. A notification for one user is never readable, countable or markable by another, including via a crafted id list or the stream (Tasks 1–2).
2. A change that rolls back creates no notification and publishes nothing; a committed change creates exactly one per recipient, never one for the actor (Task 1).
3. An impersonation session never marks a user's notifications read and never receives the impersonator's own (Tasks 1–2).
4. The header never breaks: an api failure or timeout fetching the count renders the bell without a count, on every signed-in page, including `/security` within budget (Task 3).
5. A notification about a workspace the user has since left does not link into it (Tasks 1, 3).

---

### Task 1: Notifications in the api

Migration 0032 (+ migrate test both engines); contract types + `./notifications` subpath; `notifyUser`; the seven emitters; `notifications.list/unreadCount/markRead`; `notifications.prune` schedule; export + purge; messages en + sv. Tests both engines incl. Review Focus 1–3, 5.
- [ ] Commit `feat(api): create and read per-user notifications`.

### Task 2: Per-user stream

`userChannel`; `GET /events/me` (caps shared with workspace streams, re-check, impersonation rules); `@repo/session` user-events relay; `apps/app` `/api/events/me` route. Tests (api stream, session route) incl. Review Focus 1, 3.
- [ ] Commit `feat(api): stream a user's own notifications`.

### Task 3: Bell and notifications page

`@repo/ui` `NotificationBell` + story + test; bell in `app`, `auth`, `account` headers (server-side count, failure-safe); `apps/app` live refresh wrapper; `apps/account` `/notifications` page + sidebar entry + actions with `refresh()`; en + sv; a11y manifest entry for `/notifications`; i18n guards; bundle budgets (controller adds the new route).
- [ ] Commit `feat(account): show a user's notifications`.

### Task 4: e2e

`apps/e2e/tests/notifications.spec.ts`: owner changes a member's role → the member's bell shows 1 → `/notifications` lists the change → Mark all as read clears the badge. Update e2e counts in README and CLAUDE.md. Controller runs Playwright.
- [ ] Commit `test(e2e): notifications`.

### Task 5: Docs

CLAUDE.md (**Notifications.** paragraph; migration; Realtime, Privacy, Jobs cross-refs), READMEs (api, account, app, session, ui blocks), a guide section, `/privacy` line (the inbox and its retention), ROADMAP Phase 13 section (A unticked, B listed).
- [ ] Commit `docs: notification centre`.

## Changed during implementation

Three rulings surfaced during Task 1–3 review changed this plan's Global Constraints from what
is written above (see the spec's own "Changed during implementation" section and
`.superpowers/sdd/2026-10-21-notification-centre/progress.md` for the full reasoning):

1. `invitation.received` goes only to a **verified** account holding the invited address, not
   "verified or not".
2. The per-user stream (`GET /events/me`) keeps its own 5/session and 10/user caps, apart from
   the workspace stream's, rather than counting the two kinds together; the process-wide
   `REALTIME_MAX_STREAMS` cap stays shared.
3. `auth` and `account` refresh their bell on a full load or a server action's `refresh()`
   (their layouts persist across a client `<Link>` navigation), not on every navigation as
   originally written.
