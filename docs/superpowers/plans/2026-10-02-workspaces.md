# Workspaces (Phase 6e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisations ("workspaces") with `owner / admin / member / viewer` roles and email invitations in `apps/api`, a current-workspace seam in `@repo/session`, a switcher in `UserMenu`, workspace-scoped `notes` in `apps/app`, and a live **Workspace** section in `apps/account`.

**Architecture:** Three new tables plus `notes.workspace_id`; every scoped procedure takes an explicit `workspaceId` and runs behind a `member(minRole)` middleware; the Next apps keep the current workspace id in a `workspace` cookie on the parent domain and re-check membership on every request through `requireWorkspace()`. Invitations are hashed single-use tokens bound to an email and accepted only by a signed-in user with that verified address. Works on SQLite and Postgres, keyless.

**Tech Stack:** Bun, oRPC (`implement(contract)` middleware with `mapInput`), `Bun.sql`, Zod 4, Next 16 server actions, React Email, shadcn `DropdownMenu`, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-02-workspaces-design.md`

Two amendments to the spec, decided while planning (the spec file is updated in Task 8):
- `requireWorkspace()` takes no `minRole`: no page needs more than `viewer` — the api refuses privileged actions and the forms show its message; the "You don't have access" page is dropped.
- A server component cannot write cookies, so when the cookie is missing and the user has exactly one workspace, `requireWorkspace()` uses it **without** setting the cookie; the create / accept / switch actions set it.

## Global Constraints

- Biome 0 errors / 0 warnings / 0 infos; double quotes, no semicolons, 2-space, 100 cols; `bunx biome check --write <paths>` before each commit.
- Commit trailer, the only attribution line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; subjects ≤ 100 chars.
- Roles: `ROLES = ["viewer", "member", "admin", "owner"]` (ascending), `ASSIGNABLE_ROLES = ["viewer", "member", "admin"]`; `owner` only via `transferOwnership`; every workspace keeps ≥ 1 owner (one helper, `assertNotLastOwner`, inside the same transaction as the write).
- Every scoped procedure's input extends `WorkspaceIdSchema`; non-members get `NOT_FOUND` ("Workspace not found"), a too-low role `FORBIDDEN` ("Requires the <role> role"); a note from another workspace is `NOT_FOUND`.
- Invitation token: `newToken()` (32 random bytes, base64url), stored as `tokenHash()`, 7 days (`INVITE_TTL_MS = 7 * 24 * 60 * 60_000`), single use; `preview` never consumes and masks the email with `maskEmail`; `accept` requires `email_verified_at` and an exact normalised-email match; limiter `invite:<workspaceId>` 20 / hour.
- Cookie: `WORKSPACE_COOKIE = "workspace"` (the id), HttpOnly, `SameSite=Lax`, `Path=/`, `Max-Age` 365 days, `Secure` in production, `Domain` = cookie domain. Never trusted alone.
- Copy (exact): page title **Create a workspace**, field **Workspace name**, button **Create**; mail subject `You're invited to <workspace>`; mail/accept line `<inviter> invited you to join <workspace> as a <role>.`; mismatch `This invitation was sent to <masked>. Sign in with that address to accept it.`; last owner `Transfer ownership before leaving.`; invalid `This invitation is no longer valid.`; invite success `Invitation sent to <email>.`; unverified create `Verify your email to create a workspace`; unverified accept `Verify your email to accept this invitation`; existing member `Already a member`; flood `Too many invitations, try again in an hour`.
- `apps/api` gains `APP_URL` (dev default `siteUrl("app", {})`, required in production); invitation links are `${appUrl}/invitations/<token>`.
- Members' emails are `null` in `members.list` for callers below `admin`.
- `apps/app` `/`, `apps/account` layout and all static apps are otherwise unchanged; `UserMenu` without the `workspaces` prop renders exactly as today.

## Review Focus

1. A stale `workspace` cookie naming a workspace the user left (or a forged id): `requireWorkspace()` must fall back / redirect, and every api call must still be refused — Task 3 tests the seam, Task 2 the middleware.
2. The last owner trying to leave, be demoted or be removed, concurrently or not: the invariant must hold — Task 2's transactional helper tests.
3. An invitation re-sent to the same address: the old link must stop working and the new one work — Task 2 lifecycle test.
4. Accepting with the right address but an unverified email, or signed in as someone else: a clear message, no membership — Task 2 + Task 6 tests.
5. Deleting a workspace that is the user's current one: the cookie is cleared and the user lands on `/workspaces/new`, not on a 404 — Task 7 action test + browser pass.

---

### Task 1: Schema and queries — workspaces, memberships, invitations

**Files:**
- Create: `apps/api/src/migrations/0008_workspaces.ts`, `apps/api/src/slug.ts`, `apps/api/src/slug.test.ts`, `apps/api/src/queries/workspaces.ts`, `apps/api/src/queries/memberships.ts`, `apps/api/src/queries/invitations.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/db.ts`, `apps/api/src/queries/queries.test.ts`

(`notes` are untouched here — they move under a workspace in Task 4, with their own migration, so the notes tests stay green between tasks.)

**Interfaces:**
- Produces: `slugify(name)` in `apps/api/src/slug.ts`; `WorkspaceRow { id, name, slug, created_by, created_at }`, `MembershipRow { workspace_id, user_id, role, created_at }`, `InvitationRow { id, workspace_id, email, role, token_hash, invited_by, expires_at, accepted_at, created_at }`; the query modules below.
- Note: the `Role` type is defined here locally as `"viewer" | "member" | "admin" | "owner"` (the contract's `ROLES` arrives in Task 2 and must match).

- [ ] **Step 1: Slug helper and migration**

```ts
// apps/api/src/slug.ts
/** Lowercase, `[a-z0-9-]`, 3–50 chars; derived from a workspace name and never a secret. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
  return base.length >= 3 ? base : `${base ? `${base}-` : ""}workspace`
}

/** `base`, `base-2`, `base-3`, … — the first candidate `exists` says is free. */
export async function uniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(name)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 50 - String(n).length - 1)}-${n}`
    if (!(await exists(candidate))) return candidate
  }
}
```

`slug.test.ts`: `slugify("Ada's Team!")` → `"ada-s-team"`, `slugify("")` → `"workspace"`, `slugify("ab")` → `"ab-workspace"`, a 60-char name → 50 chars; `uniqueSlug("My team", async (s) => s === "my-team")` → `"my-team-2"`.

```ts
// apps/api/src/migrations/0008_workspaces.ts
import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// Organisations, memberships and invitations. Notes move under a workspace in 0009.
const workspaces: Migration = {
  name: "0008_workspaces",
  async up(sql, dialect: Dialect) {
    await sql.unsafe(`
      CREATE TABLE workspaces (
        id ${ddl.serialId(dialect)},
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE memberships (
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
        created_at TEXT NOT NULL,
        UNIQUE (workspace_id, user_id)
      )
    `)
    await sql.unsafe("CREATE INDEX memberships_user_id ON memberships (user_id)")
    await sql.unsafe(`
      CREATE TABLE invitations (
        id ${ddl.serialId(dialect)},
        workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
        token_hash TEXT NOT NULL UNIQUE,
        invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    // One pending invitation per address per workspace (both engines support partial indexes).
    await sql.unsafe(
      "CREATE UNIQUE INDEX invitations_pending ON invitations (workspace_id, email) WHERE accepted_at IS NULL"
    )
    await sql.unsafe("CREATE INDEX invitations_email ON invitations (email)")
  },
}

export default workspaces
```

Add `workspaces` to `migrations/index.ts` after `waitlist`.

- [ ] **Step 2: Queries**

```ts
// apps/api/src/queries/workspaces.ts
import type { SQL } from "bun"

export type Role = "viewer" | "member" | "admin" | "owner"
export type WorkspaceRow = {
  id: number
  name: string
  slug: string
  created_by: number | null
  created_at: string
}
export type WorkspaceForUserRow = WorkspaceRow & { role: Role; member_count: number }

export function workspacesQueries(sql: SQL) {
  return {
    async create(input: { name: string; slug: string; createdBy: number }): Promise<WorkspaceRow> {
      const [row]: WorkspaceRow[] = await sql`
        INSERT INTO workspaces (name, slug, created_by, created_at)
        VALUES (${input.name}, ${input.slug}, ${input.createdBy}, ${new Date().toISOString()})
        RETURNING *
      `
      return row
    },
    async find(id: number): Promise<WorkspaceRow | undefined> {
      const rows: WorkspaceRow[] = await sql`SELECT * FROM workspaces WHERE id = ${id}`
      return rows[0]
    },
    async slugExists(slug: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`
      return rows.length > 0
    },
    async rename(id: number, name: string): Promise<void> {
      await sql`UPDATE workspaces SET name = ${name} WHERE id = ${id}`
    },
    /** Removes the workspace and everything inside it (explicitly — SQLite may not enforce FKs). */
    async delete(id: number): Promise<void> {
      // Task 4 adds `DELETE FROM notes WHERE workspace_id = ${id}` here, once the column exists.
      await sql`DELETE FROM invitations WHERE workspace_id = ${id}`
      await sql`DELETE FROM memberships WHERE workspace_id = ${id}`
      await sql`DELETE FROM workspaces WHERE id = ${id}`
    },
    async memberCount(id: number): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ${id}`
      return Number(row.n)
    },
    /** The user's workspaces with their role and size, oldest first. */
    async listForUser(userId: number): Promise<WorkspaceForUserRow[]> {
      const rows: Array<WorkspaceRow & { role: Role; member_count: number | string }> = await sql`
        SELECT w.*, m.role,
          (SELECT COUNT(*) FROM memberships c WHERE c.workspace_id = w.id) AS member_count
        FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
        WHERE m.user_id = ${userId} ORDER BY w.id
      `
      return rows.map((r) => ({ ...r, member_count: Number(r.member_count) }))
    },
  }
}
```

```ts
// apps/api/src/queries/memberships.ts
import type { SQL } from "bun"
import type { Role } from "./workspaces"

export type MembershipRow = { workspace_id: number; user_id: number; role: Role; created_at: string }
export type MemberRow = MembershipRow & { name: string; email: string }

export function membershipsQueries(sql: SQL) {
  return {
    async find(workspaceId: number, userId: number): Promise<MembershipRow | undefined> {
      const rows: MembershipRow[] =
        await sql`SELECT * FROM memberships WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`
      return rows[0]
    },
    async add(input: { workspaceId: number; userId: number; role: Role }): Promise<void> {
      await sql`
        INSERT INTO memberships (workspace_id, user_id, role, created_at)
        VALUES (${input.workspaceId}, ${input.userId}, ${input.role}, ${new Date().toISOString()})
      `
    },
    async setRole(workspaceId: number, userId: number, role: Role): Promise<void> {
      await sql`UPDATE memberships SET role = ${role} WHERE workspace_id = ${workspaceId} AND user_id = ${userId}`
    },
    async remove(workspaceId: number, userId: number): Promise<boolean> {
      const rows: { user_id: number }[] = await sql`
        DELETE FROM memberships WHERE workspace_id = ${workspaceId} AND user_id = ${userId} RETURNING user_id
      `
      return rows.length > 0
    },
    async ownerCount(workspaceId: number): Promise<number> {
      const [row]: { n: number | string }[] =
        await sql`SELECT COUNT(*) AS n FROM memberships WHERE workspace_id = ${workspaceId} AND role = 'owner'`
      return Number(row.n)
    },
    /** Members with their names and emails, owners first then by join date. */
    async list(workspaceId: number): Promise<MemberRow[]> {
      return sql`
        SELECT m.*, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ${workspaceId}
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, m.created_at, m.user_id
      `
    },
  }
}
```

```ts
// apps/api/src/queries/invitations.ts
import type { SQL } from "bun"
import { normalizeEmail } from "./users"
import type { Role } from "./workspaces"

export type InvitationRow = {
  id: number
  workspace_id: number
  email: string
  role: Exclude<Role, "owner">
  token_hash: string
  invited_by: number | null
  expires_at: string
  accepted_at: string | null
  created_at: string
}
/** An invitation with what the pages show next to it. */
export type InvitationDetailRow = InvitationRow & { workspace_name: string; inviter_name: string }

const DETAIL = `
  i.*, w.name AS workspace_name, COALESCE(u.name, '') AS inviter_name
  FROM invitations i
  JOIN workspaces w ON w.id = i.workspace_id
  LEFT JOIN users u ON u.id = i.invited_by`

export function invitationsQueries(sql: SQL) {
  return {
    /** Replaces any pending invitation for the address in this workspace, then inserts. */
    async create(input: {
      workspaceId: number
      email: string
      role: Exclude<Role, "owner">
      tokenHash: string
      invitedBy: number
      expiresAt: string
    }): Promise<InvitationRow> {
      const email = normalizeEmail(input.email)
      await sql`DELETE FROM invitations WHERE workspace_id = ${input.workspaceId} AND email = ${email} AND accepted_at IS NULL`
      const [row]: InvitationRow[] = await sql`
        INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at, created_at)
        VALUES (${input.workspaceId}, ${email}, ${input.role}, ${input.tokenHash}, ${input.invitedBy}, ${input.expiresAt}, ${new Date().toISOString()})
        RETURNING *
      `
      return row
    },
    async findByTokenHash(tokenHash: string): Promise<InvitationDetailRow | undefined> {
      const rows: InvitationDetailRow[] = await sql.unsafe(
        `SELECT ${DETAIL} WHERE i.token_hash = $1`,
        [tokenHash]
      )
      return rows[0]
    },
    async find(id: number): Promise<InvitationDetailRow | undefined> {
      const rows: InvitationDetailRow[] = await sql.unsafe(`SELECT ${DETAIL} WHERE i.id = $1`, [id])
      return rows[0]
    },
    async listPending(workspaceId: number, now: string): Promise<InvitationDetailRow[]> {
      return sql.unsafe(
        `SELECT ${DETAIL} WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.expires_at > $2 ORDER BY i.id`,
        [workspaceId, now]
      )
    },
    async listPendingForEmail(email: string, now: string): Promise<InvitationDetailRow[]> {
      return sql.unsafe(
        `SELECT ${DETAIL} WHERE i.email = $1 AND i.accepted_at IS NULL AND i.expires_at > $2 ORDER BY i.id`,
        [normalizeEmail(email), now]
      )
    },
    /** Marks it accepted; returns false when it was already used or has expired. */
    async accept(id: number, at: string): Promise<boolean> {
      const rows: { id: number }[] = await sql`
        UPDATE invitations SET accepted_at = ${at}
        WHERE id = ${id} AND accepted_at IS NULL AND expires_at > ${at} RETURNING id
      `
      return rows.length > 0
    },
    async delete(id: number, workspaceId: number): Promise<boolean> {
      const rows: { id: number }[] =
        await sql`DELETE FROM invitations WHERE id = ${id} AND workspace_id = ${workspaceId} RETURNING id`
      return rows.length > 0
    },
  }
}
```

`sql.unsafe(query, params)` with `$1` placeholders: confirm against `Bun.sql`'s docs for the installed Bun (`bun --version`) that positional parameters work on both SQLite and Postgres through `unsafe`; if SQLite needs `?`, build the two `SELECT ${DETAIL} …` queries with the tagged template instead (repeat the join text — correctness beats DRY here).

- [ ] **Step 3: Wire into `db.ts`** (`workspaces`, `memberships`, `invitations` in `queries()`).

- [ ] **Step 4: Tests**

In `queries.test.ts` (uses the existing test database helper — read the file's setup first): create two users, a workspace, memberships; assert `listForUser` role + `member_count`; `ownerCount`; `invitations.create` twice for one email leaves one pending row and a new token hash; `accept` returns false the second time and false when expired; `workspaces.delete` removes memberships and invitations.

Run: `bun --filter @repo/api test` and, if `TEST_DATABASE_URL` is available locally, `bun --filter @repo/api test:postgres`.

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/api
git add apps/api
git commit -m "feat(api): workspaces, memberships and invitations tables and queries"
```

---

### Task 2: Contract, api procedures and the invitation mail

**Files:**
- Create: `packages/api-contract/src/workspace.ts`, `packages/api-contract/src/workspace.test.ts`, `apps/api/src/workspaces.ts` (helpers), `apps/api/src/workspaces.test.ts`, `packages/email/src/templates/invitation.tsx`, `apps/story/stories/email/Invitation.stories.tsx`
- Modify: `packages/api-contract/src/index.ts`, `apps/api/src/router.ts`, `apps/api/src/server.ts`, `apps/api/src/env.ts`, `apps/api/src/env.test.ts`, `apps/api/src/index.ts`, `apps/api/src/test-server.ts`, `apps/api/src/credentials.ts`, `packages/email/src/index.tsx`, `packages/email/src/index.test.tsx`, `apps/api/.env.example`, `docker-compose.yml` (api service env `APP_URL`)

**Interfaces:**
- Consumes: Task 1 queries.
- Produces: the `workspaces.*` and `invitations.*` contract; `Context.appUrl`, `Context.inviteLimiter`; `emails.invitation({ workspaceName, inviterName, role, link, brand? })`, `invitationSubject(workspaceName)`; `INVITE_TTL_MS`.

- [ ] **Step 1: Contract**

```ts
// packages/api-contract/src/workspace.ts
import { z } from "zod"
import { AUTH_ERRORS, EmailSchema } from "./auth"

export const ROLES = ["viewer", "member", "admin", "owner"] as const
export type Role = (typeof ROLES)[number]
export const RoleSchema = z.enum(ROLES)
export const ASSIGNABLE_ROLES = ["viewer", "member", "admin"] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]
export const AssignableRoleSchema = z.enum(ASSIGNABLE_ROLES)
/** `role` is at least `min` in the ordered list. */
export const roleAtLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min)

const id = z.coerce.number().int().positive()
export const WorkspaceIdSchema = z.object({ workspaceId: id })
export const WorkspaceNameSchema = z.string().trim().min(1).max(100)

export const WorkspaceSchema = z.object({
  id: z.number().int().positive(),
  name: WorkspaceNameSchema,
  slug: z.string(),
  createdAt: z.iso.datetime(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>
export const WorkspaceSummarySchema = WorkspaceSchema.extend({
  role: RoleSchema,
  memberCount: z.number().int().nonnegative(),
})
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>

export const MemberSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string(),
  /** Null for callers below admin. */
  email: z.string().nullable(),
  role: RoleSchema,
  joinedAt: z.iso.datetime(),
})
export type Member = z.infer<typeof MemberSchema>

const inviter = z.object({ name: z.string() })
export const InvitationSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  role: AssignableRoleSchema,
  invitedBy: inviter,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})
export type Invitation = z.infer<typeof InvitationSchema>
export const InvitationPreviewSchema = z.object({
  workspace: z.object({ name: z.string() }),
  invitedBy: inviter,
  /** Masked, e.g. `a***@example.com`. */
  email: z.string(),
  role: AssignableRoleSchema,
  expiresAt: z.iso.datetime(),
})
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>
export const PendingInvitationSchema = z.object({
  id: z.number().int().positive(),
  workspace: z.object({ name: z.string() }),
  role: AssignableRoleSchema,
  invitedBy: inviter,
  expiresAt: z.iso.datetime(),
})
export type PendingInvitation = z.infer<typeof PendingInvitationSchema>

export const WorkspaceListSchema = z.object({
  items: z.array(WorkspaceSummarySchema),
  pendingInvitations: z.array(PendingInvitationSchema),
})
export type WorkspaceList = z.infer<typeof WorkspaceListSchema>
export const CreateWorkspaceSchema = z.object({ name: WorkspaceNameSchema })
export const UpdateWorkspaceSchema = WorkspaceIdSchema.extend({ name: WorkspaceNameSchema })
export const MemberTargetSchema = WorkspaceIdSchema.extend({ userId: id })
export const SetRoleSchema = MemberTargetSchema.extend({ role: AssignableRoleSchema })
export const MemberListSchema = z.object({ items: z.array(MemberSchema) })
export const CreateInvitationSchema = WorkspaceIdSchema.extend({
  email: EmailSchema,
  role: AssignableRoleSchema,
})
export const InvitationIdSchema = WorkspaceIdSchema.extend({ id })
export const InvitationListSchema = z.object({ items: z.array(InvitationSchema) })
export const InvitationTokenSchema = z.object({ token: z.string().min(1).max(128) })
export const AcceptByIdSchema = z.object({ id })
export const AcceptResultSchema = z.object({ workspace: WorkspaceSummarySchema })

export const WORKSPACE_ERRORS = {
  ...AUTH_ERRORS,
  NOT_FOUND: { message: "Workspace not found" },
  FORBIDDEN: { message: "Requires a higher role" },
} as const
export const LAST_OWNER = { CONFLICT: { message: "Transfer ownership before leaving." } } as const
```

Add to `index.ts`: `export * from "./workspace"` and the namespaces (every ⚑ route declares `WORKSPACE_ERRORS` where scoped, `AUTH_ERRORS` where only a session is needed):

```ts
  workspaces: {
    list: oc.route({ method: "GET", path: "/workspaces", summary: "The caller's workspaces and pending invitations" })
      .errors(AUTH_ERRORS).input(empty).output(WorkspaceListSchema),
    create: oc.route({ method: "POST", path: "/workspaces", successStatus: 201, summary: "Create a workspace" })
      .errors({ ...AUTH_ERRORS, FORBIDDEN: { message: "Verify your email to create a workspace" } })
      .input(CreateWorkspaceSchema).output(WorkspaceSummarySchema),
    get: oc.route({ method: "GET", path: "/workspaces/{workspaceId}", summary: "One workspace" })
      .errors(WORKSPACE_ERRORS).input(WorkspaceIdSchema).output(WorkspaceSummarySchema),
    update: oc.route({ method: "PATCH", path: "/workspaces/{workspaceId}", summary: "Rename a workspace" })
      .errors(WORKSPACE_ERRORS).input(UpdateWorkspaceSchema).output(WorkspaceSummarySchema),
    delete: oc.route({ method: "DELETE", path: "/workspaces/{workspaceId}", summary: "Delete a workspace" })
      .errors(WORKSPACE_ERRORS).input(WorkspaceIdSchema).output(z.void()),
    leave: oc.route({ method: "POST", path: "/workspaces/{workspaceId}/leave", summary: "Leave a workspace" })
      .errors({ ...WORKSPACE_ERRORS, ...LAST_OWNER }).input(WorkspaceIdSchema).output(z.void()),
    transferOwnership: oc.route({ method: "POST", path: "/workspaces/{workspaceId}/transfer", summary: "Make another member the owner" })
      .errors({ ...WORKSPACE_ERRORS, BAD_REQUEST: { message: "Not a member of this workspace" } })
      .input(MemberTargetSchema).output(z.void()),
    members: {
      list: oc.route({ method: "GET", path: "/workspaces/{workspaceId}/members", summary: "List members" })
        .errors(WORKSPACE_ERRORS).input(WorkspaceIdSchema).output(MemberListSchema),
      setRole: oc.route({ method: "PATCH", path: "/workspaces/{workspaceId}/members/{userId}", summary: "Change a member's role" })
        .errors({ ...WORKSPACE_ERRORS, ...LAST_OWNER, BAD_REQUEST: { message: "Not a member of this workspace" } })
        .input(SetRoleSchema).output(z.void()),
      remove: oc.route({ method: "DELETE", path: "/workspaces/{workspaceId}/members/{userId}", summary: "Remove a member" })
        .errors({ ...WORKSPACE_ERRORS, ...LAST_OWNER, BAD_REQUEST: { message: "Not a member of this workspace" } })
        .input(MemberTargetSchema).output(z.void()),
    },
    invitations: {
      list: oc.route({ method: "GET", path: "/workspaces/{workspaceId}/invitations", summary: "Pending invitations" })
        .errors(WORKSPACE_ERRORS).input(WorkspaceIdSchema).output(InvitationListSchema),
      create: oc.route({ method: "POST", path: "/workspaces/{workspaceId}/invitations", successStatus: 201, summary: "Invite by email" })
        .errors({ ...WORKSPACE_ERRORS, CONFLICT: { message: "Already a member" }, TOO_MANY_REQUESTS: { message: "Too many invitations, try again in an hour" } })
        .input(CreateInvitationSchema).output(InvitationSchema),
      revoke: oc.route({ method: "DELETE", path: "/workspaces/{workspaceId}/invitations/{id}", summary: "Revoke an invitation" })
        .errors(WORKSPACE_ERRORS).input(InvitationIdSchema).output(z.void()),
    },
  },
  invitations: {
    preview: oc.route({ method: "GET", path: "/invitations/{token}", summary: "What an invitation link is for" })
      .errors({ NOT_FOUND: { message: "This invitation is no longer valid." } })
      .input(InvitationTokenSchema).output(InvitationPreviewSchema),
    accept: oc.route({ method: "POST", path: "/invitations/{token}/accept", summary: "Accept an invitation" })
      .errors({ ...AUTH_ERRORS, NOT_FOUND: { message: "This invitation is no longer valid." }, FORBIDDEN: { message: "This invitation was sent to another address" } })
      .input(InvitationTokenSchema).output(AcceptResultSchema),
    acceptById: oc.route({ method: "POST", path: "/invitations/by-id/{id}/accept", summary: "Accept one of the caller's pending invitations" })
      .errors({ ...AUTH_ERRORS, NOT_FOUND: { message: "This invitation is no longer valid." }, FORBIDDEN: { message: "This invitation was sent to another address" } })
      .input(AcceptByIdSchema).output(AcceptResultSchema),
  },
```

(Write them in the file's multi-line style; the one-liners above are for the plan's width.) `workspace.test.ts`: `roleAtLeast` table (`viewer<member<admin<owner`, equal is true), `CreateInvitationSchema` normalises the email, `SetRoleSchema` rejects `owner`.

- [ ] **Step 2: api env, context, limiter, credentials**

First, replace the local `Role` type in `apps/api/src/queries/workspaces.ts` with `import type { Role } from "@repo/api-contract"` (and re-export it for `memberships.ts`/`invitations.ts`), so there is one definition.

`credentials.ts`: `export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000`.
`env.ts`: `APP_URL: optionalString.pipe(z.string().url().optional())`, `DEV_APP_URL = siteUrl("app", {})`, `Env.APP_URL: string`, production check identical to `ACCOUNT_URL`'s, trailing-slash strip; `env.test.ts`: production without `APP_URL` throws, dev default is `http://app.brand.localhost:3001`.
`server.ts`: `ServerOptions.appUrl: string`, `inviteLimiter?: RateLimiter` (default `createMemoryRateLimiter({ limit: 20, windowMs: 60 * 60_000 })`), both into the context; `index.ts` passes `appUrl: env.APP_URL`; `test-server.ts` passes `appUrl: "http://app.example.com"`; `Context` in `router.ts` gains `appUrl: string` and `inviteLimiter: RateLimiter`. `apps/api/.env.example` and `docker-compose.yml`'s api service gain `APP_URL` next to `ACCOUNT_URL` (same form).

- [ ] **Step 3: Helpers** (`apps/api/src/workspaces.ts`)

```ts
import type { Role, WorkspaceSummary } from "@repo/api-contract"
import { ORPCError } from "@orpc/server"
import type { Db, Queries } from "./db"
import type { WorkspaceRow } from "./queries/workspaces"
import { uniqueSlug as pickSlug } from "./slug"

export const LAST_OWNER_MESSAGE = "Transfer ownership before leaving."

export const toWorkspace = (row: WorkspaceRow, role: Role, memberCount: number): WorkspaceSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: row.created_at,
  role,
  memberCount,
})

/** The first slug for `name` that no workspace holds. */
export const uniqueSlug = (db: Pick<Db, "workspaces">, name: string) =>
  pickSlug(name, (slug) => db.workspaces.slugExists(slug))

/** Refuses to let the only owner go: call inside the transaction that changes the membership. */
export async function assertNotLastOwner(tx: Queries, workspaceId: number, userId: number) {
  const membership = await tx.memberships.find(workspaceId, userId)
  if (membership?.role !== "owner") return
  if ((await tx.memberships.ownerCount(workspaceId)) <= 1) {
    throw new ORPCError("CONFLICT", { message: LAST_OWNER_MESSAGE })
  }
}
```

Export `Queries` from `db.ts` if it is not already (`export type Queries`).

- [ ] **Step 4: Middleware and handlers** (`router.ts`)

```ts
type SessionContext = Context & { user: UserRow; session: SessionRow }
const sessionApi = implement(contract).$context<SessionContext>()

/** Loads the caller's membership of `input.workspaceId`; outsiders see NOT_FOUND, low roles FORBIDDEN. */
const member = (min: Role) =>
  sessionApi.middleware(async ({ context, next }, input: { workspaceId: number }) => {
    const membership = await context.db.memberships.find(input.workspaceId, context.user.id)
    const workspace = membership && (await context.db.workspaces.find(input.workspaceId))
    if (!membership || !workspace) throw new ORPCError("NOT_FOUND", { message: "Workspace not found" })
    if (!roleAtLeast(membership.role, min)) {
      throw new ORPCError("FORBIDDEN", { message: `Requires the ${min} role` })
    }
    return next({ context: { workspace, role: membership.role } })
  })
```

Use it as `authed.workspaces.get.use(member("viewer"), (input) => input).handler(...)` (the second argument maps the procedure's input to the middleware's — the input already has `workspaceId`, so identity). Handlers:

- `workspaces.list`: `listForUser` → `toWorkspace`; `pendingInvitations` = `context.user.email_verified_at ? listPendingForEmail(user.email, now) : []` mapped to `{ id, workspace: { name: workspace_name }, role, invitedBy: { name: inviter_name }, expiresAt: expires_at }`.
- `workspaces.create`: unverified → `errors.FORBIDDEN()`; `db.transaction`: `uniqueSlug`, `workspaces.create`, `memberships.add(owner)`; on a unique-slug race (`UNIQUE constraint failed: workspaces.slug` / `workspaces_slug_key`) retry once; return `toWorkspace(row, "owner", 1)`.
- `get` (viewer): `toWorkspace(context.workspace, context.role, await memberCount)`.
- `update` (admin): `rename`, return the summary.
- `delete` (owner): `workspaces.delete`.
- `leave` (viewer): transaction → `assertNotLastOwner` → `remove`.
- `transferOwnership` (owner): target membership must exist and differ from caller else `errors.BAD_REQUEST()`; transaction: `setRole(target, "owner")`, `setRole(caller, "admin")`.
- `members.list` (viewer): rows → `{ userId: user_id, name, email: roleAtLeast(context.role, "admin") ? email : null, role, joinedAt: created_at }`.
- `members.setRole` (admin): target must be a member (`BAD_REQUEST`); target is `owner` and caller is not → `FORBIDDEN` ("Requires the owner role"); transaction → `assertNotLastOwner(target)` → `setRole`.
- `members.remove` (admin): same guards; if `input.userId === context.user.id` behave as `leave`.
- `invitations.list` (admin): `listPending(workspaceId, now)` → `InvitationSchema` shape.
- `invitations.create` (admin): `inviteLimiter.hit(\`invite:${workspaceId}\`)` first → `TOO_MANY_REQUESTS`; existing user with that email already a member → `CONFLICT`; `token = newToken()`, `create({ …, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString() })`; `detach` the mail `emails.invitation({ workspaceName: workspace.name, inviterName: user.name || user.email, role, link: \`${context.appUrl}/invitations/${token}\` })` to the normalised email, logging `mail sent invitation to <masked>`; return the row.
- `invitations.revoke` (admin): `delete(id, workspaceId)` else `NOT_FOUND` (message "Invitation not found" — declare it on this procedure instead of the workspace one).
- `invitations.preview` (anonymous, `api.`): `findByTokenHash(tokenHash(token))`; missing, accepted, or expired → `errors.NOT_FOUND()`; return `{ workspace: { name }, invitedBy: { name }, email: maskEmail(email), role, expiresAt }`.
- `invitations.accept` (`authed.`): find by hash (same validity checks → `NOT_FOUND`); `normalizeEmail(user.email) !== row.email` → `errors.FORBIDDEN({ message: \`This invitation was sent to ${maskEmail(row.email)}. Sign in with that address to accept it.\` })`; unverified → `errors.FORBIDDEN({ message: "Verify your email to accept this invitation" })`; transaction: `invitations.accept(id, now)` (false → `NOT_FOUND`), already a member → just mark accepted and return; else `memberships.add`; return `{ workspace: toWorkspace(...) }`.
- `invitations.acceptById`: `find(id)` then the same checks and body (share a local `acceptInvitation(context, row, errors)` function).

Confirm `errors.FORBIDDEN({ message })` overrides the declared message in the installed `@orpc/server` (it does in 1.x: `errors.CODE({ message?, data? })`).

- [ ] **Step 5: Email template**

```tsx
// packages/email/src/templates/invitation.tsx
import { Button, Heading, Link, Text } from "@react-email/components"
import { BRAND, button, Layout } from "./layout"

export type InvitationProps = {
  workspaceName: string
  inviterName: string
  role: string
  link: string
  brand?: string
}

export const invitationSubject = (workspaceName: string) => `You're invited to ${workspaceName}`

export function Invitation({ workspaceName, inviterName, role, link, brand }: InvitationProps) {
  return (
    <Layout preview={`${inviterName} invited you to ${workspaceName}`} brand={brand}>
      <Heading as="h1">{`Join ${workspaceName} on ${brand ?? BRAND}`}</Heading>
      <Text>{`${inviterName} invited you to join ${workspaceName} as a ${role}. This link works for 7 days.`}</Text>
      <Button href={link} style={button}>
        Accept invitation
      </Button>
      <Text>
        Or open this link: <Link href={link}>{link}</Link>
      </Text>
      <Text>If you were not expecting this, ignore this email.</Text>
    </Layout>
  )
}
```

`index.tsx`: `invitation: (props) => rendered(invitationSubject(props.workspaceName), <Invitation {...props} />)` + re-exports. Test: subject contains the workspace name, html/text contain inviter, role, link and "7 days", escapes `<script>` in `inviterName`. Story `Email/Invitation` like `MagicLink.stories.tsx` (assert subject and "7 days").

- [ ] **Step 6: api tests** (`apps/api/src/workspaces.test.ts`, with `start()`/`signUp()`; verify emails in tests through the existing verify-link flow used in `auth.test.ts` — read how it extracts the token from `mailer.sent` and reuse that helper, or export one from `test-server.ts`):

1. `create` refused unverified (`FORBIDDEN`), allowed verified; `list` shows it with `role: "owner"`, `memberCount: 1`; slug `my-team`, a second "My team" → `my-team-2`.
2. Role matrix (table-driven over `["viewer","member","admin","owner"]` × `[get, update, delete, members.list, members.setRole, members.remove, invitations.list, invitations.create, invitations.revoke]`): expected `ok | FORBIDDEN`; a non-member gets `NOT_FOUND` for all; `members.list` emails are `null` for viewer/member and strings for admin/owner.
3. Last owner: `leave` → `CONFLICT` with the exact message; `setRole` of the only owner by a second owner is allowed only when two owners exist (create via `transferOwnership` then set); `remove` of the last owner → `CONFLICT`; `transferOwnership` to a non-member → `BAD_REQUEST`; after transfer the old owner is `admin` and can leave.
4. Invitation lifecycle: `create` sends one `You're invited to <name>` mail with an `/invitations/<token>` link to `http://app.example.com`; `preview` (anonymous client) shows masked email and role; re-invite replaces: the old token's `preview` → `NOT_FOUND`, the new works; `accept` by a signed-in user with a different email → `FORBIDDEN` with the masked-address message; by the right email unverified → `FORBIDDEN` "Verify your email…"; verified → `{ workspace }` and `list` shows role `member`; a second `accept` → `NOT_FOUND`; `acceptById` from `workspaces.list().pendingInvitations` works; `revoke` → later `preview` `NOT_FOUND`; inviting an existing member → `CONFLICT`; 21st invite in an hour → `TOO_MANY_REQUESTS` (pass `inviteLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 })` to `start` to keep it short).
5. Expired invitation (insert via a direct query with `expires_at` in the past, or pass a tiny TTL through a seam — prefer a `now` override: `invitations.listPending/accept` already take `now`; for the api path set `expires_at` by updating the row through the test database handle) → `preview` and `accept` `NOT_FOUND`.

Run `bun --filter @repo/api test`; `bun run typecheck` (apps/app still compiles — notes are untouched here).

- [ ] **Step 7: Commit**

```bash
bunx biome check --write apps/api packages/api-contract packages/email apps/story/stories/email docker-compose.yml
git add apps/api packages/api-contract packages/email apps/story/stories/email docker-compose.yml
git commit -m "feat(api,email): workspaces.* and invitations.* — roles, membership middleware, invitation mail"
```

---

### Task 3: `@repo/session` — the current-workspace seam

**Files:**
- Create: `packages/session/src/workspace.ts`, `packages/session/src/workspace.test.ts`
- Modify: `packages/session/src/index.ts`, `packages/session/src/index.test.ts`, `packages/session/README.md`

**Interfaces:**
- Consumes: `ApiClient["workspaces"]["list"]`, `WorkspaceSummary`, `Role` from the contract.
- Produces: `WORKSPACE_COOKIE`, `workspaceCookieOptions`, `readWorkspaceId`, and on `createAuth(...)`: `listWorkspaces(): Promise<WorkspaceList>`, `currentWorkspace(list: WorkspaceList): Promise<WorkspaceSummary | null>` (the cookie's workspace if the user is a member, else the only workspace, else null — used by layouts), `requireWorkspace(): Promise<WorkspaceAccess>`, `setCurrentWorkspace(id: number): Promise<boolean>`, `clearCurrentWorkspace(): Promise<void>`; exported `type WorkspaceAccess = { user: User; workspace: WorkspaceSummary; role: Role }`.

- [ ] **Step 1: Failing tests** (`workspace.test.ts` for the pure helpers; `index.test.ts` for `requireWorkspace` with the existing `next/headers` + `next/navigation` mocks — extend the `cookies` mock to return a settable map and inject a fake `fetch` into `createAuth({ ..., fetch })` that answers `/rpc` calls for `auth/me` and `workspaces/list` — look at `client.test.ts` for how the RPC body is shaped, or stub `createApiClient` via `mock.module("./client", …)` returning an object whose `workspaces.list` resolves a fixture — the module mock is simpler; use it):

- `readWorkspaceId("12")` → 12; `"abc"`, `"-1"`, `""`, `undefined` → null.
- `workspaceCookieOptions({ domain: ".brand.localhost", production: false })` → `{ name: "workspace", httpOnly: true, path: "/", sameSite: "lax", secure: false, domain, maxAge: 31536000 }`.
- `requireWorkspace`: cookie `workspace=2`, list `[{id:1…},{id:2…}]` → returns workspace 2 with its role; cookie `workspace=9` (stale) with two workspaces → redirect `http://app.brand.localhost:3001/workspaces/new`; stale cookie with one workspace → returns that one; no cookie, no workspaces → redirect; signed out → the `requireUser` login redirect.
- `setCurrentWorkspace(9)` with no such membership → `false` and no cookie written; `setCurrentWorkspace(2)` → `true`, cookie `workspace=2` with the options above.

- [ ] **Step 2: Implement**

```ts
// packages/session/src/workspace.ts
export const WORKSPACE_COOKIE = "workspace"
export const WORKSPACE_MAX_AGE_SECONDS = 365 * 24 * 3600

/** The one definition of the current-workspace cookie: the workspace id, re-checked on every read. */
export function workspaceCookieOptions({ domain, production }: { domain: string; production: boolean }) {
  return {
    name: WORKSPACE_COOKIE,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: production,
    domain,
    maxAge: WORKSPACE_MAX_AGE_SECONDS,
  }
}

/** A positive integer id, or null — a sibling subdomain can set this cookie, so it is only a hint. */
export function readWorkspaceId(value: string | undefined | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}
```

In `createAuth`:

```ts
  const workspaceCookie = workspaceCookieOptions({ domain: options.cookieDomain, production })
  // Once per request: the user's workspaces and pending invitations, as the signed-in user.
  const listWorkspaces = cache(async (): Promise<WorkspaceList> => (await api()).workspaces.list())
  const currentWorkspace = async (list: WorkspaceList): Promise<WorkspaceSummary | null> => {
    const wanted = readWorkspaceId((await cookies()).get(WORKSPACE_COOKIE)?.value)
    return list.items.find((w) => w.id === wanted) ?? (list.items.length === 1 ? list.items[0] : null)
  }
  …
    listWorkspaces,
    currentWorkspace,
    /** The user and their current workspace; without one, the onboarding page. */
    async requireWorkspace(): Promise<WorkspaceAccess> {
      const user = await this.requireUser()
      const list = await listWorkspaces()
      const workspace = await currentWorkspace(list)
      if (!workspace) redirect(`${options.appUrl}/workspaces/new`)
      return { user, workspace, role: workspace.role }
    },
    /** From a server action only: records the choice if the user is a member. */
    async setCurrentWorkspace(id: number): Promise<boolean> {
      const list = await listWorkspaces()
      if (!list.items.some((w) => w.id === id)) return false
      const { name, ...rest } = workspaceCookie
      ;(await cookies()).set(name, String(id), rest)
      return true
    },
    async clearCurrentWorkspace() {
      const { name, maxAge: _maxAge, ...rest } = workspaceCookie
      ;(await cookies()).set(name, "", { ...rest, maxAge: 0 })
    },
```

(`this.requireUser()` — write `requireUser` as a named function above the returned object and call it directly rather than through `this`.) Export the new names from `index.ts`; `README.md` gets a **Current workspace** section (cookie, the three paths, "set only from actions").

- [ ] **Step 3: Run** `bun --filter @repo/session test`, `bun run typecheck`.

- [ ] **Step 4: Commit**

```bash
bunx biome check --write packages/session
git add packages/session
git commit -m "feat(session): requireWorkspace, the workspace cookie and listWorkspaces"
```

---

### Task 4: Workspace-scoped notes end to end

**Files:**
- Create: `apps/api/src/migrations/0009_notes_workspace.ts`, `apps/app/src/components/delete-note-button.tsx`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/migrate.test.ts`, `apps/api/src/queries/notes.ts`, `apps/api/src/queries/workspaces.ts` (`delete` also removes the workspace's notes), `packages/api-contract/src/note.ts`, `packages/api-contract/src/index.ts` (notes routes), `apps/api/src/router.ts` (notes handlers), `apps/api/src/server.test.ts` or `auth.test.ts` wherever notes are tested today (grep `notes.create`), `apps/app/src/app/notes/page.tsx`, `apps/app/src/app/notes/actions.ts`, `apps/app/src/app/chat/page.tsx`, `apps/app/src/views/notes-view.tsx`, `apps/app/src/components/note-form.tsx`, `apps/app/src/lib/note-form.ts` (+ test), `apps/app/README.md`

**Interfaces:**
- Consumes: `requireWorkspace()` (Task 3), `member()` (Task 2).
- Produces: `NoteSchema.authorId: number | null`; `ListNotesSchema = WorkspaceIdSchema.extend({ cursor?, limit? })` (no longer optional); `NoteIdSchema = WorkspaceIdSchema.extend({ id })`; `CreateNoteSchema = WorkspaceIdSchema.extend({ title, body })`; `notes.delete` `[DELETE /notes/{id}]` with `NoteIdSchema`, errors `WORKSPACE_ERRORS` + `NOT_FOUND: "Note not found"`.

- [ ] **Step 0: Migration `0009_notes_workspace`** — `notes.workspace_id`, the backfill, NOT NULL:

```ts
// apps/api/src/migrations/0009_notes_workspace.ts
import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"
import { uniqueSlug } from "../slug"

type Sql = Parameters<Migration["up"]>[0]

const slugExists = (sql: Sql) => async (slug: string) => {
  const rows: { id: number }[] = await sql`SELECT id FROM workspaces WHERE slug = ${slug}`
  return rows.length > 0
}

// Notes move under a workspace. Every user who owns notes gets a workspace of their own so nothing
// they wrote disappears; notes with no owner (from before accounts) cannot be placed and go.
const notesWorkspace: Migration = {
  name: "0009_notes_workspace",
  async up(sql, dialect: Dialect) {
    await sql.unsafe("ALTER TABLE notes ADD COLUMN workspace_id INTEGER")
    await sql.unsafe("DELETE FROM notes WHERE user_id IS NULL")
    const owners: { id: number; name: string; email: string }[] = await sql.unsafe(
      "SELECT DISTINCT u.id, u.name, u.email FROM notes n JOIN users u ON u.id = n.user_id ORDER BY u.id"
    )
    const now = new Date().toISOString()
    for (const owner of owners) {
      const label = owner.name || owner.email.split("@")[0] || "My"
      const name = `${label}'s workspace`.slice(0, 100)
      const slug = await uniqueSlug(name, slugExists(sql))
      const [workspace]: { id: number }[] = await sql`
        INSERT INTO workspaces (name, slug, created_by, created_at)
        VALUES (${name}, ${slug}, ${owner.id}, ${now}) RETURNING id
      `
      await sql`
        INSERT INTO memberships (workspace_id, user_id, role, created_at)
        VALUES (${workspace.id}, ${owner.id}, 'owner', ${now})
      `
      await sql`UPDATE notes SET workspace_id = ${workspace.id} WHERE user_id = ${owner.id}`
    }
    if (dialect === "postgres") {
      await sql.unsafe("ALTER TABLE notes ALTER COLUMN workspace_id SET NOT NULL")
      await sql.unsafe(
        "ALTER TABLE notes ADD CONSTRAINT notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE"
      )
    } else {
      // SQLite cannot add NOT NULL to an existing column: rebuild, keeping ids and the id counter.
      await sql.unsafe(`
        CREATE TABLE notes_new (
          id ${ddl.serialId(dialect)},
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          user_id INTEGER,
          workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `)
      await sql.unsafe(`
        INSERT INTO notes_new (id, title, body, created_at, user_id, workspace_id)
        SELECT id, title, body, created_at, user_id, workspace_id FROM notes
      `)
      await sql.unsafe(`
        DELETE FROM sqlite_sequence
        WHERE name = 'notes_new' AND EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'notes')
      `)
      await sql.unsafe(
        "INSERT INTO sqlite_sequence (name, seq) SELECT 'notes_new', seq FROM sqlite_sequence WHERE name = 'notes'"
      )
      await sql.unsafe("DROP TABLE notes")
      await sql.unsafe("ALTER TABLE notes_new RENAME TO notes")
    }
    await sql.unsafe("CREATE INDEX notes_workspace_id ON notes (workspace_id, id)")
  },
}

export default notesWorkspace
```

Check `0001_notes.ts` (and `0003_notes_owner.ts`) for the exact `notes` columns before writing `notes_new`; copy them verbatim. Register it after `workspaces` in `migrations/index.ts`. `migrate.test.ts`: on a fresh database run migrations through `0008`, insert a user, two notes with `user_id` and one orphan (`user_id NULL`), run `0009`; assert one workspace named `"<name>'s workspace"` with the user as owner, both notes carry its id, the orphan is gone, and inserting a note without `workspace_id` now fails.

**`queries/notes.ts`:** every function scopes by `workspaceId`: `list({ workspaceId, cursor, limit })`, `find({ workspaceId, id })`, `create({ workspaceId, userId, title, body })`, new `findRow({ workspaceId, id }): Promise<NoteRow | undefined>` (raw row incl. `user_id`, for the delete handler's author check) and `delete({ workspaceId, id }): Promise<boolean>`; `NoteRow` gains `workspace_id: number`; `toNote` adds `authorId: row.user_id`. `queries/workspaces.ts` `delete` now also runs `DELETE FROM notes WHERE workspace_id = ${id}` first.

- [ ] **Step 1: Contract + api.** Routes: `list`/`find` `.use(member("viewer"), (i) => i)`, `create` `member("member")`, `delete` `member("member")` with handler: `findRow` → missing → `NOT_FOUND`; `row.user_id !== user.id && !roleAtLeast(role, "admin")` → `FORBIDDEN` ("Requires the admin role"); else `delete`. REST paths stay `/notes…` (the id is in the body/query — `workspaceId` as a query param on GET, body on POST/DELETE; oRPC's OpenAPI handler takes non-path input from query for GET and body otherwise). Tests: two workspaces, a note in each; `list` of A never shows B's; `find` of B's id with A's `workspaceId` → `NOT_FOUND`; viewer `create` → `FORBIDDEN`; member deletes own, not another's (`FORBIDDEN`); admin deletes any; all existing notes tests updated to pass `workspaceId`.

- [ ] **Step 2: App.** `notes/page.tsx`: `const { workspace, role } = await getAuth().requireWorkspace()`, `notes.list({ workspaceId: workspace.id, cursor })`, pass `workspace`, `role`, `userId: user.id` to the view. `NotesView` header: "Notes · <workspace.name>" and a muted line "You are a <role> here."; `<NoteForm workspaceId />` only when `roleAtLeast(role, "member")` (viewer sees "Viewers can read notes; ask an admin for the member role to add your own."); each card gets `<DeleteNoteButton noteId workspaceId />` when `note.authorId === userId || roleAtLeast(role, "admin")`. `note-form.ts`: `parseNoteForm(formData)` also reads `workspaceId` (hidden input) and validates with `CreateNoteSchema`; `actions.ts`: `createNote` calls `requireWorkspace()` and refuses a form whose `workspaceId` differs from the current one (return `{ ok: false, message: "Switch to that workspace first", values }`), then `notes.create`. New `deleteNote(prev, fd)` action in `notes/actions.ts` (same checks → `notes.delete` → `revalidatePath("/notes")`), `DeleteNoteButton` a client `useActionState` form with a `ConfirmDialog` if `apps/app/src/components/confirm-dialog.tsx` fits (read it), else a plain button labelled **Delete** with `aria-describedby` the note title id. `chat/page.tsx`: `requireWorkspace()` instead of `requireUser()`. Tests: `note-form.test.ts` for the `workspaceId` field; `apps/app` existing tests pass.

- [ ] **Step 3: Run** `bun --filter @repo/api test`, `bun --filter @repo/app test`, `bun run typecheck`, `bun --filter @repo/app build` (`/notes`, `/chat` stay `ƒ`).

- [ ] **Step 4: Commit**

```bash
bunx biome check --write apps/api apps/app packages/api-contract
git add apps/api apps/app packages/api-contract
git commit -m "feat(notes): notes move under the current workspace; role-gated create and delete"
```

---

### Task 5: Workspace switcher in `UserMenu` and the three signed-in layouts

**Files:**
- Modify: `packages/ui/src/components/user-menu.tsx`, `apps/story/stories/UserMenu.stories.tsx` (find the existing story by grep), `apps/app/src/app/layout.tsx`, `apps/app/src/app/actions.ts`, `apps/auth/src/app/layout.tsx`, `apps/auth/src/app/actions.ts`, `apps/account/src/app/(account)/layout.tsx`, `apps/account/src/app/actions.ts`
- Test: `packages/ui/src/components/user-menu.test.tsx` (create; render with and without `workspaces` using the package's existing test renderer — grep `blocks-1.test.tsx` for the pattern)

**Interfaces:**
- Produces: `UserMenuProps.workspaces?: { items: { id: number; name: string }[]; currentId: number | null; switchTo: (formData: FormData) => Promise<void>; pendingInvitations: number; newUrl: string; manageUrl: string; canManage: boolean }`.
- Each app: `export async function switchWorkspace(formData: FormData)` in `src/app/actions.ts`.

- [ ] **Step 1: `UserMenu`.** After the user label and before **Account**, when `workspaces` is given:

```tsx
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Workspace</DropdownMenuLabel>
        {workspaces.items.map((w) => (
          <form key={w.id} action={workspaces.switchTo}>
            <input type="hidden" name="workspaceId" value={w.id} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full text-left" aria-current={w.id === workspaces.currentId ? "true" : undefined}>
                <span className="truncate">{w.name}</span>
                {w.id === workspaces.currentId && <Icon icon="lucide:check" className="ml-auto size-4" aria-hidden />}
              </button>
            </DropdownMenuItem>
          </form>
        ))}
        {workspaces.items.length === 0 && (
          <DropdownMenuItem disabled>No workspace yet</DropdownMenuItem>
        )}
        <DropdownMenuItem asChild><a href={workspaces.newUrl}>Create a workspace</a></DropdownMenuItem>
        {workspaces.canManage && (
          <DropdownMenuItem asChild><a href={workspaces.manageUrl}>Manage members</a></DropdownMenuItem>
        )}
        {workspaces.pendingInvitations > 0 && (
          <DropdownMenuItem asChild>
            <a href={workspaces.newUrl}>Invitations <Badge className="ml-auto">{workspaces.pendingInvitations}</Badge></a>
          </DropdownMenuItem>
        )}
```

where **Manage members** renders when `workspaces.canManage` is true (the apps compute it with `roleAtLeast(current.role, "admin")`; `packages/ui` must not depend on `@repo/api-contract`, so the prop carries a boolean, not a role — and `items[].role` is therefore typed `string` here). The trigger's `sr-only` label becomes "Account menu for <label>, <n> pending invitations" when `pendingInvitations > 0`, with a small dot on the avatar. `Icon` is `@repo/ui/components/icon`, `Badge` is `@repo/ui/components/badge`. Run `bun icons:bundle` if `lucide:check` is missing from the bundle. Story: `WithWorkspaces` (two items, one current, 1 pending) and the existing default; test renders both variants and asserts the current item has `aria-current`.

- [ ] **Step 2: Layouts + actions.** In each of app, auth (only inside `user && …`), account: `const list = user ? await auth.listWorkspaces() : null` — in all three, `const current = list && (await auth.currentWorkspace(list))` (Task 3's helper: the cookie's workspace if a member, else the only one, else null). Build the prop: `items: list.items.map(({ id, name }) => ({ id, name }))`, `currentId: current?.id ?? null`, `switchTo: switchWorkspace`, `pendingInvitations: list.pendingInvitations.length`, `newUrl: \`${APP_URL}/workspaces/new\`` (app: `/workspaces/new`), `manageUrl: \`${siteUrl("account")}/workspace\`` (account: `/workspace`), `canManage: current ? roleAtLeast(current.role, "admin") : false`. `switchWorkspace`:

```ts
export async function switchWorkspace(formData: FormData) {
  const auth = getAuth()
  await auth.requireUser()
  const id = Number(formData.get("workspaceId"))
  if (Number.isInteger(id) && id > 0) await auth.setCurrentWorkspace(id)
  revalidatePath("/", "layout")
}
```

The auth app's `listWorkspaces` call must never break sign-in pages: wrap it in `try/catch` → `null` with a `console.error` (an api outage still lets people sign in).

- [ ] **Step 3: Run** `bun --filter @repo/ui test`, `bun run typecheck`, builds of app/auth/account; Storybook test for the story if quick (`bunx vitest run --project storybook stories/UserMenu.stories.tsx` from `apps/story`).

- [ ] **Step 4: Commit**

```bash
bunx biome check --write packages/ui apps/app apps/auth apps/account apps/story/stories
git add packages/ui apps/app apps/auth apps/account apps/story/stories
git commit -m "feat(ui,apps): workspace switcher in UserMenu; switchWorkspace action in the signed-in apps"
```

---

### Task 6: `apps/app` — create a workspace, accept an invitation

**Files:**
- Create: `apps/app/src/app/workspaces/new/page.tsx`, `apps/app/src/app/workspaces/new/actions.ts`, `apps/app/src/views/workspace-new-view.tsx`, `apps/app/src/components/workspace-form.tsx`, `apps/app/src/components/pending-invitations.tsx`, `apps/app/src/app/invitations/[token]/page.tsx`, `apps/app/src/app/invitations/[token]/actions.ts`, `apps/app/src/views/invitation-view.tsx`, `apps/app/src/components/accept-invitation-button.tsx`, `apps/app/src/lib/workspace-actions.ts`, `apps/app/src/lib/workspace-actions.test.ts`
- Modify: `apps/app/src/lib/auth.ts` (nothing unless `anonymousApi` is missing — it exists via `createAuth`), `apps/app/README.md`

**Interfaces:**
- Consumes: `workspaces.create`, `workspaces.list`, `invitations.preview/accept/acceptById`, `setCurrentWorkspace`, `FormState`/`fieldErrors`/`fieldAria` from `@repo/ui/components/form-feedback`.

- [ ] **Step 1: Action cores** (`lib/workspace-actions.ts`, Next-free, tested with fake apis like `apps/account/src/lib/actions.ts`):

```ts
export type WorkspaceApi = {
  workspaces: Pick<ApiClient["workspaces"], "create">
  invitations: Pick<ApiClient["invitations"], "accept" | "acceptById">
}
export type Deps = { api: WorkspaceApi }
export type CreateResult = FormState & { workspaceId?: number }

export async function createWorkspaceCore(deps: Deps, fd: FormData): Promise<CreateResult>
// validates { name } with CreateWorkspaceSchema → fieldErrors; FORBIDDEN (unverified) → message
// "Verify your email to create a workspace"; other defined errors → their message; else UNAVAILABLE.
export async function acceptInvitationCore(deps: Deps, fd: FormData): Promise<CreateResult>
// reads `token` or `id` (one of them), calls accept / acceptById; NOT_FOUND and FORBIDDEN messages
// pass through (they are the exact copy); returns { ok: true, workspaceId }.
```

Tests: valid create → `workspaceId`; empty name → field error; unverified → the exact message; accept by token success / NOT_FOUND / FORBIDDEN mismatch message passes through / network error → UNAVAILABLE.

- [ ] **Step 2: Server actions.** `workspaces/new/actions.ts`: `createWorkspace(prev, fd)` → `requireUser()` → core → on success `setCurrentWorkspace(id)` then `redirect("/notes")`. `acceptPending(prev, fd)` (by `id`) likewise. `invitations/[token]/actions.ts`: `acceptInvitation(prev, fd)` (by `token`) likewise; on failure the message renders in place.

- [ ] **Step 3: Pages and views.**
`workspaces/new/page.tsx`: `await connection()`; `const user = await auth.requireUser()`; `const list = await auth.listWorkspaces()`; `<WorkspaceNewView user list />`, `metadata.title = "Create a workspace"`. View: `<main id="main">` with `<h1>Create a workspace</h1>`; if `!user.emailVerified` render the existing verify notice pattern (grep `verify-email-notice` in `apps/account` and `apps/app`; reuse or copy the smallest version with a **Resend** action calling `account.resendVerification`) instead of the form; else `<WorkspaceForm />` (label **Workspace name**, `fieldAria("name", state)`, button **Create**); below, `<PendingInvitations items />` when any: "<inviter> invited you to <workspace> as a <role>." + **Accept** form per row (`acceptPending`, hidden `id`), expiry as "Expires <date>" with the UTC `Intl` formatter from `sessions-list.tsx`.
`invitations/[token]/page.tsx`: `await connection()`; `const { token } = await params`; `const preview = await (await auth.anonymousApi({ ip: requestInfo(await headers()).ip })).invitations.preview({ token })` (`requestInfo` from `@repo/session`) inside `try` — `NOT_FOUND` → `notFound()` (the app's `not-found.tsx` renders `StatusPage`; set the message by rendering `<StatusPage code={404} title="This invitation is no longer valid." />` directly instead of `notFound()` so the copy is exact — check `@repo/ui/blocks/status-page`'s props); `const user = await auth.getUser()`; `<InvitationView preview user token authUrl current />`. View states: signed out → the line + **Sign in** (`${AUTH_URL}/login?next=<current>`) and **Create account** (`${AUTH_URL}/signup?next=<current>`) + "Use <masked email>."; signed in → `<AcceptInvitationButton token />` (`useActionState(acceptInvitation)`, shows `state.message` via `FormMessage`) — the mismatch/unverified messages come back from the action; a **Sign out** form (`signOut` from `@/app/actions`) under the message so the wrong-account case has a way out. `metadata.title = "Invitation"`. The GET never calls `accept`.

- [ ] **Step 4: Run** `bun --filter @repo/app test`, `bun run typecheck`, `bun --filter @repo/app build` (both routes `ƒ`).

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/app
git add apps/app
git commit -m "feat(app): /workspaces/new onboarding and /invitations/[token] accept flow"
```

---

### Task 7: `apps/account` — the Workspace section

**Files:**
- Create: `apps/account/src/app/(account)/workspace/page.tsx`, `apps/account/src/app/(account)/workspace/actions.ts`, `apps/account/src/views/workspace-view.tsx`, `apps/account/src/components/members-list.tsx`, `apps/account/src/components/invite-form.tsx`, `apps/account/src/components/invitations-list.tsx`, `apps/account/src/components/workspace-name-form.tsx`, `apps/account/src/components/danger-zone.tsx`, `apps/account/src/lib/workspace-actions.ts`, `apps/account/src/lib/workspace-actions.test.ts`
- Delete: `apps/account/src/app/(account)/people-sharing/page.tsx`, `apps/account/src/views/people-sharing-view.tsx`
- Modify: `apps/account/src/components/account-sidebar.tsx` (`{ title: "Workspace", href: "/workspace", icon: "lucide:users-round" }` in place of People & sharing), `apps/account/src/views/home-view.tsx` (any People & sharing row → Workspace), `apps/account/README.md`, `apps/account/src/views/README.md`

**Interfaces:**
- Consumes: `requireWorkspace()`, `workspaces.get/update/delete/leave/transferOwnership`, `members.list/setRole/remove`, `invitations.list/create/revoke`, `clearCurrentWorkspace`, `APP_URL` via `loadEnv`.

- [ ] **Step 1: Action cores** (`lib/workspace-actions.ts` + tests, same style as `lib/actions.ts`): `renameWorkspaceCore`, `inviteCore` (success `Invitation sent to <email>.`; `CONFLICT`, `TOO_MANY_REQUESTS`, `FORBIDDEN` messages pass through), `setRoleCore`, `removeMemberCore`, `leaveCore` (returns `{ ok: true, left: true }`; `CONFLICT` → the last-owner message), `revokeInvitationCore`, `transferOwnershipCore`, `deleteWorkspaceCore` (`confirm` must equal the workspace name, else field error on `confirm`: "Type the workspace name to confirm"; returns `{ ok: true, deleted: true }`). Every core takes `{ api, workspaceId }` and reads ids from the form; tests cover each success + one declared error + the confirm mismatch.

- [ ] **Step 2: Server actions** (`workspace/actions.ts`): each `requireWorkspace()` first, passes `workspace.id`, `revalidatePath("/workspace")` on success; `leave` and `deleteWorkspace` on success `clearCurrentWorkspace()` then `redirect(\`${APP_URL}/workspaces/new\`)`.

- [ ] **Step 3: Page + view.** `page.tsx`: `const { user, workspace, role } = await requireWorkspace()`; `members.list`; `invitations.list` only when `roleAtLeast(role, "admin")`; `<WorkspaceView …/>`. View sections (each a `SettingsCard`): **Workspace** — name (admin+: `WorkspaceNameForm`, else text), slug, "You are a <role>"; **Members** — `MembersList` (rows: name, email when present, role as `<select name="role">` for admin+ on non-owner rows or when caller is owner, **Remove** for admin+ on others, **Leave** on own row); **Invitations** (admin+) — `InvitationsList` with **Revoke**, `InviteForm` (email + role select over `ASSIGNABLE_ROLES`); **Danger zone** (owner) — `DangerZone`: transfer (select member → **Transfer ownership**) and delete (input `confirm` + **Delete workspace**, button disabled until the typed value equals the name). All forms `useActionState` + `FormMessage`/`FieldError`/`fieldAria`, following `sessions-list.tsx` and `name-form.tsx`.

- [ ] **Step 4: Run** `bun --filter @repo/account test`, `bun run typecheck`, `bun --filter @repo/account build`; `grep -rn "people-sharing" apps/account` → nothing.

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/account
git add -A apps/account
git commit -m "feat(account): Workspace section — members, roles, invitations, transfer and delete"
```

---

### Task 8: Docs, ROADMAP, spec amendments, full gate, browser pass

**Files:**
- Modify: `CLAUDE.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-02-workspaces-design.md` (status → implemented; the two amendments from this plan's header written into **Decisions**; drop the forbidden-page copy), `packages/session/README.md` (if Task 3 left gaps), `apps/api/README.md` (procedure table rows, `APP_URL`, limiter), `apps/app/README.md`, `apps/account/README.md`, `packages/email/README.md`, `apps/api/.env.example`, root `.env.example` (`APP_URL` is read by the api too)

- [ ] **Step 1: Docs.** CLAUDE.md: a **Workspaces** paragraph under **Authentication** (tables, roles list + `roleAtLeast`, the `member(min)` middleware and `NOT_FOUND`-for-outsiders rule, the `workspace` cookie and `requireWorkspace()` with its three outcomes, invitation rules, the last-owner invariant, `APP_URL` row in the env table with `api` added to its Apps column); the Apps list entries for `app` (notes per workspace, `/workspaces/new`, `/invitations/[token]`) and `account` (Workspace section live; the other sections still mockups minus People & sharing); the new-app checklist step: "tenant pages use `requireWorkspace()` and pass `workspaces` to `UserMenu`"; the Quality-gates import-count sentence recounted if `UserMenu`'s new deps changed it. ROADMAP: tick 6e under Phase 6; amend the "deliberately out of scope" line: organisations are in (why: the benchmark and the product built from this repo), payments follow in 6d, the rest stands. `apps/api/README.md`: the `workspaces.*` / `invitations.*` rows in the same table format as `waitlist.join`.

- [ ] **Step 2: Browser pass (controller).** Dev servers api, app, auth, account. Sign up A (verify via the api log link) → `/notes` → redirected to `/workspaces/new` → create "Acme" → `/notes` shows "Notes · Acme", create a note → `UserMenu` shows Acme checked → invite `b@example.com` as viewer from account `/workspace` → copy the link from the api log → second isolated browser context: preview page shows the masked address and the two buttons → sign up B via **Create account** with `next` → verify → back on the invitation page → **Accept** → B on `/notes` sees A's note, no form, no delete → A sets B to member → B creates a note → A deletes it → A **Leave** refused with the exact message → A transfers to B → A leaves → lands on `/workspaces/new` → B deletes Acme (typed name) → B lands on `/workspaces/new`. Zero console/CSP errors; Lighthouse accessibility ≥ 95 on `/workspace` and `/workspaces/new`.

- [ ] **Step 3: Gate** — `bun run ci` → exit 0; `bun --filter @repo/api test:postgres` → green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs packages/session/README.md apps/api/README.md apps/app/README.md apps/account/README.md packages/email/README.md apps/api/.env.example .env.example
git commit -m "docs(workspaces): roles, cookie and invitation rules in CLAUDE.md; Phase 6e done"
```
