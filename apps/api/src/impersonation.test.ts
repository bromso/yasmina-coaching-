import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { type ApiClient, IMPERSONATING_MESSAGE } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { clientFor, providersWith, signUpVerified, signUpWithWorkspace, start } from "./test-server"

const ROOT = "root@example.com"
let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  // This file's table test and its siblings impersonate well past the production default (10 per
  // hour, per admin): raise it so the suite tests business logic, not its own rate limiter.
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

/** A verified owner with a workspace, and a client impersonating them. */
async function impersonatedOwner() {
  const owner = await signUpWithWorkspace(app)
  const { token } = await root.client.admin.users.impersonate({
    id: owner.user.id,
    reason: "support",
    client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
  })
  return { ...owner, asUser: clientFor(app, token) }
}

describe("blocked while impersonating", () => {
  const blocked: Array<
    [string, (c: ApiClient, workspaceId: number, userId: number) => Promise<unknown>]
  > = [
    [
      "account.changePassword",
      (c) =>
        c.account.changePassword({
          currentPassword: "correct horse battery",
          newPassword: "another horse battery",
        }),
    ],
    ["account.setPassword", (c) => c.account.setPassword({ password: "another horse battery" })],
    ["account.sessions.revoke", (c) => c.account.sessions.revoke({ id: 1 })],
    ["account.sessions.revokeOthers", (c) => c.account.sessions.revokeOthers()],
    [
      "account.identities.disconnect",
      (c) => c.account.identities.disconnect({ provider: "github" }),
    ],
    ["account.resendVerification", (c) => c.account.resendVerification()],
    ["notifications.markRead (all)", (c) => c.notifications.markRead({ all: true })],
    ["notifications.markRead (ids)", (c) => c.notifications.markRead({ ids: [1] })],
    [
      "billing.checkout",
      (c, workspaceId) => c.billing.checkout({ workspaceId, plan: "pro", interval: "month" }),
    ],
    ["billing.portal", (c, workspaceId) => c.billing.portal({ workspaceId })],
    [
      "billing.mockChange",
      (c, workspaceId) => c.billing.mockChange({ workspaceId, plan: "pro", interval: "month" }),
    ],
    ["workspaces.delete", (c, workspaceId) => c.workspaces.delete({ workspaceId })],
    [
      "workspaces.transferOwnership",
      (c, workspaceId, userId) => c.workspaces.transferOwnership({ workspaceId, userId }),
    ],
  ]

  test.each(blocked)("%s → FORBIDDEN %s", async (_name, call) => {
    const { asUser, workspaceId, user } = await impersonatedOwner()
    const [error] = await safe(call(asUser, workspaceId, user.id + 1))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
  })

  test("account.setPassword's impersonation refusal is a declared FORBIDDEN (no reason)", async () => {
    // The account app recognises declared errors only (`apiError` checks `defined`): the plain
    // FORBIDDEN validates against setPassword's declared one, whose `data` is optional.
    const { asUser } = await impersonatedOwner()
    const [error] = await safe(asUser.account.setPassword({ password: "another horse battery" }))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      defined: true,
      message: IMPERSONATING_MESSAGE,
    })
    expect((error as { data?: unknown }).data).toBeUndefined()
  })

  test("the same calls work for the user's own session (reads stay open while impersonating)", async () => {
    const { asUser, client, workspaceId } = await impersonatedOwner()
    // A read the account Security page needs while impersonating.
    expect((await asUser.account.sessions.list()).items.length).toBeGreaterThan(0)
    expect(await asUser.billing.get({ workspaceId })).toMatchObject({ plan: "free" })
    // And the real user is unaffected.
    await client.account.sessions.revokeOthers()
  })

  test("auth.oauth.callback refuses to connect a provider during an impersonation session", async () => {
    const withProvider = await start({
      superadminEmails: [ROOT],
      providers: providersWith(["github"]),
    })
    try {
      const rootHere = await signUpVerified(withProvider, ROOT)
      const owner = await signUpWithWorkspace(withProvider)
      const { token } = await rootHere.client.admin.users.impersonate({
        id: owner.user.id,
        reason: "support",
        client: {},
      })
      const asUser = clientFor(withProvider, token)
      await asUser.auth.oauth.start({ provider: "github" })
      const [error] = await safe(asUser.auth.oauth.callback({ provider: "github", code: "c" }))
      expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    } finally {
      await withProvider.stop()
    }
  })
})

describe("audited while impersonating", () => {
  test("notes, workspace, members, invitations and profile writes leave rows naming both", async () => {
    const { asUser, workspaceId, user } = await impersonatedOwner()
    const note = await asUser.notes.create({ workspaceId, title: "Hello", body: "" })
    await asUser.notes.delete({ workspaceId, id: note.id })
    const created = await asUser.workspaces.create({ name: "Second" })
    await asUser.workspaces.update({ workspaceId: created.id, name: "Second renamed" })
    await asUser.account.updateProfile({ name: "Renamed by admin" })
    const invite = await asUser.workspaces.invitations.create({
      workspaceId,
      email: "new@example.com",
      role: "member",
    })
    await asUser.workspaces.invitations.revoke({ workspaceId, id: invite.id })

    const { items } = await root.client.admin.audit.list({ actorId: root.user.id, limit: 20 })
    // Rows made *as* the user: the admin's own impersonation.started has no `impersonated`.
    const mine = items.filter((e) => e.impersonated?.id === user.id)
    expect(mine.map((e) => e.action)).toEqual([
      "invitation.revoked",
      "invitation.created",
      "profile.updated",
      "workspace.renamed",
      "workspace.created",
      "note.deleted",
      "note.created",
    ])
    expect(mine[1]).toMatchObject({
      actor: { id: root.user.id, email: ROOT },
      impersonated: { id: user.id, email: user.email },
      targetType: "invitation",
      targetId: String(invite.id),
      metadata: { email: "n***@example.com", role: "member" },
    })
    expect(mine.at(-1)).toMatchObject({
      action: "note.created",
      targetType: "note",
      targetId: String(note.id),
      metadata: { workspaceId },
    })
    expect(
      items.find((e) => e.action === "impersonation.started" && e.targetId === String(user.id))
    ).toMatchObject({ actor: { id: root.user.id }, impersonated: null })
  })

  test("the same note and profile writes by the user themself are not audited", async () => {
    const owner = await signUpWithWorkspace(app)
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "Mine", body: "" })
    await owner.client.account.updateProfile({ name: "Me" })
    const { items } = await root.client.admin.audit.list({ actorId: owner.user.id })
    // Only the workspace's own activity row (always recorded) — nothing for the note or profile.
    expect(items.map((e) => e.action)).toEqual(["workspace.created"])
  })

  test("accepting an invitation and member changes while impersonating are audited", async () => {
    const { asUser, client, workspaceId, user } = await impersonatedOwner()
    const invitee = await signUpVerified(app)
    const invite = await asUser.workspaces.invitations.create({
      workspaceId,
      email: invitee.email,
      role: "member",
    })
    // The invitee accepts on their own (not impersonated): a workspace activity row naming them
    // alone, with no `impersonated`.
    const { pendingInvitations } = await invitee.client.workspaces.list()
    await invitee.client.invitations.acceptById({ id: pendingInvitations[0]?.id ?? invite.id })
    await asUser.workspaces.members.setRole({ workspaceId, userId: invitee.user.id, role: "admin" })
    await asUser.workspaces.members.remove({ workspaceId, userId: invitee.user.id })
    const second = await asUser.workspaces.create({ name: "Leave me" })
    // Leaving as the only owner is CONFLICT; add a second owner first. `members.setRole` only
    // takes an ASSIGNABLE_ROLE ("owner" is rejected by the contract's input schema before the
    // request is even sent), and `transferOwnership` is one of the eleven handlers refused while
    // impersonating — so the promotion has to run on the real owner's own (non-impersonated)
    // session, `client`, same as the earlier `revokeOthers` call in the blocked-table test above.
    const other = await signUpVerified(app)
    const inv2 = await asUser.workspaces.invitations.create({
      workspaceId: second.id,
      email: other.email,
      role: "admin",
    })
    await other.client.invitations.acceptById({
      id: (await other.client.workspaces.list()).pendingInvitations[0]?.id ?? inv2.id,
    })
    await client.workspaces.transferOwnership({ workspaceId: second.id, userId: other.user.id })
    await asUser.workspaces.leave({ workspaceId: second.id })

    const { items } = await root.client.admin.audit.list({ actorId: root.user.id, limit: 30 })
    const actions = items.filter((e) => e.impersonated?.id === user.id).map((e) => e.action)
    // transferOwnership ran on the real session above, so its row names the owner, not the admin.
    expect(actions.slice(0, 6)).toEqual([
      "workspace.left",
      "invitation.created",
      "workspace.created",
      "member.removed",
      "member.role_changed",
      "invitation.created",
    ])
    const accepted = await root.client.admin.audit.list({ actorId: invitee.user.id })
    expect(accepted.items).toHaveLength(1)
    expect(accepted.items[0]).toMatchObject({ action: "invitation.accepted", impersonated: null })
  })

  test("invitations.accept while impersonating is audited as invitation.accepted", async () => {
    const host = await signUpWithWorkspace(app)
    const guest = await signUpVerified(app)
    const invite = await host.client.workspaces.invitations.create({
      workspaceId: host.workspaceId,
      email: guest.email,
      role: "viewer",
    })
    const { token } = await root.client.admin.users.impersonate({
      id: guest.user.id,
      reason: "accept for them",
      client: {},
    })
    const asGuest = clientFor(app, token)
    const pending = (await asGuest.workspaces.list()).pendingInvitations
    await asGuest.invitations.acceptById({ id: pending[0]?.id ?? invite.id })
    const { items } = await root.client.admin.audit.list({
      targetType: "workspace",
      targetId: String(host.workspaceId),
    })
    expect(items[0]).toMatchObject({
      action: "invitation.accepted",
      impersonated: { id: guest.user.id },
    })
  })
})
