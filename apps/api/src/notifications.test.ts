// The notification centre's api side (Phase 13 A): `notifyUser`, the seven emitters, the three
// `notifications.*` procedures and `notifications.prune`. Runs on SQLite, and on Postgres with
// TEST_DATABASE_URL. `webhook.disabled` is covered with the delivery job in
// webhook-delivery.test.ts, the export and purge in privacy.test.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  type BroadcastEvent,
  IMPERSONATING_MESSAGE,
  NOTIFICATION_UNREAD_CAP,
  type NotificationType,
  userChannel,
} from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { applyBillingEvent } from "./billing/mirror"
import type { Queries } from "./db"
import { DEV_TWO_FACTOR_KEY } from "./env"
import { notificationsPruneJob } from "./jobs/builtin/notifications"
import { createEnqueue } from "./jobs/enqueue"
import { notifyUser } from "./notifications"
import {
  clientFor,
  enableTwoFactor,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"

const ROOT = "notifications-root@example.com"
const DAY_MS = 86_400_000
let offsetMs = 0
const now = () => new Date(Date.now() + offsetMs)

let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    now,
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

type Row = {
  id: number
  user_id: number
  workspace_id: number | null
  type: string
  data: string
  read_at: string | null
}
/** Every notification row stored for `userId`, oldest first. */
const rowsOf = async (userId: number) =>
  (
    (await app.db.sql`SELECT * FROM notifications WHERE user_id = ${userId} ORDER BY id`) as Row[]
  ).map((row) => ({
    ...row,
    id: Number(row.id),
    workspace_id: row.workspace_id === null ? null : Number(row.workspace_id),
    data: JSON.parse(row.data) as unknown,
  }))
const typesOf = async (userId: number) => (await rowsOf(userId)).map((row) => row.type)
const allRowCount = async () => {
  const [row] = (await app.db.sql`SELECT COUNT(*) AS n FROM notifications`) as Array<{
    n: number | string
  }>
  return Number(row?.n ?? 0)
}

/** Everything published on `userId`'s channel from now on. */
function listen(userId: number) {
  const events: BroadcastEvent[] = []
  const stop = app.broadcaster.subscribe(userChannel(userId), (event) => {
    events.push(event)
  })
  return { events, stop }
}
async function until(check: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out")
    await Bun.sleep(5)
  }
}
/** Long enough for a Postgres NOTIFY round trip that should not happen. */
const settle = () => Bun.sleep(150)

/** An owner (verified, workspace "Notes") and a verified member of it with `role`. */
async function ownerAndMember(role: "viewer" | "member" | "admin" | "owner" = "member") {
  const owner = await signUpWithWorkspace(app)
  const member = await signUpVerified(app)
  await app.db.memberships.add({ workspaceId: owner.workspaceId, userId: member.user.id, role })
  return { owner, member, workspaceId: owner.workspaceId }
}

/** What `notifyUser` needs to email an optional type: the test server's own settings. */
const mailDeps = {
  authUrl: "http://auth.example.com",
  accountUrl: "http://account.example.com",
  twoFactorKey: DEV_TWO_FACTOR_KEY,
}

/** A notification for `userId` written straight through `notifyUser` on the pool. */
const notify = (userId: number, workspaceId?: number) =>
  notifyUser(
    { ...app, ...mailDeps },
    userId,
    "member.removed",
    { workspaceName: "W" },
    { workspaceId }
  )

type Tx = Queries
/** Until restored, every transaction is handed `patch(tx)` instead of `tx`. */
function patchTransactions(patch: (tx: Tx) => Tx) {
  const original = app.db.transaction
  app.db.transaction = (fn) => original((tx) => fn(patch(tx)))
  return () => {
    app.db.transaction = original
  }
}
/**
 * Every transaction that writes a notification queues its publish and then fails: the row and
 * the queued publish must both vanish with the rollback.
 */
const failAfterNotify = () =>
  patchTransactions((tx) => ({
    ...tx,
    afterCommit: (fn) => {
      tx.afterCommit(fn)
      throw new Error("after the notification")
    },
  }))

describe("notifyUser", () => {
  test("writes one row and publishes notification.created on the user's channel only", async () => {
    const a = await signUpVerified(app)
    const b = await signUpVerified(app)
    const onA = listen(a.user.id)
    const onB = listen(b.user.id)
    await notify(a.user.id, 7)
    await until(() => onA.events.length === 1)
    await settle()
    onA.stop()
    onB.stop()
    const [row] = await rowsOf(a.user.id)
    expect(row).toMatchObject({
      type: "member.removed",
      workspace_id: 7,
      data: { workspaceName: "W" },
      read_at: null,
    })
    expect(onA.events).toEqual([{ type: "notification.created", id: row?.id as number }])
    expect(onB.events).toEqual([])
    expect(await rowsOf(b.user.id)).toEqual([])
  })

  test("inside a transaction it publishes only after the commit, and nothing on a rollback", async () => {
    const user = await signUpVerified(app)
    const heard = listen(user.user.id)
    let publishedBeforeCommit = -1
    await app.db.transaction(async (tx) => {
      await notifyUser(app, user.user.id, "export.ready", {}, { tx })
      await settle()
      publishedBeforeCommit = heard.events.length
    })
    await until(() => heard.events.length === 1)
    expect(publishedBeforeCommit).toBe(0)

    const [error] = await safe(
      app.db.transaction(async (tx) => {
        await notifyUser(app, user.user.id, "export.ready", {}, { tx })
        throw new Error("roll back")
      })
    )
    expect(error).toBeInstanceOf(Error)
    await settle()
    heard.stop()
    expect(heard.events).toHaveLength(1)
    expect(await typesOf(user.user.id)).toEqual(["export.ready"])
  })

  test("a throwing after-commit callback neither skips the next nor fails the committed change", async () => {
    const user = await signUpVerified(app)
    const ran: string[] = []
    const result = await app.db.transaction(async (tx) => {
      tx.afterCommit(() => {
        ran.push("first")
        throw new Error("a broken callback")
      })
      await notifyUser(app, user.user.id, "export.ready", {}, { tx })
      tx.afterCommit(() => ran.push("last"))
      return "committed"
    })
    expect(result).toBe("committed")
    expect(ran).toEqual(["first", "last"])
    expect(await typesOf(user.user.id)).toEqual(["export.ready"])
  })

  test("data off the type's allowlist (an email, an unknown key) is refused before any write", async () => {
    const user = await signUpVerified(app)
    const bad = [
      ["member.removed", { workspaceName: "W", email: "a@example.com" }],
      ["export.ready", { token: "secret" }],
      ["member.role_changed", { workspaceName: "W", from: "member", to: "god" }],
    ] as const
    for (const [type, data] of bad) {
      await expect(
        notifyUser(app, user.user.id, type as NotificationType, data as never)
      ).rejects.toThrow()
    }
    expect(await rowsOf(user.user.id)).toEqual([])
  })
})

describe("notifications.list / unreadCount / markRead", () => {
  test("a new account has none", async () => {
    const user = await signUpVerified(app)
    expect(await user.client.notifications.list()).toEqual({ items: [], nextCursor: null })
    expect(await user.client.notifications.unreadCount()).toEqual({ count: 0 })
  })

  test("signed out is UNAUTHORIZED", async () => {
    const anonymous = clientFor(app)
    const calls: Promise<unknown>[] = [
      anonymous.notifications.list(),
      anonymous.notifications.unreadCount(),
      anonymous.notifications.markRead({ all: true }),
    ]
    for (const call of calls) {
      const [error] = await safe(call)
      expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    }
  })

  test("lists the caller's own rows newest first, with read state and display data", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await notify(member.user.id, workspaceId)
    await notifyUser(app, member.user.id, "export.ready", {})
    const { items, nextCursor } = await member.client.notifications.list()
    expect(nextCursor).toBeNull()
    expect(items).toEqual([
      {
        id: expect.any(Number),
        type: "export.ready",
        data: {},
        workspaceId: null,
        createdAt: expect.any(String),
        read: false,
      },
      {
        id: expect.any(Number),
        type: "member.removed",
        data: { workspaceName: "W" },
        workspaceId,
        createdAt: expect.any(String),
        read: false,
      },
    ])
    expect(await member.client.notifications.unreadCount()).toEqual({ count: 2 })
    // The owner sees none of them.
    expect((await owner.client.notifications.list()).items).toEqual([])
    expect(await owner.client.notifications.unreadCount()).toEqual({ count: 0 })
  })

  test("another user's rows are never listed, counted or markable, even by a crafted id list", async () => {
    const a = await signUpVerified(app)
    const b = await signUpVerified(app)
    await notify(a.user.id)
    await notify(b.user.id)
    const [bRow] = await rowsOf(b.user.id)
    const [aRow] = await rowsOf(a.user.id)
    // `a` names `b`'s id (and an id that does not exist): silently ignored.
    await a.client.notifications.markRead({ ids: [bRow?.id as number, 2_000_000_000] })
    expect((await rowsOf(b.user.id))[0]?.read_at).toBeNull()
    expect((await rowsOf(a.user.id))[0]?.read_at).toBeNull()
    // Marking all touches only the caller's own.
    await a.client.notifications.markRead({ all: true })
    expect((await rowsOf(b.user.id))[0]?.read_at).toBeNull()
    expect((await rowsOf(a.user.id))[0]?.read_at).not.toBeNull()
    expect(await b.client.notifications.unreadCount()).toEqual({ count: 1 })
    expect((await a.client.notifications.list()).items.map((n) => n.id)).toEqual([
      aRow?.id as number,
    ])
    expect((await b.client.notifications.list()).items.map((n) => n.id)).toEqual([
      bRow?.id as number,
    ])
  })

  test("markRead by id marks those only; repeating it, or all, is idempotent", async () => {
    const user = await signUpVerified(app)
    for (let i = 0; i < 3; i++) await notify(user.user.id)
    const [first, second, third] = await rowsOf(user.user.id)
    await user.client.notifications.markRead({ ids: [first?.id as number, second?.id as number] })
    const readAt = (await rowsOf(user.user.id))[0]?.read_at
    expect(readAt).not.toBeNull()
    expect(await user.client.notifications.unreadCount()).toEqual({ count: 1 })
    offsetMs = 60_000
    try {
      await user.client.notifications.markRead({ ids: [first?.id as number] })
      // A read row keeps its first read time.
      expect((await rowsOf(user.user.id))[0]?.read_at).toBe(readAt as string)
      await user.client.notifications.markRead({ all: true })
      await user.client.notifications.markRead({ all: true })
    } finally {
      offsetMs = 0
    }
    expect(await user.client.notifications.unreadCount()).toEqual({ count: 0 })
    const { items } = await user.client.notifications.list()
    expect(items.map((n) => [n.id, n.read])).toEqual([
      [third?.id as number, true],
      [second?.id as number, true],
      [first?.id as number, true],
    ])
  })

  test("markRead refuses an empty or oversized id list and a non-literal all", async () => {
    const user = await signUpVerified(app)
    for (const input of [
      { ids: [] },
      { ids: Array.from({ length: 101 }, (_, i) => i + 1) },
      { ids: [0] },
      { all: false },
      {},
    ]) {
      const [error] = await safe(user.client.notifications.markRead(input as never))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
    await user.client.notifications.markRead({ ids: Array.from({ length: 100 }, (_, i) => i + 1) })
  })

  test("pages newest first by (createdAt, id), 20 by default; unreadOnly filters", async () => {
    const user = await signUpVerified(app)
    const base = Date.parse("2026-01-01T00:00:00.000Z")
    // 25 rows; two pairs share a timestamp, so the id breaks the tie.
    for (let i = 0; i < 25; i++) {
      await app.db.notifications.create({
        userId: user.user.id,
        workspaceId: null,
        type: "export.ready",
        data: "{}",
        createdAt: new Date(base + Math.floor(i / 2) * 1000).toISOString(),
      })
    }
    const all = (await rowsOf(user.user.id)).map((row) => row.id)
    const newestFirst = [...all].reverse()
    const first = await user.client.notifications.list()
    expect(first.items.map((n) => n.id)).toEqual(newestFirst.slice(0, 20))
    expect(first.nextCursor).toMatch(/^2026-01-01T00:00:0\d\.000Z_\d+$/)
    const second = await user.client.notifications.list({ cursor: first.nextCursor as string })
    expect(second.items.map((n) => n.id)).toEqual(newestFirst.slice(20))
    expect(second.nextCursor).toBeNull()

    const small = await user.client.notifications.list({ limit: 2 })
    expect(small.items.map((n) => n.id)).toEqual(newestFirst.slice(0, 2))
    const next = await user.client.notifications.list({
      limit: 2,
      cursor: small.nextCursor as string,
    })
    expect(next.items.map((n) => n.id)).toEqual(newestFirst.slice(2, 4))

    await user.client.notifications.markRead({ ids: newestFirst.slice(0, 24) })
    const unread = await user.client.notifications.list({ unreadOnly: true })
    expect(unread.items.map((n) => n.id)).toEqual([all[0] as number])
    expect(unread.nextCursor).toBeNull()

    for (const input of [
      { limit: 0 },
      { limit: 51 },
      { cursor: "nope" },
      { cursor: "2026-13-01T00:00:00.000Z_1" },
    ]) {
      const [error] = await safe(user.client.notifications.list(input))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
    expect((await user.client.notifications.list({ limit: 50 })).items).toHaveLength(25)
  })

  test("unreadCount stops counting one past the display cap", async () => {
    const user = await signUpVerified(app)
    const at = new Date().toISOString()
    for (let i = 0; i < NOTIFICATION_UNREAD_CAP + 20; i++) {
      await app.db.notifications.create({
        userId: user.user.id,
        workspaceId: null,
        type: "export.ready",
        data: "{}",
        createdAt: at,
      })
    }
    expect(await user.client.notifications.unreadCount()).toEqual({
      count: NOTIFICATION_UNREAD_CAP + 1,
    })
  })

  test("a workspace the user has since left is null, so nothing links into it", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    expect((await member.client.notifications.list()).items[0]?.workspaceId).toBe(workspaceId)
    await member.client.workspaces.leave({ workspaceId })
    const { items } = await member.client.notifications.list()
    expect(items.map((n) => [n.type, n.workspaceId])).toEqual([["member.role_changed", null]])
    // The row itself keeps the workspace: rejoining links it again.
    await app.db.memberships.add({ workspaceId, userId: member.user.id, role: "member" })
    expect((await member.client.notifications.list()).items[0]?.workspaceId).toBe(workspaceId)
  })

  test("a stored row that no longer matches the contract is skipped, never returned", async () => {
    const user = await signUpVerified(app)
    await notify(user.user.id)
    await app.db.notifications.create({
      userId: user.user.id,
      workspaceId: null,
      type: "member.removed",
      data: '{"workspaceName":"W","email":"a@example.com"}',
      createdAt: new Date().toISOString(),
    })
    const { items } = await user.client.notifications.list()
    expect(items).toHaveLength(1)
    expect(JSON.stringify(items)).not.toContain("a@example.com")
  })
})

describe("while impersonating", () => {
  async function impersonated() {
    const { owner, member, workspaceId } = await ownerAndMember()
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: {},
    })
    return { owner, member, workspaceId, asOwner: clientFor(app, token) }
  }

  test("the user's notifications are readable but never marked read", async () => {
    const { owner, asOwner } = await impersonated()
    await notify(owner.user.id)
    // The impersonating admin's own notification never shows in the session acting as the user.
    await notifyUser(app, root.user.id, "export.ready", {})
    expect((await asOwner.notifications.list()).items).toHaveLength(1)
    expect(await asOwner.notifications.unreadCount()).toEqual({ count: 1 })
    const [row] = await rowsOf(owner.user.id)
    for (const input of [{ all: true as const }, { ids: [row?.id as number] }]) {
      const [error] = await safe(asOwner.notifications.markRead(input))
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        defined: true,
        message: IMPERSONATING_MESSAGE,
      })
    }
    expect((await rowsOf(owner.user.id))[0]?.read_at).toBeNull()
    // …and the two inboxes stay apart both ways.
    expect((await asOwner.notifications.list()).items.map((n) => n.type)).toEqual([
      "member.removed",
    ])
    expect((await root.client.notifications.list()).items.map((n) => n.type)).toEqual([
      "export.ready",
    ])
  })

  test("acting as the user notifies the member acted on, never the impersonator or the user", async () => {
    const { owner, member, workspaceId, asOwner } = await impersonated()
    const before = await rowsOf(root.user.id)
    await asOwner.workspaces.members.setRole({ workspaceId, userId: member.user.id, role: "admin" })
    await asOwner.workspaces.members.remove({ workspaceId, userId: member.user.id })
    expect(await typesOf(member.user.id)).toEqual(["member.role_changed", "member.removed"])
    expect(await rowsOf(owner.user.id)).toEqual([])
    expect(await rowsOf(root.user.id)).toEqual(before)
  })

  test("an impersonator invited by the user they act as is not notified of it", async () => {
    const { workspaceId, asOwner } = await impersonated()
    const before = await rowsOf(root.user.id)
    await asOwner.workspaces.invitations.create({ workspaceId, email: ROOT, role: "member" })
    expect(await rowsOf(root.user.id)).toEqual(before)
  })
})

describe("emitters", () => {
  test("invitation.received: to the verified account holding the address, once per invitation", async () => {
    const owner = await signUpWithWorkspace(app)
    const unverified = await signUpVerified(app)
    const heard = listen(unverified.user.id)
    const first = await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: unverified.email,
      role: "admin",
    })
    await until(() => heard.events.length === 1)
    const [row] = await rowsOf(unverified.user.id)
    expect(row).toMatchObject({
      type: "invitation.received",
      workspace_id: owner.workspaceId,
      data: { workspaceName: "Notes", role: "admin", invitationId: first.id },
    })
    expect(heard.events).toEqual([{ type: "notification.created", id: row?.id as number }])
    // A re-invite replaces the invitation and notifies again, naming the new one.
    const second = await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: unverified.email.toUpperCase(),
      role: "viewer",
    })
    heard.stop()
    expect((await rowsOf(unverified.user.id)).map((r) => r.data)).toEqual([
      { workspaceName: "Notes", role: "admin", invitationId: first.id },
      { workspaceName: "Notes", role: "viewer", invitationId: second.id },
    ])
    // The inviter is told nothing.
    expect(await rowsOf(owner.user.id)).toEqual([])
  })

  test("invitation.received: never to an unverified holder of the address", async () => {
    // Whoever registered someone else's address without proving it must not learn, in-app, which
    // workspaces invite it — the same rule as workspaces.list's pending invitations.
    const owner = await signUpWithWorkspace(app)
    const squatter = await signUp(app)
    const heard = listen(squatter.user.id)
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: squatter.email,
      role: "admin",
    })
    await settle()
    heard.stop()
    expect(await rowsOf(squatter.user.id)).toEqual([])
    expect(heard.events).toEqual([])
    expect(await squatter.client.notifications.unreadCount()).toEqual({ count: 0 })
  })

  test("invitation.received: nobody when no account holds the address", async () => {
    const owner = await signUpWithWorkspace(app)
    const before = await allRowCount()
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: "nobody-yet-notifications@example.com",
      role: "member",
    })
    expect(await allRowCount()).toBe(before)
  })

  test("member.role_changed: to the member, with from and to; a no-op change tells nobody", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    expect(await rowsOf(member.user.id)).toEqual([
      expect.objectContaining({
        type: "member.role_changed",
        workspace_id: workspaceId,
        data: { workspaceName: "Notes", from: "viewer", to: "admin" },
      }),
    ])
    expect(await rowsOf(owner.user.id)).toEqual([])
  })

  test("member.role_changed: an admin changing their own role is not told", async () => {
    const { owner, member: admin, workspaceId } = await ownerAndMember("admin")
    await admin.client.workspaces.members.setRole({
      workspaceId,
      userId: admin.user.id,
      role: "member",
    })
    expect(await rowsOf(admin.user.id)).toEqual([])
    expect(await rowsOf(owner.user.id)).toEqual([])
  })

  test("member.role_changed: a transfer tells the new owner, never the former owner who made it", async () => {
    const { owner, member: admin, workspaceId } = await ownerAndMember("admin")
    const heard = listen(admin.user.id)
    await owner.client.workspaces.transferOwnership({ workspaceId, userId: admin.user.id })
    await until(() => heard.events.length === 1)
    heard.stop()
    expect(await rowsOf(admin.user.id)).toEqual([
      expect.objectContaining({
        type: "member.role_changed",
        workspace_id: workspaceId,
        data: { workspaceName: "Notes", from: "admin", to: "owner" },
      }),
    ])
    // Demoted to admin by their own action: not told.
    expect(await rowsOf(owner.user.id)).toEqual([])
  })

  test("member.removed: to the member removed; leaving or removing yourself tells nobody", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await owner.client.workspaces.members.remove({ workspaceId, userId: member.user.id })
    expect(await rowsOf(member.user.id)).toEqual([
      expect.objectContaining({
        type: "member.removed",
        workspace_id: workspaceId,
        data: { workspaceName: "Notes" },
      }),
    ])
    const leaver = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: leaver.user.id, role: "admin" })
    await leaver.client.workspaces.leave({ workspaceId })
    const self = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: self.user.id, role: "admin" })
    await self.client.workspaces.members.remove({ workspaceId, userId: self.user.id })
    expect(await rowsOf(leaver.user.id)).toEqual([])
    expect(await rowsOf(self.user.id)).toEqual([])
    expect(await rowsOf(owner.user.id)).toEqual([])
  })

  test("workspace.two_factor_required: to each member lacking it, never the owner; off tells nobody", async () => {
    const { owner, member: lacking, workspaceId } = await ownerAndMember()
    await enableTwoFactor(app, owner.user.id)
    const satisfied = await signUpVerified(app)
    await enableTwoFactor(app, satisfied.user.id)
    await app.db.memberships.add({ workspaceId, userId: satisfied.user.id, role: "member" })
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
    expect(await rowsOf(lacking.user.id)).toEqual([
      expect.objectContaining({
        type: "workspace.two_factor_required",
        workspace_id: workspaceId,
        data: { workspaceName: "Notes" },
      }),
    ])
    expect(await rowsOf(satisfied.user.id)).toEqual([])
    expect(await rowsOf(owner.user.id)).toEqual([])
    // Turning it off, and setting it to what it already is, tells nobody.
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: false })
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: false })
    expect(await rowsOf(lacking.user.id)).toHaveLength(1)
  })

  test("export.ready: once, when the export job finishes", async () => {
    const user = await signUpVerified(app)
    const heard = listen(user.user.id)
    await user.client.account.export.request()
    expect(await rowsOf(user.user.id)).toEqual([])
    await app.drain()
    await until(() => heard.events.length === 1)
    heard.stop()
    expect(await rowsOf(user.user.id)).toEqual([
      expect.objectContaining({ type: "export.ready", workspace_id: null, data: {} }),
    ])
  })

  test("export.ready: a failed export transaction tells nobody; the retry tells once", async () => {
    const user = await signUpVerified(app)
    const heard = listen(user.user.id)
    await user.client.account.export.request()
    const restore = failAfterNotify()
    try {
      await app.drain()
    } finally {
      restore()
    }
    await settle()
    expect(await rowsOf(user.user.id)).toEqual([])
    expect(heard.events).toEqual([])
    expect((await user.client.account.export.get())?.status).toBe("pending")
    // The job retries (30 s backoff, ± 20 %) and succeeds: exactly one notification.
    offsetMs = 2 * 60_000
    try {
      await app.drain()
      await app.drain()
    } finally {
      offsetMs = 0
    }
    await until(() => heard.events.length === 1)
    await settle()
    heard.stop()
    expect(await typesOf(user.user.id)).toEqual(["export.ready"])
    expect(heard.events).toHaveLength(1)
    expect((await user.client.account.export.get())?.status).toBe("ready")
  })

  test("plan.changed: each owner but the one who changed it; never another member", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    expect(await rowsOf(coOwner.user.id)).toEqual([
      expect.objectContaining({
        type: "plan.changed",
        workspace_id: workspaceId,
        data: { workspaceName: "Notes", plan: "pro" },
      }),
    ])
    expect(await rowsOf(owner.user.id)).toEqual([])
    expect(await rowsOf(member.user.id)).toEqual([])
    // Cancelling is a change to Free.
    await owner.client.billing.mockChange({ workspaceId, plan: "cancel", interval: "month" })
    expect((await rowsOf(coOwner.user.id)).map((r) => r.data)).toEqual([
      { workspaceName: "Notes", plan: "pro" },
      { workspaceName: "Notes", plan: "free" },
    ])
  })

  test("plan.changed: an interval-only change (Pro monthly → Pro yearly) tells nobody", async () => {
    const { owner, workspaceId } = await ownerAndMember()
    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    const before = await rowsOf(coOwner.user.id)
    expect(before.map((row) => row.data)).toEqual([{ workspaceName: "Notes", plan: "pro" }])
    const heard = listen(coOwner.user.id)
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "year" })
    // The interval did change (so the mirror did write), and the plan did not.
    expect(await owner.client.billing.get({ workspaceId })).toMatchObject({
      plan: "pro",
      interval: "year",
    })
    await settle()
    heard.stop()
    expect(await rowsOf(coOwner.user.id)).toEqual(before)
    expect(heard.events).toEqual([])
    // A real plan change after it still tells.
    await owner.client.billing.mockChange({ workspaceId, plan: "team", interval: "year" })
    expect((await rowsOf(coOwner.user.id)).map((row) => row.data)).toEqual([
      { workspaceName: "Notes", plan: "pro" },
      { workspaceName: "Notes", plan: "team" },
    ])
  })

  test("plan.changed: a provider webhook (no actor) tells every owner, once per event", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    const event = {
      id: `evt_notifications_${workspaceId}`,
      type: "customer.subscription.created",
      createdAt: new Date().toISOString(),
      workspaceId,
      customerId: `cus_notifications_${workspaceId}`,
      customerEmail: null,
      subscription: {
        subscriptionId: `sub_notifications_${workspaceId}`,
        status: "active" as const,
        plan: "team" as const,
        interval: "year" as const,
        currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS).toISOString(),
        cancelAtPeriodEnd: false,
      },
    }
    const events = {
      enqueue: app.enqueue,
      recordFailure: () => {},
      broadcaster: app.broadcaster,
      notificationEmail: mailDeps,
    }
    expect(await applyBillingEvent(app.db, "stripe", event, events)).toEqual({ applied: true })
    // A redelivery changes nothing.
    expect(await applyBillingEvent(app.db, "stripe", event, events)).toMatchObject({
      reason: "duplicate",
    })
    expect(await rowsOf(owner.user.id)).toEqual([
      expect.objectContaining({
        type: "plan.changed",
        data: { workspaceName: "Notes", plan: "team" },
      }),
    ])
    expect(await rowsOf(member.user.id)).toEqual([])
  })

  test("the cancellation ahead of deleting a workspace tells nobody", async () => {
    const { owner, workspaceId } = await ownerAndMember()
    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    const before = await rowsOf(coOwner.user.id)
    expect(before.map((row) => row.type)).toEqual(["plan.changed"])
    await owner.client.workspaces.delete({ workspaceId })
    expect(await rowsOf(coOwner.user.id)).toEqual(before)
    expect(await rowsOf(owner.user.id)).toEqual([])
  })
})

describe("a change that rolls back creates no notification and publishes nothing", () => {
  test("role change, removal, invitation, two-step requirement, plan change and transfer", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await enableTwoFactor(app, owner.user.id)
    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    const invitee = await signUpVerified(app)
    const heard = [member, coOwner, invitee].map((u) => listen(u.user.id))
    // Paid, so the invitation has a seat (Free holds three members). Its own plan.changed for the
    // co-owner (a NOTIFY on Postgres) lands before the test proper starts counting.
    await app.billing.change(workspaceId, "pro", "month")
    await until(() => heard[1]?.events.length === 1)
    await settle()
    for (const h of heard) h.events.length = 0
    const before = await allRowCount()

    const restore = failAfterNotify()
    // One after another, each its own transaction.
    const calls: Array<() => Promise<unknown>> = [
      () =>
        owner.client.workspaces.members.setRole({
          workspaceId,
          userId: member.user.id,
          role: "admin",
        }),
      () => owner.client.workspaces.members.remove({ workspaceId, userId: member.user.id }),
      () =>
        owner.client.workspaces.invitations.create({
          workspaceId,
          email: invitee.email,
          role: "member",
        }),
      () => owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true }),
      () => owner.client.billing.mockChange({ workspaceId, plan: "team", interval: "month" }),
      () => owner.client.workspaces.transferOwnership({ workspaceId, userId: member.user.id }),
    ]
    const errors: unknown[] = []
    for (const call of calls) errors.push((await safe(call()))[0])
    restore()
    await settle()
    for (const h of heard) h.stop()

    for (const error of errors) expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(await allRowCount()).toBe(before)
    for (const h of heard) expect(h.events).toEqual([])
    // …and none of the changes happened.
    expect(await app.db.memberships.find(workspaceId, member.user.id)).toMatchObject({
      role: "member",
    })
    expect((await owner.client.workspaces.get({ workspaceId })).requireTwoFactor).toBe(false)
    expect((await owner.client.billing.get({ workspaceId })).plan).toBe("pro")
    expect((await owner.client.workspaces.invitations.list({ workspaceId })).items).toEqual([])
  })
})

describe("notifications.prune", () => {
  test("deletes read rows older than 30 days and any row older than 90; keeps the rest", async () => {
    const user = await signUpVerified(app)
    const ages = [
      ["read-29", 29, true],
      ["read-31", 31, true],
      ["unread-89", 89, false],
      ["unread-91", 91, false],
      ["read-91", 91, true],
    ] as const
    const ids = new Map<string, number>()
    for (const [name, ageDays, read] of ages) {
      const at = new Date(now().getTime() - ageDays * DAY_MS).toISOString()
      const { id } = await app.db.notifications.create({
        userId: user.user.id,
        workspaceId: null,
        type: "export.ready",
        data: "{}",
        createdAt: at,
      })
      if (read) await app.db.notifications.markRead(user.user.id, [id], at)
      ids.set(name, id)
    }
    await createEnqueue({ db: app.db, now })(notificationsPruneJob, {})
    await app.drain()
    expect((await rowsOf(user.user.id)).map((row) => row.id)).toEqual([
      ids.get("read-29") as number,
      ids.get("unread-89") as number,
    ])
  })

  test("is scheduled nightly at 04:05", async () => {
    const { SCHEDULES, jobByName } = await import("./jobs/registry")
    expect(SCHEDULES.find((s) => s.name === "notifications.prune")?.cron).toBe("5 4 * * *")
    expect(jobByName("notifications.prune")?.name).toBe(notificationsPruneJob.name)
  })
})
