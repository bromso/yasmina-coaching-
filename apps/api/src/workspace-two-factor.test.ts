import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { type ApiClient, WORKSPACE_TWO_FACTOR_REASON } from "@repo/api-contract"
import { invitationSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { requiresTwoFactor } from "./queries/workspaces"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  openStream,
  type SseFrame,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"

// Enforced two-step verification per workspace (Phase 12 B), the api side: a workspace that
// requires it refuses every `member(min)` procedure and the realtime stream to a member with
// neither two-step on nor a passkey; `workspaces.list`, `workspaces.leave`, the invitation
// procedures and everything account-level stay open so they can always fix it or leave. The
// setting itself (`workspaces.security.*`) is a later task: these tests write the flag directly.

const ROOT = "root@example.com"
type App = Awaited<ReturnType<typeof start>>
let app: App
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    realtimeRecheckMs: 100,
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const setRequired = async (workspaceId: number, on: boolean) => {
  await app.db
    .sql`UPDATE workspaces SET require_two_factor = ${on ? 1 : 0} WHERE id = ${workspaceId}`
}

let credentials = 0
const addPasskey = (userId: number) =>
  app.db.passkeys.create({
    userId,
    credentialId: `cred-${++credentials}-${userId}`,
    publicKey: "pk",
    counter: 0,
    transports: null,
    name: "Key",
  })

/**
 * An owner with two-step on and a workspace named `name` that requires it, plus a verified member
 * (role `role`) with neither two-step nor a passkey.
 */
async function requiringWorkspace(role: "viewer" | "member" | "admin" = "admin", name = "Acme") {
  const owner = await signUpWithWorkspace(app)
  await enableTwoFactor(app, owner.user.id)
  await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name })
  const member = await signUpVerified(app)
  await app.db.memberships.add({ workspaceId: owner.workspaceId, userId: member.user.id, role })
  await setRequired(owner.workspaceId, true)
  return { owner, member, workspaceId: owner.workspaceId, name }
}

/** The refusal, with exactly the reason in `data` (no member, count or factor detail). */
async function expectBlocked(call: Promise<unknown>, name = "Acme") {
  const [error, , isDefined] = await safe(call)
  expect(error).toMatchObject({
    code: "FORBIDDEN",
    status: 403,
    message: `Turn on two-step verification to access ${name}.`,
    data: { reason: WORKSPACE_TWO_FACTOR_REASON },
  })
  expect((error as unknown as { data: object }).data).toEqual({ reason: "two_factor_required" })
  // Declared (validated against the procedure's FORBIDDEN), so the Next apps' `apiError` sees it.
  expect(isDefined).toBe(true)
}

describe("the requirement off (the default)", () => {
  test("a member without two-step uses the workspace as before; the flags read false", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await signUpVerified(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
      role: "member",
    })
    const workspaceId = owner.workspaceId
    expect((await member.client.notes.list({ workspaceId })).items).toEqual([])
    expect((await member.client.workspaces.get({ workspaceId })).requireTwoFactor).toBe(false)
    const listed = await member.client.workspaces.list()
    expect(listed.items.find((w) => w.id === workspaceId)?.requireTwoFactor).toBe(false)
    expect((await member.client.auth.me()).user.twoFactorSatisfied).toBe(false)
    expect(member.user.twoFactorSatisfied).toBe(false)
  })

  test("a new workspace's row reads as not requiring it", async () => {
    const owner = await signUpWithWorkspace(app)
    const row = await app.db.workspaces.find(owner.workspaceId)
    expect(row && requiresTwoFactor(row)).toBe(false)
  })
})

describe("a workspace that requires two-step verification", () => {
  const scoped: Array<[string, (c: ApiClient, workspaceId: number) => Promise<unknown>]> = [
    ["notes.list", (c, workspaceId) => c.notes.list({ workspaceId })],
    ["notes.find", (c, workspaceId) => c.notes.find({ workspaceId, id: 1 })],
    ["notes.create", (c, workspaceId) => c.notes.create({ workspaceId, title: "t", body: "b" })],
    ["notes.delete", (c, workspaceId) => c.notes.delete({ workspaceId, id: 1 })],
    ["workspaces.get", (c, workspaceId) => c.workspaces.get({ workspaceId })],
    ["workspaces.update", (c, workspaceId) => c.workspaces.update({ workspaceId, name: "Other" })],
    ["workspaces.members.list", (c, workspaceId) => c.workspaces.members.list({ workspaceId })],
    [
      "workspaces.members.setRole",
      (c, workspaceId) => c.workspaces.members.setRole({ workspaceId, userId: 1, role: "viewer" }),
    ],
    [
      "workspaces.members.remove",
      (c, workspaceId) => c.workspaces.members.remove({ workspaceId, userId: 1 }),
    ],
    [
      "workspaces.invitations.list",
      (c, workspaceId) => c.workspaces.invitations.list({ workspaceId }),
    ],
    [
      "workspaces.invitations.create",
      (c, workspaceId) =>
        c.workspaces.invitations.create({ workspaceId, email: "x@example.com", role: "member" }),
    ],
    [
      "workspaces.invitations.revoke",
      (c, workspaceId) => c.workspaces.invitations.revoke({ workspaceId, id: 1 }),
    ],
    ["workspaces.logo.remove", (c, workspaceId) => c.workspaces.logo.remove({ workspaceId })],
    ["workspaces.apiKeys.list", (c, workspaceId) => c.workspaces.apiKeys.list({ workspaceId })],
    [
      "workspaces.apiKeys.create",
      (c, workspaceId) =>
        c.workspaces.apiKeys.create({
          workspaceId,
          name: "CI",
          scopes: ["notes:read"],
          expiresInDays: 30,
        }),
    ],
    [
      "workspaces.apiKeys.revoke",
      (c, workspaceId) => c.workspaces.apiKeys.revoke({ workspaceId, id: 1 }),
    ],
    ["workspaces.webhooks.list", (c, workspaceId) => c.workspaces.webhooks.list({ workspaceId })],
    [
      "workspaces.webhooks.delete",
      (c, workspaceId) => c.workspaces.webhooks.delete({ workspaceId, id: 1 }),
    ],
    [
      "workspaces.webhooks.deliveries",
      (c, workspaceId) => c.workspaces.webhooks.deliveries({ workspaceId, id: 1 }),
    ],
    ["workspaces.activity.list", (c, workspaceId) => c.workspaces.activity.list({ workspaceId })],
    ["billing.get", (c, workspaceId) => c.billing.get({ workspaceId })],
  ]

  test.each(scoped)("%s refuses a member without two-step", async (_name, call) => {
    const { member, workspaceId } = await requiringWorkspace("admin")
    await expectBlocked(call(member.client, workspaceId))
  })

  test("the owner-only procedures refuse an owner without two-step too", async () => {
    // An owner who turned their own two-step off afterwards is blocked like anyone (Review
    // Focus 2) — the setting itself refuses to turn on while the owner is unsatisfied (Task 2).
    const owner = await signUpWithWorkspace(app)
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "Mine" })
    await setRequired(owner.workspaceId, true)
    const workspaceId = owner.workspaceId
    const c = owner.client
    for (const call of [
      () => c.workspaces.delete({ workspaceId }),
      () => c.workspaces.transferOwnership({ workspaceId, userId: owner.user.id + 1 }),
      () => c.billing.checkout({ workspaceId, plan: "pro", interval: "month" }),
      () => c.billing.portal({ workspaceId }),
      () => c.billing.mockChange({ workspaceId, plan: "pro", interval: "month" }),
    ]) {
      // One at a time: a promise made up front could reject before it is awaited.
      await expectBlocked(call(), "Mine")
    }
    // …and can still fix it: account-level procedures answer.
    expect((await c.auth.me()).user.twoFactorSatisfied).toBe(false)
    expect((await c.account.twoFactor.get()).enabled).toBe(false)
    expect(await c.account.passkeys.list()).toEqual([])
    // Nothing was deleted by the refused call.
    expect(await app.db.workspaces.find(workspaceId)).toBeDefined()
  })

  test("a role refusal still comes first (no two-step reason for a call the role forbids)", async () => {
    const { member, workspaceId } = await requiringWorkspace("viewer")
    const [error] = await safe(member.client.workspaces.invitations.list({ workspaceId }))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
    expect((error as { data?: unknown }).data).toBeUndefined()
  })

  test("a non-member still gets NOT_FOUND, never the two-step refusal", async () => {
    const { workspaceId } = await requiringWorkspace()
    const outsider = await signUpVerified(app)
    const [error] = await safe(outsider.client.notes.list({ workspaceId }))
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
  })

  test("the message is in the caller's language", async () => {
    const { member, workspaceId } = await requiringWorkspace("member", "Bolaget")
    const sv = clientFor(app, member.token, "sv")
    const [error] = await safe(sv.notes.list({ workspaceId }))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Slå på tvåstegsverifiering för att komma åt Bolaget.",
      data: { reason: "two_factor_required" },
    })
  })

  test("the owner, with two-step on, is not blocked; the flags read true", async () => {
    const { owner, workspaceId } = await requiringWorkspace()
    expect((await owner.client.notes.list({ workspaceId })).items).toEqual([])
    expect((await owner.client.workspaces.get({ workspaceId })).requireTwoFactor).toBe(true)
    expect((await owner.client.auth.me()).user.twoFactorSatisfied).toBe(true)
  })

  test("another workspace without the requirement stays open to the same member", async () => {
    const { member } = await requiringWorkspace()
    const own = await member.client.workspaces.create({ name: "Own" })
    expect((await member.client.notes.list({ workspaceId: own.id })).items).toEqual([])
  })
})

describe("what satisfies it, read fresh on every request", () => {
  test("a passkey alone satisfies it; removing the last one re-blocks the next request", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await expectBlocked(member.client.notes.list({ workspaceId }))

    const passkey = await addPasskey(member.user.id)
    expect((await member.client.notes.list({ workspaceId })).items).toEqual([])
    const me = await member.client.auth.me()
    expect(me.user.twoFactorSatisfied).toBe(true)
    expect(me.user.passkeys).toBe(1)

    await app.db.passkeys.delete(passkey.id, member.user.id)
    await expectBlocked(member.client.notes.list({ workspaceId }))
    expect((await member.client.auth.me()).user.twoFactorSatisfied).toBe(false)
  })

  test("two-step on satisfies it; turning it off re-blocks the very next request", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await enableTwoFactor(app, member.user.id)
    expect((await member.client.notes.list({ workspaceId })).items).toEqual([])
    expect((await member.client.auth.me()).user.twoFactorSatisfied).toBe(true)

    await app.db.twoFactor.disable(member.user.id)
    await expectBlocked(member.client.notes.list({ workspaceId }))
  })

  test("turning the requirement off unblocks at once", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await expectBlocked(member.client.notes.list({ workspaceId }))
    await setRequired(workspaceId, false)
    expect((await member.client.notes.list({ workspaceId })).items).toEqual([])
  })
})

describe("exempt, so a blocked member can always recover", () => {
  test("workspaces.list answers, naming the requirement", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    const listed = await member.client.workspaces.list()
    expect(listed.items.find((w) => w.id === workspaceId)).toMatchObject({
      requireTwoFactor: true,
      role: "member",
    })
  })

  test("account.* and auth.* answer", async () => {
    const { member } = await requiringWorkspace("member")
    expect((await member.client.auth.me()).user.id).toBe(member.user.id)
    expect((await member.client.account.twoFactor.get()).enabled).toBe(false)
    expect(await member.client.account.passkeys.list()).toEqual([])
    expect((await member.client.account.sessions.list()).items.length).toBeGreaterThan(0)
    await member.client.account.updateProfile({ name: "Still me" })
  })

  test("workspaces.leave works for a blocked member", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await member.client.workspaces.leave({ workspaceId })
    expect(await app.db.memberships.find(workspaceId, member.user.id)).toBeUndefined()
  })

  test("workspaces.leave keeps its last-owner rule for a blocked owner", async () => {
    const owner = await signUpWithWorkspace(app)
    await setRequired(owner.workspaceId, true)
    const [error] = await safe(owner.client.workspaces.leave({ workspaceId: owner.workspaceId }))
    expect(error).toMatchObject({ code: "CONFLICT", message: "Transfer ownership before leaving." })
  })

  test("an invitation can be previewed and accepted (by token and by id); the workspace then blocks", async () => {
    const { owner, workspaceId } = await requiringWorkspace()
    // Room for two more members (Free has three seats).
    await app.billing.change(workspaceId, "pro", "month")
    for (const by of ["token", "id"] as const) {
      const invitee = await signUpVerified(app)
      await owner.client.workspaces.invitations.create({
        workspaceId,
        email: invitee.email,
        role: "member",
      })
      const [mail] = await mailsTo(app, invitee.email, invitationSubject("Acme"))
      const token = mail?.text.match(/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""
      const preview = await clientFor(app).invitations.preview({ token })
      expect(preview.workspace.name).toBe("Acme")
      if (by === "token") {
        const accepted = await invitee.client.invitations.accept({ token })
        expect(accepted.workspace).toMatchObject({ id: workspaceId, requireTwoFactor: true })
      } else {
        const [pending] = (await invitee.client.workspaces.list()).pendingInvitations
        const accepted = await invitee.client.invitations.acceptById({ id: pending?.id ?? 0 })
        expect(accepted.workspace).toMatchObject({ id: workspaceId, requireTwoFactor: true })
      }
      await expectBlocked(invitee.client.notes.list({ workspaceId }))
    }
  })
})

describe("impersonation follows the member", () => {
  test("an impersonation session of a blocked member is blocked too", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    const { token } = await root.client.admin.users.impersonate({
      id: member.user.id,
      reason: "support",
    })
    const asMember = clientFor(app, token)
    await expectBlocked(asMember.notes.list({ workspaceId }))
    // The admin's own two-step does not stand in for the member's.
    await enableTwoFactor(app, root.user.id)
    await expectBlocked(asMember.notes.list({ workspaceId }))
    await asMember.admin.stopImpersonation()
  })

  test("an impersonation session of a satisfied member is not blocked", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await addPasskey(member.user.id)
    const { token } = await root.client.admin.users.impersonate({
      id: member.user.id,
      reason: "support",
    })
    const asMember = clientFor(app, token)
    expect((await asMember.notes.list({ workspaceId })).items).toEqual([])
    await asMember.admin.stopImpersonation()
  })
})

describe("/v1 API keys are unaffected", () => {
  test("a key keeps working in a workspace that requires two-step, even for an unsatisfied creator", async () => {
    const owner = await signUpWithWorkspace(app)
    await app.billing.change(owner.workspaceId, "pro", "month")
    const { key } = await owner.client.workspaces.apiKeys.create({
      workspaceId: owner.workspaceId,
      name: "CI",
      scopes: ["notes:read", "notes:write", "workspace:read"],
      expiresInDays: 30,
    })
    await setRequired(owner.workspaceId, true)
    // The creator (no two-step) is blocked in the app…
    await expectBlocked(
      owner.client.notes.list({ workspaceId: owner.workspaceId }),
      (await app.db.workspaces.find(owner.workspaceId))?.name
    )
    // …but the machine credential is not.
    const headers = { authorization: `Bearer ${key}` }
    const notes = await fetch(new URL("/v1/notes", app.server.url), { headers })
    expect(notes.status).toBe(200)
    const created = await fetch(new URL("/v1/notes", app.server.url), {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "From CI", body: "" }),
    })
    expect(created.status).toBe(201)
  })
})

describe("the realtime stream", () => {
  const resync = (frame: SseFrame) => frame.kind === "event" && frame.data.type === "resync"
  const within = async (promise: Promise<unknown>, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`not within ${ms} ms`)), ms)
    })
    try {
      await Promise.race([promise, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  test("a blocked member is refused with 403 two_factor_required; a satisfied one connects", async () => {
    const { owner, member, workspaceId } = await requiringWorkspace("member")
    const refused = await openStream(app, { workspaceId, token: member.token })
    expect(refused.status).toBe(403)
    expect(refused.text).toBe("two_factor_required")
    expect(refused.headers.get("cache-control")).toBe("no-store")

    const ok = await openStream(app, { workspaceId, token: owner.token })
    try {
      expect(ok.status).toBe(200)
      await ok.waitFor(resync)
    } finally {
      await ok.close()
    }
  })

  test("a non-member still gets 404 there, not 403", async () => {
    const { workspaceId } = await requiringWorkspace()
    const outsider = await signUpVerified(app)
    const refused = await openStream(app, { workspaceId, token: outsider.token })
    expect(refused.status).toBe(404)
  })

  test("turning two-step off closes an open stream within the recheck", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await enableTwoFactor(app, member.user.id)
    const stream = await openStream(app, { workspaceId, token: member.token })
    try {
      expect(stream.status).toBe(200)
      await stream.waitFor(resync)
      await app.db.twoFactor.disable(member.user.id)
      await within(stream.ended, 1_000)
      expect(stream.isDone()).toBe(true)
    } finally {
      await stream.close()
    }
  })

  test("removing the last passkey closes an open stream within the recheck", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    const passkey = await addPasskey(member.user.id)
    const stream = await openStream(app, { workspaceId, token: member.token })
    try {
      expect(stream.status).toBe(200)
      await stream.waitFor(resync)
      await app.db.passkeys.delete(passkey.id, member.user.id)
      await within(stream.ended, 1_000)
    } finally {
      await stream.close()
    }
  })

  test("the requirement turning on closes an unsatisfied member's open stream", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    await setRequired(workspaceId, false)
    const stream = await openStream(app, { workspaceId, token: member.token })
    try {
      expect(stream.status).toBe(200)
      await stream.waitFor(resync)
      await setRequired(workspaceId, true)
      await within(stream.ended, 1_000)
    } finally {
      await stream.close()
    }
  })

  test("an impersonation stream of a blocked member is refused too", async () => {
    const { member, workspaceId } = await requiringWorkspace("member")
    const { token } = await root.client.admin.users.impersonate({
      id: member.user.id,
      reason: "support",
    })
    const refused = await openStream(app, { workspaceId, token })
    expect(refused.status).toBe(403)
    expect(refused.text).toBe("two_factor_required")
    await clientFor(app, token).admin.stopImpersonation()
  })
})
