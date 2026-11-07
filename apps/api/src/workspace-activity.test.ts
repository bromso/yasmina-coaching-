import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { WORKSPACE_ACTIVITY_ACTIONS } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { auditWorkspace } from "./admin"
import { maskEmail } from "./mail/mailer"
import { PNG_1X1 } from "./storage/fixtures"
import { clientFor, signUpVerified, signUpWithWorkspace, start } from "./test-server"
import type { Resolver } from "./webhooks/ssrf"

// Phase 12 A, task 1: every administrative action on a workspace is recorded with its workspace,
// whoever makes it, inside the change's own transaction.

const ROOT = "activity-root@example.com"
/** Every webhook host resolves to one public address (the SSRF guard needs an answer). */
const resolve: Resolver = async () => ["93.184.216.34"]
let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    webhookResolve: resolve,
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

type Row = {
  id: number
  actor_user_id: number | null
  impersonated_user_id: number | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: string | null
  workspace_id: number | null
}
const rowsFor = (workspaceId: number) =>
  app.db.sql`
    SELECT * FROM audit_log WHERE workspace_id = ${workspaceId} ORDER BY id
  ` as Promise<Row[]>
const rowsOf = (workspaceId: number, action: string) =>
  app.db.sql`
    SELECT * FROM audit_log WHERE workspace_id = ${workspaceId} AND action = ${action} ORDER BY id
  ` as Promise<Row[]>
const meta = (row: Row | undefined) => JSON.parse(row?.metadata ?? "null")
const png = () => new File([PNG_1X1], "logo.png", { type: "image/png" })

/** An invited, verified account that has accepted and is now a member with `role`. */
async function joined(
  owner: Awaited<ReturnType<typeof signUpWithWorkspace>>,
  role: "viewer" | "member" | "admin" = "member"
) {
  const invitee = await signUpVerified(app)
  await owner.client.workspaces.invitations.create({
    workspaceId: owner.workspaceId,
    email: invitee.email,
    role,
  })
  const { pendingInvitations } = await invitee.client.workspaces.list()
  await invitee.client.invitations.acceptById({ id: pendingInvitations[0]?.id as number })
  return invitee
}

type Tx = Parameters<Parameters<(typeof app)["db"]["transaction"]>[0]>[0]
/** Every transaction until restored sees `patch(tx)` instead of its own query helpers. */
function patchTransactions(patch: (tx: Tx) => Tx) {
  const original = app.db.transaction
  app.db.transaction = (fn) => original((tx) => fn(patch(tx)))
  return () => {
    app.db.transaction = original
  }
}

describe("recorded with the workspace", () => {
  test("each administrative action writes one row naming its workspace, actor and target", async () => {
    const owner = await signUpWithWorkspace(app)
    const { workspaceId, client } = owner

    await client.workspaces.update({ workspaceId, name: "Renamed" })
    // The same name again changes nothing: no second row.
    await client.workspaces.update({ workspaceId, name: "Renamed" })
    await client.workspaces.logo.set({ workspaceId, file: png() })
    await client.workspaces.logo.remove({ workspaceId })
    await client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })

    const member = await joined(owner)
    await client.workspaces.members.setRole({ workspaceId, userId: member.user.id, role: "admin" })
    // Already admin: no change, no row.
    await client.workspaces.members.setRole({ workspaceId, userId: member.user.id, role: "admin" })

    const revoked = await client.workspaces.invitations.create({
      workspaceId,
      email: "revoked@example.com",
      role: "viewer",
    })
    await client.workspaces.invitations.revoke({ workspaceId, id: revoked.id })

    const { apiKey } = await client.workspaces.apiKeys.create({
      workspaceId,
      name: "Deploy",
      scopes: ["notes:read"],
      expiresInDays: 30,
    })
    await client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })

    const { endpoint } = await client.workspaces.webhooks.create({
      workspaceId,
      url: "https://hooks.example.com/in?token=secret",
      events: ["note.created"],
    })
    await client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      events: ["note.created", "note.deleted"],
    })
    await client.workspaces.webhooks.rotateSecret({ workspaceId, id: endpoint.id })
    await client.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })

    const removed = await joined(owner, "viewer")
    await client.workspaces.members.remove({ workspaceId, userId: removed.user.id })

    await client.workspaces.transferOwnership({ workspaceId, userId: member.user.id })
    await client.workspaces.leave({ workspaceId })

    // A note is not administrative: no row, with or without the workspace.
    await member.client.notes.create({ workspaceId, title: "t", body: "" })

    const rows = await rowsFor(workspaceId)
    expect(rows.map((r) => r.action)).toEqual([
      "workspace.created",
      "workspace.renamed",
      "workspace.logo_set",
      "workspace.logo_removed",
      "workspace.plan_changed",
      "invitation.created",
      "invitation.accepted",
      "member.role_changed",
      "invitation.created",
      "invitation.revoked",
      "workspace.api_key_created",
      "workspace.api_key_revoked",
      "workspace.webhook_created",
      "workspace.webhook_updated",
      "workspace.webhook_secret_rotated",
      "workspace.webhook_deleted",
      "invitation.created",
      "invitation.accepted",
      "member.removed",
      "workspace.ownership_transferred",
      "workspace.left",
    ])
    for (const row of rows) {
      expect(WORKSPACE_ACTIVITY_ACTIONS as readonly string[]).toContain(row.action)
      // Nobody was impersonating: the actor is the caller alone.
      expect(row.impersonated_user_id).toBeNull()
    }
    expect(await app.db.sql`SELECT id FROM audit_log WHERE action LIKE 'note.%'`).toHaveLength(0)

    const one = (action: string) => {
      const found = rows.filter((r) => r.action === action)
      expect(found).toHaveLength(1)
      return found[0] as Row
    }
    expect(one("workspace.created")).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "workspace",
      target_id: String(workspaceId),
    })
    expect(meta(one("workspace.created"))).toEqual({ name: "Notes" })
    expect(meta(one("workspace.renamed"))).toEqual({ from: "Notes", to: "Renamed" })
    expect(one("workspace.plan_changed")).toMatchObject({ actor_user_id: owner.user.id })
    expect(meta(one("workspace.plan_changed"))).toEqual({
      plan: "pro",
      interval: "month",
      status: "active",
    })
    expect(one("member.role_changed")).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "user",
      target_id: String(member.user.id),
    })
    expect(meta(one("member.role_changed"))).toEqual({ from: "member", to: "admin" })
    expect(one("invitation.revoked")).toMatchObject({
      target_type: "invitation",
      target_id: String(revoked.id),
    })
    // The invitee's address is stored masked: nothing downstream needs it in full.
    expect(meta(one("invitation.revoked"))).toEqual({ email: "r***@example.com", role: "viewer" })
    expect(meta(rows.find((r) => r.action === "invitation.created"))).toEqual({
      email: maskEmail(member.email),
      role: "member",
    })
    expect(one("workspace.api_key_created")).toMatchObject({
      target_type: "api_key",
      target_id: String(apiKey.id),
    })
    expect(meta(one("workspace.api_key_revoked"))).toMatchObject({
      name: "Deploy",
      scopes: ["notes:read"],
    })
    for (const action of [
      "workspace.webhook_created",
      "workspace.webhook_updated",
      "workspace.webhook_secret_rotated",
      "workspace.webhook_deleted",
    ]) {
      expect(one(action)).toMatchObject({ target_type: "webhook", target_id: String(endpoint.id) })
      expect(meta(one(action)).host).toBe("hooks.example.com")
      expect(one(action).metadata).not.toContain("secret")
    }
    expect(one("member.removed")).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "user",
      target_id: String(removed.user.id),
    })
    expect(one("workspace.ownership_transferred")).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "user",
      target_id: String(member.user.id),
    })
    expect(one("workspace.left")).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "user",
      target_id: String(owner.user.id),
    })
    // The joiner is the actor of their own join, the role they joined with kept.
    const accepted = rows.filter((r) => r.action === "invitation.accepted")
    expect(accepted.map((r) => [r.actor_user_id, r.target_id, meta(r)])).toEqual([
      [member.user.id, String(member.user.id), { role: "member" }],
      [removed.user.id, String(removed.user.id), { role: "viewer" }],
    ])
  })

  test("a plan change from a provider webhook has no actor (the system)", async () => {
    const owner = await signUpWithWorkspace(app)
    // The mock's own `change` with no caller is the shape a webhook takes: nobody to name.
    await app.billing.change(owner.workspaceId, "team", "year")
    const [row, ...rest] = await rowsOf(owner.workspaceId, "workspace.plan_changed")
    expect(rest).toEqual([])
    expect(row).toMatchObject({ actor_user_id: null, impersonated_user_id: null })
    expect(meta(row)).toEqual({ plan: "team", interval: "year", status: "active" })
    // Cancelling back to Free is a change too; the same plan again is not.
    await app.billing.change(owner.workspaceId, "team", "year")
    await app.billing.change(owner.workspaceId, "cancel", "year")
    const rows = await rowsOf(owner.workspaceId, "workspace.plan_changed")
    expect(rows.map(meta)).toEqual([
      { plan: "team", interval: "year", status: "active" },
      { plan: "free", interval: "year", status: "canceled" },
    ])
  })

  test("the cancellation ahead of deleting a workspace records nothing", async () => {
    const owner = await signUpWithWorkspace(app)
    await owner.client.billing.mockChange({
      workspaceId: owner.workspaceId,
      plan: "pro",
      interval: "month",
    })
    await owner.client.workspaces.delete({ workspaceId: owner.workspaceId })
    // The live subscription was cancelled with the (mock) provider first — a plan change to
    // Free in the mirror — yet only the upgrade's row is there.
    expect((await rowsOf(owner.workspaceId, "workspace.plan_changed")).map(meta)).toEqual([
      { plan: "pro", interval: "month", status: "active" },
    ])
  })

  test("while impersonating: the admin is the actor and the member is named as impersonated", async () => {
    const owner = await signUpWithWorkspace(app)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: {},
    })
    const asOwner = clientFor(app, token)
    await asOwner.workspaces.update({ workspaceId: owner.workspaceId, name: "By support" })
    const note = await asOwner.notes.create({
      workspaceId: owner.workspaceId,
      title: "n",
      body: "",
    })

    const [renamed] = await rowsOf(owner.workspaceId, "workspace.renamed")
    expect(renamed).toMatchObject({
      actor_user_id: root.user.id,
      impersonated_user_id: owner.user.id,
    })
    // Notes keep their impersonation-only row, and it never carries the workspace.
    const notes = (await app.db.sql`
      SELECT * FROM audit_log WHERE action = 'note.created' AND target_id = ${String(note.id)}
    `) as Row[]
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ workspace_id: null, actor_user_id: root.user.id })
  })

  test("the superadmin's workspace filter still finds rows that target a member", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await joined(owner)
    await owner.client.workspaces.members.setRole({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
      role: "viewer",
    })
    const { items } = await root.client.admin.audit.list({
      targetType: "workspace",
      targetId: String(owner.workspaceId),
    })
    expect(items.map((e) => e.action)).toEqual([
      "member.role_changed",
      "invitation.accepted",
      "invitation.created",
      "workspace.created",
    ])
    const detail = await root.client.admin.workspaces.get({ id: owner.workspaceId })
    expect(detail.audit.map((e) => e.action)).toContain("member.role_changed")
  })
})

describe("a change that rolls back records nothing", () => {
  test("a failure after the row is written rolls back the row and the change", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await joined(owner)
    const before = await rowsFor(owner.workspaceId)
    // The row is written inside the transaction, then the transaction fails.
    const restore = patchTransactions((tx) => ({
      ...tx,
      audit: {
        ...tx.audit,
        create: async (input) => {
          await tx.audit.create(input)
          throw new Error("after the audit row")
        },
      },
    }))
    const [roleError] = await safe(
      owner.client.workspaces.members.setRole({
        workspaceId: owner.workspaceId,
        userId: member.user.id,
        role: "admin",
      })
    )
    const [renameError] = await safe(
      owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "Never" })
    )
    const [inviteError] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: "never@example.com",
        role: "member",
      })
    )
    restore()
    expect(roleError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(renameError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(inviteError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await rowsFor(owner.workspaceId)).toEqual(before)
    // …and the changes themselves did not happen.
    const { items } = await owner.client.workspaces.members.list({
      workspaceId: owner.workspaceId,
    })
    expect(items.find((m) => m.userId === member.user.id)?.role).toBe("member")
    expect((await owner.client.workspaces.get({ workspaceId: owner.workspaceId })).name).toBe(
      "Notes"
    )
    expect(
      (await owner.client.workspaces.invitations.list({ workspaceId: owner.workspaceId })).items
    ).toEqual([])
  })

  /** Until restored, every transaction's audit write succeeds and then fails the transaction. */
  const failAfterAudit = () =>
    patchTransactions((tx) => ({
      ...tx,
      audit: {
        ...tx.audit,
        create: async (input) => {
          await tx.audit.create(input)
          throw new Error("after the audit row")
        },
      },
    }))

  test("an invitation revoke that rolls back keeps the invitation and records nothing", async () => {
    const owner = await signUpWithWorkspace(app)
    const invite = await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: "kept@example.com",
      role: "viewer",
    })
    const restore = failAfterAudit()
    const [error] = await safe(
      owner.client.workspaces.invitations.revoke({ workspaceId: owner.workspaceId, id: invite.id })
    ).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await rowsOf(owner.workspaceId, "invitation.revoked")).toEqual([])
    const { items } = await owner.client.workspaces.invitations.list({
      workspaceId: owner.workspaceId,
    })
    expect(items.map((i) => i.id)).toEqual([invite.id])
  })

  test("a logo set or remove that rolls back keeps the logo, records nothing and cleans up", async () => {
    const owner = await signUpWithWorkspace(app)
    const { workspaceId, client } = owner
    const { logoUrl } = await client.workspaces.logo.set({ workspaceId, file: png() })
    await app.drain()
    const keys = async () => {
      const found: string[] = []
      for await (const object of app.storage.list(`logos/${workspaceId}/`)) found.push(object.key)
      return found.sort()
    }
    const kept = await keys()
    expect(kept).toHaveLength(1)
    const before = await rowsFor(workspaceId)

    let restore = failAfterAudit()
    const [setError] = await safe(client.workspaces.logo.set({ workspaceId, file: png() })).finally(
      restore
    )
    expect(setError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    // The new key never committed: the old logo is still the workspace's, no row was written…
    expect((await client.workspaces.get({ workspaceId })).logoUrl).toBe(logoUrl)
    expect(await rowsFor(workspaceId)).toEqual(before)
    // …and the object the failed set wrote was queued for storage.delete, the old one kept.
    await app.drain()
    expect(await keys()).toEqual(kept)

    restore = failAfterAudit()
    const [removeError] = await safe(client.workspaces.logo.remove({ workspaceId })).finally(
      restore
    )
    expect(removeError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect((await client.workspaces.get({ workspaceId })).logoUrl).toBe(logoUrl)
    expect(await rowsFor(workspaceId)).toEqual(before)
    // The logo it kept is not queued for deletion.
    await app.drain()
    expect(await keys()).toEqual(kept)
  })

  test("an accept that rolls back leaves the invitation pending and records nothing", async () => {
    const owner = await signUpWithWorkspace(app)
    const invitee = await signUpVerified(app)
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: invitee.email,
      role: "member",
    })
    const { pendingInvitations } = await invitee.client.workspaces.list()
    const id = pendingInvitations[0]?.id as number
    const restore = failAfterAudit()
    const [error] = await safe(invitee.client.invitations.acceptById({ id })).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await rowsOf(owner.workspaceId, "invitation.accepted")).toEqual([])
    expect((await invitee.client.workspaces.list()).pendingInvitations.map((i) => i.id)).toEqual([
      id,
    ])
    expect(await app.db.memberships.find(owner.workspaceId, invitee.user.id)).toBeUndefined()
  })

  test("an accept refused for seats records nothing and leaves the invitation pending", async () => {
    // Free holds 3 seats: the owner and two members. The third invitee's accept is refused.
    const owner = await signUpWithWorkspace(app)
    const invitees = [
      await signUpVerified(app),
      await signUpVerified(app),
      await signUpVerified(app),
    ]
    for (const invitee of invitees)
      await owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: invitee.email,
        role: "member",
      })
    const pendingFor = async (invitee: (typeof invitees)[number]) =>
      (await invitee.client.workspaces.list()).pendingInvitations.map((i) => i.id)
    for (const invitee of invitees.slice(0, 2)) {
      const [id] = await pendingFor(invitee)
      await invitee.client.invitations.acceptById({ id: id as number })
    }
    const last = invitees[2] as (typeof invitees)[number]
    const pending = await pendingFor(last)
    const [error] = await safe(last.client.invitations.acceptById({ id: pending[0] as number }))
    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(await pendingFor(last)).toEqual(pending)
    const accepted = await rowsOf(owner.workspaceId, "invitation.accepted")
    expect(accepted.map((r) => r.actor_user_id)).toEqual(invitees.slice(0, 2).map((i) => i.user.id))
  })

  test("a removal or a leave that rolls back keeps the member and records nothing", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await joined(owner)
    const restore = failAfterAudit()
    const [removeError] = await safe(
      owner.client.workspaces.members.remove({
        workspaceId: owner.workspaceId,
        userId: member.user.id,
      })
    )
    const [leaveError] = await safe(
      member.client.workspaces.leave({ workspaceId: owner.workspaceId })
    )
    restore()
    expect(removeError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(leaveError).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await rowsOf(owner.workspaceId, "member.removed")).toEqual([])
    expect(await rowsOf(owner.workspaceId, "workspace.left")).toEqual([])
    expect(await app.db.memberships.find(owner.workspaceId, member.user.id)).toMatchObject({
      role: "member",
    })
  })

  test("a billing event that rolls back changes no plan and records nothing", async () => {
    const owner = await signUpWithWorkspace(app)
    const restore = failAfterAudit()
    const [error] = await safe(
      owner.client.billing.mockChange({
        workspaceId: owner.workspaceId,
        plan: "pro",
        interval: "month",
      })
    ).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await rowsOf(owner.workspaceId, "workspace.plan_changed")).toEqual([])
    expect(await app.db.billing.subscriptions.latest(owner.workspaceId)).toBeUndefined()
    expect((await owner.client.billing.get({ workspaceId: owner.workspaceId })).plan).toBe("free")
  })

  test("a row written through a transaction commits only with it", async () => {
    const owner = await signUpWithWorkspace(app)
    const [error] = await safe(
      app.db.transaction(async (tx) => {
        await auditWorkspace({ db: tx, user: null }, owner.workspaceId, {
          action: "workspace.renamed",
        })
        throw new Error("roll back")
      })
    )
    expect(error).toBeInstanceOf(Error)
    expect(await rowsOf(owner.workspaceId, "workspace.renamed")).toEqual([])
    await app.db.transaction((tx) =>
      auditWorkspace({ db: tx }, owner.workspaceId, { action: "workspace.renamed" })
    )
    expect(await rowsOf(owner.workspaceId, "workspace.renamed")).toHaveLength(1)
  })
})

describe("auditWorkspace", () => {
  test("no user: the system — no actor, nothing impersonated", async () => {
    const owner = await signUpWithWorkspace(app)
    await auditWorkspace({ db: app.db }, owner.workspaceId, {
      action: "workspace.webhook_disabled",
      targetType: "webhook",
      targetId: 1,
      metadata: { reason: "gone" },
    })
    const [row] = await rowsOf(owner.workspaceId, "workspace.webhook_disabled")
    expect(row).toMatchObject({ actor_user_id: null, impersonated_user_id: null, target_id: "1" })
    expect(meta(row)).toEqual({ reason: "gone" })
  })

  test("an API key: no actor, the key named in the metadata so it renders once the key is gone", async () => {
    const owner = await signUpWithWorkspace(app)
    await auditWorkspace({ db: app.db, apiKey: { id: 41, name: "Importer" } }, owner.workspaceId, {
      action: "workspace.renamed",
      metadata: { from: "a", to: "b" },
    })
    const [row] = await rowsOf(owner.workspaceId, "workspace.renamed")
    expect(row).toMatchObject({ actor_user_id: null, impersonated_user_id: null })
    expect(meta(row)).toEqual({ from: "a", to: "b", apiKeyId: 41, apiKeyName: "Importer" })
  })

  test("a session user wins over a key: the actor is the user, no key in the metadata", async () => {
    const owner = await signUpWithWorkspace(app)
    const user = await app.db.users.find(owner.user.id)
    await auditWorkspace(
      { db: app.db, user, impersonator: null, apiKey: { id: 1, name: "x" } },
      owner.workspaceId,
      { action: "workspace.logo_set" }
    )
    const [row] = await rowsOf(owner.workspaceId, "workspace.logo_set")
    expect(row).toMatchObject({ actor_user_id: owner.user.id, metadata: null })
  })
})
