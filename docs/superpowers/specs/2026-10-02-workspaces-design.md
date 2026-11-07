# Workspaces: organisations, roles and invitations (Phase 6e)

**Status:** implemented (2026-10-02)
**Date:** 2026-10-02
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — sub-project 6e
(brought forward: 6d billing and 6f admin both need the tenant and the roles this defines)
**Builds on:** Phase 4 (`@repo/session`, `apps/account`), 6a (`@repo/email`, `detach()`, the
`tokens` hashing rule), 6b (verified email as the linking rule), 6c (`apps/account` layout)
**Reference shape:** the product grown from this repo (`singularorg`) — sign-up creates a user
without an organisation, creating one is an explicit step, roles are `owner / admin / member /
viewer`, billing hangs off the organisation. This spec keeps the boilerplate compatible with that
shape so a product started from it never has to re-model its tenant.

## Intent

The repo has users and sessions but no tenant: `notes` belong to a user, `apps/account`'s "People &
sharing" section is a mockup, and nothing can be shared or billed per team. The benchmark put
organisations and billing among the first things founders and agencies expect, and the one product
built from this repo needed both. The ROADMAP's "deliberately out of scope" line listed payments
(and, by implication, teams) as decisions a starter should not make; this phase reverses that for
organisations, and 6d will for billing. The reversal is recorded in the ROADMAP, with the reason.

After this phase: a signed-in user creates a **workspace**, invites people by email with a role,
switches between workspaces from the user menu, and the demo `notes` belong to the current
workspace and are read or written according to the member's role. Everything runs on SQLite and
Postgres alike and stays keyless.

## Decisions

- **Tenant model.** A user exists without a workspace. `Create a workspace` is an explicit step
  that needs a verified email. Invitations join an existing one. No personal workspace is created
  at sign-up (an invited user would otherwise own a workspace they never wanted).
- **Current workspace** is an app concern, not a session one: a `workspace` cookie on the parent
  domain holds the id; every read re-checks membership. `auth.me` is unchanged.
- **Explicit `workspaceId` on every scoped procedure** plus a membership middleware — not a header,
  not row-level security (SQLite cannot do it, and a starter that isolates tenants on one engine only
  is a trap). The tenant stays visible in the contract and the OpenAPI docs.
- **Roles** are one ordered list, `viewer < member < admin < owner`, compared with `roleAtLeast`.
- **Invitations are bound to the address**: the mailed link is accepted only by a signed-in user
  whose verified email equals the invited one (6b's linking rule).
- **Demo data follows the tenant**: `notes` gain `workspace_id`; `user_id` stays as the author.
- **Empty state is an onboarding gate**: pages that need a workspace redirect to `/workspaces/new`.
- **Amendment (planning): `requireWorkspace()` takes no `minRole`, and there is no 403 page.** No
  page needs more than `viewer`: the api refuses a privileged call and the form shows its message,
  so the "You don't have access to this page" page is dropped.
- **Amendment (planning): only server actions write the `workspace` cookie.** A server component
  cannot set cookies, so when the cookie is missing or stale and the user has exactly one
  workspace, `requireWorkspace()` uses it without writing the cookie; the create, accept and switch
  actions (and `setCurrentWorkspace`) set it, leave and delete clear it.
- Out of scope, so nobody adds them here: per-workspace settings beyond the name, custom roles or
  permissions, workspace-scoped `chat`, domain-based auto-join or SSO, user deletion rules (6f),
  billing columns (6d).

## Components

### `packages/api-contract`

- `ROLES = ["viewer", "member", "admin", "owner"] as const`, `Role`, `RoleSchema`,
  `roleAtLeast(role: Role, min: Role): boolean`, `ASSIGNABLE_ROLES = ["viewer", "member", "admin"]`
  (what an invitation or `setRole` may name — `owner` only through `transferOwnership`).
- Schemas: `WorkspaceSchema { id, name, slug, createdAt }`, `WorkspaceSummarySchema` (= workspace +
  `role` + `memberCount`), `MemberSchema { userId, name, email: string | null, role, joinedAt }`
  (`email` is `null` for callers below `admin`), `InvitationSchema { id, email, role, invitedBy:
  { name }, expiresAt, createdAt }`, `InvitationPreviewSchema { workspace: { name }, invitedBy: {
  name }, email: masked, role, expiresAt }`, `PendingInvitationSchema` (what the caller was invited
  to: `{ token-less id, workspace: { name }, role, invitedBy: { name }, expiresAt }` — accepting
  from the list goes through `invitations.acceptById`, see below).
- `WorkspaceIdSchema = z.object({ workspaceId: z.coerce.number().int().positive() })`; every
  scoped input extends it.
- `Note` gains nothing visible; `notes.*` inputs gain `workspaceId`; `NoteSchema` gains
  `authorId: number | null` so the app can show "yours" and the delete button.
- Errors: `WORKSPACE_ERRORS` — `NOT_FOUND` ("Workspace not found"), `FORBIDDEN` (message names the
  required role: "Requires the admin role"), `LAST_OWNER` → `CONFLICT` ("Transfer ownership before
  leaving."), `EMAIL_UNVERIFIED` → `FORBIDDEN` ("Verify your email to create a workspace"),
  `ALREADY_MEMBER` → `CONFLICT` ("Already a member"), `INVITATION_MISMATCH` → `FORBIDDEN` ("This
  invitation was sent to <masked>. Sign in with that address to accept it."), `TOO_MANY_REQUESTS`
  ("Too many invitations, try again in an hour").

### `apps/api`

**Migration `0008_workspaces`** (forward-only; the number assumes `0007_waitlist` is merged):

- `workspaces (id PK, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, created_by INTEGER NULL
  REFERENCES users ON DELETE SET NULL, created_at)`. The slug is derived from the name (lowercase,
  `[a-z0-9-]`, 3–50 chars, `-2`, `-3` … on collision); it never changes on rename and is never a
  secret.
- `memberships (workspace_id REFERENCES workspaces ON DELETE CASCADE, user_id REFERENCES users ON
  DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at, UNIQUE (workspace_id, user_id))`.
- `invitations (id PK, workspace_id REFERENCES workspaces ON DELETE CASCADE, email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')), token_hash TEXT NOT NULL UNIQUE,
  invited_by INTEGER NULL REFERENCES users ON DELETE SET NULL, expires_at, accepted_at NULL,
  created_at)`; a partial unique index on `(workspace_id, email) WHERE accepted_at IS NULL` on
  Postgres, and the same rule enforced in the query on SQLite (SQLite supports partial indexes too —
  use one on both).
- `notes` gains `workspace_id INTEGER NULL REFERENCES workspaces ON DELETE CASCADE`, then the
  backfill: for every user who owns at least one note, create a workspace named
  `"<name, else the email's local part>'s workspace"` with that user as `owner`, and set
  `workspace_id` on their notes; then `workspace_id` becomes NOT NULL (on SQLite via the
  rebuild-table pattern the earlier migrations already use). A fresh install backfills nothing.
  Index `(workspace_id, id)` for the keyset list.

**Queries** (`queries/workspaces.ts`, `queries/memberships.ts`, `queries/invitations.ts`; `notes.ts`
reworked): every note query takes `workspaceId` and filters on it; `membership(workspaceId, userId)`;
`ownerCount(workspaceId)`; the last-owner guard is **one helper**, `assertNotLastOwner(workspaceId,
userId)`, used by `setRole`, `remove`, `leave` and `transferOwnership`, run inside the same
transaction as the write.

**Middleware.** `member(minRole)` on top of `requireSession`: reads `input.workspaceId`, loads the
membership, sets `context.workspace` and `context.role`; no membership → `NOT_FOUND` (outsiders
cannot distinguish "exists" from "not yours"); role below `minRole` → `FORBIDDEN`.

**Procedures** (REST paths in brackets; `⚑` = session required; role = minimum):

| Procedure | Role | Behaviour |
|---|---|---|
| `workspaces.list` `[GET /workspaces]` ⚑ | signed in | the caller's workspaces (`WorkspaceSummary[]`) and `pendingInvitations` for the caller's email, listed only when `emailVerified` |
| `workspaces.create` `[POST /workspaces]` ⚑ | signed in, verified | `{ name }` → workspace, caller `owner`; limiter `workspace-create:<userId>` 10 / hour → `TOO_MANY_REQUESTS` |
| `workspaces.get` `[GET /workspaces/{workspaceId}]` | viewer | `WorkspaceSummary` |
| `workspaces.update` `[PATCH /workspaces/{workspaceId}]` | admin | `{ name }`; slug unchanged |
| `workspaces.delete` `[DELETE /workspaces/{workspaceId}]` | owner | cascades |
| `workspaces.leave` `[POST /workspaces/{workspaceId}/leave]` | viewer | last owner → `LAST_OWNER` |
| `workspaces.transferOwnership` `[POST …/transfer]` | owner | `{ userId }` must be a member; target becomes `owner`, caller `admin` |
| `workspaces.members.list` `[GET …/members]` | viewer | emails only for admin+ |
| `workspaces.members.setRole` `[PATCH …/members/{userId}]` | admin | `role ∈ ASSIGNABLE_ROLES`; an admin cannot change an owner; the last owner cannot be demoted; owners are re-counted after the write, in the same transaction (`assertOwnerRemains`) |
| `workspaces.members.remove` `[DELETE …/members/{userId}]` | admin | an admin cannot remove an owner; self → same as `leave`; owners re-counted after the write, as for `setRole` |
| `workspaces.invitations.list` `[GET …/invitations]` | admin | pending only |
| `workspaces.invitations.create` `[POST …/invitations]` | admin | `{ email, role }`; existing member → `ALREADY_MEMBER`; a pending row for the email is replaced (new token, new expiry) and the mail re-sent; limiters `invite:<workspaceId>` 20 / hour and `invite:user:<userId>` 50 / hour (per inviter, across workspaces) → `TOO_MANY_REQUESTS`; the mail is `detach()`ed |
| `workspaces.invitations.revoke` `[DELETE …/invitations/{id}]` | admin | |
| `invitations.preview` `[GET /invitations/{token}]` | anonymous (service token) | `InvitationPreview`; unknown, expired or accepted → `NOT_FOUND`; never consumes |
| `invitations.accept` `[POST /invitations/{token}/accept]` ⚑ | signed in | caller's email must equal the invitation's and be verified → membership (role from the row), `accepted_at` set; mismatch → `INVITATION_MISMATCH`; unverified → `EMAIL_UNVERIFIED` (same code, message "Verify your email to accept this invitation") |
| `invitations.acceptById` `[POST /invitations/by-id/{id}/accept]` ⚑ | signed in | same as `accept`, for the pending list; a row addressed to another email → `NOT_FOUND` (ids are guessable, so a foreign invitation looks exactly like a missing one — the ruling during review) |
| `notes.list` / `notes.find` | viewer | scoped by `workspaceId`; a foreign id → `NOT_FOUND` |
| `notes.create` | member | `user_id` = caller |
| `notes.delete` `[DELETE /notes/{id}]` | member | allowed when author, or admin+ (new procedure — the demo had no delete) |

Tokens: 32 random bytes, base64url in the link, SHA-256 hash stored, 7 days, single use — the same
helper the `tokens` table uses. The invitation mail (`emails.invitation({ workspaceName,
inviterName, role, acceptUrl, expiresAt })`, subject `You're invited to <workspace>`) links to
`${APP_URL}/invitations/<token>`. The api reads `AUTH_URL` and `ACCOUNT_URL` today; it gains
**`APP_URL`** the same way (dev default `http://app.brand.localhost:3001`, required in production,
exits at startup without it).

### `@repo/email`

`invitation` template + test + story (`Email/Invitation`), listed with the others.

### `@repo/session`

- `WORKSPACE_COOKIE = "workspace"`; `workspaceCookieOptions({ domain, production })` — HttpOnly,
  `SameSite=Lax`, `Path=/`, `Max-Age` one year, `Secure` in production, `Domain` = the cookie
  domain.
- `createAuth` gains `requireWorkspace()` (no `minRole` — see the amendments under **Decisions**):
  after `requireUser()`, reads the cookie; a valid membership → `{ user, workspace, role }`; a
  missing or stale cookie → if the user has exactly one workspace, use it (without writing the
  cookie), else redirect to `${APP_URL}/workspaces/new`. Also `setCurrentWorkspace(id)`
  (validates membership, sets the cookie), `clearCurrentWorkspace()`, and `listWorkspaces()`
  (cached per request). Server actions call the same `requireWorkspace`.
- `README.md` documents the cookie and the three paths.

### `packages/ui`

`UserMenu` gains an optional `workspaces` prop: `{ items: { id, name, role }[], currentId: number |
null, switchTo: (id: number) => Promise<void>, pendingInvitations: number, newUrl: string,
manageUrl: string }`. When present the menu shows a **Workspace** submenu: the items with the current
one checked, **Create a workspace** (`newUrl`), **Manage members** (`manageUrl`, admin+ only), and a
badge on the trigger plus an **Invitations (n)** item when `pendingInvitations > 0` (links to
`newUrl`, which lists them). Static apps pass nothing and the menu is unchanged. Story updated.

As built: `items` are `{ id, name }`, `switchTo` is a server action taking `FormData` (the submitted
`workspaceId`, so the switch works as a plain form), and a `canManage` flag, computed by the app
(`roleAtLeast(role, "admin")`), decides **Manage members**; the workspaces render as a labelled group
in the menu rather than a submenu.

### `apps/app`

- `/notes` and `/chat`: `requireWorkspace()`; the notes view shows the workspace name, the
  caller's role, a **Delete** per note when author or admin+, and the create form only for
  `member+`. All calls pass `workspace.id`.
- `/workspaces/new`: `requireUser()`; when the user already has workspaces, a **Your workspaces**
  list comes first, each a one-click switch (plain form → `setCurrentWorkspace` → `/notes`), with
  the form below under **Create another**; verified → name form (`workspaces.create` → cookie → `/notes`)
  and the pending-invitation list with **Accept** (`acceptById` → cookie → `/notes`); unverified →
  the existing verification notice with **Resend** instead of the form. Page title "Create a
  workspace".
- `/invitations/[token]`: no session required. `invitations.preview` → "<inviter> invited you to
  <workspace> as a <role>." Signed out: **Sign in** / **Create account** to the auth app with
  `next` = this URL and the masked email in the copy. Signed in with the matching verified email:
  **Accept** (server action → `invitations.accept` → cookie → `/notes`). Signed in otherwise: the
  same **Accept**, which answers with the `INVITATION_MISMATCH` message — the preview is masked, so
  the page cannot tell a mismatch before the accept; a "Not you? **Sign out**" sits under it for
  every signed-in visitor. Unknown or expired: `StatusPage` 404 "This
  invitation is no longer valid." The GET never consumes the token.
- `src/app/actions.ts` gains `switchWorkspace(id)` (server action; `setCurrentWorkspace`, then
  `revalidatePath("/")`), used by the switcher.
- Layout passes `workspaces` to `UserMenu` (from `listWorkspaces()`; `newUrl = "/workspaces/new"`,
  `manageUrl = ${ACCOUNT_URL}/workspace`). `/` stays a public welcome page.
- `src/lib/routes.ts` unchanged (`/invitations/*` is not for crawlers; robots keep `Disallow: /`).

### `apps/account`

"People & sharing" becomes **Workspace** at `/workspace` (nav label and sidebar icon updated;
the old mockup view is removed): `requireWorkspace()`.
- Header: workspace name (rename form for admin+), slug, the caller's role.
- **Members**: name, email (admin+), role, joined; a role select (admin+, `ASSIGNABLE_ROLES`; an
  owner row shows its role as text, for owners too — only a transfer changes it), **Remove**
  (admin+), **Leave** on the caller's own row (the last owner sees the `LAST_OWNER` message
  instead).
- **Invitations** (admin+): pending rows with **Revoke**; the invite form (email + role select,
  `FormState` + `fieldAria`), success message "Invitation sent to <email>."
- **Danger zone** (owner): **Transfer ownership** (select a member who is not already an owner →
  confirm) and **Delete workspace** (type the name to confirm → `workspaces.delete` →
  `clearCurrentWorkspace()` → `${APP_URL}/workspaces/new`).
- Layout passes `workspaces` to `UserMenu` like `apps/app` (`newUrl = ${APP_URL}/workspaces/new`,
  `manageUrl = "/workspace"`). The `account` README and the sidebar nav are updated.
- `apps/auth` only passes `workspaces` to `UserMenu` when a session exists (it already shows the
  menu then) — no other change.

## Copy (exact)

- Create page title: **Create a workspace**; field label **Workspace name**; button **Create**.
- Invitation mail subject: `You're invited to <workspace>`; body line: `<inviter> invited you to
  join <workspace> as a <role>. This link works for 7 days.`
- Accept page: `<inviter> invited you to <workspace> as a <role>.`
- Mismatch: `This invitation was sent to <masked>. Sign in with that address to accept it.`
- Last owner: `Transfer ownership before leaving.`
- Invalid invitation: `This invitation is no longer valid.`
- Invite success: `Invitation sent to <email>.`

## Security (review focus)

- The `workspace` cookie is never trusted alone: `requireWorkspace` re-checks membership on every
  request, and the api's `member()` middleware is the real gate. Every scoped query filters on
  `workspace_id`; a note id from another workspace is `NOT_FOUND`, not `FORBIDDEN`.
- Non-members get `NOT_FOUND` for any workspace id — no existence oracle.
- Invitation tokens: random, stored hashed, single use, 7 days; `preview` masks the email and never
  consumes; `accept` requires the verified matching email; the mail is detached; the accept page's
  GET is scanner-safe.
- Invite flooding: 20 per workspace per hour and 50 per inviter per hour; workspace creation 10 per
  user per hour; `preview` sits under the anonymous limiter.
- Last-owner invariant: one helper, transactional, tested on both engines.
- Emails of members are hidden below `admin`.
- All mutations are same-app server actions behind `assertSameOrigin` / Next's Origin check; no
  cross-subdomain POST.
- The backfill names workspaces from the user's name or email local part — never the full email —
  and the slug is derived from that name.

## Tests

- `apps/api`: role matrix (4 roles × every scoped procedure, table-driven); last-owner cases
  (leave, demote, remove, transfer); invitation lifecycle (create → re-invite replaces → accept
  right / wrong / unverified email → expired → revoked → `acceptById`); `ALREADY_MEMBER`;
  notes isolation across two workspaces (list, find, delete); `notes.delete` author vs admin vs
  member; the backfill on a seeded database; `APP_URL` required in production; limiter. SQLite and
  Postgres (`test:postgres`).
- `@repo/session`: `requireWorkspace` — valid cookie, stale cookie with one workspace, stale with
  several (redirect), none (redirect); `setCurrentWorkspace` refuses a non-membership; cookie
  options.
- `@repo/email`: template renders the name, role, link and expiry; story.
- `apps/app` / `apps/account`: action cores with fake apis (create, accept, switch, invite, set
  role, remove, transfer, delete) — same pattern as the existing action tests.
- `packages/ui`: `UserMenu` with and without `workspaces` (render + story); `roleAtLeast` table.
- Browser pass (controller): sign up A → `/notes` redirects to `/workspaces/new` → create → notes
  work → invite B (link from the api log) → B in a second isolated context: preview, sign-up with
  the prefilled address, verify, accept → B sees the same notes as viewer (no create form) → A
  promotes B to member → B creates a note → A deletes it → A tries to leave (refused) → transfer
  to B → A leaves → B deletes the workspace → B lands on `/workspaces/new`. Zero console/CSP
  errors; Lighthouse accessibility ≥ 95 on `/workspace` and `/workspaces/new`.

## Docs

- CLAUDE.md: a **Workspaces** paragraph under **Authentication** (the cookie, `requireWorkspace`,
  the roles list and invariants, `APP_URL` for the api in the env table); the Apps list entries for
  `app` and `account`; the new-app checklist (`requireWorkspace` for tenant pages, `workspaces`
  prop on `UserMenu`); the ROADMAP reversal note.
- `docs/ROADMAP.md`: 6e ticked; the "deliberately out of scope" line amended — organisations (and,
  with 6d, payments) are in because the benchmark and the product built from this repo showed every
  SaaS needs them; the rest of the list stands.
- `packages/session/README.md`, `apps/api/README.md`, `apps/app/README.md`,
  `apps/account/README.md`, `packages/email/README.md`.

## Out of scope

Per-workspace settings beyond the name; custom roles or permission sets; workspace-scoped `chat`;
domain-based auto-join and SSO; user deletion and the sole-owner rule on delete (6f); billing
(6d); audit log; workspace avatars; slugs in URLs.
