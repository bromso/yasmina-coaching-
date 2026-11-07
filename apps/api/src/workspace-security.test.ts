import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { invitationSubject, workspaceTwoFactorRequiredSubject } from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { exportedMetadata } from "./jobs/builtin/privacy"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"
import { activityDetails } from "./workspace-activity"

// Enforced two-step verification per workspace (Phase 12 B), the owner's control: the setting
// (`workspaces.security.get` / `set`), its audit row and mail, the members list's `twoFactor` and
// the invitation preview's `requireTwoFactor`.

const ROOT = "root@example.com"
type App = Awaited<ReturnType<typeof start>>
let app: App
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const ACTION = "workspace.two_factor_requirement_changed"
const SUBJECT = workspaceTwoFactorRequiredSubject
const SV_SUBJECT = translatorFor("sv", "email")("workspaceTwoFactorRequired.subject")

let credentials = 0
const addPasskey = (userId: number) =>
  app.db.passkeys.create({
    userId,
    credentialId: `sec-cred-${++credentials}-${userId}`,
    publicKey: "pk",
    counter: 0,
    transports: null,
    name: "Key",
  })

type AuditRow = { actor_user_id: number | null; target_type: string; metadata: string | null }
const auditRows = (workspaceId: number) =>
  app.db.sql`
    SELECT * FROM audit_log WHERE workspace_id = ${workspaceId} AND action = ${ACTION} ORDER BY id
  ` as Promise<AuditRow[]>

/** Every message sent so far (after draining the queue) with `subject`, to any address. */
async function sentWith(...subjects: string[]) {
  await app.drain()
  return app.mailer.sent.filter((m) => subjects.includes(m.subject))
}

/**
 * An owner with two-step on (workspace "Acme"), plus members: one with two-step, one with a
 * passkey only, and two with neither (an admin and a viewer, the viewer having chosen Swedish).
 */
async function team() {
  const owner = await signUpWithWorkspace(app)
  await enableTwoFactor(app, owner.user.id)
  const workspaceId = owner.workspaceId
  await owner.client.workspaces.update({ workspaceId, name: "Acme" })
  const add = async (role: "viewer" | "member" | "admin") => {
    const user = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: user.user.id, role })
    return user
  }
  const withTotp = await add("member")
  await enableTwoFactor(app, withTotp.user.id)
  const withPasskey = await add("member")
  await addPasskey(withPasskey.user.id)
  const adminWithout = await add("admin")
  const viewerWithout = await add("viewer")
  await viewerWithout.client.account.setLocale({ locale: "sv" })
  return { owner, workspaceId, withTotp, withPasskey, adminWithout, viewerWithout }
}

describe("workspaces.security.set", () => {
  test("turning it on: writes, audits once, mails exactly the members without two-step", async () => {
    const t = await team()
    const before = (await sentWith(SUBJECT, SV_SUBJECT)).length
    const result = await t.owner.client.workspaces.security.set({
      workspaceId: t.workspaceId,
      requireTwoFactor: true,
    })
    expect(result).toEqual({ requireTwoFactor: true })
    expect(
      (await t.owner.client.workspaces.get({ workspaceId: t.workspaceId })).requireTwoFactor
    ).toBe(true)

    const rows = await auditRows(t.workspaceId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actor_user_id: t.owner.user.id, target_type: "workspace" })
    expect(JSON.parse(rows[0]?.metadata ?? "null")).toEqual({ enabled: true })

    const [en] = await mailsTo(app, t.adminWithout.email, SUBJECT)
    expect(en?.text).toContain("Acme now requires every member")
    expect(en?.text).toContain("http://account.example.com/security")
    // Never another member's name or address.
    for (const other of [t.owner, t.withTotp, t.withPasskey, t.viewerWithout]) {
      expect(en?.text).not.toContain(other.email)
    }
    // The Swedish viewer gets it in their saved locale.
    const [sv] = await mailsTo(app, t.viewerWithout.email, SV_SUBJECT)
    expect(sv?.text).toContain("Acme kräver nu")

    const mailed = (await sentWith(SUBJECT, SV_SUBJECT)).slice(before).map((m) => m.to)
    expect(mailed.sort()).toEqual([t.adminWithout.email, t.viewerWithout.email].sort())
  })

  test("a repeat on, a no-op off and then turning it off: no mail, one audit row per change", async () => {
    const t = await team()
    const set = (requireTwoFactor: boolean) =>
      t.owner.client.workspaces.security.set({ workspaceId: t.workspaceId, requireTwoFactor })

    // Off while already off: nothing at all.
    expect(await set(false)).toEqual({ requireTwoFactor: false })
    expect(await auditRows(t.workspaceId)).toHaveLength(0)

    await set(true)
    await mailsTo(app, t.adminWithout.email, SUBJECT)
    const afterOn = (await sentWith(SUBJECT, SV_SUBJECT)).length

    // On again: a no-op — no write, no audit row, no second mail.
    expect(await set(true)).toEqual({ requireTwoFactor: true })
    expect(await auditRows(t.workspaceId)).toHaveLength(1)

    // Off: audited, never mailed, and the members are unblocked at once.
    expect(await set(false)).toEqual({ requireTwoFactor: false })
    const rows = await auditRows(t.workspaceId)
    expect(rows.map((r) => JSON.parse(r.metadata ?? "null"))).toEqual([
      { enabled: true },
      { enabled: false },
    ])
    expect((await sentWith(SUBJECT, SV_SUBJECT)).length).toBe(afterOn)
    expect((await t.adminWithout.client.notes.list({ workspaceId: t.workspaceId })).items).toEqual(
      []
    )
  })

  test("concurrent identical changes write, audit and mail once", async () => {
    const t = await team()
    const before = (await sentWith(SUBJECT, SV_SUBJECT)).length
    await Promise.all(
      [1, 2, 3].map(() =>
        t.owner.client.workspaces.security.set({
          workspaceId: t.workspaceId,
          requireTwoFactor: true,
        })
      )
    )
    expect(await auditRows(t.workspaceId)).toHaveLength(1)
    await mailsTo(app, t.adminWithout.email, SUBJECT)
    expect((await sentWith(SUBJECT, SV_SUBJECT)).length - before).toBe(2)
  })

  test("an owner without two-step cannot turn it on (owner_two_factor), en and sv", async () => {
    const owner = await signUpWithWorkspace(app)
    const workspaceId = owner.workspaceId
    for (const [client, message] of [
      [owner.client, "Turn on two-step verification for your own account first."],
      [clientFor(app, owner.token, "sv"), "Slå på tvåstegsverifiering för ditt eget konto först."],
    ] as const) {
      const [error, , isDefined] = await safe(
        client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403, message })
      // The reason code only: no name, count or id.
      expect((error as unknown as { data: object }).data).toEqual({ reason: "owner_two_factor" })
      expect(isDefined).toBe(true)
    }
    expect((await owner.client.workspaces.get({ workspaceId })).requireTwoFactor).toBe(false)
    expect(await auditRows(workspaceId)).toHaveLength(0)
  })

  test("a passkey alone lets the owner turn it on", async () => {
    const owner = await signUpWithWorkspace(app)
    await addPasskey(owner.user.id)
    const result = await owner.client.workspaces.security.set({
      workspaceId: owner.workspaceId,
      requireTwoFactor: true,
    })
    expect(result.requireTwoFactor).toBe(true)
  })

  test("an owner who later drops two-step is blocked like anyone, and can still recover", async () => {
    const owner = await signUpWithWorkspace(app)
    await enableTwoFactor(app, owner.user.id)
    const workspaceId = owner.workspaceId
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
    await app.db.sql`UPDATE users SET two_factor_enabled_at = NULL WHERE id = ${owner.user.id}`

    // Turning it off or on again is refused by the middleware, with its own reason.
    for (const requireTwoFactor of [false, true]) {
      const [error] = await safe(
        owner.client.workspaces.security.set({ workspaceId, requireTwoFactor })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN", data: { reason: "two_factor_required" } })
    }
    // account.* still answers, so they can fix it; leave keeps its last-owner rule.
    expect((await owner.client.account.twoFactor.get()).enabled).toBe(false)
    const [leave] = await safe(owner.client.workspaces.leave({ workspaceId }))
    expect(leave).toMatchObject({ code: "CONFLICT" })
    // Fixing it lets them back in.
    await addPasskey(owner.user.id)
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: false })
  })

  test("owner only: an admin is refused, whatever their two-step", async () => {
    const t = await team()
    await enableTwoFactor(app, t.adminWithout.user.id)
    const [error] = await safe(
      t.adminWithout.client.workspaces.security.set({
        workspaceId: t.workspaceId,
        requireTwoFactor: true,
      })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the owner role" })
    expect((error as { data?: unknown }).data).toBeUndefined()
  })

  test("a non-member gets NOT_FOUND", async () => {
    const owner = await signUpWithWorkspace(app)
    const outsider = await signUpVerified(app)
    await enableTwoFactor(app, outsider.user.id)
    const [error] = await safe(
      outsider.client.workspaces.security.set({
        workspaceId: owner.workspaceId,
        requireTwoFactor: true,
      })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("refused while impersonating, even for a satisfied owner", async () => {
    const owner = await signUpWithWorkspace(app)
    await enableTwoFactor(app, owner.user.id)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
    })
    const asOwner = clientFor(app, token)
    const [error] = await safe(
      asOwner.workspaces.security.set({ workspaceId: owner.workspaceId, requireTwoFactor: true })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Not available while impersonating" })
    expect(
      (await owner.client.workspaces.get({ workspaceId: owner.workspaceId })).requireTwoFactor
    ).toBe(false)
    // Reading is fine while impersonating.
    expect(
      (await asOwner.workspaces.security.get({ workspaceId: owner.workspaceId })).requireTwoFactor
    ).toBe(false)
    await asOwner.admin.stopImpersonation()
  })
})

describe("workspaces.security.get", () => {
  test("admin and up: the setting and how many members lack two-step", async () => {
    const t = await team()
    const get = () => t.owner.client.workspaces.security.get({ workspaceId: t.workspaceId })
    // The admin and the viewer lack it; a passkey or two-step counts.
    expect(await get()).toEqual({
      requireTwoFactor: false,
      membersWithoutTwoFactor: 2,
      inviteDomains: [],
    })
    expect(
      await t.adminWithout.client.workspaces.security.get({ workspaceId: t.workspaceId })
    ).toEqual({ requireTwoFactor: false, membersWithoutTwoFactor: 2, inviteDomains: [] })
    await t.owner.client.workspaces.security.set({
      workspaceId: t.workspaceId,
      requireTwoFactor: true,
    })
    await addPasskey(t.adminWithout.user.id)
    expect(await get()).toEqual({
      requireTwoFactor: true,
      membersWithoutTwoFactor: 1,
      inviteDomains: [],
    })
  })

  test("below admin it is refused (role first)", async () => {
    const t = await team()
    for (const member of [t.withTotp, t.viewerWithout]) {
      const [error] = await safe(
        member.client.workspaces.security.get({ workspaceId: t.workspaceId })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
    }
  })
})

describe("workspaces.members.list twoFactor", () => {
  test("a yes/no for admin and up, null below admin", async () => {
    const t = await team()
    const byUser = (items: Array<{ userId: number; twoFactor: boolean | null }>) =>
      Object.fromEntries(items.map((m) => [m.userId, m.twoFactor]))

    for (const client of [t.owner.client, t.adminWithout.client]) {
      const { items } = await client.workspaces.members.list({ workspaceId: t.workspaceId })
      expect(byUser(items)).toEqual({
        [t.owner.user.id]: true,
        [t.withTotp.user.id]: true,
        [t.withPasskey.user.id]: true,
        [t.adminWithout.user.id]: false,
        [t.viewerWithout.user.id]: false,
      })
    }
    for (const client of [t.withTotp.client, t.viewerWithout.client]) {
      const { items } = await client.workspaces.members.list({ workspaceId: t.workspaceId })
      expect(items).toHaveLength(5)
      for (const item of items) {
        expect(item.twoFactor).toBeNull()
        expect(item.email).toBeNull()
      }
    }
  })
})

describe("invitations.preview requireTwoFactor", () => {
  test("says whether the workspace requires two-step", async () => {
    const owner = await signUpWithWorkspace(app)
    await enableTwoFactor(app, owner.user.id)
    const workspaceId = owner.workspaceId
    await owner.client.workspaces.update({ workspaceId, name: "Preview Co" })
    const token = async (email: string) => {
      await owner.client.workspaces.invitations.create({ workspaceId, email, role: "member" })
      const [mail] = await mailsTo(app, email, invitationSubject("Preview Co"))
      return mail?.text.match(/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""
    }
    const anonymous = clientFor(app)
    const first = await anonymous.invitations.preview({ token: await token("p1@example.com") })
    expect(first.requireTwoFactor).toBe(false)
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
    const second = await anonymous.invitations.preview({ token: await token("p2@example.com") })
    expect(second.requireTwoFactor).toBe(true)
  })
})

describe("the activity log and the data export", () => {
  test("the change is listed with only `enabled`, and the export keeps only `enabled`", async () => {
    const owner = await signUpWithWorkspace(app)
    await enableTwoFactor(app, owner.user.id)
    const workspaceId = owner.workspaceId
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
    const page = await owner.client.workspaces.activity.list({ workspaceId, action: ACTION })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      action: ACTION,
      actor: { kind: "member", userId: owner.user.id },
      target: { type: "workspace", id: String(workspaceId) },
      details: { enabled: true },
    })

    expect(activityDetails(ACTION, { enabled: false, extra: "x" })).toEqual({ enabled: false })
    expect(activityDetails(ACTION, { enabled: "yes" })).toEqual({})
    expect(exportedMetadata(ACTION, JSON.stringify({ enabled: true, extra: "x" }))).toEqual({
      enabled: true,
    })
  })
})
