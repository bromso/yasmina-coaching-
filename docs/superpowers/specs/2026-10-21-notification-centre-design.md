# Notification centre — design (Phase 13 A)

Phase 13 "notifications": **A in-app notification centre** → B per-user notification preferences
and email delivery (one-click unsubscribe; security mail never opt-out-able). Approved in chat on
2026-10-21. One PR.

## Intent

A signed-in person sees, in one place, the things that happened **to them** — invited to a
workspace, their role changed, removed, a workspace now requires two-step verification they
lack, their data export is ready — and, for owners, a webhook auto-disabled or the plan changed.
Decided with the owner:
- **Events:** personal only (no "someone joined" noise; that is the activity log's job).
- **Calm by design:** a badge and an inbox — no toasts, pop-ups or sounds.
- **Approach:** the unread count renders server-side on every page of the three signed-in apps;
  only `apps/app` gets a live update, over a new per-user channel.

## Basis (checked 2026-10-21)

- Consensus: notifications disrupt task focus and raise strain; reducing them helps (Ohly et al.,
  J. Occup. Health 2023); people value notifications for passive awareness rather than as a
  trigger to switch tasks (Iqbal & Horvitz, 2010); informational intrusions hurt task resumption
  most (Vella et al., ECCE 2022); users accept attention management when they feel in control
  (Talypova et al., MUM 2023; Kim et al., IEEE Access 2025) — hence a passive badge + inbox, no
  interrupting UI, and B's per-user preferences.
- Context7 `/w3c/aria-practices`: polite live regions announce a changed value without
  interrupting; a disclosure/link pattern for the bell — the count change is announced politely,
  never as an alert.
- Context7 `/vercel/next.js` v16.2: `refresh()` from `next/cache`, called in a Server Action,
  refreshes the client router so server-rendered layout data (the bell's count) updates after a
  mutation; `router.refresh()` does the same from the client (used on a live event).
- Context7 `/amannn/next-intl` v4.14: counts use ICU plurals (`{count, plural, =0 {…} one {…}
  other {# …}}`); relative times need a stable `now` to avoid hydration mismatches — so the list
  shows absolute UTC dates (`formatUtcDate`, like the Activity card), not "2 hours ago".
- No new legal surface: notifications are the user's own data — included in their data export,
  deleted with their account, retention bounded (§1).

## 1. Data

- Migration `0032_notifications`: `notifications` (`id`, `user_id` NOT NULL, no FK like other
  user-owned tables, `workspace_id` nullable no FK, `type` TEXT, `data` TEXT JSON, `created_at`,
  `read_at` nullable), index `(user_id, created_at)` and a partial/plain index supporting the
  unread count `(user_id, read_at)`.
- `data` holds ids and display names only (workspace name, role, plan) — never an email address,
  token or secret.
- `NOTIFICATION_TYPES` in `@repo/api-contract` (with a Zod-free `./notifications` subpath for the
  type list): `invitation.received`, `member.role_changed`, `member.removed`,
  `workspace.two_factor_required`, `export.ready`, `webhook.disabled`, `plan.changed`.
- Retention: `notifications.prune` nightly (`5 4 * * *`) deletes read rows older than 30 days and
  any row older than 90 days. `users.purge` deletes a user's rows; the privacy export lists them
  (type, created, read, data).

## 2. Creating notifications

- `notifyUser(context, userId, type, data, { tx, workspaceId? })` inserts inside the caller's
  transaction (a rolled-back change creates nothing) and publishes `{ type: "notification.created",
  id }` on the per-user channel `userChannel(id)` = `user:<id>` **after commit** (the
  `publishAfterCommit` pattern; fire-and-forget; under the same 8000-byte NOTIFY limit).
- Never notify the actor about their own action (an owner changing someone's role notifies that
  member, not the owner), and never on an impersonation session's *behalf* to the impersonator.
- Emitters (one notification per recipient, exactly once per committed change):
  - `invitation.received` — `workspaces.invitations.create` and re-invite, to the account that
    already holds the invited address, **only once that account's email is verified** (ruling,
    Task 1 review — matches the rule `workspaces.list`'s pending invitations already use, so
    whoever pre-registered someone else's address unverified never learns what it is being
    invited to); none when no account exists or the holder is unverified.
  - `member.role_changed` also fires from `workspaces.transferOwnership`, to the new owner
    (`from` their previous role, `to: "owner"`) — the former owner made the change, including
    their own demotion, so they get nothing (ruling, Task 1 fix round 1).
  - `member.role_changed` — `members.setRole`, to that member (`from`, `to`).
  - `member.removed` — `members.remove` of someone else, to that member (not on leave).
  - `workspace.two_factor_required` — `security.set` turning it on, to each non-satisfying member
    (alongside the existing mail).
  - `export.ready` — the `privacy.export` job on success.
  - `webhook.disabled` — the delivery job's auto-disable (`failures`/`gone`), to each owner.
  - `plan.changed` — the billing mirror write (mock and Stripe), to each owner.

## 3. Reading and marking

- `notifications.list({ cursor?, limit? 1–50 default 20, unreadOnly? })` (⚑) — the caller's own
  rows, newest first, keyset `(created_at, id)`; items `{ id, type, data, workspaceId, createdAt,
  read }`; `workspaceId` is returned only while the caller is still a member of it (else `null`,
  so a link never points into a workspace they left).
- `notifications.unreadCount()` (⚑) — capped display at 99 (`99+` in the UI).
- `notifications.markRead({ ids: number[] (1–100) } | { all: true })` (⚑) — only the caller's
  rows; refused while impersonating (`FORBIDDEN` "Not available while impersonating"), so support
  never clears a user's badge; idempotent.
- Another user's ids are silently ignored by `markRead` and never returned by `list`.

## 4. Realtime

- `userChannel(id)` on the existing `Broadcaster` (memory / Postgres NOTIFY).
- `GET /events/me` on `Bun.serve`: the same guard, limiter, session resolution, idle-timeout
  handling, pings and 60 s session re-check as `/events/workspaces/:id`; sends `resync` on connect
  and `notification.created` events; no presence. Caps: 5 per session and 10 per user, kept in
  **its own counters, apart from the workspace stream's** (ruling, Task 3 review, carried back
  into Task 2 — counting the two kinds together would halve how many `/notes` tabs fit in one
  session, since each then opens two streams); the process-wide `REALTIME_MAX_STREAMS` cap stays
  shared by both kinds.
- `@repo/session`'s `createEventsRoute` gains a mode (or a sibling `createUserEventsRoute`) for
  `/api/events/me`; `apps/app` gets `src/app/api/events/me/route.ts`. `auth` and `account` do not
  stream — their badge refreshes on a full load and after a server action's `refresh()` (e.g.
  marking a notification read), not on every client `<Link>` navigation, since their layouts
  persist across one (ruling, Task 3 review; corrected from "refreshes on navigation").

## 5. UI

- `@repo/ui` `NotificationBell` (props only: `count`, `href`, `label`): a link with an icon, the
  count badge (`99+` cap), an accessible name from an ICU plural ("3 unread notifications" /
  "No unread notifications"), and a polite live region announcing a changed count. Rendered by
  `app`, `auth` and `account` in `SiteHeader`'s `end` slot next to `UserMenu`, count fetched
  server-side per request (one `unreadCount` call; a failure renders the bell without a count, never
  breaks the page).
- `apps/app`: a small client wrapper subscribes to `/api/events/me` and calls `router.refresh()`
  on `notification.created` (debounced) so the badge updates live; it stops on 401/403/404 like
  `LiveNotes`.
- `apps/account` `/notifications` page (sidebar entry): the list (a translated sentence per type
  with a link to its target — the workspace page, `/data-privacy`, `/payments`, `/security`, or
  the invitation — and a UTC date), unread rows marked, **Mark all as read**, per-row **Mark as
  read**, an **Unread only** filter and **Older** / **Newest** paging (GET); server actions call
  `refresh()` from `next/cache` so the bell updates. Works without JavaScript; en + sv; i18n
  guard; labels unique.

## 6. Testing, docs

- api tests (SQLite + Postgres): each emitter creates exactly one notification for the right
  recipient and none for the actor; rollback creates none; another user's rows never visible or
  markable; impersonation reads but cannot mark; `workspaceId` nulled after leaving; prune; export
  and purge; `/events/me` auth, caps, `notification.created` after commit only.
- `@repo/session` route tests; ui block test + story; account and app action cores and views.
- e2e: an owner changes a member's role → the member's bell shows 1 → `/notifications` lists
  "Your role in … changed to Admin" → Mark all as read clears the badge.
- Docs: CLAUDE.md (a **Notifications.** paragraph; migration; Realtime, Privacy, Jobs cross-refs;
  e2e counts), READMEs (api, account, app, session, ui blocks), a guide section, `/privacy` (the
  inbox and its retention), ROADMAP (a Phase 13 section, A unticked until merge).

## Out of scope (A)

Preferences and email delivery (B); push/web-push; mentions; per-workspace muting; digests.

## Changed during implementation

Three rulings, made during review and carried back into this document (see
`.superpowers/sdd/2026-10-21-notification-centre/progress.md` for the full reasoning):

1. **`invitation.received` goes only to a verified account.** §2 originally said "verified or
   not"; an unverified holder of the invited address gets no notification (and no row) until they
   verify — the same rule `workspaces.list`'s pending invitations already use, so whoever
   pre-registered someone else's address unverified never learns what it is being invited to.
2. **The per-user stream keeps its own caps.** §4 originally said the 5-per-session and
   10-per-user limits were "counted together with workspace streams"; they are kept apart per
   kind instead (the process-wide `REALTIME_MAX_STREAMS` cap stays shared), since counting them
   together would halve how many `/notes` tabs fit in one session.
3. **`auth` and `account` refresh their bell on full loads and actions, not every navigation.**
   §4 said "their badge refreshes on navigation"; in practice their layouts persist across a
   client `<Link>` navigation, so the count only updates on a full page load or after a server
   action's `refresh()` (e.g. marking a notification read) — a stale count can show in between
   until one of those happens.

Two accepted, documented limitations, not spec changes: a real Stripe checkout's `plan.changed`
reaches the owner who checked out (the webhook carries no actor), a self-notification; and on
SQLite a dedicated worker's `export.ready` / `webhook.disabled` publish reaches no api process, so
it shows on the next page load rather than live (on Postgres it reaches every replica). See
CLAUDE.md's **Notifications.** paragraph.
