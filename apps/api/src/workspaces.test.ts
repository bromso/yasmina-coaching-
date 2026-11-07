import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { type ApiClient, ROLES, type Role, SEAT_LIMIT_MESSAGE } from "@repo/api-contract"
import { invitationSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { applyBillingEvent } from "./billing/mirror"
import { newToken, tokenHash } from "./credentials"
import { clientFor, mailsTo, signUp, signUpWithWorkspace, start, verify } from "./test-server"

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

/** A signed-up account whose email is verified. */
async function verifiedUser(email?: string) {
  const user = await signUp(app, email)
  await verify(app, user.email)
  return user
}

const inviteLinkOf = (text: string | undefined) =>
  text?.match(/http:\/\/app\.example\.com\/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""

/** Invites `email` to the workspace and returns the token from the mailed link. */
async function invite(
  client: ApiClient,
  workspaceId: number,
  email: string,
  role: "viewer" | "member" | "admin" = "member"
) {
  const { name } = await client.workspaces.get({ workspaceId })
  const subject = invitationSubject(name)
  const before = app.mailer.sent.filter((m) => m.to === email && m.subject === subject).length
  await client.workspaces.invitations.create({ workspaceId, email, role })
  const mails = await mailsTo(app, email, subject, before + 1)
  return inviteLinkOf(mails.at(-1)?.text)
}

describe("workspaces.create / list", () => {
  test("refused unverified, allowed verified, listed as owner of one", async () => {
    const unverified = await signUp(app)
    const [refused] = await safe(unverified.client.workspaces.create({ name: "My team" }))
    expect(refused).toMatchObject({
      code: "FORBIDDEN",
      message: "Verify your email to create a workspace",
    })

    const { client } = await verifiedUser()
    const created = await client.workspaces.create({ name: "My team" })
    expect(created).toMatchObject({ name: "My team", role: "owner", memberCount: 1 })
    const { items, pendingInvitations } = await client.workspaces.list()
    expect(items).toEqual([created])
    expect(pendingInvitations).toEqual([])
  })

  test("slugs are unique: a second My team is my-team-2", async () => {
    const { client } = await verifiedUser()
    const first = await client.workspaces.create({ name: "Slug team" })
    const second = await client.workspaces.create({ name: "Slug team" })
    expect(first.slug).toBe("slug-team")
    expect(second.slug).toBe("slug-team-2")
  })
})

type Ctx = { workspaceId: number; targetId: number; invitationId: number }
const procedures: Record<string, { min: Role; call: (c: ApiClient, x: Ctx) => Promise<unknown> }> =
  {
    get: { min: "viewer", call: (c, x) => c.workspaces.get({ workspaceId: x.workspaceId }) },
    update: {
      min: "admin",
      call: (c, x) => c.workspaces.update({ workspaceId: x.workspaceId, name: "Renamed" }),
    },
    delete: { min: "owner", call: (c, x) => c.workspaces.delete({ workspaceId: x.workspaceId }) },
    "members.list": {
      min: "viewer",
      call: (c, x) => c.workspaces.members.list({ workspaceId: x.workspaceId }),
    },
    "members.setRole": {
      min: "admin",
      call: (c, x) =>
        c.workspaces.members.setRole({
          workspaceId: x.workspaceId,
          userId: x.targetId,
          role: "member",
        }),
    },
    "members.remove": {
      min: "admin",
      call: (c, x) =>
        c.workspaces.members.remove({ workspaceId: x.workspaceId, userId: x.targetId }),
    },
    "invitations.list": {
      min: "admin",
      call: (c, x) => c.workspaces.invitations.list({ workspaceId: x.workspaceId }),
    },
    "invitations.create": {
      min: "admin",
      call: (c, x) =>
        c.workspaces.invitations.create({
          workspaceId: x.workspaceId,
          email: "matrix-new@example.com",
          role: "viewer",
        }),
    },
    "invitations.revoke": {
      min: "admin",
      call: (c, x) =>
        c.workspaces.invitations.revoke({ workspaceId: x.workspaceId, id: x.invitationId }),
    },
  }

describe("workspaces.update / delete", () => {
  test("a rename shows in get; a deleted workspace is NOT_FOUND and gone from list", async () => {
    const { client } = await verifiedUser()
    const { id: workspaceId } = await client.workspaces.create({ name: "Before" })
    expect(await client.workspaces.update({ workspaceId, name: "After" })).toMatchObject({
      name: "After",
      role: "owner",
    })
    expect((await client.workspaces.get({ workspaceId })).name).toBe("After")
    await client.workspaces.delete({ workspaceId })
    const [error] = await safe(client.workspaces.get({ workspaceId }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    expect((await client.workspaces.list()).items.map((w) => w.id)).not.toContain(workspaceId)
  })

  test("delete removes memberships, invitations and notes in one transaction", async () => {
    const owner = await verifiedUser()
    const other = await signUp(app)
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Doomed" })
    await app.db.memberships.add({ workspaceId, userId: other.user.id, role: "member" })
    await owner.client.workspaces.invitations.create({
      workspaceId,
      email: "doomed-invitee@example.com",
      role: "member",
    })
    await owner.client.notes.create({ workspaceId, title: "doomed note" })

    const original = app.db.transaction
    let transactions = 0
    app.db.transaction = (fn) => {
      transactions++
      return original(fn)
    }
    try {
      await owner.client.workspaces.delete({ workspaceId })
    } finally {
      app.db.transaction = original
    }
    expect(transactions).toBe(1)

    expect(await app.db.workspaces.find(workspaceId)).toBeUndefined()
    expect(await app.db.memberships.list(workspaceId)).toEqual([])
    expect(await app.db.invitations.listPending(workspaceId, new Date(0).toISOString())).toEqual([])
    expect((await app.db.notes.list({ workspaceId, limit: 10 })).items).toEqual([])
  })
})

describe("entitlements on workspace summaries", () => {
  test("list, get, create and accept carry the workspace's entitlements", async () => {
    const owner = await verifiedUser()
    const created = await owner.client.workspaces.create({ name: "Entitled" })
    expect(created.entitlements).toMatchObject({ plan: "free", seatsUsed: 1, seatLimit: 3 })
    const invitee = await verifiedUser()
    const token = await invite(owner.client, created.id, invitee.email)
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace.entitlements).toMatchObject({ plan: "free", seatsUsed: 2 })
    await app.billing.change(created.id, "pro", "month")
    const listed = (await owner.client.workspaces.list()).items.find((w) => w.id === created.id)
    expect(listed?.entitlements).toMatchObject({ plan: "pro", seatsUsed: 2, seatLimit: 10 })
    const got = await owner.client.workspaces.get({ workspaceId: created.id })
    expect(listed).toEqual(got)
  })
})

describe("the seat limit", () => {
  test("Free holds three members; a pending invitation accepted past the limit is refused until an upgrade", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Seats" })
    const a = await verifiedUser()
    const b = await verifiedUser()
    const c = await verifiedUser()
    const tokenA = await invite(owner.client, workspaceId, a.email)
    // B's invitation is created while there is room, and accepted after the room is gone.
    await invite(owner.client, workspaceId, b.email)
    await a.client.invitations.accept({ token: tokenA })
    const tokenC = await invite(owner.client, workspaceId, c.email) // 2 members: still room
    const { workspace } = await c.client.invitations.accept({ token: tokenC })
    expect(workspace).toMatchObject({ memberCount: 3, entitlements: { seatsUsed: 3 } })

    const [create] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId,
        email: "seat-fourth@example.com",
        role: "member",
      })
    )
    expect(create).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })

    const pending = (await b.client.workspaces.list()).pendingInvitations
    expect(pending).toHaveLength(1)
    const id = pending[0]?.id as number
    const [accept] = await safe(b.client.invitations.acceptById({ id }))
    expect(accept).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })
    // Refused inside the transaction: the invitation is still pending, the member count unchanged.
    expect((await b.client.workspaces.list()).pendingInvitations.map((p) => p.id)).toEqual([id])
    expect(await app.db.workspaces.memberCount(workspaceId)).toBe(3)

    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    const accepted = await b.client.invitations.acceptById({ id })
    expect(accepted.workspace).toMatchObject({ memberCount: 4, entitlements: { plan: "pro" } })
  })

  test("an existing member accepting at the limit keeps their seat", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Full" })
    const invitee = await verifiedUser()
    const token = await invite(owner.client, workspaceId, invitee.email)
    for (const user of [invitee, await signUp(app)]) {
      await app.db.memberships.add({ workspaceId, userId: user.user.id, role: "member" })
    }
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ memberCount: 3 })
  })
})

describe("deleting a subscribed workspace", () => {
  test("cancels the subscription first, then deletes", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Paid" })
    await owner.client.billing.checkout({ workspaceId, plan: "pro", interval: "month" })
    const subscriptionId = (await app.db.billing.subscriptions.latest(workspaceId))
      ?.subscription_id as string
    const original = app.billing.cancelSubscription
    const canceled: string[] = []
    app.billing.cancelSubscription = async (id) => {
      canceled.push(id)
      // Still there when the provider is asked: the delete waits for the cancel.
      expect(await app.db.workspaces.find(workspaceId)).toBeDefined()
      return original.call(app.billing, id)
    }
    try {
      await owner.client.workspaces.delete({ workspaceId })
    } finally {
      app.billing.cancelSubscription = original
    }
    expect(canceled).toEqual([subscriptionId])
    const [error] = await safe(owner.client.billing.get({ workspaceId }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("a canceled subscription is not canceled again", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Lapsed" })
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    await owner.client.billing.mockChange({ workspaceId, plan: "cancel", interval: "month" })
    const original = app.billing.cancelSubscription
    let calls = 0
    app.billing.cancelSubscription = async () => {
      calls++
    }
    try {
      await owner.client.workspaces.delete({ workspaceId })
    } finally {
      app.billing.cancelSubscription = original
    }
    expect(calls).toBe(0)
    expect(await app.db.workspaces.find(workspaceId)).toBeUndefined()
  })

  test("a provider that cannot cancel → INTERNAL_SERVER_ERROR and the workspace stays", async () => {
    const logged: string[] = []
    const failing = await start({
      log: (m) => logged.push(m),
      billing: () => ({
        kind: "stripe",
        createCheckout: async () => ({ url: "https://checkout.example" }),
        createPortal: async () => ({ url: "https://portal.example" }),
        hasPrice: () => true,
        cancelSubscription: async () => {
          throw new Error("stripe is down")
        },
        verifyWebhook: async () => null,
      }),
    })
    try {
      const owner = await signUpWithWorkspace(failing)
      await applyBillingEvent(failing.db, "stripe", {
        id: "evt_delete_1",
        type: "customer.subscription.created",
        createdAt: new Date().toISOString(),
        workspaceId: owner.workspaceId,
        customerId: "cus_delete_1",
        customerEmail: null,
        subscription: {
          subscriptionId: "sub_delete_1",
          status: "active",
          plan: "pro",
          interval: "month",
          currentPeriodEnd: "2026-11-02T00:00:00.000Z",
          cancelAtPeriodEnd: false,
        },
      })
      const [error] = await safe(owner.client.workspaces.delete({ workspaceId: owner.workspaceId }))
      expect(error).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not cancel the subscription, try again",
      })
      expect(logged).toContain("billing: cancel before delete failed")
      expect(await owner.client.workspaces.get({ workspaceId: owner.workspaceId })).toMatchObject({
        entitlements: { plan: "pro" },
      })
    } finally {
      await failing.stop()
    }
  })
})

describe("role matrix", () => {
  let owner: Awaited<ReturnType<typeof verifiedUser>>
  const actors = {} as Record<Exclude<Role, "owner">, Awaited<ReturnType<typeof signUp>>>
  let target: Awaited<ReturnType<typeof signUp>>
  let outsider: Awaited<ReturnType<typeof signUp>>

  // Six sign-ups (argon2 each) and Postgres on a CI runner: beyond bun's 5 s default.
  beforeAll(async () => {
    owner = await verifiedUser()
    for (const role of ["viewer", "member", "admin"] as const) actors[role] = await signUp(app)
    target = await signUp(app)
    outsider = await signUp(app)
  }, 30_000)

  /** A fresh workspace with one member per role, a viewer to act on and a pending invitation. */
  async function workspace(): Promise<Ctx> {
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Matrix" })
    // Five members is over Free's seat limit: Team keeps the invitation rows about roles.
    await app.billing.change(workspaceId, "team", "month")
    for (const role of ["viewer", "member", "admin"] as const) {
      await app.db.memberships.add({ workspaceId, userId: actors[role].user.id, role })
    }
    await app.db.memberships.add({ workspaceId, userId: target.user.id, role: "viewer" })
    const invitation = await owner.client.workspaces.invitations.create({
      workspaceId,
      email: "matrix-pending@example.com",
      role: "member",
    })
    return { workspaceId, targetId: target.user.id, invitationId: invitation.id }
  }

  const clientOf = (role: Role) => (role === "owner" ? owner.client : actors[role].client)

  for (const [name, { min, call }] of Object.entries(procedures)) {
    for (const role of ROLES) {
      const allowed = ROLES.indexOf(role) >= ROLES.indexOf(min)
      test(`${name} as ${role}: ${allowed ? "ok" : "FORBIDDEN"}`, async () => {
        const ctx = await workspace()
        const [error] = await safe(call(clientOf(role), ctx))
        if (allowed) expect(error).toBeNull()
        else expect(error).toMatchObject({ code: "FORBIDDEN", message: `Requires the ${min} role` })
      })
    }

    test(`${name} as a non-member: NOT_FOUND`, async () => {
      const ctx = await workspace()
      const [error] = await safe(call(outsider.client, ctx))
      expect(error).toMatchObject({ code: "NOT_FOUND" })
    })
  }

  test("an unknown workspace is NOT_FOUND", async () => {
    const [error] = await safe(owner.client.workspaces.get({ workspaceId: 999_999 }))
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
  })

  test("members.list shows emails to admins and owners only", async () => {
    const { workspaceId } = await workspace()
    for (const role of ROLES) {
      const { items } = await clientOf(role).workspaces.members.list({ workspaceId })
      expect(items).toHaveLength(5)
      const emails = items.map((member) => member.email)
      if (role === "admin" || role === "owner") {
        expect(emails).toContain(owner.email)
        expect(emails.every((email) => typeof email === "string")).toBe(true)
      } else {
        expect(emails.every((email) => email === null)).toBe(true)
      }
    }
  })
})

describe("the last owner", () => {
  test("cannot leave or remove themselves; CONFLICT with the exact message", async () => {
    const { client, user } = await verifiedUser()
    const { id: workspaceId } = await client.workspaces.create({ name: "Solo" })
    const conflict = { code: "CONFLICT", message: "Transfer ownership before leaving." }
    const [left] = await safe(client.workspaces.leave({ workspaceId }))
    expect(left).toMatchObject(conflict)
    const [removed] = await safe(client.workspaces.members.remove({ workspaceId, userId: user.id }))
    expect(removed).toMatchObject(conflict)
    const [demoted] = await safe(
      client.workspaces.members.setRole({ workspaceId, userId: user.id, role: "admin" })
    )
    expect(demoted).toMatchObject(conflict)
    expect((await client.workspaces.get({ workspaceId })).role).toBe("owner")
  })

  test("transfer: a non-member is BAD_REQUEST; afterwards the old owner is admin and can leave", async () => {
    const owner = await verifiedUser()
    const next = await signUp(app)
    const stranger = await signUp(app)
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Handover" })
    const [notMember] = await safe(
      owner.client.workspaces.transferOwnership({ workspaceId, userId: stranger.user.id })
    )
    expect(notMember).toMatchObject({ code: "BAD_REQUEST" })
    const [self] = await safe(
      owner.client.workspaces.transferOwnership({ workspaceId, userId: owner.user.id })
    )
    expect(self).toMatchObject({ code: "BAD_REQUEST" })

    await app.db.memberships.add({ workspaceId, userId: next.user.id, role: "member" })
    await owner.client.workspaces.transferOwnership({ workspaceId, userId: next.user.id })
    expect((await owner.client.workspaces.get({ workspaceId })).role).toBe("admin")
    expect((await next.client.workspaces.get({ workspaceId })).role).toBe("owner")
    // An admin cannot touch the owner.
    const [touch] = await safe(
      owner.client.workspaces.members.setRole({ workspaceId, userId: next.user.id, role: "admin" })
    )
    expect(touch).toMatchObject({ code: "FORBIDDEN", message: "Requires the owner role" })
    await owner.client.workspaces.leave({ workspaceId })
    const [gone] = await safe(owner.client.workspaces.get({ workspaceId }))
    expect(gone).toMatchObject({ code: "NOT_FOUND" })
  })

  test("transfer to a member who was just removed is BAD_REQUEST and the caller stays owner", async () => {
    const owner = await verifiedUser()
    const gone = await signUp(app)
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Left early" })
    await app.db.memberships.add({ workspaceId, userId: gone.user.id, role: "member" })
    await owner.client.workspaces.members.remove({ workspaceId, userId: gone.user.id })
    const [error] = await safe(
      owner.client.workspaces.transferOwnership({ workspaceId, userId: gone.user.id })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: "Not a member of this workspace" })
    expect((await owner.client.workspaces.get({ workspaceId })).role).toBe("owner")
    const { items } = await owner.client.workspaces.members.list({ workspaceId })
    expect(items.map((m) => [m.userId, m.role])).toEqual([[owner.user.id, "owner"]])
  })

  test("with two owners, one owner can demote the other", async () => {
    const first = await verifiedUser()
    const second = await signUp(app)
    const { id: workspaceId } = await first.client.workspaces.create({ name: "Two owners" })
    await app.db.memberships.add({ workspaceId, userId: second.user.id, role: "owner" })
    await first.client.workspaces.members.setRole({
      workspaceId,
      userId: second.user.id,
      role: "admin",
    })
    expect((await second.client.workspaces.get({ workspaceId })).role).toBe("admin")
    // Now the only owner again.
    const [error] = await safe(
      first.client.workspaces.members.setRole({ workspaceId, userId: first.user.id, role: "admin" })
    )
    expect(error).toMatchObject({ code: "CONFLICT" })
  })

  test("setRole and remove of a non-member are BAD_REQUEST", async () => {
    const owner = await verifiedUser()
    const stranger = await signUp(app)
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Strangers" })
    const target = { workspaceId, userId: stranger.user.id }
    const [setRole] = await safe(
      owner.client.workspaces.members.setRole({ ...target, role: "member" })
    )
    expect(setRole).toMatchObject({
      code: "BAD_REQUEST",
      message: "Not a member of this workspace",
    })
    const [remove] = await safe(owner.client.workspaces.members.remove(target))
    expect(remove).toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("invitations", () => {
  test("the full lifecycle: mail, preview, replace, wrong address, verify, accept once", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId, name } = await owner.client.workspaces.create({ name: "Invite Co" })
    const email = "invitee-life@example.com"

    const first = await invite(owner.client, workspaceId, email)
    const mails = await mailsTo(app, email, `You're invited to ${name}`)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.text).toContain(`http://app.example.com/invitations/${first}`)

    const anonymous = clientFor(app)
    expect(await anonymous.invitations.preview({ token: first })).toMatchObject({
      workspace: { name: "Invite Co" },
      email: "i***@example.com",
      role: "member",
    })

    // A re-invite replaces the pending one: the old link dies, the new one works.
    const token = await invite(owner.client, workspaceId, email, "admin")
    expect(token).not.toBe(first)
    const [old] = await safe(anonymous.invitations.preview({ token: first }))
    expect(old).toMatchObject({ code: "NOT_FOUND", message: "This invitation is no longer valid." })
    expect((await anonymous.invitations.preview({ token })).role).toBe("admin")
    expect(
      (await owner.client.workspaces.invitations.list({ workspaceId })).items.map((i) => i.email)
    ).toEqual([email])

    const other = await verifiedUser()
    const [wrong] = await safe(other.client.invitations.accept({ token }))
    expect(wrong).toMatchObject({
      code: "FORBIDDEN",
      message:
        "This invitation was sent to i***@example.com. Sign in with that address to accept it.",
    })

    const invitee = await signUp(app, email)
    const [unverified] = await safe(invitee.client.invitations.accept({ token }))
    expect(unverified).toMatchObject({
      code: "FORBIDDEN",
      message: "Verify your email to accept this invitation",
    })

    await verify(app, email)
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ id: workspaceId, role: "admin", memberCount: 2 })
    expect((await invitee.client.workspaces.list()).items).toEqual([workspace])

    const [again] = await safe(invitee.client.invitations.accept({ token }))
    expect(again).toMatchObject({ code: "NOT_FOUND" })
    const [previewAgain] = await safe(anonymous.invitations.preview({ token }))
    expect(previewAgain).toMatchObject({ code: "NOT_FOUND" })
    expect((await owner.client.workspaces.invitations.list({ workspaceId })).items).toEqual([])
  })

  test("acceptById takes a pending invitation from workspaces.list", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "By id" })
    const invitee = await signUp(app, "invitee-byid@example.com")
    await invite(owner.client, workspaceId, invitee.email, "viewer")
    // Unverified: nothing pending is shown, and accepting their own invitation asks to verify.
    expect((await invitee.client.workspaces.list()).pendingInvitations).toEqual([])
    const [own] = (await owner.client.workspaces.invitations.list({ workspaceId })).items
    const [unverified] = await safe(
      invitee.client.invitations.acceptById({ id: own?.id as number })
    )
    expect(unverified).toMatchObject({
      code: "FORBIDDEN",
      message: "Verify your email to accept this invitation",
    })
    await verify(app, invitee.email)
    const { pendingInvitations } = await invitee.client.workspaces.list()
    expect(pendingInvitations).toMatchObject([
      { workspace: { name: "By id" }, role: "viewer", invitedBy: { name: "" } },
    ])
    const id = pendingInvitations[0]?.id as number

    // Someone else's invitation looks exactly like a missing one: ids are guessable.
    const stranger = await verifiedUser()
    const [wrong] = await safe(stranger.client.invitations.acceptById({ id }))
    expect(wrong).toMatchObject({
      code: "NOT_FOUND",
      message: "This invitation is no longer valid.",
    })

    const { workspace } = await invitee.client.invitations.acceptById({ id })
    expect(workspace).toMatchObject({ id: workspaceId, role: "viewer" })
    expect((await invitee.client.workspaces.list()).pendingInvitations).toEqual([])
    const [again] = await safe(invitee.client.invitations.acceptById({ id }))
    expect(again).toMatchObject({ code: "NOT_FOUND" })
    const [unknown] = await safe(invitee.client.invitations.acceptById({ id: 999_999 }))
    expect(unknown).toMatchObject({ code: "NOT_FOUND" })
  })

  test("accepting while already a member keeps the membership and uses the invitation", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Already in" })
    const invitee = await verifiedUser("invitee-already@example.com")
    const token = await invite(owner.client, workspaceId, invitee.email, "admin")
    await app.db.memberships.add({ workspaceId, userId: invitee.user.id, role: "viewer" })
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ id: workspaceId, role: "viewer", memberCount: 2 })
    const [again] = await safe(invitee.client.invitations.accept({ token }))
    expect(again).toMatchObject({ code: "NOT_FOUND" })
  })

  test("revoke kills the link; revoking again is NOT_FOUND", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Revoke" })
    const token = await invite(owner.client, workspaceId, "invitee-revoke@example.com")
    const [pending] = (await owner.client.workspaces.invitations.list({ workspaceId })).items
    await owner.client.workspaces.invitations.revoke({ workspaceId, id: pending?.id as number })
    const [preview] = await safe(clientFor(app).invitations.preview({ token }))
    expect(preview).toMatchObject({ code: "NOT_FOUND" })
    const [again] = await safe(
      owner.client.workspaces.invitations.revoke({ workspaceId, id: pending?.id as number })
    )
    expect(again).toMatchObject({ code: "NOT_FOUND", message: "Invitation not found" })
  })

  test("inviting an existing member is CONFLICT, whatever the case", async () => {
    const owner = await verifiedUser()
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Conflict" })
    const [error] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId,
        email: owner.email.toUpperCase(),
        role: "member",
      })
    )
    expect(error).toMatchObject({ code: "CONFLICT", message: "Already a member" })
  })

  test("an expired invitation is NOT_FOUND for preview and accept", async () => {
    const owner = await verifiedUser()
    const invitee = await verifiedUser("invitee-expired@example.com")
    const { id: workspaceId } = await owner.client.workspaces.create({ name: "Expired" })
    const token = newToken()
    await app.db.invitations.create({
      workspaceId,
      email: invitee.email,
      role: "member",
      tokenHash: tokenHash(token),
      invitedBy: owner.user.id,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })
    const [preview] = await safe(clientFor(app).invitations.preview({ token }))
    expect(preview).toMatchObject({ code: "NOT_FOUND" })
    const [accept] = await safe(invitee.client.invitations.accept({ token }))
    expect(accept).toMatchObject({ code: "NOT_FOUND" })
    expect((await invitee.client.workspaces.list()).pendingInvitations).toEqual([])
  })

  test("an unknown token is NOT_FOUND; accept needs a session", async () => {
    const [preview] = await safe(clientFor(app).invitations.preview({ token: "nope" }))
    expect(preview).toMatchObject({ code: "NOT_FOUND" })
    const [accept] = await safe(clientFor(app).invitations.accept({ token: "nope" }))
    expect(accept).toMatchObject({ code: "UNAUTHORIZED" })
  })
})

describe("the invitation limiter", () => {
  let limited: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    limited = await start({
      inviteLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
  })
  afterAll(() => limited.stop())

  test("over the limit is TOO_MANY_REQUESTS and stores and sends nothing", async () => {
    const owner = await signUp(limited)
    await verify(limited, owner.email)
    const { id: workspaceId, name } = await owner.client.workspaces.create({ name: "Busy" })
    for (const n of [1, 2]) {
      await owner.client.workspaces.invitations.create({
        workspaceId,
        email: `busy${n}@example.com`,
        role: "member",
      })
    }
    const [error] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId,
        email: "busy3@example.com",
        role: "member",
      })
    )
    expect(error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many invitations, try again in an hour",
    })
    await mailsTo(limited, "busy2@example.com", invitationSubject(name))
    await Bun.sleep(20)
    expect(limited.mailer.sent.some((mail) => mail.to === "busy3@example.com")).toBe(false)
    const { items } = await owner.client.workspaces.invitations.list({ workspaceId })
    expect(items.map((item) => item.email)).toEqual(["busy1@example.com", "busy2@example.com"])
  })
})

describe("the per-inviter invitation limiter", () => {
  let limited: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    limited = await start({
      inviterLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
  })
  afterAll(() => limited.stop())

  test("caps one inviter across workspaces: the third is TOO_MANY_REQUESTS, nothing stored or sent", async () => {
    const owner = await signUp(limited)
    await verify(limited, owner.email)
    const first = await owner.client.workspaces.create({ name: "Spree one" })
    const second = await owner.client.workspaces.create({ name: "Spree two" })
    await owner.client.workspaces.invitations.create({
      workspaceId: first.id,
      email: "spree1@example.com",
      role: "member",
    })
    await owner.client.workspaces.invitations.create({
      workspaceId: second.id,
      email: "spree2@example.com",
      role: "member",
    })
    const [error] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: second.id,
        email: "spree3@example.com",
        role: "member",
      })
    )
    expect(error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many invitations, try again in an hour",
    })
    await mailsTo(limited, "spree2@example.com", invitationSubject(second.name))
    await Bun.sleep(20)
    expect(limited.mailer.sent.some((mail) => mail.to === "spree3@example.com")).toBe(false)
    const { items } = await owner.client.workspaces.invitations.list({ workspaceId: second.id })
    expect(items.map((item) => item.email)).toEqual(["spree2@example.com"])
  })
})

describe("the workspace creation limiter", () => {
  let limited: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    limited = await start({
      workspaceCreateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
  })
  afterAll(() => limited.stop())

  test("the third create in the window is TOO_MANY_REQUESTS and creates nothing", async () => {
    const user = await signUp(limited)
    await verify(limited, user.email)
    await user.client.workspaces.create({ name: "One" })
    await user.client.workspaces.create({ name: "Two" })
    const [error] = await safe(user.client.workspaces.create({ name: "Three" }))
    expect(error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many workspaces created, try again in an hour",
    })
    const { items } = await user.client.workspaces.list()
    expect(items.map((item) => item.name)).toEqual(["One", "Two"])
  })
})
