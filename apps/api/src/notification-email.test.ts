// Notification preferences and email (Phase 13 B): the unsubscribe token, the three optional
// notification mails and their List-Unsubscribe headers, `account.notificationPreferences.*` and
// `auth.notificationEmail.*`. Runs on SQLite, and on Postgres with TEST_DATABASE_URL. The export
// and purge are covered in privacy.test.ts and queries.test.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHmac, hkdfSync } from "node:crypto"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ApiClient,
  IMPERSONATING_MESSAGE,
  NOTIFICATION_EMAIL,
  type NotificationPreference,
  type OptionalNotificationEmailType,
} from "@repo/api-contract"
import {
  emails,
  invitationSubject,
  planChangedSubject,
  removedFromWorkspaceSubject,
  roleChangedSubject,
  workspaceTwoFactorRequiredSubject,
} from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type { Queries } from "./db"
import { DEV_TWO_FACTOR_KEY } from "./env"
import {
  mintUnsubscribeToken,
  NOTIFICATION_UNSUBSCRIBE_LABEL,
  unsubscribeHeaders,
  unsubscribeKey,
  verifyUnsubscribeToken,
} from "./notification-email"
import {
  auth,
  clientFor,
  enableTwoFactor,
  mailsTo,
  type Sent,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"

const KEY = DEV_TWO_FACTOR_KEY
const OTHER_KEY = Buffer.alloc(32, 7).toString("base64")
const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

/** A mac under the derived unsubscribe key, as the api computes it — for forging test payloads. */
const derivedMac = (payload: string, key = KEY) =>
  createHmac(
    "sha256",
    Buffer.from(
      hkdfSync(
        "sha256",
        Buffer.from(key, "base64"),
        Buffer.alloc(0),
        NOTIFICATION_UNSUBSCRIBE_LABEL,
        32
      )
    )
  )
    .update(payload)
    .digest()
/** A token for any payload, correctly signed: what only the key holder could make. */
const signed = (payload: string) => `${b64url(payload)}.${b64url(derivedMac(payload))}`

describe("the unsubscribe token", () => {
  test("round-trips one user and one optional type", () => {
    for (const type of NOTIFICATION_EMAIL.optional) {
      const token = mintUnsubscribeToken(KEY, 42, type)
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/)
      expect(verifyUnsubscribeToken(KEY, token)).toEqual({ userId: 42, type })
      // The payload is the user, the type and the version, nothing else.
      expect(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()).toBe(`42.${type}.1`)
    }
  })

  test("cannot be minted for a locked type or a bad user id", () => {
    for (const type of NOTIFICATION_EMAIL.locked) {
      expect(() =>
        mintUnsubscribeToken(KEY, 1, type as unknown as OptionalNotificationEmailType)
      ).toThrow()
    }
    for (const id of [0, -1, 1.5, Number.NaN, 2 ** 60]) {
      expect(() => mintUnsubscribeToken(KEY, id, "plan.changed")).toThrow()
    }
  })

  test("a correctly signed token naming a locked or unknown type, or another version, is invalid", () => {
    for (const type of NOTIFICATION_EMAIL.locked) {
      expect(verifyUnsubscribeToken(KEY, signed(`1.${type}.1`))).toBeNull()
    }
    for (const payload of [
      "1.plan.changed.2",
      "1.plan.changed",
      "1.plan.changed.1.1",
      "01.plan.changed.1",
      "0.plan.changed.1",
      "-1.plan.changed.1",
      "1.PLAN.CHANGED.1",
      "1.plan.changed .1",
      " 1.plan.changed.1",
      "1.member.removed.x.1",
      "99999999999999999.plan.changed.1",
    ]) {
      expect(verifyUnsubscribeToken(KEY, signed(payload))).toBeNull()
    }
    // The control: the same construction for a real payload is accepted.
    expect(verifyUnsubscribeToken(KEY, signed("1.plan.changed.1"))).toEqual({
      userId: 1,
      type: "plan.changed",
    })
  })

  test("a forged, altered, truncated or re-encoded token is invalid", () => {
    const token = mintUnsubscribeToken(KEY, 7, "member.removed")
    const [payload, mac] = token.split(".") as [string, string]
    const flip = (s: string, i: number) =>
      `${s.slice(0, i)}${s[i] === "A" ? "B" : "A"}${s.slice(i + 1)}`
    const otherUser = b64url("8.member.removed.1")
    const otherType = b64url("7.plan.changed.1")
    const bad = [
      "",
      ".",
      payload,
      `${payload}.`,
      `.${mac}`,
      `${otherUser}.${mac}`,
      `${otherType}.${mac}`,
      `${payload}.${flip(mac, 0)}`,
      `${flip(payload, 0)}.${mac}`,
      `${payload}.${mac.slice(0, -1)}`,
      `${payload.slice(0, -1)}.${mac}`,
      `${payload}.${mac}A`,
      `${payload}.${mac}=`,
      `${payload}=.${mac}`,
      `${payload}.${mac}.${mac}`,
      `${payload} .${mac}`,
      // Standard base64 instead of base64url, and the mac as hex.
      `${Buffer.from("7.member.removed.1").toString("base64")}.${Buffer.from(mac, "base64url").toString("base64")}`,
      `${payload}.${Buffer.from(mac, "base64url").toString("hex")}`,
      // Signed under the raw key (never the derived one), or under another key.
      `${payload}.${b64url(createHmac("sha256", Buffer.from(KEY, "base64")).update("7.member.removed.1").digest())}`,
      mintUnsubscribeToken(OTHER_KEY, 7, "member.removed"),
      `${token}${"A".repeat(600)}`,
    ]
    for (const candidate of bad) expect(verifyUnsubscribeToken(KEY, candidate)).toBeNull()
    expect(verifyUnsubscribeToken(KEY, undefined)).toBeNull()
    expect(verifyUnsubscribeToken(KEY, 7)).toBeNull()
  })

  test("the key is HKDF-SHA256 of TWO_FACTOR_ENCRYPTION_KEY, never the raw key or a plain HMAC", () => {
    const raw = Buffer.from(KEY, "base64")
    const expected = Buffer.from(
      hkdfSync("sha256", raw, Buffer.alloc(0), "notification-unsubscribe-v1", 32)
    )
    expect(unsubscribeKey(KEY).equals(expected)).toBe(true)
    expect(unsubscribeKey(KEY).equals(raw)).toBe(false)
    expect(unsubscribeKey(KEY).equals(unsubscribeKey(OTHER_KEY))).toBe(false)
    // A token under the earlier HMAC(rawKey, label) derivation is not accepted.
    const oldKey = createHmac("sha256", raw).update(NOTIFICATION_UNSUBSCRIBE_LABEL).digest()
    const payload = "7.member.removed.1"
    const oldToken = `${b64url(payload)}.${b64url(createHmac("sha256", oldKey).update(payload).digest())}`
    expect(verifyUnsubscribeToken(KEY, oldToken)).toBeNull()
  })

  test("unsubscribeHeaders refuses an unsafe base URL or token", () => {
    const token = mintUnsubscribeToken(KEY, 7, "member.removed")
    expect(unsubscribeHeaders("https://auth.example.com/", token)).toEqual({
      "List-Unsubscribe": `<https://auth.example.com/email/unsubscribe/one-click?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
    for (const url of [
      "https://auth.example.com\r\nBcc: x@example.com",
      "https://auth.example.com/>",
      "https://auth.example.com/<",
      "https://auth.example.com/a b",
      "https://auth.example.com/\t",
    ]) {
      expect(() => unsubscribeHeaders(url, token)).toThrow()
    }
    for (const bad of [`${token}>`, `${token}\r\n`, `${token} x`]) {
      expect(() => unsubscribeHeaders("https://auth.example.com", bad)).toThrow()
    }
  })

  test("a non-canonical spelling of the same bytes is invalid (base64url's spare trailing bits)", () => {
    const token = mintUnsubscribeToken(KEY, 7, "member.removed")
    const [payload, mac] = token.split(".") as [string, string]
    // A 32-byte mac is 43 characters whose last one carries 2 spare bits: change only those.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    const last = alphabet.indexOf(mac.at(-1) as string)
    const twin = `${mac.slice(0, -1)}${alphabet[last ^ 1]}`
    expect(Buffer.from(twin, "base64url").equals(Buffer.from(mac, "base64url"))).toBe(true)
    expect(verifyUnsubscribeToken(KEY, `${payload}.${twin}`)).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------

let app: Awaited<ReturnType<typeof start>>
const ROOT = "notification-email-root@example.com"
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const sv = translatorFor("sv", "email")

/** An owner (verified, workspace "Notes") and a verified member of it with `role`. */
async function ownerAndMember(role: "viewer" | "member" | "admin" = "member") {
  const owner = await signUpWithWorkspace(app)
  const member = await signUpVerified(app)
  await app.db.memberships.add({ workspaceId: owner.workspaceId, userId: member.user.id, role })
  return { owner, member, workspaceId: owner.workspaceId }
}

/** Every mail to `to` sent so far (after running the queue). */
async function sentTo(to: string): Promise<Sent[]> {
  await app.drain()
  return app.mailer.sent.filter((mail) => mail.to === to)
}

const typesOf = async (userId: number) =>
  (
    (await app.db
      .sql`SELECT type FROM notifications WHERE user_id = ${userId} ORDER BY id`) as Array<{
      type: string
    }>
  ).map((row) => row.type)

const auditRows = async (userId: number) =>
  (await app.db.sql`
    SELECT actor_user_id, impersonated_user_id, action, target_id, metadata FROM audit_log
    WHERE action = 'user.notification_email_changed' AND target_id = ${String(userId)}
    ORDER BY id
  `) as Array<{ actor_user_id: number; action: string; metadata: string }>

const queuedMailJobs = async () => {
  const [row] = (await app.db.sql`
    SELECT COUNT(*) AS n FROM jobs WHERE name = 'mail.send'
  `) as Array<{ n: number | string }>
  return Number(row?.n ?? 0)
}

/** The payloads of every still-queued `mail.send` job to `to`, oldest first. */
const queuedMailTo = async (to: string) =>
  (
    (await app.db.sql`
      SELECT payload FROM jobs WHERE name = 'mail.send' AND status = 'queued' ORDER BY id
    `) as Array<{ payload: string }>
  )
    .map(
      (row) =>
        JSON.parse(row.payload) as {
          template: string
          to: string
          props?: unknown
          locale?: string
          headers?: Record<string, string>
        }
    )
    .filter((payload) => payload.to === to)

/** The token in a mail's List-Unsubscribe header. */
const headerToken = (mail: Sent) =>
  mail.headers?.["List-Unsubscribe"]?.match(/[?&]token=([A-Za-z0-9_.-]+)>$/)?.[1]

const defaults: NotificationPreference[] = [
  { type: "member.role_changed", email: true, locked: false },
  { type: "member.removed", email: true, locked: false },
  { type: "plan.changed", email: true, locked: false },
  { type: "invitation.received", email: true, locked: true },
  { type: "workspace.two_factor_required", email: true, locked: true },
  { type: "export.ready", email: true, locked: true },
  { type: "webhook.disabled", email: true, locked: true },
]

describe("account.notificationPreferences", () => {
  test("every optional type is on by default; the locked ones are listed, on and locked", async () => {
    const user = await signUpVerified(app)
    expect(await user.client.account.notificationPreferences.get()).toEqual(defaults)
  })

  test("signed out is UNAUTHORIZED", async () => {
    const anonymous = clientFor(app)
    expect((await safe(anonymous.account.notificationPreferences.get()))[0]).toMatchObject({
      code: "UNAUTHORIZED",
    })
    expect(
      (
        await safe(
          anonymous.account.notificationPreferences.set({ type: "plan.changed", email: false })
        )
      )[0]
    ).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("set turns one type off and back on; each change is audited once, a no-op never", async () => {
    const user = await signUpVerified(app)
    const prefs = user.client.account.notificationPreferences
    // Setting the default when nothing is stored writes nothing.
    expect(await prefs.set({ type: "plan.changed", email: true })).toEqual(defaults)
    expect(await auditRows(user.user.id)).toEqual([])
    expect(await app.db.notificationPreferences.list(user.user.id)).toEqual([])

    const off = await prefs.set({ type: "plan.changed", email: false })
    expect(off.find((p) => p.type === "plan.changed")).toEqual({
      type: "plan.changed",
      email: false,
      locked: false,
    })
    // Only that type moved.
    expect(off.filter((p) => p.type !== "plan.changed")).toEqual(
      defaults.filter((p) => p.type !== "plan.changed")
    )
    await prefs.set({ type: "plan.changed", email: false })
    expect(await prefs.set({ type: "plan.changed", email: true })).toEqual(defaults)
    await prefs.set({ type: "plan.changed", email: true })

    const rows = await auditRows(user.user.id)
    expect(rows.map((row) => JSON.parse(row.metadata))).toEqual([
      { type: "plan.changed", email: false, via: "settings" },
      { type: "plan.changed", email: true, via: "settings" },
    ])
    expect(Number(rows[0]?.actor_user_id)).toBe(user.user.id)
  })

  test("two identical changes at once write and audit once", async () => {
    const user = await signUpVerified(app)
    const set = () =>
      user.client.account.notificationPreferences.set({ type: "member.removed", email: false })
    await Promise.all([set(), set(), set()])
    expect(await auditRows(user.user.id)).toHaveLength(1)
    expect((await app.db.notificationPreferences.list(user.user.id)).map((r) => r.type)).toEqual([
      "member.removed",
    ])
  })

  test("a locked type, or any other string, can never be set", async () => {
    const user = await signUpVerified(app)
    for (const type of [...NOTIFICATION_EMAIL.locked, "plan.changed ", "nope", "PLAN.CHANGED"]) {
      const [error] = await safe(
        user.client.account.notificationPreferences.set({ type: type as never, email: false })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
    expect(await app.db.notificationPreferences.list(user.user.id)).toEqual([])
    expect(await user.client.account.notificationPreferences.get()).toEqual(defaults)
    expect(await auditRows(user.user.id)).toEqual([])
  })

  test("readable but never changed while impersonating", async () => {
    const user = await signUpVerified(app)
    const { token } = await root.client.admin.users.impersonate({
      id: user.user.id,
      reason: "support",
      client: {},
    })
    const asUser = clientFor(app, token)
    expect(await asUser.account.notificationPreferences.get()).toEqual(defaults)
    const [error] = await safe(
      asUser.account.notificationPreferences.set({ type: "member.removed", email: false })
    )
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      defined: true,
      message: IMPERSONATING_MESSAGE,
    })
    expect(await app.db.notificationPreferences.list(user.user.id)).toEqual([])
  })
})

describe("the optional notification mails", () => {
  test("member.role_changed: mailed once to the member, with the RFC 8058 headers and links", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    const [mail] = await mailsTo(app, member.email, roleChangedSubject("Notes"))
    const mails = await sentTo(member.email)
    expect(mails.filter((m) => m.subject === roleChangedSubject("Notes"))).toHaveLength(1)
    if (!mail) throw new Error("no mail")
    expect(mail.text).toContain("Your role in Notes is now admin.")
    const token = headerToken(mail)
    expect(verifyUnsubscribeToken(KEY, token)).toEqual({
      userId: member.user.id,
      type: "member.role_changed",
    })
    expect(mail.headers).toEqual({
      "List-Unsubscribe": `<http://auth.example.com/email/unsubscribe/one-click?token=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
    // The visible link and the inbox link, both in the body.
    expect(mail.text).toContain(`http://auth.example.com/email/unsubscribe?token=${token}`)
    expect(mail.text).toContain("http://account.example.com/notifications")
    // Nobody else's address: not the owner's, who made the change.
    expect(`${mail.text}${mail.html}`).not.toContain(owner.email)
    // The owner, who made the change, is mailed nothing about it.
    expect((await sentTo(owner.email)).filter((m) => m.headers)).toEqual([])
  })

  test("member.removed and plan.changed: mailed in the recipient's saved locale", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await member.client.account.setLocale({ locale: "sv" })
    await owner.client.workspaces.members.remove({ workspaceId, userId: member.user.id })
    const removed = (await sentTo(member.email)).filter((m) => m.headers)
    expect(removed).toHaveLength(1)
    expect(removed[0]?.subject).toBe(sv("removedFromWorkspace.subject", { workspace: "Notes" }))
    expect(removed[0]?.subject).not.toBe(removedFromWorkspaceSubject("Notes"))
    expect(verifyUnsubscribeToken(KEY, headerToken(removed[0] as Sent))).toEqual({
      userId: member.user.id,
      type: "member.removed",
    })

    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    await owner.client.billing.mockChange({ workspaceId, plan: "pro", interval: "month" })
    const [plan] = await mailsTo(app, coOwner.email, planChangedSubject("Notes", "pro"))
    expect(plan?.text).toContain("Notes is now on the Pro plan.")
    expect(verifyUnsubscribeToken(KEY, headerToken(plan as Sent))).toEqual({
      userId: coOwner.user.id,
      type: "plan.changed",
    })
    // Never the owner who changed it.
    expect((await sentTo(owner.email)).filter((m) => m.headers)).toEqual([])
  })

  test("a type turned off is not mailed, but the in-app notification still lands", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await member.client.account.notificationPreferences.set({
      type: "member.role_changed",
      email: false,
    })
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    expect(await typesOf(member.user.id)).toEqual(["member.role_changed"])
    expect((await sentTo(member.email)).filter((m) => m.headers)).toEqual([])
    // Only that type: a removal is still mailed.
    await owner.client.workspaces.members.remove({ workspaceId, userId: member.user.id })
    expect(await typesOf(member.user.id)).toEqual(["member.role_changed", "member.removed"])
    expect((await sentTo(member.email)).map((m) => m.subject)).toContain(
      removedFromWorkspaceSubject("Notes")
    )
  })

  test("a change that rolls back enqueues no mail", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await sentTo(member.email)
    const before = await queuedMailJobs()
    const original = app.db.transaction
    // Every transaction fails at its end, after the notification and its mail were enqueued.
    app.db.transaction = (fn) =>
      original(async (tx: Queries) => {
        await fn(tx)
        throw new Error("rolled back after the change")
      })
    try {
      const [error] = await safe(
        owner.client.workspaces.members.setRole({
          workspaceId,
          userId: member.user.id,
          role: "admin",
        })
      )
      expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    } finally {
      app.db.transaction = original
    }
    expect(await queuedMailJobs()).toBe(before)
    expect(await typesOf(member.user.id)).toEqual([])
    expect((await sentTo(member.email)).filter((m) => m.headers)).toEqual([])
  })

  test("locked mails are unchanged: no headers, the same content as before", async () => {
    const { owner, member, workspaceId } = await ownerAndMember()
    await enableTwoFactor(app, owner.user.id)
    // Everything due so far is sent, so only this test's jobs are queued below.
    await app.drain()
    await owner.client.workspaces.security.set({ workspaceId, requireTwoFactor: true })
    // The queued payload, before the worker runs it (success replaces a payload with `{}`).
    const [queued] = await queuedMailTo(member.email)
    expect(queued).toEqual({
      template: "workspaceTwoFactorRequired",
      to: member.email,
      props: { workspaceName: "Notes", link: "http://account.example.com/security" },
      locale: "en",
    })
    const [required] = await mailsTo(app, member.email, workspaceTwoFactorRequiredSubject)
    const expected = await emails.workspaceTwoFactorRequired({
      name: undefined,
      workspaceName: "Notes",
      link: "http://account.example.com/security",
    })
    expect(required).toEqual({ to: member.email, ...expected })
    expect(required).not.toHaveProperty("headers")

    const invitee = await signUpVerified(app)
    await owner.client.workspaces.invitations.create({
      workspaceId,
      email: invitee.email,
      role: "member",
    })
    const [invitationJob] = await queuedMailTo(invitee.email)
    expect(invitationJob?.template).toBe("invitation")
    expect(invitationJob).not.toHaveProperty("headers")
    const [invitation] = await mailsTo(app, invitee.email, invitationSubject("Notes"))
    expect(invitation).not.toHaveProperty("headers")

    // The control: the same query does see an optional mail's headers while it is queued.
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    const [optional] = await queuedMailTo(member.email)
    expect(optional?.template).toBe("roleChanged")
    expect(Object.keys(optional?.headers ?? {})).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ])
    await app.drain()
  })

  test("an unverified address is never mailed an optional notification", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await app.db.sql`UPDATE users SET email_verified_at = NULL WHERE id = ${member.user.id}`
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    expect(await typesOf(member.user.id)).toEqual(["member.role_changed"])
    expect((await sentTo(member.email)).filter((m) => m.headers)).toEqual([])
  })
})

describe("auth.notificationEmail.unsubscribe", () => {
  const anonymous = () => clientFor(app)
  const prefsOf = async (userId: number) => app.db.notificationPreferences.list(userId)

  test("a good token turns that one type off for that one user, audited once; a repeat is a no-op", async () => {
    const user = await signUpVerified(app)
    const other = await signUpVerified(app)
    const token = mintUnsubscribeToken(KEY, user.user.id, "plan.changed")
    expect(await anonymous().auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
    expect(await anonymous().auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
    const prefs = await user.client.account.notificationPreferences.get()
    expect(prefs.filter((p) => !p.email).map((p) => p.type)).toEqual(["plan.changed"])
    expect(await prefsOf(other.user.id)).toEqual([])
    const rows = await auditRows(user.user.id)
    expect(rows.map((row) => JSON.parse(row.metadata))).toEqual([
      { type: "plan.changed", email: false, via: "link" },
    ])
    expect(Number(rows[0]?.actor_user_id)).toBe(user.user.id)
  })

  test("a bad token answers exactly like a good one and changes nothing for anyone", async () => {
    const user = await signUpVerified(app)
    const other = await signUpVerified(app)
    const good = mintUnsubscribeToken(KEY, user.user.id, "member.removed")
    const [payload, mac] = good.split(".") as [string, string]
    const bad = [
      `${b64url(`${other.user.id}.member.removed.1`)}.${mac}`,
      `${b64url(`${user.user.id}.plan.changed.1`)}.${mac}`,
      `${payload}.${mac.slice(0, -2)}`,
      `${payload}.${mac}=`,
      `${payload}`,
      mintUnsubscribeToken(OTHER_KEY, user.user.id, "member.removed"),
      signed(`${user.user.id}.export.ready.1`),
      signed(`${user.user.id}.invitation.received.1`),
      "x",
    ]
    const auditBefore = (await app.db.sql`SELECT COUNT(*) AS n FROM audit_log`) as Array<{
      n: number
    }>
    for (const token of bad) {
      expect(await anonymous().auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
    }
    expect(await prefsOf(user.user.id)).toEqual([])
    expect(await prefsOf(other.user.id)).toEqual([])
    const auditAfter = (await app.db.sql`SELECT COUNT(*) AS n FROM audit_log`) as Array<{
      n: number
    }>
    expect(Number(auditAfter[0]?.n)).toBe(Number(auditBefore[0]?.n))
    // The raw HTTP answers are byte-identical too.
    const raw = async (token: string) => {
      const response = await fetch(
        new URL("/rpc/auth/notificationEmail/unsubscribe", app.server.url),
        {
          method: "POST",
          headers: { ...auth, "content-type": "application/json", "x-api-client-id": "raw" },
          body: JSON.stringify({ json: { token } }),
        }
      )
      return { status: response.status, body: await response.text() }
    }
    const answers = await Promise.all([raw(good), ...bad.map(raw)])
    expect(answers[0]?.status).toBe(200)
    expect(answers[0]?.body).toContain('"ok":true')
    for (const answer of answers) expect(answer).toEqual(answers[0] as (typeof answers)[number])
    expect(await prefsOf(user.user.id)).toEqual([
      { type: "member.removed", email_enabled: false, updated_at: expect.any(String) },
    ])
  })

  test("a locked type can never be turned off through a link, even a correctly signed one", async () => {
    const user = await signUpVerified(app)
    for (const type of NOTIFICATION_EMAIL.locked) {
      const token = signed(`${user.user.id}.${type}.1`)
      expect(await anonymous().auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
    }
    expect(await prefsOf(user.user.id)).toEqual([])
    expect(await user.client.account.notificationPreferences.get()).toEqual(defaults)
  })

  test("a link to an account that is gone changes nothing and leaves no row", async () => {
    const token = mintUnsubscribeToken(KEY, 987_654, "plan.changed")
    expect(await anonymous().auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
    expect(await prefsOf(987_654)).toEqual([])
  })

  test("the token from a real mail works end to end", async () => {
    const { owner, member, workspaceId } = await ownerAndMember("viewer")
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    const [mail] = await mailsTo(app, member.email, roleChangedSubject("Notes"))
    const token = headerToken(mail as Sent) as string
    await anonymous().auth.notificationEmail.unsubscribe({ token })
    expect(
      (await member.client.account.notificationPreferences.get()).find(
        (p) => p.type === "member.role_changed"
      )
    ).toMatchObject({ email: false })
    // The next role change notifies in-app only.
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: member.user.id,
      role: "member",
    })
    expect(await typesOf(member.user.id)).toEqual(["member.role_changed", "member.role_changed"])
    expect((await sentTo(member.email)).filter((m) => m.headers)).toHaveLength(1)
  })
})

describe("auth.notificationEmail.peek", () => {
  test("names the type a good token turns off, never the user; null for anything else", async () => {
    const user = await signUpVerified(app)
    const peek = clientFor(app).auth.notificationEmail.peek
    const token = mintUnsubscribeToken(KEY, user.user.id, "member.removed")
    expect(await peek({ token })).toEqual({ type: "member.removed" })
    for (const bad of [
      `${token}x`,
      signed(`${user.user.id}.export.ready.1`),
      mintUnsubscribeToken(KEY, 987_654, "plan.changed"),
      "x",
    ]) {
      expect(await peek({ token: bad })).toBeNull()
    }
    // Read-only: nothing changed.
    expect(await app.db.notificationPreferences.list(user.user.id)).toEqual([])
  })
})

describe("the unsubscribe limits", () => {
  const rawClient = (target: { server: { url: URL } }, clientId: string): ApiClient =>
    createORPCClient(
      new RPCLink({
        url: new URL("/rpc", target.server.url).href,
        headers: { ...auth, "x-api-client-id": clientId },
      })
    )

  test("per client, then api-wide, once a token verifies; peek shares the budget", async () => {
    const limited = await start({
      notificationEmailLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
      notificationEmailGlobalLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
    })
    try {
      const user = await signUpVerified(limited)
      const token = mintUnsubscribeToken(KEY, user.user.id, "plan.changed")
      const a = rawClient(limited, "client-a")
      expect(await a.auth.notificationEmail.peek({ token })).toEqual({ type: "plan.changed" })
      // A forged token spends nothing, so client-a still has one call of its two left.
      expect(await a.auth.notificationEmail.unsubscribe({ token: "bad" })).toEqual({ ok: true })
      expect(await a.auth.notificationEmail.peek({ token: "bad" })).toBeNull()
      expect(await a.auth.notificationEmail.peek({ token })).toEqual({ type: "plan.changed" })
      const refused = { code: "TOO_MANY_REQUESTS", defined: true }
      expect((await safe(a.auth.notificationEmail.unsubscribe({ token })))[0]).toMatchObject(
        refused
      )
      expect((await safe(a.auth.notificationEmail.peek({ token })))[0]).toMatchObject(refused)
      // The refused call changed nothing.
      expect(await limited.db.notificationPreferences.list(user.user.id)).toEqual([])
      // Another client still has its own budget until the api-wide cap (3 allowed in total).
      const b = rawClient(limited, "client-b")
      expect(await b.auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
      expect((await safe(b.auth.notificationEmail.unsubscribe({ token })))[0]).toMatchObject({
        code: "TOO_MANY_REQUESTS",
      })
    } finally {
      await limited.stop()
    }
  })

  test("a flood of forged tokens spends no budget, and a real link still works after it", async () => {
    const limited = await start({
      notificationEmailLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
      notificationEmailGlobalLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const user = await signUpVerified(limited)
      const other = await signUpVerified(limited)
      const token = mintUnsubscribeToken(KEY, user.user.id, "member.removed")
      const [payload, mac] = token.split(".") as [string, string]
      const forged = (i: number) =>
        [
          `${b64url(`${other.user.id}.member.removed.1`)}.${mac}`,
          mintUnsubscribeToken(OTHER_KEY, user.user.id, "member.removed"),
          `${payload}.${mac.slice(0, -2)}`,
          `garbage${i}`,
        ][i % 4] as string
      // One client, as the one-click route would send it: a fresh client id per invented token,
      // and the same one for all of them — far past both the per-client and the api-wide cap.
      for (let i = 0; i < 40; i++) {
        const flood = rawClient(limited, i % 2 ? "flood" : `unsub-${i}`)
        expect(await flood.auth.notificationEmail.unsubscribe({ token: forged(i) })).toEqual({
          ok: true,
        })
        expect(await flood.auth.notificationEmail.peek({ token: forged(i) })).toBeNull()
      }
      expect(await limited.db.notificationPreferences.list(user.user.id)).toEqual([])
      expect(await limited.db.notificationPreferences.list(other.user.id)).toEqual([])
      // The real link, even from the flooding client, still has the whole budget.
      const flood = rawClient(limited, "flood")
      expect(await flood.auth.notificationEmail.peek({ token })).toEqual({ type: "member.removed" })
      expect(await flood.auth.notificationEmail.unsubscribe({ token })).toEqual({ ok: true })
      expect(
        (await limited.db.notificationPreferences.list(user.user.id)).map((p) => p.type)
      ).toEqual(["member.removed"])
    } finally {
      await limited.stop()
    }
  })
})
