import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { WORKSPACE_ACTIVITY_DAYS } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { auditWorkspace } from "./admin"
import { clientFor, signUpVerified, signUpWithWorkspace, start } from "./test-server"
import { activityDetails, decodeActivityCursor, encodeActivityCursor } from "./workspace-activity"

// Phase 12 A, task 2: `workspaces.activity.list` reads a workspace's activity back for its admins,
// never naming platform staff, never crossing workspaces, never older than 90 days.

const ROOT = "activity-list-root@example.com"
const DAY_MS = 86_400_000
/** The server's clock (`Context.now()`): the real time unless a test pins it. */
let pinned: Date | null = null
let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    now: () => pinned ?? new Date(),
  })
  root = await signUpVerified(app, ROOT)
  // A name to look for: staff must appear nowhere in a workspace's log.
  await app.db.sql`UPDATE users SET name = ${"Platform Staffer"} WHERE id = ${root.user.id}`
  root.user.name = "Platform Staffer"
})
afterAll(() => app.stop())

type Owner = Awaited<ReturnType<typeof signUpWithWorkspace>>

/** An invited, verified account that has accepted and is now a member with `role`. */
async function joined(owner: Owner, role: "viewer" | "member" | "admin" = "member") {
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

const list = (owner: Owner, extra: Record<string, unknown> = {}) =>
  owner.client.workspaces.activity.list({ workspaceId: owner.workspaceId, ...extra })

describe("workspaces.activity.list", () => {
  test("newest first: member actors with their address, target labels, allowlisted details", async () => {
    const owner = await signUpWithWorkspace(app)
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "Renamed" })
    const member = await joined(owner, "member")
    await owner.client.workspaces.members.setRole({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
      role: "admin",
    })

    const { items, nextCursor } = await list(owner)
    expect(nextCursor).toBeNull()
    expect(items.map((item) => item.action)).toEqual([
      "member.role_changed",
      "invitation.accepted",
      "invitation.created",
      "workspace.renamed",
      "workspace.created",
    ])
    const byOwner = {
      kind: "member",
      userId: owner.user.id,
      name: owner.user.name,
      email: owner.email,
      bySupport: false,
    }
    const [roleChanged, accepted, invited, renamed, created] = items
    expect(roleChanged).toMatchObject({
      actor: byOwner,
      target: { type: "user", id: String(member.user.id), label: member.user.name },
      details: { from: "member", to: "admin" },
    })
    expect(accepted).toMatchObject({
      actor: { kind: "member", userId: member.user.id, email: member.email, bySupport: false },
      details: { role: "member" },
    })
    expect(invited?.details).toEqual({ role: "member", email: expect.stringContaining("***@") })
    expect(invited?.target).toMatchObject({ type: "invitation", label: null })
    expect(renamed).toMatchObject({
      actor: byOwner,
      target: { type: "workspace", id: String(owner.workspaceId), label: null },
      details: { from: "Notes", to: "Renamed" },
    })
    expect(created?.details).toEqual({ name: "Notes" })
    // Never network details or an admin's reason.
    const text = JSON.stringify(items)
    for (const key of ["ip", "user_agent", "userAgent", "reason", "impersonated"])
      expect(text).not.toContain(`"${key}"`)
  })

  test("a member who has left keeps their name but not their address; current members keep both", async () => {
    const owner = await signUpWithWorkspace(app)
    const leaver = await joined(owner, "admin")
    const removed = await joined(owner, "admin")
    await leaver.client.workspaces.update({ workspaceId: owner.workspaceId, name: "By leaver" })
    await removed.client.workspaces.update({ workspaceId: owner.workspaceId, name: "By removed" })
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "By owner" })
    const actors = async () =>
      (await list(owner, { action: "workspace.renamed" })).items.map((item) => item.actor)

    expect(await actors()).toEqual([
      { kind: "member", userId: owner.user.id, name: "", email: owner.email, bySupport: false },
      { kind: "member", userId: removed.user.id, name: "", email: removed.email, bySupport: false },
      { kind: "member", userId: leaver.user.id, name: "", email: leaver.email, bySupport: false },
    ])

    await app.db.sql`UPDATE users SET name = ${"Left Person"} WHERE id = ${leaver.user.id}`
    await leaver.client.workspaces.leave({ workspaceId: owner.workspaceId })
    await owner.client.workspaces.members.remove({
      workspaceId: owner.workspaceId,
      userId: removed.user.id,
    })
    expect(await actors()).toEqual([
      { kind: "member", userId: owner.user.id, name: "", email: owner.email, bySupport: false },
      { kind: "member", userId: removed.user.id, name: "", email: null, bySupport: false },
      {
        kind: "member",
        userId: leaver.user.id,
        name: "Left Person",
        email: null,
        bySupport: false,
      },
    ])
    // Their join and departure rows name them without an address too.
    const text = JSON.stringify(await list(owner))
    expect(text).not.toContain(leaver.email)
    expect(text).not.toContain(removed.email)
    expect(text).toContain(owner.email)
  })

  test("admins read it; members and viewers are refused; a non-member gets NOT_FOUND", async () => {
    const owner = await signUpWithWorkspace(app)
    const admin = await joined(owner, "admin")
    const plain = await joined(owner, "member")
    const stranger = await signUpWithWorkspace(app)
    const read = (client: typeof owner.client) =>
      safe(client.workspaces.activity.list({ workspaceId: owner.workspaceId }))

    const [adminError, page] = await read(admin.client)
    expect(adminError).toBeNull()
    expect(page?.items.length).toBeGreaterThan(0)
    for (const role of ["member", "viewer"] as const) {
      await owner.client.workspaces.members.setRole({
        workspaceId: owner.workspaceId,
        userId: plain.user.id,
        role,
      })
      const [error] = await read(plain.client)
      expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
    }
    const [strangerError] = await read(stranger.client)
    expect(strangerError).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
  })

  test("the action filter narrows the list; an action outside the list is a 400", async () => {
    const owner = await signUpWithWorkspace(app)
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "One" })
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "Two" })
    const { items } = await list(owner, { action: "workspace.renamed" })
    expect(items.map((item) => item.details)).toEqual([
      { from: "One", to: "Two" },
      { from: "Notes", to: "One" },
    ])
    for (const action of ["note.created", "user.suspended", "impersonation.started", ""]) {
      const [error] = await safe(list(owner, { action }))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  })

  test("keyset pages on (at, id): ties on `at` are split by id, nothing repeats or is skipped", async () => {
    const owner = await signUpWithWorkspace(app)
    for (const name of ["a", "b", "c", "d"])
      await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name })
    // Two rows sharing one instant: the id alone must order them.
    const at = new Date().toISOString()
    await app.db.sql`UPDATE audit_log SET at = ${at}
      WHERE workspace_id = ${owner.workspaceId} AND action = 'workspace.renamed'`
    const all = (await list(owner)).items.map((item) => item.id)
    expect(all).toHaveLength(5)

    const seen: number[] = []
    let cursor: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await list(owner, { limit: 2, ...(cursor ? { cursor } : {}) })
      seen.push(...result.items.map((item) => item.id))
      if (!result.nextCursor) break
      cursor = result.nextCursor
    }
    expect(seen).toEqual(all)
    expect(all.slice(1, 4)).toEqual([...all.slice(1, 4)].sort((x, y) => y - x))
  })

  test("a malformed cursor or an out-of-range limit is a 400", async () => {
    const owner = await signUpWithWorkspace(app)
    for (const cursor of [
      "nope",
      "2026-10-19T10:00:00.000Z",
      "2026-10-19T10:00:00.000Z_0",
      "2026-02-30T10:00:00.000Z_5",
      // An impossible date is an Invalid Date, whose toISOString throws: still a 400, never a 500.
      "2026-13-01T00:00:00.000Z_5",
      "2026-10-19T25:00:00.000Z_5",
      "2026-10-19T10:00:00.000Z_99999999999",
      "2026-10-19 10:00:00_5",
      "' OR 1=1 --_5",
    ]) {
      const [error] = await safe(list(owner, { cursor }))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
    for (const limit of [0, 101]) {
      const [error] = await safe(list(owner, { limit }))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  })

  test("never another workspace's rows or a platform row, even through a forged cursor", async () => {
    const owner = await signUpWithWorkspace(app)
    const other = await signUpWithWorkspace(app)
    await other.client.workspaces.update({ workspaceId: other.workspaceId, name: "Elsewhere" })
    // A platform row about this workspace (no workspace_id), as an admin action writes it.
    await app.db.audit.create({
      actorUserId: root.user.id,
      impersonatedUserId: null,
      action: "workspace.renamed",
      targetType: "workspace",
      targetId: String(owner.workspaceId),
      reason: "platform",
      ip: null,
      userAgent: null,
      metadata: JSON.stringify({ from: "x", to: "y" }),
    })
    // A non-activity action that names the workspace.
    await auditWorkspace({ db: app.db }, owner.workspaceId, {
      action: "user.suspended",
      targetType: "user",
      targetId: owner.user.id,
    })
    const forged = encodeActivityCursor({ at: "9999-12-31T23:59:59.999Z", id: 2_147_483_647 })
    for (const extra of [{}, { cursor: forged }]) {
      const { items } = await list(owner, extra)
      expect(items.map((item) => item.action)).toEqual(["workspace.created"])
    }
    const [error] = await safe(
      owner.client.workspaces.activity.list({ workspaceId: other.workspaceId })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("impersonated actions show the member, by support; staff appear nowhere", async () => {
    const owner = await signUpWithWorkspace(app)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
    })
    const asOwner = clientFor(app, token)
    await asOwner.workspaces.update({ workspaceId: owner.workspaceId, name: "By support" })

    // The impersonation session may read it too (read-only).
    const seenBySupport = await asOwner.workspaces.activity.list({ workspaceId: owner.workspaceId })
    const seenByOwner = await list(owner)
    for (const page of [seenBySupport, seenByOwner]) {
      const [renamed] = page.items
      expect(renamed).toMatchObject({
        action: "workspace.renamed",
        actor: { kind: "member", userId: owner.user.id, email: owner.email, bySupport: true },
      })
      const text = JSON.stringify(page)
      expect(text).not.toContain(ROOT)
      expect(text).not.toContain(root.user.name)
      expect(text).not.toContain("203.0.113.7")
      expect(text).not.toContain("AdminBrowser")
      expect(text).not.toContain('"support"')
      const ids = page.items.flatMap((item) =>
        item.actor.kind === "member" ? [item.actor.userId] : []
      )
      expect(ids).not.toContain(root.user.id)
    }
  })

  test("a purged member renders as deleted, also when support acted as them", async () => {
    const owner = await signUpWithWorkspace(app)
    const admin = await joined(owner, "admin")
    await admin.client.workspaces.update({ workspaceId: owner.workspaceId, name: "By admin" })
    const { token } = await root.client.admin.users.impersonate({
      id: admin.user.id,
      reason: "support",
    })
    await clientFor(app, token).workspaces.update({
      workspaceId: owner.workspaceId,
      name: "By support",
    })
    await app.db.transaction((tx) => tx.users.purge(admin.user.id, new Date().toISOString()))

    const { items } = await list(owner, { action: "workspace.renamed" })
    expect(items.map((item) => item.actor)).toEqual([{ kind: "deleted" }, { kind: "deleted" }])
    expect(JSON.stringify(items)).not.toContain(ROOT)
    // The member's join and removal still render, their target label gone with the account.
    const { items: accepted } = await list(owner, { action: "invitation.accepted" })
    const mine = accepted.find((item) => item.target?.id === String(admin.user.id))
    expect(mine).toMatchObject({ actor: { kind: "deleted" }, target: { label: null } })
  })

  test("API keys: named from the row, or the key while it exists; a deleted key still renders", async () => {
    const owner = await signUpWithWorkspace(app)
    const [key] = (await app.db.sql`
      INSERT INTO api_keys (workspace_id, name, prefix, secret_hash, scopes, created_by, created_at)
      VALUES (${owner.workspaceId}, ${"Live key"}, ${`p${Date.now().toString(36).slice(-7)}`},
        ${"h"}, ${'["notes:read"]'}, ${owner.user.id}, ${new Date().toISOString()})
      RETURNING id
    `) as { id: number }[]
    const keyId = Number(key?.id)
    await auditWorkspace(
      { db: app.db, apiKey: { id: keyId, name: "Importer" } },
      owner.workspaceId,
      {
        action: "workspace.renamed",
        metadata: { from: "a", to: "b" },
      }
    )
    // A row naming the key by id only falls back to the key's current name.
    await app.db.audit.create({
      actorUserId: null,
      impersonatedUserId: null,
      action: "workspace.renamed",
      targetType: "workspace",
      targetId: String(owner.workspaceId),
      reason: null,
      ip: null,
      userAgent: null,
      metadata: JSON.stringify({ from: "b", to: "c", apiKeyId: keyId }),
      workspaceId: owner.workspaceId,
    })
    await auditWorkspace({ db: app.db, user: null }, owner.workspaceId, {
      action: "workspace.api_key_revoked",
      targetType: "api_key",
      targetId: keyId,
      metadata: { name: "Revoked key", prefix: "abcdefgh", scopes: ["notes:read"] },
    })
    const before = await list(owner)
    expect(
      before.items.slice(0, 3).map((item) => [item.actor, item.target?.label ?? null])
    ).toEqual([
      [{ kind: "deleted" }, "Revoked key"],
      [{ kind: "apiKey", id: keyId, name: "Live key" }, null],
      [{ kind: "apiKey", id: keyId, name: "Importer" }, null],
    ])
    expect(before.items[0]?.details).toEqual({ name: "Revoked key", scopes: ["notes:read"] })

    await app.db.sql`DELETE FROM api_keys WHERE id = ${keyId}`
    const after = await list(owner)
    expect(after.items.slice(0, 3).map((item) => item.actor)).toEqual([
      { kind: "deleted" },
      { kind: "apiKey", id: keyId, name: "" },
      { kind: "apiKey", id: keyId, name: "Importer" },
    ])
    expect(after.items[0]?.target?.label).toBe("Revoked key")
  })

  test("system rows: details cut to the allowlist, unparseable metadata still renders", async () => {
    const owner = await signUpWithWorkspace(app)
    await auditWorkspace({ db: app.db }, owner.workspaceId, {
      action: "workspace.webhook_disabled",
      targetType: "webhook",
      targetId: 7,
      metadata: {
        endpointId: 7,
        host: "hooks.example.com",
        events: ["note.created"],
        reason: "failures",
        consecutiveFailures: 5,
      },
    })
    await app.db.audit.create({
      actorUserId: null,
      impersonatedUserId: null,
      action: "workspace.plan_changed",
      targetType: "workspace",
      targetId: String(owner.workspaceId),
      reason: null,
      ip: "198.51.100.1",
      userAgent: "Stripe/1.0",
      metadata: "{not json",
      workspaceId: owner.workspaceId,
    })
    const { items } = await list(owner)
    expect(items[0]).toMatchObject({
      action: "workspace.plan_changed",
      actor: { kind: "system" },
      details: {},
    })
    expect(items[1]).toMatchObject({
      action: "workspace.webhook_disabled",
      actor: { kind: "system" },
      target: { type: "webhook", id: "7", label: "hooks.example.com" },
    })
    expect(items[1]?.details).toEqual({
      host: "hooks.example.com",
      events: ["note.created"],
      reason: "failures",
    })
    expect(JSON.stringify(items)).not.toMatch(/endpointId|consecutiveFailures|198\.51|Stripe/)
  })

  test("a row exactly 90 days old is shown; a millisecond later it is not", async () => {
    const owner = await signUpWithWorkspace(app)
    const [row] = (await app.db.sql`
      SELECT at FROM audit_log WHERE workspace_id = ${owner.workspaceId}
    `) as { at: string }[]
    const at = Date.parse(row?.at as string)
    try {
      pinned = new Date(at + WORKSPACE_ACTIVITY_DAYS * DAY_MS)
      expect((await list(owner)).items.map((item) => item.action)).toEqual(["workspace.created"])
      pinned = new Date(at + WORKSPACE_ACTIVITY_DAYS * DAY_MS + 1)
      expect((await list(owner)).items).toEqual([])
    } finally {
      pinned = null
    }
  })
})

describe("helpers", () => {
  test("a cursor round-trips", () => {
    const cursor = encodeActivityCursor({ at: "2026-10-19T10:00:00.000Z", id: 42 })
    expect(decodeActivityCursor(cursor)).toEqual({ at: "2026-10-19T10:00:00.000Z", id: 42 })
    expect(decodeActivityCursor("2026-10-19T10:00:00.000Z-42")).toBeUndefined()
  })

  test("details keep only allowlisted keys of the declared shape", () => {
    expect(
      activityDetails("workspace.webhook_updated", {
        host: "h.example.com",
        events: ["note.created", 3],
        endpointId: 1,
        enabled: true,
        changed: ["url"],
      })
    ).toEqual({ host: "h.example.com" })
    expect(activityDetails("workspace.webhook_created", { reason: "gone" })).toEqual({})
    expect(activityDetails("workspace.webhook_disabled", { reason: "manual" })).toEqual({})
    expect(activityDetails("workspace.renamed", { from: "a", to: { x: 1 }, name: "n" })).toEqual({
      from: "a",
    })
  })
})
