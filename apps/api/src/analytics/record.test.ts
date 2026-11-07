import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { decodeBase32IgnorePadding } from "@oslojs/encoding"
import { type ApiClient, SEAT_LIMIT_MESSAGE } from "@repo/api-contract"
import { invitationSubject, magicLinkSubject } from "@repo/email"
import type { Queries } from "../db"
import type { EventRow } from "../queries/analytics"
import { clientFor, mailsTo, providersWith, signedIn, signUp, start, verify } from "../test-server"
import { totpCodeAt } from "../two-factor/totp"
import { noopEvents, type RecordEventContext, recordEvent } from "./record"

const ROOT = "record-root@example.com"
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    // A distinct verified identity per `code`, so each callback can create its own account.
    providers: providersWith({
      google: ({ code }) => ({
        providerUserId: `google-${code}`,
        email: `google-${code}@example.com`,
        emailVerified: true,
        name: "Google user",
      }),
    }),
  })
})
afterAll(() => app.stop())

const nowSeconds = () => Math.floor(Date.now() / 1000)
const codeFor = (secretBase32: string) =>
  totpCodeAt(decodeBase32IgnorePadding(secretBase32), nowSeconds())

/**
 * Every row recorded for a given UTC day — `app.drain()`'s own `new Date()` call and this one
 * (a moment apart) could, right at midnight, land on either side of it, so this checks both
 * today's and yesterday's bucket rather than risk a flake nobody can reproduce on demand.
 */
async function todaysAndYesterdaysEvents(): Promise<EventRow[]> {
  await app.drain()
  const now = Date.now()
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const [today, yesterday] = await Promise.all([
    app.db.analytics.eventsForDay(day(now)),
    app.db.analytics.eventsForDay(day(now - 24 * 60 * 60 * 1000)),
  ])
  return [...today, ...yesterday]
}

/**
 * Every row of `name` for `userId` (and `workspaceId` when given; `undefined` for either matches
 * any value, including null — used by the "leaves no new row" checks below, which care about the
 * total count, not one identity).
 */
async function eventsFor(
  name: string,
  userId?: number,
  workspaceId: number | null | undefined = null
): Promise<EventRow[]> {
  const rows = await todaysAndYesterdaysEvents()
  return rows.filter(
    (r) =>
      r.name === name &&
      (userId === undefined || r.user_id === userId) &&
      (workspaceId === undefined || r.workspace_id === workspaceId)
  )
}

/** A verified account. */
async function verifiedUser(email?: string) {
  const user = await signUp(app, email)
  await verify(app, user.email)
  return user
}

/** Requests a magic link for `email` and returns the token from the newest mailed link. */
async function magicToken(email: string) {
  const before = app.mailer.sent.filter((m) => m.to === email && m.subject === magicLinkSubject)
  await clientFor(app).auth.magicLink.request({ email })
  const mails = await mailsTo(app, email, magicLinkSubject, before.length + 1)
  return mails.at(-1)?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
}

let root: ApiClient | undefined
/** A client signed in as the superadmin (created on first use). */
async function adminClient(): Promise<ApiClient> {
  root ??= (await verifiedUser(ROOT)).client
  return root
}

const inviteLinkOf = (text: string | undefined) =>
  text?.match(/http:\/\/app\.example\.com\/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""

/** Invites `email` to the workspace and returns the token from the mailed link. */
async function invite(client: ApiClient, workspaceId: number, email: string) {
  const { name } = await client.workspaces.get({ workspaceId })
  const subject = invitationSubject(name)
  const before = app.mailer.sent.filter((m) => m.to === email && m.subject === subject).length
  await client.workspaces.invitations.create({ workspaceId, email, role: "member" })
  const mails = await mailsTo(app, email, subject, before + 1)
  return inviteLinkOf(mails.at(-1)?.text)
}

describe("recordEvent: product events from instrumented procedures", () => {
  test("auth.signUp: one signed_up {method: password}, no visitor_id, source api", async () => {
    const { user } = await signUp(app)
    const rows = await eventsFor("signed_up", user.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: "api", visitor_id: null, workspace_id: null })
    expect(JSON.parse(rows[0]?.props ?? "null")).toEqual({ method: "password" })
  })

  test("a rejected duplicate sign-up adds no signed_up row at all", async () => {
    const email = `dupe-${Date.now()}@example.com`
    const { user } = await signUp(app, email)
    // The total count of every signed_up row right now, not just this user's: the point is that
    // the conflicting call added nothing anywhere, which "still exactly 1 for this user" alone
    // would not actually prove (there is no second user whose absence of rows would say so).
    const before = await eventsFor("signed_up", undefined, undefined)
    expect(before.filter((r) => r.user_id === user.id)).toHaveLength(1)
    const [err] = await safe(clientFor(app).auth.signUp({ email, password: "whatever password" }))
    expect(err).toMatchObject({ code: "CONFLICT" })
    expect(await eventsFor("signed_up", undefined, undefined)).toEqual(before)
  })

  test("auth.verifyEmail: one email_verified", async () => {
    const { user, email } = await signUp(app)
    await verify(app, email)
    expect(await eventsFor("email_verified", user.id)).toHaveLength(1)
  })

  test("auth.oauth.callback creating a new account: one signed_up {method: provider id}", async () => {
    const result = signedIn(
      await clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
    )
    const rows = await eventsFor("signed_up", result.user.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.props ?? "null")).toEqual({ method: "google" })
  })

  test("auth.oauth.callback creating a new account: one email_verified (created verified)", async () => {
    const result = signedIn(
      await clientFor(app).auth.oauth.callback({ provider: "google", code: `v-${Date.now()}` })
    )
    expect(await eventsFor("email_verified", result.user.id)).toHaveLength(1)
  })

  test("auth.magicLink.consume creating a new account: one email_verified (created verified)", async () => {
    const email = `magic-ev-${Date.now()}@example.com`
    const result = signedIn(
      await clientFor(app).auth.magicLink.consume({ token: await magicToken(email) })
    )
    expect(await eventsFor("email_verified", result.user.id)).toHaveLength(1)
  })

  test("a magic link purging an unverified account records one email_verified, and the old verify link adds none", async () => {
    const { user, email } = await signUp(app)
    expect(await eventsFor("email_verified", user.id)).toHaveLength(0)
    signedIn(await clientFor(app).auth.magicLink.consume({ token: await magicToken(email) }))
    expect(await eventsFor("email_verified", user.id)).toHaveLength(1)
    // The verify link mailed at sign-up is still valid: following it now verifies nothing new.
    await verify(app, email)
    expect(await eventsFor("email_verified", user.id)).toHaveLength(1)
  })

  test("a magic link for an already verified account records no second email_verified", async () => {
    const { user, email } = await verifiedUser()
    expect(await eventsFor("email_verified", user.id)).toHaveLength(1)
    signedIn(await clientFor(app).auth.magicLink.consume({ token: await magicToken(email) }))
    expect(await eventsFor("email_verified", user.id)).toHaveLength(1)
  })

  test("auth.magicLink.consume creating a new account: one signed_up {method: magic_link}", async () => {
    const email = `magic-su-${Date.now()}@example.com`
    await clientFor(app).auth.magicLink.request({ email })
    const [mail] = await mailsTo(app, email, magicLinkSubject)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const result = signedIn(await clientFor(app).auth.magicLink.consume({ token }))
    const rows = await eventsFor("signed_up", result.user.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.props ?? "null")).toEqual({ method: "magic_link" })
  })

  test("workspaces.create: one workspace_created", async () => {
    const { client, user } = await verifiedUser()
    const ws = await client.workspaces.create({ name: "Recorded" })
    const rows = await eventsFor("workspace_created", user.id, ws.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.props ?? "null")).toEqual({})
  })

  test("workspaces.invitations.create: one member_invited {role}", async () => {
    const owner = await verifiedUser()
    const ws = await owner.client.workspaces.create({ name: "Invites" })
    const invitee = await verifiedUser()
    await invite(owner.client, ws.id, invitee.email)
    const rows = await eventsFor("member_invited", owner.user.id, ws.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.props ?? "null")).toEqual({ role: "member" })
  })

  test("invitations.accept: one invitation_accepted", async () => {
    const owner = await verifiedUser()
    const ws = await owner.client.workspaces.create({ name: "Accept" })
    const invitee = await verifiedUser()
    const token = await invite(owner.client, ws.id, invitee.email)
    await invitee.client.invitations.accept({ token })
    expect(await eventsFor("invitation_accepted", invitee.user.id, ws.id)).toHaveLength(1)
  })

  test("invitations.acceptById: one invitation_accepted", async () => {
    const owner = await verifiedUser()
    const ws = await owner.client.workspaces.create({ name: "AcceptById" })
    const invitee = await verifiedUser()
    await invite(owner.client, ws.id, invitee.email)
    const pending = (await invitee.client.workspaces.list()).pendingInvitations
    const id = pending[0]?.id as number
    await invitee.client.invitations.acceptById({ id })
    expect(await eventsFor("invitation_accepted", invitee.user.id, ws.id)).toHaveLength(1)
  })

  test("notes.create: one note_created", async () => {
    const { client, user } = await verifiedUser()
    const ws = await client.workspaces.create({ name: "Notes" })
    await client.notes.create({ workspaceId: ws.id, title: "T", body: "B" })
    expect(await eventsFor("note_created", user.id, ws.id)).toHaveLength(1)
  })

  test("funnel: a magic-link sign-up reaches workspace_created without auth.verifyEmail", async () => {
    const admin = await adminClient()
    await app.drain()
    const steps = async () =>
      new Map(
        (await admin.admin.analytics.summary({ days: 7 })).funnel.map((f) => [f.step, f.users])
      )
    const before = await steps()
    const email = `magic-funnel-${Date.now()}@example.com`
    const { session } = signedIn(
      await clientFor(app).auth.magicLink.consume({ token: await magicToken(email) })
    )
    await clientFor(app, session.token).workspaces.create({ name: "Funnel" })
    await app.drain()
    const after = await steps()
    const delta = (step: string) => (after.get(step) ?? 0) - (before.get(step) ?? 0)
    expect(delta("signed_up")).toBe(1)
    expect(delta("email_verified")).toBe(1)
    expect(delta("workspace_created")).toBe(1)
  })

  test("notes.create in an impersonation session records nothing for the user", async () => {
    const owner = await verifiedUser()
    const ws = await owner.client.workspaces.create({ name: "Impersonated" })
    const admin = await adminClient()
    const { token } = await admin.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
    })
    await clientFor(app, token).notes.create({ workspaceId: ws.id, title: "T", body: "B" })
    expect(await eventsFor("note_created", owner.user.id, ws.id)).toHaveLength(0)
    // The user's own note, outside the impersonation, is still theirs.
    await owner.client.notes.create({ workspaceId: ws.id, title: "Mine", body: "" })
    expect(await eventsFor("note_created", owner.user.id, ws.id)).toHaveLength(1)
  })

  test("account.twoFactor.enable: one two_factor_enabled", async () => {
    const { client, user } = await verifiedUser()
    const { secret } = await client.account.twoFactor.setup({
      currentPassword: "correct horse battery",
    })
    await client.account.twoFactor.enable({ code: codeFor(secret) })
    expect(await eventsFor("two_factor_enabled", user.id)).toHaveLength(1)
  })

  describe("billing.checkout / mockChange: plan_changed only when the plan actually changes", () => {
    const planChangedRows = (workspaceId: number) =>
      eventsFor("plan_changed", undefined, workspaceId)

    test("activating a plan records one plan_changed; the same plan again records none more", async () => {
      const { client } = await verifiedUser()
      const ws = await client.workspaces.create({ name: "Billing" })
      await client.billing.checkout({ workspaceId: ws.id, plan: "pro", interval: "month" })
      const afterCheckout = await planChangedRows(ws.id)
      expect(afterCheckout).toHaveLength(1)
      expect(JSON.parse(afterCheckout[0]?.props ?? "null")).toEqual({
        plan: "pro",
        interval: "month",
      })

      await client.billing.mockChange({ workspaceId: ws.id, plan: "pro", interval: "month" })
      expect(await planChangedRows(ws.id)).toHaveLength(1)

      await client.billing.mockChange({ workspaceId: ws.id, plan: "team", interval: "month" })
      const afterUpgrade = await planChangedRows(ws.id)
      expect(afterUpgrade).toHaveLength(2)
      expect(JSON.parse(afterUpgrade[1]?.props ?? "null")).toEqual({
        plan: "team",
        interval: "month",
      })
    })
  })

  describe("a failed or rolled-back write leaves no event", () => {
    test("workspaces.invitations.create refused at the seat limit (the check runs before any write starts) enqueues no member_invited", async () => {
      const owner = await verifiedUser()
      const ws = await owner.client.workspaces.create({ name: "SeatsInvite" })
      const a = await verifiedUser()
      const b = await verifiedUser()
      const tokenA = await invite(owner.client, ws.id, a.email)
      await a.client.invitations.accept({ token: tokenA })
      const tokenB = await invite(owner.client, ws.id, b.email)
      await b.client.invitations.accept({ token: tokenB }) // 3 members: owner, a, b — at the limit

      const before = await eventsFor("member_invited", owner.user.id, ws.id)
      const [err] = await safe(
        owner.client.workspaces.invitations.create({
          workspaceId: ws.id,
          email: "fourth@example.com",
          role: "member",
        })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })
      expect(await eventsFor("member_invited", owner.user.id, ws.id)).toEqual(before)
    })

    test("invitations.acceptById refused at the seat limit after the invitation is marked accepted (a genuine transaction rollback) enqueues no invitation_accepted", async () => {
      const owner = await verifiedUser()
      const ws = await owner.client.workspaces.create({ name: "SeatsAccept" })
      const a = await verifiedUser()
      const b = await verifiedUser()
      const c = await verifiedUser()
      const tokenA = await invite(owner.client, ws.id, a.email)
      // b's invitation is created while there is room, and accepted only after the room is gone.
      await invite(owner.client, ws.id, b.email)
      await a.client.invitations.accept({ token: tokenA })
      const tokenC = await invite(owner.client, ws.id, c.email)
      await c.client.invitations.accept({ token: tokenC }) // 3 members: owner, a, c — at the limit

      const pending = (await b.client.workspaces.list()).pendingInvitations
      const id = pending[0]?.id as number
      // Unlike the invite-time seat check above, `acceptInvitation`'s own check runs *inside* the
      // transaction, after `tx.invitations.accept` already marked the row accepted: the whole
      // transaction — the accept and the would-be event together — rolls back, not just a write
      // that never started.
      const [err] = await safe(b.client.invitations.acceptById({ id }))
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })
      expect(await eventsFor("invitation_accepted", b.user.id, ws.id)).toHaveLength(0)
      // The successful accepts (a, c) still recorded theirs.
      expect(await eventsFor("invitation_accepted", a.user.id, ws.id)).toHaveLength(1)
      expect(await eventsFor("invitation_accepted", c.user.id, ws.id)).toHaveLength(1)
    })
  })
})

describe("recordEvent: an enqueue failure, with vs. without a transaction", () => {
  function failingContext() {
    const failures: Array<{ message: string; error: unknown }> = []
    const context: RecordEventContext = {
      enqueue: async () => {
        throw new Error("enqueue boom")
      },
      recordFailure: (message, error) => {
        failures.push({ message, error })
      },
    }
    return { context, failures }
  }

  test("inside a transaction, the failure propagates and nothing is recorded as a detached failure", async () => {
    const { context, failures } = failingContext()
    await expect(
      recordEvent(context, "note_created", { userId: 1, workspaceId: 1 }, {}, { tx: {} as Queries })
    ).rejects.toThrow("enqueue boom")
    expect(failures).toHaveLength(0)
  })

  test("without a transaction, the failure is caught and recorded instead of thrown", async () => {
    const { context, failures } = failingContext()
    await expect(
      recordEvent(context, "note_created", { userId: 1, workspaceId: 1 }, {})
    ).resolves.toBeUndefined()
    expect(failures).toHaveLength(1)
    expect(failures[0]?.message).toContain("note_created")
  })

  test("an impersonating context enqueues nothing, not even inside a transaction", async () => {
    const { context, failures } = failingContext()
    const impersonating = { ...context, impersonating: true }
    await expect(
      recordEvent(impersonating, "note_created", { userId: 1, workspaceId: 1 }, {})
    ).resolves.toBeUndefined()
    await expect(
      recordEvent(
        impersonating,
        "note_created",
        { userId: 1, workspaceId: 1 },
        {},
        { tx: {} as Queries }
      )
    ).resolves.toBeUndefined()
    expect(failures).toHaveLength(0)
  })

  test("noopEvents resolves without enqueueing or recording anything", async () => {
    await expect(
      recordEvent(noopEvents, "note_created", { userId: 1, workspaceId: 1 }, {})
    ).resolves.toBeUndefined()
  })
})
