# Notification Preferences and Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users choose per type whether optional notifications also arrive by email; three new optional emails with RFC 8058 one-click unsubscribe; essential mail stays locked on.

**Architecture:** `notification_preferences` + `NOTIFICATION_EMAIL` classification; `notifyUser` enqueues an optional email in the change's transaction when enabled; a `headers` field on the mail seam carries `List-Unsubscribe` / `List-Unsubscribe-Post`; an HMAC unsubscribe token consumed by an anonymous procedure behind an `apps/auth` one-click route and a confirm page; an Email section on account `/notifications`.

**Tech Stack:** Bun.sql (SQLite + Postgres), the mail seam (Nodemailer / Resend), React Email, oRPC, Next 16 + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-notification-preferences-design.md`

## Global Constraints

- Migration `0033_notification_preferences`: `notification_preferences(user_id, type, email_enabled, updated_at)`, PK `(user_id, type)`, no FK; no row = default.
- `NOTIFICATION_EMAIL` (contract `./notifications` subpath): `locked` = `invitation.received`, `workspace.two_factor_required`, `export.ready`, `webhook.disabled`; `optional` (default on) = `member.role_changed`, `member.removed`, `plan.changed`.
- `account.notificationPreferences.get()` / `.set({ type, email })` ⚑, optional types only, refused while impersonating, audited `user.notification_email_changed`, no-op writes nothing; in the privacy export; deleted by `users.purge`.
- Locked types' existing mails unchanged in every respect. Optional mails enqueued inside the change's transaction only when enabled; templates `roleChanged`, `removedFromWorkspace`, `planChanged` (en + sv, saved locale else English, test + story), no other people's emails, visible "Turn off these emails" link.
- Mail seam `Message.headers?: Record<string, string>` passed through `smtp` and `resend`, recorded by `log`/`file`. Optional mails only: `List-Unsubscribe: <${AUTH_URL}/email/unsubscribe/one-click?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Token: `base64url(userId.type.v)` + HMAC-SHA256 under a key derived from `TWO_FACTOR_ENCRYPTION_KEY` with a fixed context label; constant-time compare; no expiry; bound to one user + one type. `auth.notificationEmail.unsubscribe({ token })` anonymous, rate-limited per client and api-wide, identical answer for good and bad tokens, bad token changes nothing.
- `apps/auth`: `POST /email/unsubscribe/one-click?token=` route → empty `200`, `no-store`, no redirect, no same-origin check (documented); `GET` same path → `303` to `/email/unsubscribe?token=`; that page names the type, **Turn off these emails** server action, never acts on load; a11y manifest entry.
- `apps/account` `/notifications` **Email** section: checkbox per optional type + **Save email settings**, locked list read-only "Always emailed — needed to keep your account and workspaces working.", read-only while impersonating, no JS needed. en + sv; labels unique.
- Tests must derive formatted dates from the same formatter the code uses, never literals (CI ICU differs). Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly (never docker prune/rm/rmi/system prune; if Docker is out of disk, stop and report BLOCKED). Client components never import `@repo/sites` root or contract roots. Never `mock.module` a first-party module that has its own test. Postgres tests: `TEST_DATABASE_URL="postgres://jonasbroms@[::1]:5432/postgres"`, `--timeout 30000`. Account `/security` has ~1.5 KB of bundle headroom.

## Review Focus

1. A token for one user or type can never change another user's or type's preference; a forged, truncated or re-encoded token changes nothing and answers exactly like a good one (Task 1).
2. A locked type can never be switched off — not by `set`, not by a token minted for it, not by a crafted type string (Task 1).
3. A rolled-back change sends no optional email; an enabled optional type sends exactly one; a disabled one sends none but the in-app notification still lands (Task 1).
4. Loading the unsubscribe page or following a `GET` never unsubscribes anyone (Task 2).
5. Locked mails carry no `List-Unsubscribe` header and their content is byte-identical to before (Tasks 1–2).

---

### Task 1: Preferences, optional emails and the token in the api

Migration 0033 (+ migrate test); contract (`NOTIFICATION_EMAIL`, preference schemas, token procedure); mail seam `headers` (smtp, resend, log, file + tests); three templates (en + sv, tests, stories); `notifyUser` enqueue; token mint/verify; `account.notificationPreferences.*`; `auth.notificationEmail.unsubscribe`; export + purge; messages en + sv. Tests both engines incl. Review Focus 1–3, 5.
- [ ] Commit `feat(api): email optional notifications and honour per-type preferences`.

### Task 2: Unsubscribe pages in auth

`POST`/`GET` `/email/unsubscribe/one-click` route and the `/email/unsubscribe` page with its server action; en + sv; robots (already under `/email/`); a11y manifest; tests incl. Review Focus 4.
- [ ] Commit `feat(auth): one-click and confirmed unsubscribe from notification emails`.

### Task 3: Email settings in account

The Email section on `/notifications`; action core; en + sv; tests; bundle budgets (controller adjusts if a route changes).
- [ ] Commit `feat(account): choose which notifications are emailed`.

### Task 4: e2e

`apps/e2e/tests/notification-email.spec.ts`: member turns off role-change email → owner changes their role → inbox shows it, no mail arrives; then a one-click `POST` to the `List-Unsubscribe` URL of the next `plan.changed` mail turns that type off, visible on the settings page. Update e2e counts. Controller runs Playwright.
- [ ] Commit `test(e2e): notification email preferences`.

### Task 5: Docs

CLAUDE.md (**Notification preferences.** paragraph; migration; Email, Notifications cross-refs), READMEs (api, auth, account, email), guide section, `/privacy` (email choices), ROADMAP (tick A as #116; B unticked).
- [ ] Commit `docs: notification preferences and email`.
