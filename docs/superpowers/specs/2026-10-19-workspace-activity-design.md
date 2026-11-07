# Workspace activity log — design (Phase 12 A)

Phase 12 "workspace admin depth": **A workspace activity log** → B enforced two-step verification
→ C email-domain allowlists for invitations. Approved in chat on 2026-10-19. One PR.

## Intent

Workspace owners and admins can see who changed what in their own workspace — membership, roles,
invitations, keys, webhooks, settings, plan — without asking the platform's support. Decided with
the owner:
- **Events:** admin actions only. Note create/delete are content, high-volume and already visible
  on `/notes`; they keep today's impersonation-only audit rows and never appear in the log.
- **Support acts:** a superadmin acting while impersonating shows as the impersonated member plus
  a "by support" badge — the superadmin is never named to the customer.
- **Access:** admin and owner, every plan (a safety feature, not an upsell), 90 days visible, no
  ip or user agent ever shown.
- B and C will record their own settings changes into this same log.

## Basis (checked 2026-10-19)

- Context7 `/owasp/cheatsheetseries`, Logging Cheat Sheet: record "when, where, who and what";
  remove or mask personal data not needed for the purpose; "the privileges to read log data
  should be restricted and reviewed periodically"; never log data unless legally sanctioned —
  "monitoring employees … may be illegal". Hence: no ip/user agent, no admin `reason`, an
  allowlisted metadata summary, admin-and-up only.
- Legal Data Hunter (EU, GDPRhub): employee-monitoring decisions — Garante 10134221 (2025-04-29,
  Region of Lombardia), Garante 10224096 (2026-02-24, Amazon Italia Logistica), CNIL
  SAN-2023-021 (2023-12-07, Amazon France Logistique) — turn on transparency to the people
  monitored and proportionality of what is recorded. Hence: only administrative actions (no
  content, no sign-in times, no page views), 90-day visibility, and the `/privacy` template
  states that workspace admins can see members' administrative actions in their workspace.
- Consensus: accountability in multi-tenant SaaS rests on evidence the tenant can see itself
  (Masmoudi et al., AINA 2017); a taxonomy of customer-observable controls puts tenant-visible
  logging first (Beliachkov, 2026).

## 1. Data

- Migration `0029_audit_workspace`: nullable `audit_log.workspace_id INTEGER` (no FK — a row
  outlives its workspace like `actor_user_id` outlives a purge) and index
  `audit_log_workspace (workspace_id, at)`. No backfill: existing rows were written only while
  impersonating, so the log starts empty at deploy (documented).
- `AuditInput` gains `workspaceId?`; `audit()` writes it. New helper
  `auditWorkspace(context, workspaceId, input, client?)` — always writes (unlike
  `auditWhileImpersonating`), actor = the session user, or the impersonator with the user as
  `impersonated` exactly as `audit()` does today. For API-key callers (`/v1`) the actor is null
  and `metadata.apiKeyId` names the key; for system writers (webhook auto-disable, a Stripe
  webhook plan change) the actor is null.
- `audit.prune` and `users.purge` already cover the table; the column changes neither.

## 2. Recorded actions (`WORKSPACE_ACTIVITY_ACTIONS` in `@repo/api-contract`)

Always recorded, with `workspace_id` set, inside or right after the change as today's audit call
sites do:

| Action | Where | Target | Metadata kept for display |
|---|---|---|---|
| `workspace.created` | create | workspace | `name` |
| `workspace.renamed` | rename | workspace | `from`, `to` |
| `workspace.logo_set` / `workspace.logo_removed` | logo | workspace | — |
| `workspace.ownership_transferred` (new) | transferOwnership | user | — |
| `workspace.plan_changed` (new) | billing mirror write (mock and Stripe webhook) | workspace | `plan`, `interval`, `status` |
| `invitation.accepted` (shown as "joined") | accept / acceptById | user | `role` |
| `member.role_changed` | setRole | user | `from`, `to` |
| `member.removed` | remove | user | — |
| `workspace.left` | leave | user | — |
| `invitation.created` / `invitation.revoked` | invitations | invitation | `role`, masked `email` |
| `workspace.api_key_created` / `_revoked` | api keys | key | `name`, `scopes` |
| `workspace.webhook_created` / `_updated` / `_secret_rotated` / `_deleted` / `_disabled` | webhooks | endpoint | `host`, `events`, `reason` (disabled only: `failures`/`gone`) |

Existing action names are kept (no rename of stored data). `privacy.purge`'s membership removal
records nothing new (the account is being erased).

## 3. Reading it

- `workspaces.activity.list({ workspaceId, cursor?, limit? (1–100, default 50), action? })`
  (⚑, `member("admin")`, every plan, readable while impersonating — read-only). Keyset on
  `(at, id)` descending; `workspace_id = ?` and `at >= now − 90 days`
  (`WORKSPACE_ACTIVITY_DAYS = 90`, from `Context.now()`).
- Each item: `{ id, at, action, actor, target, details }` where `actor` is
  `{ kind: "member", userId, name, email | null, bySupport: boolean } | { kind: "apiKey", id,
  name } | { kind: "system" } | { kind: "deleted" }` (an actor id whose user was purged), `target`
  is `{ type, id, label | null }` (a member's current name, a key's name, an endpoint's host), and
  `details` is the allowlisted metadata only. Never returned: `ip`, `user_agent`, `reason`,
  `impersonated_user_id` as an id of staff, any metadata key not on the allowlist.
- `email` follows the existing rule (members' emails are visible to admins and up).

## 4. UI

`apps/account` Workspace page, an **Activity** card below Webhooks, admin and up (below admin
the card is absent): a list (time in UTC via `formatUtcDate`, actor, a translated sentence per
action, "by support" badge), a type filter (select + submit, a plain GET form), **Older** /
**Newer** paging links (cursor in the query string) — no JavaScript needed. Empty state: "No
activity in the last 90 days." en + sv; i18n guard clean.

## 5. Testing, docs

- api tests on SQLite and Postgres: every action in §2 records with `workspace_id`; viewer/member
  get `FORBIDDEN`, non-member `NOT_FOUND`; no ip/user agent/reason in the response; the support
  marker and that the superadmin's id/name never appear; API-key and system actors; a purged actor
  reads `deleted`; 90-day cutoff (moved clock); paging and filter; another workspace's rows never
  leak.
- `apps/account` action/view tests; i18n guard; e2e (owner renames the workspace and invites a
  member → both show in Activity; a member does not see the card); a11y manifest unchanged (the
  Workspace page is already swept) plus the card in Swedish via the existing sweep.
- Docs: CLAUDE.md (an **Activity log.** paragraph; migration; Admin paragraph), `apps/api` and
  `apps/account` READMEs, `docs/guides/operations.md` (retention note), the `/privacy` template
  line, ROADMAP Phase 12 section (A ticked on merge).

## Out of scope

Exporting the workspace log (the superadmin export exists), alerts on activity, notes in the
log, sign-in history, tamper evidence (still the documented gap).
