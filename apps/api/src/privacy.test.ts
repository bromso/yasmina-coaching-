import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { safe } from "@orpc/client"
import {
  DELETE_EMAIL_MISMATCH_MESSAGE,
  DELETE_REAUTH_MESSAGE,
  DELETION_GRACE_MS,
  EXPORT_KEY_PATTERN,
  EXPORT_REQUEST_INTERVAL_MS,
  EXPORT_TTL_MS,
  IMPERSONATING_MESSAGE,
  TWO_FACTOR_REAUTH_REASON,
} from "@repo/api-contract"
import { TERMS_VERSION } from "@repo/api-contract/legal"
import { emails } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { BRAND_NAME } from "@repo/sites/brand"
import { SQL } from "bun"
import { auditWorkspace } from "./admin"
import { tokenHash } from "./credentials"
import {
  exportedAuditBy,
  exportedMetadata,
  privacyExportJob,
  privacyExportPruneJob,
  privacyPurgeJob,
  purgeUser,
} from "./jobs/builtin/privacy"
import { maskEmail } from "./mail/mailer"
import { slugify } from "./slug"
import { PNG_1X1, TINY_PDF } from "./storage/fixtures"
import { testDatabase } from "./test-db"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  signedIn,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"

const ROOT = "privacy-root@example.com"
const DAY = 24 * 60 * 60 * 1000
/** Shifts the worker's (and enqueue's) clock; the request path keeps the real one. */
const clock = { offset: 0 }
/** Everything the api logged (`recordFailure` logs, then records), and each with its error. */
const logged: string[] = []
const loggedErrors: string[] = []
let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
/** A second connection to the server's own database, for what no query exposes. */
let raw: SQL
let cleanup: () => Promise<void>
beforeAll(async () => {
  // A database a second connection can reach: a throwaway Postgres one, or a SQLite file.
  let databaseUrl: string
  if (Bun.env.TEST_DATABASE_URL) {
    const db = await testDatabase()
    databaseUrl = db.url
    cleanup = db.cleanup
  } else {
    const dir = await mkdtemp(join(tmpdir(), "privacy-"))
    databaseUrl = `sqlite://${join(dir, "t.db")}`
    cleanup = () => rm(dir, { recursive: true, force: true })
  }
  app = await start({
    databaseUrl,
    superadminEmails: [ROOT],
    jobsLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    now: () => new Date(Date.now() + clock.offset),
    log: (message, error) => {
      logged.push(message)
      loggedErrors.push(`${message}: ${error instanceof Error ? error.message : ""}`)
    },
  })
  raw = new SQL(databaseUrl)
  root = await signUpVerified(app, ROOT)
})
afterAll(async () => {
  await app.stop()
  await raw.close()
  await cleanup()
})

/** Requests an export as `client`, runs the queue and returns the ready export. */
async function readyExport(client: ReturnType<typeof clientFor>) {
  const requested = await client.account.export.request()
  expect(requested.status).toBe("pending")
  await app.drain()
  const ready = await client.account.export.get()
  if (!ready) throw new Error("no export")
  return ready
}

describe("account.export", () => {
  test("get is null before any request", async () => {
    const user = await signUpVerified(app)
    expect(await user.client.account.export.get()).toBeNull()
  })

  test("request → job → ready for 7 days; the file holds the account's data and no secret", async () => {
    const owner = await signUpWithWorkspace(app)
    await owner.client.notes.create({
      workspaceId: owner.workspaceId,
      title: "Export me",
      body: "a body only this note has",
    })
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: "invitee-privacy@example.com",
      role: "member",
    })
    await app.drain()
    const inviteMail = app.mailer.sent.filter((m) => m.to === "invitee-privacy@example.com")
    const inviteToken = inviteMail.at(-1)?.text.match(/invitations\/([A-Za-z0-9_-]+)/)?.[1]
    await enableTwoFactor(app, owner.user.id)
    const recovery = "abcde-fghij"
    await app.db.twoFactor.replaceRecoveryCodes(owner.user.id, [tokenHash(recovery)])
    const passkey = await app.db.passkeys.create({
      userId: owner.user.id,
      credentialId: "cred-privacy-export",
      publicKey: "pubkey-privacy-export",
      counter: 0,
      transports: null,
      name: "Export me too",
    })

    // Two notifications of the owner's (one read) and one of someone else's.
    const other = await signUpVerified(app)
    const notifiedAt = new Date().toISOString()
    const read = await app.db.notifications.create({
      userId: owner.user.id,
      workspaceId: owner.workspaceId,
      type: "member.role_changed",
      data: JSON.stringify({ workspaceName: "Notes", from: "member", to: "admin" }),
      createdAt: notifiedAt,
    })
    await app.db.notifications.markRead(owner.user.id, [read.id], notifiedAt)
    await app.db.notifications.create({
      userId: owner.user.id,
      workspaceId: null,
      type: "export.ready",
      data: "{}",
      createdAt: notifiedAt,
    })
    await app.db.notifications.create({
      userId: other.user.id,
      workspaceId: null,
      type: "member.removed",
      data: JSON.stringify({ workspaceName: "Someone else's" }),
      createdAt: notifiedAt,
    })

    // One email setting changed from its default; the other optional types keep theirs.
    await owner.client.account.notificationPreferences.set({ type: "plan.changed", email: false })
    const [preference] = await app.db.notificationPreferences.list(owner.user.id)

    const ready = await readyExport(owner.client)
    expect(ready.status).toBe("ready")
    expect(ready.readyAt).not.toBeNull()
    expect(Date.parse(ready.expiresAt ?? "") - Date.parse(ready.readyAt ?? "")).toBe(EXPORT_TTL_MS)

    const file = await owner.client.account.export.download({ id: ready.id })
    expect(file.type).toStartWith("application/json")
    expect(file.name).toBe(`${slugify(BRAND_NAME)}-data-${ready.readyAt?.slice(0, 10)}.json`)
    const text = await file.text()
    const data = JSON.parse(text)
    expect(data.format).toBe(1)
    expect(typeof data.exportedAt).toBe("string")
    expect(data.profile.email).toBe(owner.email)
    expect(data.profile.twoFactorEnabled).toBe(true)
    expect(data.signInMethods.password).toBe(true)
    expect(data.workspaces).toEqual([expect.objectContaining({ name: "Notes", role: "owner" })])
    expect(data.notes).toEqual([
      expect.objectContaining({ workspace: "Notes", body: "a body only this note has" }),
    ])
    expect(data.invitationsSent).toEqual([
      expect.objectContaining({ email: "invitee-privacy@example.com", role: "member" }),
    ])
    expect(data.sessions.length).toBeGreaterThan(0)
    expect(data.analyticsEvents.map((e: { name: string }) => e.name)).toContain("signed_up")
    expect(data.passkeys).toEqual([
      { name: "Export me too", createdAt: expect.any(String), lastUsedAt: null },
    ])
    // The user's own notifications (written before this export, so not its own export.ready).
    expect(data.notifications).toEqual([
      {
        type: "member.role_changed",
        createdAt: notifiedAt,
        readAt: notifiedAt,
        data: { workspaceName: "Notes", from: "member", to: "admin" },
      },
      { type: "export.ready", createdAt: notifiedAt, readAt: null, data: {} },
    ])
    expect(text).not.toContain("Someone else's")
    // Whether each optional notification type is emailed, and when it was last changed.
    expect(data.notificationPreferences).toEqual([
      { type: "member.role_changed", email: true, changedAt: null },
      { type: "member.removed", email: true, changedAt: null },
      { type: "plan.changed", email: false, changedAt: preference?.updated_at },
    ])
    expect(preference?.updated_at).toEqual(expect.any(String))

    // Every stored secret, searched for in the serialized file.
    const user = await app.db.users.find(owner.user.id)
    const sessions = await app.db.sessions.listForUser(owner.user.id, new Date().toISOString())
    const secrets = [
      user?.password_hash,
      user?.two_factor_secret,
      tokenHash(recovery),
      recovery,
      owner.token,
      tokenHash(owner.token),
      ...sessions.map((s) => s.token_hash),
      passkey.credential_id,
      passkey.public_key,
    ]
    expect(inviteToken).toBeString()
    secrets.push(inviteToken as string, tokenHash(inviteToken as string))
    const verifyMail = app.mailer.sent.filter((m) => m.to === owner.email).at(0)
    const verifyToken = verifyMail?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]
    expect(verifyToken).toBeString()
    secrets.push(verifyToken as string, tokenHash(verifyToken as string))
    for (const secret of secrets) {
      expect(typeof secret).toBe("string")
      expect(text).not.toContain(secret as string)
    }
    for (const name of ["password_hash", "two_factor_secret", "token_hash", "passwordHash"]) {
      expect(text).not.toContain(name)
    }
  })

  test("the file is stored under exports/<userId>/ and the job is idempotent", async () => {
    const user = await signUpVerified(app)
    const ready = await readyExport(user.client)
    const row = await app.db.exports.find(ready.id)
    expect(row?.storage_key).toMatch(EXPORT_KEY_PATTERN)
    expect(row?.storage_key?.startsWith(`exports/${user.user.id}/`)).toBe(true)
    // A redelivered job for a ready row changes nothing (same key, no second mail).
    const sentBefore = app.mailer.sent.length
    await app.enqueue(privacyExportJob, { exportId: ready.id })
    await app.drain()
    expect((await app.db.exports.find(ready.id))?.storage_key).toBe(row?.storage_key ?? "")
    expect(app.mailer.sent.length).toBe(sentBefore)
  })

  test("the file lists the user's linked support requests, never another's or an anonymous one", async () => {
    const user = await signUpVerified(app)
    const request = {
      email: "reply-here@example.com",
      topic: "bug" as const,
      message: "The export button does nothing.",
      page: "/privacy/export",
    }
    const { reference } = await user.client.support.create(request)
    await clientFor(app).support.create({ ...request, message: "Sent while signed out." })
    const other = await signUpVerified(app)
    await other.client.support.create({ ...request, message: "Someone else's request." })
    const ready = await readyExport(user.client)
    const file = await user.client.account.export.download({ id: ready.id })
    const data = JSON.parse(await file.text())
    expect(data.supportRequests).toEqual([
      {
        reference,
        topic: "bug",
        email: "reply-here@example.com",
        name: null,
        message: "The export button does nothing.",
        page: "/privacy/export",
        status: "open",
        createdAt: expect.any(String),
        resolvedAt: null,
      },
    ])
  })

  test("the file lists job applications sent from the account's verified address only", async () => {
    const user = await signUpVerified(app)
    const apply = (email: string, title: string) =>
      clientFor(app).jobs.apply({
        job: "engineer",
        title,
        name: "Ada",
        email,
        link: "https://ada.example",
        note: "Hello",
        cv: new File([TINY_PDF], "cv.pdf", { type: "application/pdf" }),
      })
    // Typed in another case: the address still matches.
    const { reference } = await apply(user.email.toUpperCase(), "Engineer")
    await apply("someone-else@example.com", "Designer")
    const ready = await readyExport(user.client)
    const file = await user.client.account.export.download({ id: ready.id })
    const text = await file.text()
    expect(JSON.parse(text).jobApplications).toEqual([
      {
        reference,
        job: "engineer",
        title: "Engineer",
        name: "Ada",
        email: user.email,
        link: "https://ada.example",
        note: "Hello",
        status: "new",
        createdAt: expect.any(String),
      },
    ])
    // Never the ip hash or the CV's key.
    expect(text).not.toContain("ip_hash")
    expect(text).not.toContain("applications/")

    // An unverified account has not proven it owns the address: nothing is listed.
    const unverified = await signUp(app)
    await apply(unverified.email, "Engineer")
    const pending = await readyExport(unverified.client)
    const theirs = await unverified.client.account.export.download({ id: pending.id })
    expect(JSON.parse(await theirs.text()).jobApplications).toEqual([])
  })

  test("the file lists bookings made with the account's verified address only, no tokens", async () => {
    const user = await signUpVerified(app)
    const request = (email: string) =>
      clientFor(app).booking.request({
        termsAccepted: true,
        offering: "workshop",
        customer: { name: "Ada", email, organisation: "Analytical Engines AB" },
        location: "on_site",
        preferredDates: [{ date: "2099-03-02", part: "morning" }],
        attendees: 8,
        venue: "Stadshuset",
        message: "A team day, please.",
      })
    const { reference } = await request(user.email.toUpperCase())
    await request("someone-else-booking@example.com")
    const ready = await readyExport(user.client)
    const text = await (await user.client.account.export.download({ id: ready.id })).text()
    expect(JSON.parse(text).bookings).toEqual([
      {
        reference,
        offering: "workshop",
        kind: "request",
        status: "pending",
        audience: "organisation",
        name: "Ada",
        email: user.email,
        organisation: "Analytical Engines AB",
        phone: null,
        location: "on_site",
        startsAt: null,
        endsAt: null,
        notes: "A team day, please.",
        preferredDates: [{ date: "2099-03-02", part: "morning" }],
        attendees: 8,
        venue: "Stadshuset",
        createdAt: expect.any(String),
        cancelledAt: null,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: expect.any(String),
        earlyStartRequestedAt: null,
      },
    ])
    expect(text).not.toContain("token")
    expect(text).not.toContain("someone-else-booking")

    const unverified = await signUp(app)
    await request(unverified.email)
    const pending = await readyExport(unverified.client)
    const theirs = await unverified.client.account.export.download({ id: pending.id })
    expect(JSON.parse(await theirs.text()).bookings).toEqual([])
  })

  test("the file carries suspension status and dates, never the reason or who suspended it", async () => {
    const user = await signUpVerified(app)
    const until = new Date(Date.now() + DAY).toISOString()
    // Requested before the suspension (a suspended account cannot sign in to ask), built after it:
    // the job reads the account as it is when it runs. The file is read straight from storage,
    // since no session of a suspended account can download it.
    const requested = await user.client.account.export.request()
    await root.client.admin.users.suspend({
      userId: user.user.id,
      reason: "a very specific internal investigation reason",
      until,
    })
    await app.drain()
    const key = (await app.db.exports.find(requested.id))?.storage_key ?? ""
    const stored = await app.storage.get(key)
    if (!stored) throw new Error("no export file")
    const text = new TextDecoder().decode(stored.body)
    const data = JSON.parse(text)
    expect(data.profile.suspended).toEqual({ at: expect.any(String), until })
    expect(text).not.toContain("a very specific internal investigation reason")
    expect(text).not.toContain("suspended_by")
    expect(text).not.toContain("suspendedBy")
  })

  test("the file's suspended field is null for an account that was never suspended", async () => {
    const user = await signUpVerified(app)
    const ready = await readyExport(user.client)
    const file = await user.client.account.export.download({ id: ready.id })
    const data = JSON.parse(await file.text())
    expect(data.profile.suspended).toBeNull()
  })

  test("a second request within 24 h is CONFLICT with retryAt", async () => {
    const user = await signUpVerified(app)
    await user.client.account.export.request()
    const row = await app.db.exports.latest(user.user.id)
    const [error] = await safe(user.client.account.export.request())
    expect(error).toMatchObject({ code: "CONFLICT" })
    const retryAt = (error as { data?: { retryAt?: string } }).data?.retryAt
    expect(retryAt).toBe(
      new Date(Date.parse(row?.created_at ?? "") + EXPORT_REQUEST_INTERVAL_MS).toISOString()
    )
    expect((error as Error).message).toStartWith("You can request a new export after ")
    await app.drain()
  })

  test("the CONFLICT message answers in the caller's language", async () => {
    const user = await signUpVerified(app)
    const sv = clientFor(app, user.token, "sv")
    await sv.account.export.request()
    const [error] = await safe(sv.account.export.request())
    expect((error as Error).message).toStartWith("Du kan begära en ny export efter ")
    await app.drain()
  })

  test("another user's export id, an unknown id and a pending export are NOT_FOUND", async () => {
    const a = await signUpVerified(app)
    const b = await signUpVerified(app)
    const ready = await readyExport(a.client)
    const [other] = await safe(b.client.account.export.download({ id: ready.id }))
    expect(other).toMatchObject({ code: "NOT_FOUND", message: "That export is not available." })
    const [unknown] = await safe(a.client.account.export.download({ id: 999_999 }))
    expect(unknown).toMatchObject({ code: "NOT_FOUND" })
    const pending = await b.client.account.export.request()
    const [notReady] = await safe(b.client.account.export.download({ id: pending.id }))
    expect(notReady).toMatchObject({ code: "NOT_FOUND" })
    await app.drain()
  })

  test("an impersonation session can neither request nor download", async () => {
    const user = await signUpVerified(app)
    const ready = await readyExport(user.client)
    const { token } = await root.client.admin.users.impersonate({
      id: user.user.id,
      reason: "support",
      client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
    })
    const asUser = clientFor(app, token)
    const [request] = await safe(asUser.account.export.request())
    expect(request).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    const [download] = await safe(asUser.account.export.download({ id: ready.id }))
    expect(download).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    await asUser.admin.stopImpersonation()
  })

  test("admin actions on the user are in the export with their reason, metadata allowlisted", async () => {
    const user = await signUpVerified(app)
    await enableTwoFactor(app, user.user.id)
    const { token } = await root.client.admin.users.impersonate({
      id: user.user.id,
      reason: "support ticket 42",
      client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
    })
    await clientFor(app, token).account.updateProfile({ name: "Renamed by support" })
    // Ends the impersonation as well: its audit row carries the admin's id as `impersonatedBy`.
    await root.client.admin.users.revokeSessions({ id: user.user.id })
    await root.client.admin.users.resetTwoFactor({ userId: user.user.id, reason: "lost phone" })
    const client = await signInAgain(user.email)

    const ready = await readyExport(client)
    const data = JSON.parse(await (await client.account.export.download({ id: ready.id })).text())
    const byAction = (action: string) =>
      data.auditLog.filter((row: { action: string }) => row.action === action)
    expect(byAction("impersonation.started")).toEqual([
      expect.objectContaining({
        by: "admin",
        targetType: "user",
        targetId: String(user.user.id),
        reason: "support ticket 42",
        ip: null,
        userAgent: null,
      }),
    ])
    expect(byAction("user.two_factor_reset")).toEqual([
      expect.objectContaining({ by: "admin", reason: "lost phone", ip: null, userAgent: null }),
    ])
    expect(byAction("user.sessions_revoked")).toEqual([expect.objectContaining({ by: "admin" })])
    expect(byAction("profile.updated")).toEqual([
      expect.objectContaining({ by: "admin", metadata: { name: "Renamed by support" } }),
    ])
    // The stop's `via` is kept; the admin's id (`impersonatedBy`) is not.
    expect(byAction("impersonation.stopped")).toEqual([
      expect.objectContaining({ by: "admin", metadata: { via: "sessions_revoked" } }),
    ])
    const stored = await raw`
      SELECT metadata FROM audit_log
      WHERE action = 'impersonation.stopped' AND target_id = ${String(user.user.id)}
    `
    expect(stored[0]?.metadata).toContain("impersonatedBy")
    expect(JSON.stringify(data.auditLog)).not.toContain("impersonatedBy")
  })

  test("workspace actions on the user are by `workspace`, never `admin`, with the display keys", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await signUpVerified(app)
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: member.email,
      role: "member",
    })
    const { pendingInvitations } = await member.client.workspaces.list()
    await member.client.invitations.acceptById({ id: pendingInvitations[0]?.id as number })
    await owner.client.workspaces.update({ workspaceId: owner.workspaceId, name: "Renamed" })
    await owner.client.workspaces.members.setRole({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
      role: "admin",
    })
    // One of the workspace's API keys (no user) acting on the member: still `workspace`, and the
    // key's own id and name never reach the export.
    await auditWorkspace({ db: app.db, apiKey: { id: 77, name: "Importer" } }, owner.workspaceId, {
      action: "member.role_changed",
      targetType: "user",
      targetId: member.user.id,
      metadata: { from: "admin", to: "viewer" },
    })
    await owner.client.workspaces.members.remove({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
    })

    const memberExport = JSON.parse(
      await (
        await member.client.account.export.download({
          id: (await readyExport(member.client)).id,
        })
      ).text()
    )
    const rows = memberExport.auditLog as Array<Record<string, unknown>>
    const pick = (action: string) => rows.filter((row) => row.action === action)
    expect(pick("invitation.accepted")).toEqual([
      expect.objectContaining({
        by: "you",
        workspaceId: owner.workspaceId,
        metadata: { role: "member" },
      }),
    ])
    expect(pick("member.role_changed")).toEqual([
      expect.objectContaining({
        by: "workspace",
        workspaceId: owner.workspaceId,
        targetType: "user",
        targetId: String(member.user.id),
        metadata: { from: "member", to: "admin" },
        ip: null,
        userAgent: null,
      }),
      expect.objectContaining({ by: "workspace", metadata: { from: "admin", to: "viewer" } }),
    ])
    expect(pick("member.removed")).toEqual([
      expect.objectContaining({ by: "workspace", workspaceId: owner.workspaceId, metadata: null }),
    ])
    expect(rows.some((row) => row.by === "admin")).toBe(false)
    expect(JSON.stringify(rows)).not.toContain("apiKeyId")
    expect(JSON.stringify(rows)).not.toContain("Importer")

    const ownerExport = JSON.parse(
      await (
        await owner.client.account.export.download({ id: (await readyExport(owner.client)).id })
      ).text()
    )
    const owned = ownerExport.auditLog as Array<Record<string, unknown>>
    expect(owned.filter((row) => row.action === "workspace.renamed")).toEqual([
      expect.objectContaining({ by: "you", metadata: { from: "Notes", to: "Renamed" } }),
    ])
    expect(owned.filter((row) => row.action === "invitation.created")).toEqual([
      expect.objectContaining({
        by: "you",
        metadata: { email: maskEmail(member.email), role: "member" },
      }),
    ])
  })

  test("the dataExportReady mail links to the Data & privacy page, in the user's locale", async () => {
    const user = await signUpVerified(app)
    await user.client.account.setLocale({ locale: "sv" })
    await readyExport(user.client)
    const { subject } = await emails.dataExportReady({ link: "x" }, "sv")
    const [mail] = await mailsTo(app, user.email, subject)
    expect(mail?.text).toContain("http://account.example.com/data-privacy")
    expect(mail?.text).not.toContain("exports/")
  })

  test("prune at +8 days: expired, the file queued for deletion, download NOT_FOUND", async () => {
    const user = await signUpVerified(app)
    const ready = await readyExport(user.client)
    const key = (await app.db.exports.find(ready.id))?.storage_key ?? ""
    expect(await app.storage.get(key)).not.toBeNull()
    clock.offset = 8 * DAY
    try {
      await app.enqueue(privacyExportPruneJob, {})
      await app.drain()
    } finally {
      clock.offset = 0
    }
    expect(await user.client.account.export.get()).toMatchObject({
      id: ready.id,
      status: "expired",
    })
    expect(await app.storage.get(key)).toBeNull()
    const [error] = await safe(user.client.account.export.download({ id: ready.id }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("a stale export", () => {
  test("a ready export past expires_at, before the prune, is NOT_FOUND", async () => {
    const user = await signUpVerified(app)
    const ready = await readyExport(user.client)
    await raw`
      UPDATE data_exports SET expires_at = ${new Date(Date.now() - 1000).toISOString()}
      WHERE id = ${ready.id}
    `
    expect((await app.db.exports.find(ready.id))?.status).toBe("ready")
    const [error] = await safe(user.client.account.export.download({ id: ready.id }))
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "That export is not available." })
  })

  test("a pending export whose job died reads as expired after 24 h, and a new request works", async () => {
    const user = await signUpVerified(app)
    // A request whose job is gone (dead after its retries): no job is enqueued for this row.
    const old = new Date(Date.now() - EXPORT_REQUEST_INTERVAL_MS - 60_000).toISOString()
    const { id } = await app.db.exports.create(user.user.id, old)
    expect(await user.client.account.export.get()).toMatchObject({ id, status: "expired" })
    expect((await app.db.exports.find(id))?.status).toBe("pending")

    const requested = await user.client.account.export.request()
    expect(requested.status).toBe("pending")
    await app.drain()
    expect(await user.client.account.export.get()).toMatchObject({
      id: requested.id,
      status: "ready",
    })
  })

  test("the prune expires a pending export older than 24 h and leaves a recent one", async () => {
    const stale = await signUpVerified(app)
    const fresh = await signUpVerified(app)
    const old = new Date(Date.now() - EXPORT_REQUEST_INTERVAL_MS - 60_000).toISOString()
    const recent = new Date(Date.now() - 60_000).toISOString()
    const { id: staleId } = await app.db.exports.create(stale.user.id, old)
    const { id: freshId } = await app.db.exports.create(fresh.user.id, recent)
    await app.enqueue(privacyExportPruneJob, {})
    await app.drain()
    expect((await app.db.exports.find(staleId))?.status).toBe("expired")
    expect((await app.db.exports.find(freshId))?.status).toBe("pending")
    expect(await fresh.client.account.export.get()).toMatchObject({ status: "pending" })
    // A late retry of the dead job finds the row no longer pending and writes nothing.
    await app.enqueue(privacyExportJob, { exportId: staleId })
    await app.drain()
    expect(await app.db.exports.find(staleId)).toMatchObject({
      status: "expired",
      storage_key: null,
    })
    await raw`DELETE FROM data_exports WHERE id = ${freshId}`
  })
})

const PASSWORD = "correct horse battery"
const png = () => new File([PNG_1X1], "me.png", { type: "image/png" })

/** Signs `email` in again (a fresh session), as the auth app does after a deletion sign-out. */
async function signInAgain(email: string) {
  const result = signedIn(await clientFor(app).auth.signIn({ email, password: PASSWORD }))
  return clientFor(app, result.session.token)
}

/** Runs `privacy.purge` with the worker's clock past the grace period. */
async function purgeLater(payload: { pageSize?: number } = {}) {
  clock.offset = DELETION_GRACE_MS + DAY
  try {
    await app.enqueue(privacyPurgeJob, payload)
    await app.drain()
  } finally {
    clock.offset = 0
  }
}

/** A verified owner `owner` of a workspace that `member` (also verified) belongs to. */
async function sharedWorkspace(name: string) {
  const owner = await signUpWithWorkspace(app)
  await app.db.workspaces.rename(owner.workspaceId, name)
  const member = await signUpVerified(app)
  await app.db.memberships.add({
    workspaceId: owner.workspaceId,
    userId: member.user.id,
    role: "member",
  })
  return { owner, member, workspaceId: owner.workspaceId }
}

describe("account.delete", () => {
  test("refused while impersonating, as is cancelDeletion", async () => {
    const user = await signUpVerified(app)
    const { token } = await root.client.admin.users.impersonate({
      id: user.user.id,
      reason: "support",
    })
    const asUser = clientFor(app, token)
    const [deleted] = await safe(asUser.account.delete({ email: user.email }))
    expect(deleted).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    const [cancelled] = await safe(asUser.account.cancelDeletion())
    expect(cancelled).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    await asUser.admin.stopImpersonation()
    expect((await app.db.users.find(user.user.id))?.deletion_scheduled_at).toBeNull()
  })

  test("another email is BAD_REQUEST, checked before the session's age", async () => {
    const user = await signUpVerified(app)
    const [error] = await safe(user.client.account.delete({ email: "someone@example.com" }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: DELETE_EMAIL_MISMATCH_MESSAGE })
    const [sv] = await safe(
      clientFor(app, user.token, "sv").account.delete({ email: "someone@example.com" })
    )
    expect((sv as Error).message).toBe("Skriv kontots e-postadress för att bekräfta.")
    await raw`UPDATE sessions SET created_at = ${new Date(Date.now() - 11 * 60_000).toISOString()} WHERE user_id = ${user.user.id}`
    const [stillMismatch] = await safe(user.client.account.delete({ email: "x@example.com" }))
    expect(stillMismatch).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a session older than 10 minutes is FORBIDDEN with reason reauth", async () => {
    const user = await signUpVerified(app)
    await raw`UPDATE sessions SET created_at = ${new Date(Date.now() - 11 * 60_000).toISOString()} WHERE user_id = ${user.user.id}`
    const [error] = await safe(user.client.account.delete({ email: user.email }))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: DELETE_REAUTH_MESSAGE,
      data: { reason: TWO_FACTOR_REAUTH_REASON },
    })
    expect((await app.db.users.find(user.user.id))?.deletion_scheduled_at).toBeNull()
  })

  test("the only owner of a workspace with other members is CONFLICT naming it", async () => {
    const { owner } = await sharedWorkspace("Acme")
    const [error] = await safe(owner.client.account.delete({ email: owner.email }))
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Transfer ownership or delete these workspaces first: Acme",
      data: { names: ["Acme"] },
    })
    const [sv] = await safe(
      clientFor(app, owner.token, "sv").account.delete({ email: owner.email })
    )
    expect((sv as Error).message).toBe(
      "Överlåt ägarskapet eller radera de här arbetsytorna först: Acme"
    )
    expect((await app.db.users.find(owner.user.id))?.deletion_scheduled_at).toBeNull()
  })

  test("a co-owned shared workspace and a workspace of one's own do not block", async () => {
    const { member, workspaceId } = await sharedWorkspace("Co-owned")
    await app.db.memberships.setRole(workspaceId, member.user.id, "owner")
    await member.client.workspaces.create({ name: "Solo" })
    const { deletionScheduledAt } = await member.client.account.delete({ email: member.email })
    expect(deletionScheduledAt).toBeString()
    await app.db.users.cancelDeletion(member.user.id)
  })

  test("schedules in 7 days, ends every session, mails once; cancel clears it", async () => {
    const user = await signUpWithWorkspace(app)
    const other = await signInAgain(user.email)
    const before = Date.now()
    const { deletionScheduledAt } = await user.client.account.delete({
      email: user.email.toUpperCase(),
    })
    const delay = Date.parse(deletionScheduledAt) - before
    expect(delay).toBeGreaterThanOrEqual(DELETION_GRACE_MS)
    expect(delay).toBeLessThan(DELETION_GRACE_MS + 60_000)

    // Every session, the current one included.
    for (const client of [user.client, other]) {
      const [error] = await safe(client.auth.me())
      expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    }
    expect(await app.db.sessions.listForUser(user.user.id, new Date().toISOString())).toEqual([])

    const { subject } = await emails.accountDeletionScheduled({
      date: deletionScheduledAt,
      link: "x",
    })
    const [mail] = await mailsTo(app, user.email, subject)
    expect(mail?.text).toContain("http://auth.example.com/login")

    // Signing in again is allowed; Me carries the date.
    const again = await signInAgain(user.email)
    expect((await again.auth.me()).user.deletionScheduledAt).toBe(deletionScheduledAt)
    expect((await root.client.admin.users.get({ id: user.user.id })).deletionScheduledAt).toBe(
      deletionScheduledAt
    )

    // A second request is a no-op: the first date, no second mail, and the session stays.
    const second = await again.account.delete({ email: user.email })
    expect(second.deletionScheduledAt).toBe(deletionScheduledAt)
    await app.drain()
    expect(
      app.mailer.sent.filter((m) => m.to === user.email && m.subject === subject)
    ).toHaveLength(1)
    expect((await again.auth.me()).user.deletionScheduledAt).toBe(deletionScheduledAt)

    const third = again
    expect(await third.account.cancelDeletion()).toEqual({})
    expect((await third.auth.me()).user.deletionScheduledAt).toBeNull()
    expect((await root.client.admin.users.get({ id: user.user.id })).deletionScheduledAt).toBeNull()
    // Cancelling with nothing scheduled is a no-op.
    expect(await third.account.cancelDeletion()).toEqual({})
  })

  test("the scheduled mail is in the user's language", async () => {
    const user = await signUpVerified(app)
    await user.client.account.setLocale({ locale: "sv" })
    const { deletionScheduledAt } = await user.client.account.delete({ email: user.email })
    const { subject } = await emails.accountDeletionScheduled(
      { date: deletionScheduledAt, link: "x" },
      "sv"
    )
    await mailsTo(app, user.email, subject)
    await app.db.users.cancelDeletion(user.user.id)
  })
})

describe("privacy.purge", () => {
  const count = async (table: string, where: string, id: number) => {
    // The id is a number we made, so inlining it is safe and works on both engines.
    const [row] = await raw.unsafe(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${where.replaceAll("$1", String(id))}`
    )
    return Number(row.n)
  }

  test("deletes the user, their sole-member workspace and files; shared data stays de-linked", async () => {
    const { owner, member: user, workspaceId: sharedId } = await sharedWorkspace("Shared")
    const note = await user.client.notes.create({
      workspaceId: sharedId,
      title: "Written by a leaver",
      body: "",
    })
    // A workspace of their own, paid, with a logo; an avatar; a ready export; a pageview.
    const solo = await user.client.workspaces.create({ name: "Solo" })
    await user.client.billing.mockChange({ workspaceId: solo.id, plan: "pro", interval: "month" })
    const subscriptionId = (await app.db.billing.subscriptions.latest(solo.id))?.subscription_id
    await user.client.workspaces.logo.set({ workspaceId: solo.id, file: png() })
    await user.client.account.avatar.set({ file: png() })
    const ready = await readyExport(user.client)
    const exportKey = (await app.db.exports.find(ready.id))?.storage_key as string
    const avatarKey = (await app.db.users.find(user.user.id))?.avatar_key as string
    const logoKey = (await app.db.workspaces.find(solo.id))?.logo_key as string
    for (const key of [exportKey, avatarKey, logoKey]) {
      expect(await app.storage.get(key)).not.toBeNull()
    }
    const now = new Date().toISOString()
    await app.db.analytics.insertPageview({
      app: "app",
      path: "/notes",
      referrerHost: null,
      visitorId: "v",
      userId: user.user.id,
      workspaceId: sharedId,
      day: now.slice(0, 10),
      createdAt: now,
    })
    await app.drain()
    expect(await count("analytics_events", "user_id = $1", user.user.id)).toBeGreaterThan(0)
    // The ready export left an export.ready notification: the purge deletes the user's inbox.
    expect(await count("notifications", "user_id = $1", user.user.id)).toBeGreaterThan(0)
    // …and their email settings.
    await user.client.account.notificationPreferences.set({ type: "member.removed", email: false })
    expect(await count("notification_preferences", "user_id = $1", user.user.id)).toBe(1)

    await user.client.account.delete({ email: user.email })
    const cancelled: string[] = []
    const original = app.billing.cancelSubscription
    app.billing.cancelSubscription = async (id) => {
      cancelled.push(id)
      return original.call(app.billing, id)
    }
    try {
      await purgeLater()
    } finally {
      app.billing.cancelSubscription = original
    }

    expect(cancelled).toEqual([subscriptionId as string])
    expect(await app.db.users.find(user.user.id)).toBeUndefined()
    expect(await app.db.workspaces.find(solo.id)).toBeUndefined()
    // The shared workspace stays with its owner; the note is theirs to see, author unknown.
    expect(await app.db.workspaces.find(sharedId)).toBeDefined()
    expect((await owner.client.workspaces.get({ workspaceId: sharedId })).memberCount).toBe(1)
    const { items } = await owner.client.notes.list({ workspaceId: sharedId })
    expect(items.find((n) => n.id === note.id)).toMatchObject({ authorId: null })
    expect(await owner.client.notes.find({ workspaceId: sharedId, id: note.id })).toMatchObject({
      authorId: null,
    })
    // The avatar, the export and the deleted workspace's logo were queued and deleted.
    for (const key of [exportKey, avatarKey, logoKey]) {
      expect(await app.storage.get(key)).toBeNull()
    }
    // No row references the id any more.
    const linked: Array<[string, string]> = [
      ["users", "id = $1"],
      ["sessions", "user_id = $1 OR impersonated_by = $1"],
      ["tokens", "user_id = $1"],
      ["identities", "user_id = $1"],
      ["memberships", "user_id = $1"],
      ["two_factor_recovery_codes", "user_id = $1"],
      ["data_exports", "user_id = $1"],
      ["notifications", "user_id = $1"],
      ["notification_preferences", "user_id = $1"],
      ["invitations", "invited_by = $1"],
      ["workspaces", "created_by = $1"],
      ["audit_log", "actor_user_id = $1 OR impersonated_user_id = $1"],
      ["analytics_pageviews", "user_id = $1"],
      ["analytics_events", "user_id = $1"],
    ]
    for (const [table, where] of linked) {
      expect({ table, n: await count(table, where, user.user.id) }).toEqual({ table, n: 0 })
    }
    // The pageview survives, de-linked.
    expect(await count("analytics_pageviews", "path = '/notes' AND user_id IS NULL", 0)).toBe(1)

    const { subject } = await emails.accountDeleted({})
    await mailsTo(app, user.email, subject)
    const audit = await raw`
      SELECT actor_user_id, impersonated_user_id, metadata FROM audit_log
      WHERE action = 'user.deleted' AND target_type = 'user' AND target_id = ${String(user.user.id)}
    `
    expect(audit).toHaveLength(1)
    expect(audit[0].actor_user_id).toBeNull()
    expect(audit[0].impersonated_user_id).toBeNull()
    expect(JSON.parse(audit[0].metadata)).toEqual({ workspacesDeleted: [solo.id] })
    // The admin views render the gone user as unknown, never fail on it.
    const [gone] = await safe(root.client.admin.users.get({ id: user.user.id }))
    expect(gone).toMatchObject({ code: "NOT_FOUND" })
    // The email is free again.
    const fresh = await clientFor(app).auth.signUp({ email: user.email, password: PASSWORD })
    expect(fresh.user.id).not.toBe(user.user.id)
  })

  test("skips a user who became the only owner of a shared workspace, and records it", async () => {
    const { owner, member: user, workspaceId } = await sharedWorkspace("Handed over")
    await user.client.account.delete({ email: user.email })
    // After scheduling: the owner hands the workspace over and steps down.
    await app.db.memberships.setRole(workspaceId, user.user.id, "owner")
    await app.db.memberships.setRole(workspaceId, owner.user.id, "admin")
    logged.length = 0
    await purgeLater()
    expect((await app.db.users.find(user.user.id))?.deletion_scheduled_at).not.toBeNull()
    expect(await app.db.memberships.find(workspaceId, user.user.id)).toBeDefined()
    expect(logged).toContain(`privacy.purge: user ${user.user.id} skipped`)
    await app.db.users.cancelDeletion(user.user.id)
  })

  test("the re-check inside the transaction catches a hand-over during the cancels", async () => {
    const { owner, member: user, workspaceId } = await sharedWorkspace("Late hand-over")
    const solo = await user.client.workspaces.create({ name: "Solo paid" })
    await user.client.billing.mockChange({ workspaceId: solo.id, plan: "pro", interval: "month" })
    await user.client.account.delete({ email: user.email })
    const original = app.billing.cancelSubscription
    // Runs after the pre-check passed, before the purge transaction starts.
    app.billing.cancelSubscription = async (id) => {
      await app.db.memberships.setRole(workspaceId, user.user.id, "owner")
      await app.db.memberships.setRole(workspaceId, owner.user.id, "admin")
      return original.call(app.billing, id)
    }
    logged.length = 0
    try {
      await purgeLater()
    } finally {
      app.billing.cancelSubscription = original
    }
    expect(await app.db.users.find(user.user.id)).toBeDefined()
    expect(await app.db.workspaces.find(solo.id)).toBeDefined()
    expect(await app.db.memberships.find(workspaceId, user.user.id)).toBeDefined()
    expect(logged).toContain(`privacy.purge: user ${user.user.id} skipped`)
    // The solo workspace stays, its subscription already cancelled: the skip names it.
    const subscription = await app.db.billing.subscriptions.latest(solo.id)
    expect(subscription?.status).toBe("canceled")
    expect(loggedErrors).toContain(
      `privacy.purge: user ${user.user.id} skipped after cancelling subscriptions: cancelled, workspace kept: workspace ${solo.id} (${subscription?.subscription_id})`
    )
    await app.db.users.cancelDeletion(user.user.id)
  })

  test("a co-owner leaving during the purge rolls it back: the workspace keeps an owner", async () => {
    const { owner, member: user, workspaceId } = await sharedWorkspace("Co-owners")
    await app.db.memberships.setRole(workspaceId, user.user.id, "owner")
    const third = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: third.user.id, role: "member" })
    await user.client.account.delete({ email: user.email })
    const failures: string[] = []
    const outcome = await purgeUser(
      user.user.id,
      new Date(Date.now() + DELETION_GRACE_MS + DAY).toISOString(),
      {
        db: app.db,
        billing: app.billing,
        enqueue: app.enqueue,
        recordFailure: (message, error) =>
          failures.push(`${message}: ${error instanceof Error ? error.message : ""}`),
      },
      {
        // The other owner's leave, committed after the re-check saw two owners.
        beforePurge: async (tx) => {
          await tx.memberships.remove(workspaceId, owner.user.id)
        },
      }
    )
    expect(outcome).toEqual({ purged: false, reason: "ownerless", workspaceId })
    expect(failures).toEqual([
      `privacy.purge: user ${user.user.id} skipped: removing the user would leave workspace ${workspaceId} with no owner`,
    ])
    expect(await app.db.users.find(user.user.id)).toBeDefined()
    expect(await app.db.memberships.ownerCount(workspaceId)).toBe(2)
    await app.db.users.cancelDeletion(user.user.id)
  })

  test("a database error during the owner re-count fails the purge, never reported as a skip", async () => {
    const { member: user, workspaceId } = await sharedWorkspace("Re-count fails")
    await app.db.memberships.setRole(workspaceId, user.user.id, "owner")
    await user.client.account.delete({ email: user.email })
    const failures: string[] = []
    const outcome = purgeUser(
      user.user.id,
      new Date(Date.now() + DELETION_GRACE_MS + DAY).toISOString(),
      {
        db: app.db,
        billing: app.billing,
        enqueue: app.enqueue,
        recordFailure: (message) => failures.push(message),
      },
      {
        beforePurge: async (tx) => {
          tx.memberships.ownerCount = async () => {
            throw new Error("connection lost")
          }
        },
      }
    )
    await expect(outcome).rejects.toThrow("connection lost")
    expect(failures).toEqual([])
    expect(await app.db.users.find(user.user.id)).toBeDefined()
    expect(await app.db.memberships.find(workspaceId, user.user.id)).toBeDefined()
    await app.db.users.cancelDeletion(user.user.id)
  })

  test("an accepted invitation to the user's address is deleted; a pending one stays", async () => {
    const user = await signUpVerified(app)
    const joined = await signUpWithWorkspace(app)
    const other = await signUpWithWorkspace(app)
    for (const { client, workspaceId } of [joined, other]) {
      await client.workspaces.invitations.create({ workspaceId, email: user.email, role: "member" })
    }
    await app.db.workspaces.rename(joined.workspaceId, "Joined")
    const { pendingInvitations } = await user.client.workspaces.list()
    const accepted = pendingInvitations.find((i) => i.workspace.name === "Joined")
    if (!accepted) throw new Error("no invitation")
    await user.client.invitations.acceptById({ id: accepted.id })
    await app.drain()
    const before = await raw`
      SELECT workspace_id, accepted_at FROM invitations WHERE email = ${user.email} ORDER BY id
    `
    expect(before.length).toBe(2)

    await user.client.account.delete({ email: user.email })
    await purgeLater()
    expect(await app.db.users.find(user.user.id)).toBeUndefined()
    const after = await raw`
      SELECT workspace_id, accepted_at FROM invitations WHERE email = ${user.email} ORDER BY id
    `
    expect(after.map((row: { workspace_id: number }) => Number(row.workspace_id))).toEqual([
      other.workspaceId,
    ])
    expect(after[0]?.accepted_at).toBeNull()
  })

  test("a linked support request stays, de-linked, with the address it was sent from", async () => {
    const user = await signUpVerified(app)
    const { reference } = await user.client.support.create({
      email: user.email,
      topic: "account",
      message: "Please delete my account.",
    })
    const id = Number(reference.replace("HELP-", ""))
    expect((await app.db.support.find(id))?.user_id).toBe(user.user.id)
    await user.client.account.delete({ email: user.email })
    await purgeLater()
    expect(await app.db.users.find(user.user.id)).toBeUndefined()
    expect(await app.db.support.find(id)).toMatchObject({
      user_id: null,
      email: user.email,
      message: "Please delete my account.",
    })
  })

  test("a user skipped for good never stops the ones behind them", async () => {
    const { owner: blocked } = await sharedWorkspace("Blocking")
    // Scheduled first (so first in line), then blocked: the only owner of a shared workspace.
    await app.db.users.scheduleDeletion(blocked.user.id, new Date().toISOString())
    const next = await signUpVerified(app)
    await next.client.account.delete({ email: next.email })
    logged.length = 0
    await purgeLater({ pageSize: 1 })
    expect(await app.db.users.find(blocked.user.id)).toBeDefined()
    expect(logged).toContain(`privacy.purge: user ${blocked.user.id} skipped`)
    expect(await app.db.users.find(next.user.id)).toBeUndefined()
    await app.db.users.cancelDeletion(blocked.user.id)
  })

  test("a subscription the provider cannot cancel deletes nothing and records a failure", async () => {
    const user = await signUpWithWorkspace(app)
    await user.client.billing.mockChange({
      workspaceId: user.workspaceId,
      plan: "pro",
      interval: "month",
    })
    await user.client.account.delete({ email: user.email })
    const original = app.billing.cancelSubscription
    app.billing.cancelSubscription = async () => {
      throw new Error("provider is down")
    }
    logged.length = 0
    try {
      await purgeLater()
    } finally {
      app.billing.cancelSubscription = original
    }
    expect(await app.db.users.find(user.user.id)).toBeDefined()
    expect(await app.db.workspaces.find(user.workspaceId)).toBeDefined()
    expect(await app.db.memberships.find(user.workspaceId, user.user.id)).toBeDefined()
    expect(
      logged.some((m) =>
        m.startsWith(`privacy.purge: user ${user.user.id} skipped: cancelling workspace`)
      )
    ).toBe(true)
    await app.db.users.cancelDeletion(user.user.id)
  })

  test("a cancelled deletion is not purged, nor one not yet due", async () => {
    const cancelledUser = await signUpVerified(app)
    await cancelledUser.client.account.delete({ email: cancelledUser.email })
    await (await signInAgain(cancelledUser.email)).account.cancelDeletion()
    const notDue = await signUpVerified(app)
    await notDue.client.account.delete({ email: notDue.email })
    // Today's clock: not due yet.
    await app.enqueue(privacyPurgeJob, {})
    await app.drain()
    expect(await app.db.users.find(notDue.user.id)).toBeDefined()
    // Past the grace period: due, while the cancelled one never is.
    await purgeLater()
    expect(await app.db.users.find(cancelledUser.user.id)).toBeDefined()
    expect(await app.db.users.find(notDue.user.id)).toBeUndefined()
  })
})

describe("the export's reading of audit rows", () => {
  const row = (actor: number | null, impersonated: number | null, workspace: number | null) => ({
    actor_user_id: actor,
    impersonated_user_id: impersonated,
    workspace_id: workspace,
  })
  test("exportedAuditBy: you, a platform admin, or the workspace", () => {
    expect(exportedAuditBy(row(5, null, null), 5)).toBe("you")
    expect(exportedAuditBy(row(5, null, 9), 5)).toBe("you")
    // Platform rows by someone else (an admin's reset, suspension, impersonation start…).
    expect(exportedAuditBy(row(1, null, null), 5)).toBe("admin")
    expect(exportedAuditBy(row(null, null, null), 5)).toBe("admin")
    // Impersonation is always platform staff, workspace row or not.
    expect(exportedAuditBy(row(1, 5, null), 5)).toBe("admin")
    expect(exportedAuditBy(row(1, 5, 9), 5)).toBe("admin")
    expect(exportedAuditBy(row(1, 3, 9), 5)).toBe("admin")
    // Another member, an API key or the system, on behalf of a workspace.
    expect(exportedAuditBy(row(2, null, 9), 5)).toBe("workspace")
    expect(exportedAuditBy(row(null, null, 9), 5)).toBe("workspace")
  })

  test("exportedAuditBy: a support row stays admin after its impersonated member is purged", () => {
    const supportRow = (actor: number | null, metadata: string | null) => ({
      ...row(actor, null, 9),
      metadata,
    })
    // The purge nulled impersonated_user_id; the bySupport stamp still says it was support.
    expect(
      exportedAuditBy(supportRow(1, JSON.stringify({ role: "admin", bySupport: true })), 5)
    ).toBe("admin")
    // Even once the staff actor is gone too, or the actor is the exporting user themselves.
    expect(exportedAuditBy(supportRow(null, JSON.stringify({ bySupport: true })), 5)).toBe("admin")
    expect(exportedAuditBy(supportRow(5, JSON.stringify({ bySupport: true })), 5)).toBe("admin")
    // Anything but a literal true is not the stamp.
    expect(exportedAuditBy(supportRow(2, JSON.stringify({ bySupport: "true" })), 5)).toBe(
      "workspace"
    )
    expect(exportedAuditBy(supportRow(2, "not json"), 5)).toBe("workspace")
    expect(exportedAuditBy(supportRow(2, null), 5)).toBe("workspace")
  })

  test("exportedMetadata keeps each activity action's display keys and drops internals", () => {
    const meta = (action: string, value: Record<string, unknown>) =>
      exportedMetadata(action, JSON.stringify(value))
    const actorKey = { apiKeyId: 7, apiKeyName: "Importer" }
    expect(meta("workspace.renamed", { from: "a", to: "b", ...actorKey })).toEqual({
      from: "a",
      to: "b",
    })
    expect(meta("workspace.created", { name: "N" })).toEqual({ name: "N" })
    expect(
      meta("workspace.plan_changed", { plan: "pro", interval: "month", status: "active" })
    ).toEqual({ plan: "pro", interval: "month", status: "active" })
    expect(meta("workspace.ownership_transferred", { ...actorKey })).toBeNull()
    expect(meta("invitation.accepted", { role: "member" })).toEqual({ role: "member" })
    expect(meta("member.role_changed", { from: "member", to: "admin" })).toEqual({
      from: "member",
      to: "admin",
    })
    expect(meta("invitation.revoked", { email: "a***@example.com", role: "viewer" })).toEqual({
      email: "a***@example.com",
      role: "viewer",
    })
    expect(
      meta("workspace.api_key_created", {
        name: "CI",
        prefix: "abcd1234",
        scopes: ["notes:read"],
        expiresAt: null,
      })
    ).toEqual({ name: "CI", scopes: ["notes:read"] })
    expect(
      meta("workspace.webhook_updated", {
        endpointId: 3,
        host: "h.example.com",
        events: ["note.created"],
        enabled: true,
        changed: ["url"],
      })
    ).toEqual({ host: "h.example.com", events: ["note.created"] })
    expect(
      meta("workspace.webhook_disabled", {
        endpointId: 3,
        host: "h.example.com",
        events: [],
        reason: "gone",
        consecutiveFailures: 0,
      })
    ).toEqual({ host: "h.example.com", events: [], reason: "gone" })
  })
})
