import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  AUDIT_EXPORT_RATE_MESSAGE,
  auditExportCapMessage,
  JOB_RETRY_CONFLICT_MESSAGE,
  SELF_REMOVE_PASSKEYS_MESSAGE,
  SELF_RESET_MESSAGE,
  SELF_SUSPEND_MESSAGE,
  SELF_TARGET_MESSAGE,
  SUPERADMIN_REMOVE_PASSKEYS_MESSAGE,
  SUPERADMIN_RESET_MESSAGE,
  SUPERADMIN_SUSPEND_MESSAGE,
  SUPERADMIN_TARGET_MESSAGE,
  SUSPEND_UNTIL_INVALID_MESSAGE,
} from "@repo/api-contract"
import {
  accountSuspendedSubject,
  accountUnsuspendedSubject,
  magicLinkSubject,
  passkeysRemovedSubject,
  twoFactorResetSubject,
} from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { IMPERSONATION_TTL_MS } from "./admin"
import type { Db } from "./db"
import { analyticsRollupJob, DAY_MS, dayOf } from "./jobs/builtin/analytics"
import {
  auth,
  CLIENT_ID,
  clientFor,
  enableTwoFactor,
  mailsTo,
  signedIn,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"

const ROOT = "root@example.com"
const OPS = "ops@example.com"

let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({ superadminEmails: [ROOT, OPS] })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const client = { userAgent: "AdminBrowser/1", ip: "203.0.113.7" }

const iso = () => new Date().toISOString()
const future = () => new Date(Date.now() + 3_600_000).toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60_000).toISOString().slice(0, 10)
const daysAhead = (n: number) =>
  new Date(Date.now() + n * 24 * 60 * 60_000).toISOString().slice(0, 10)

/**
 * Reads the UTC date just before and just after running `fn`, so a row `fn` writes is always
 * exportable with `{ from, to }` spanning the window — even on the rare run where the real clock
 * crosses UTC midnight while `fn` runs (normally `from === to`, same as reading `today()` once).
 */
async function todayAround<T>(
  fn: () => Promise<T>
): Promise<{ result: T; from: string; to: string }> {
  const from = today()
  const result = await fn()
  const to = today()
  return { result, from, to }
}
/** A quote-aware CSV record splitter — enough to pull a specific row's cells out of a real export
 * without a naive comma split mistaking an embedded comma for a field separator. */
function splitCsvRecord(line: string): string[] {
  const cells: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] !== '"') throw new Error(`expected a quoted field at ${i}: ${line.slice(i)}`)
    i++
    let value = ""
    while (i < line.length) {
      if (line[i] === '"' && line[i + 1] === '"') {
        value += '"'
        i += 2
      } else if (line[i] === '"') {
        i++
        break
      } else {
        value += line[i]
        i++
      }
    }
    cells.push(value)
    if (line[i] === ",") i++
  }
  return cells
}

/**
 * A raw (non-oRPC-client) call to `admin.audit.export`, for asserting the literal wire
 * `Content-Type` of the returned file. Bun's `Response.formData()` drops a multipart file part's
 * own `Content-Type` header on decode (confirmed independently of this procedure, against
 * `admin.applications.cv` too — it only looks right there because its guessed-from-extension
 * fallback happens to match "application/pdf"), so the `ApiClient`'s reconstructed `File.type` is
 * not trustworthy for this check — `apps/auth`'s route handler must not trust it either, and
 * should set its response's `Content-Type` from the requested `format`, never from `file.type`.
 */
async function rawAuditExport(
  server: { url: URL },
  token: string,
  input: Record<string, unknown>
): Promise<{ contentType: string; filename: string; body: string }> {
  const res = await fetch(new URL("/rpc/admin/audit/export", server.url), {
    method: "POST",
    headers: {
      ...auth,
      "x-api-client-id": CLIENT_ID,
      "x-session-token": token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: input }),
  })
  const text = await res.text()
  const boundary = /boundary=([^;]+)/.exec(res.headers.get("content-type") ?? "")?.[1]
  if (!boundary) throw new Error(`expected multipart/form-data: ${res.headers.get("content-type")}`)
  const filePart = text.split(`--${boundary}`).find((p) => p.includes('name="0"'))
  if (!filePart) throw new Error(`no file part found in: ${text}`)
  const [headerBlock = "", ...rest] = filePart.replace(/^\r\n/, "").split("\r\n\r\n")
  return {
    contentType: /Content-Type:\s*(.+)/i.exec(headerBlock)?.[1]?.trim() ?? "",
    filename: /filename="([^"]*)"/i.exec(headerBlock)?.[1] ?? "",
    body: rest.join("\r\n\r\n").replace(/\r\n$/, ""),
  }
}

/**
 * Inserts a job and kills it in one go — bypassing the worker's definition registry entirely
 * (like `jobs/queue.test.ts`), so the job name need not be a real one. Runs start to finish with
 * no `await` boundary another test could land in, so it is safe against the queue other tests
 * drain via `signUp` / `verify` / `mailsTo`.
 */
async function deadJob(
  opts: { name?: string; dedupeKey?: string; error?: string } = {},
  db: Db = app.db
) {
  // Clears any job another test left queued (an analytics event instrumentation enqueued and
  // never drained, say): otherwise `claim` below — oldest `run_at` first — could grab that one
  // instead of the row this helper just inserted.
  await app.jobs.drain()
  await db.jobs.insert({
    name: opts.name ?? "test.dead",
    payload: "{}",
    maxAttempts: 1,
    runAt: iso(),
    dedupeKey: opts.dedupeKey,
    createdAt: iso(),
  })
  const [claimed] = await db.jobs.claim(iso(), 1, future())
  if (!claimed) throw new Error("expected a claimed row")
  await db.jobs.kill(claimed.id, claimed.attempts, iso(), opts.error ?? "boom")
  return claimed.id
}

/** Starts impersonating `target` as root and returns a client holding the impersonation token. */
async function impersonate(targetId: number, reason = "support ticket #1") {
  const result = await root.client.admin.users.impersonate({ id: targetId, reason, client })
  return { ...result, client: clientFor(app, result.token) }
}

describe("superadmin gate", () => {
  test("a listed, verified email sees admin; everyone else gets NOT_FOUND", async () => {
    expect((await root.client.auth.me()).user.superadmin).toBe(true)
    expect(await root.client.admin.metrics()).toMatchObject({ users: expect.any(Number) })

    const nobody = await signUpVerified(app)
    expect((await nobody.client.auth.me()).user.superadmin).toBe(false)
    const [error] = await safe(nobody.client.admin.metrics())
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Not found" })

    // Listed but unverified: not yet.
    const ops = await signUp(app, OPS)
    expect((await ops.client.auth.me()).user.superadmin).toBe(false)
    const [unverified] = await safe(ops.client.admin.users.list({}))
    expect(unverified).toMatchObject({ code: "NOT_FOUND" })
  })

  test("an impersonation session cannot reach the admin namespace", async () => {
    const target = await signUpVerified(app)
    const session = await impersonate(target.user.id)
    const [error] = await safe(session.client.admin.metrics())
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    await session.client.admin.stopImpersonation()
  })
})

describe("admin.users.impersonate", () => {
  test("issues a one-hour session that auth.me reports as impersonation", async () => {
    const target = await signUpVerified(app)
    const before = Date.now()
    const session = await impersonate(target.user.id, "checking a bug report")
    expect(session.user.id).toBe(target.user.id)
    const ttl = Date.parse(session.expiresAt) - before
    expect(ttl).toBeGreaterThan(IMPERSONATION_TTL_MS - 5_000)
    expect(ttl).toBeLessThanOrEqual(IMPERSONATION_TTL_MS + 5_000)

    const me = await session.client.auth.me()
    expect(me.user.id).toBe(target.user.id)
    expect(me.impersonation).toEqual({
      by: { id: root.user.id, name: root.user.name, email: ROOT },
      reason: "checking a bug report",
      expiresAt: session.expiresAt,
    })
    // The user's own session is untouched by it.
    expect((await target.client.auth.me()).impersonation).toBeNull()
    await session.client.admin.stopImpersonation()
  })

  test("impersonation sessions are never touched; ordinary ones are", async () => {
    const target = await signUpVerified(app)
    const session = await impersonate(target.user.id)
    const old = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()
    const [own] = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    const rows = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    const imp = rows.find((r) => r.impersonated_by === root.user.id)
    if (!own || !imp) throw new Error("expected both sessions")
    await app.db.sessions.touch(own.id, old)
    await app.db.sessions.touch(imp.id, old)
    await target.client.auth.me()
    await session.client.auth.me()
    const after = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    expect(after.find((r) => r.id === own.id)?.last_seen_at).not.toBe(old)
    expect(after.find((r) => r.id === imp.id)?.last_seen_at).toBe(old)
    await session.client.admin.stopImpersonation()
  })

  test("refuses yourself, superadmins and unknown ids", async () => {
    const [self] = await safe(
      root.client.admin.users.impersonate({ id: root.user.id, reason: "testing", client })
    )
    expect(self).toMatchObject({ code: "FORBIDDEN", message: SELF_TARGET_MESSAGE })
    const ops = await signUpVerified(app, `ops2-${Date.now()}@example.com`)
    // Make ops a superadmin for this check by listing them: start a second app.
    const second = await start({ superadminEmails: [ROOT, ops.email] })
    try {
      const r = await signUpVerified(second, ROOT)
      const o = await signUpVerified(second, ops.email)
      const [admin] = await safe(
        r.client.admin.users.impersonate({ id: o.user.id, reason: "testing", client })
      )
      expect(admin).toMatchObject({ code: "FORBIDDEN", message: SUPERADMIN_TARGET_MESSAGE })
    } finally {
      await second.stop()
    }
    const [missing] = await safe(
      root.client.admin.users.impersonate({ id: 999_999, reason: "testing", client })
    )
    expect(missing).toMatchObject({ code: "NOT_FOUND" })
  }, 30_000)

  test("a second impersonation replaces the first, on the record", async () => {
    const a = await signUpVerified(app)
    const b = await signUpVerified(app)
    const first = await impersonate(a.user.id, "first")
    const secondSession = await impersonate(b.user.id, "second")
    const [gone] = await safe(first.client.auth.me())
    expect(gone).toMatchObject({ code: "UNAUTHORIZED" })
    const { items } = await root.client.admin.audit.list({ actorId: root.user.id, limit: 5 })
    expect(items.map((e) => e.action).slice(0, 2)).toEqual([
      "impersonation.started",
      "impersonation.replaced",
    ])
    expect(items[1]).toMatchObject({
      actor: { id: root.user.id, email: ROOT },
      targetType: "user",
      targetId: String(a.user.id),
    })
    expect(items[0]).toMatchObject({ targetId: String(b.user.id), reason: "second" })
    await secondSession.client.admin.stopImpersonation()
  })

  test("limiter: impersonate:<adminId>", async () => {
    const limited = await start({
      superadminEmails: [ROOT],
      impersonateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const r = await signUpVerified(limited, ROOT)
      const u = await signUpVerified(limited)
      await r.client.admin.users.impersonate({ id: u.user.id, reason: "one", client })
      await r.client.admin.users.impersonate({ id: u.user.id, reason: "two", client })
      const [error] = await safe(
        r.client.admin.users.impersonate({ id: u.user.id, reason: "three", client })
      )
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("the admin losing superadmin status ends their impersonations at the next request", async () => {
    const revocable = await start({ superadminEmails: [ROOT] })
    try {
      const r = await signUpVerified(revocable, ROOT)
      const u = await signUpVerified(revocable)
      const result = await r.client.admin.users.impersonate({
        id: u.user.id,
        reason: "testing",
        client,
      })
      const session = clientFor(revocable, result.token)
      expect((await session.auth.me()).impersonation).not.toBeNull()
      // The operator removes the address from SUPERADMIN_EMAILS: the live set is what the
      // server reads (createServer returns it), so this is that change without a restart.
      revocable.superadminEmails.delete(ROOT)
      const [error] = await safe(session.auth.me())
      expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    } finally {
      await revocable.stop()
    }
  })
})

describe("admin.stopImpersonation", () => {
  test("only an impersonation token may call it; a second call is NOT_FOUND", async () => {
    const target = await signUpVerified(app)
    const [own] = await safe(root.client.admin.stopImpersonation())
    expect(own).toMatchObject({ code: "NOT_FOUND" })
    const [user] = await safe(target.client.admin.stopImpersonation())
    expect(user).toMatchObject({ code: "NOT_FOUND" })

    const session = await impersonate(target.user.id)
    expect(await session.client.admin.stopImpersonation()).toEqual({ ok: true })
    const [again] = await safe(session.client.admin.stopImpersonation())
    expect(again).toMatchObject({ code: "UNAUTHORIZED" })
    const detail = await root.client.admin.users.get({ id: target.user.id })
    expect(detail.audit.map((e) => e.action)).toEqual([
      "impersonation.stopped",
      "impersonation.started",
    ])
    expect(detail.audit[0]).toMatchObject({
      actor: { id: root.user.id },
      impersonated: { id: target.user.id },
      metadata: { via: "stop" },
    })
    expect(detail.sessions.impersonations).toBe(1)
  })
})

describe("every impersonation end is audited", () => {
  test("auth.signOut while impersonating writes impersonation.stopped via sign_out", async () => {
    const target = await signUpVerified(app)
    const session = await impersonate(target.user.id)
    await session.client.auth.signOut()
    const [gone] = await safe(session.client.auth.me())
    expect(gone).toMatchObject({ code: "UNAUTHORIZED" })
    const detail = await root.client.admin.users.get({ id: target.user.id })
    expect(detail.audit.map((e) => e.action)).toEqual([
      "impersonation.stopped",
      "impersonation.started",
    ])
    expect(detail.audit[0]).toMatchObject({
      actor: { id: root.user.id },
      impersonated: { id: target.user.id },
      targetType: "user",
      targetId: String(target.user.id),
      metadata: { via: "sign_out" },
    })
  })

  test("the user's own sign-out writes no impersonation row", async () => {
    const target = await signUpVerified(app)
    await target.client.auth.signOut()
    const detail = await root.client.admin.users.get({ id: target.user.id })
    expect(detail.audit).toEqual([])
  })

  test("revokeSessions on a user being impersonated ends and audits the impersonation", async () => {
    const target = await signUpVerified(app)
    const session = await impersonate(target.user.id)
    await root.client.admin.users.revokeSessions({ id: target.user.id })
    const [gone] = await safe(session.client.auth.me())
    expect(gone).toMatchObject({ code: "UNAUTHORIZED" })
    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items.map((e) => e.action)).toEqual([
      "user.sessions_revoked",
      "impersonation.stopped",
      "impersonation.started",
    ])
    expect(items[1]).toMatchObject({
      actor: { id: root.user.id },
      impersonated: null,
      metadata: { via: "sessions_revoked", impersonatedBy: root.user.id },
    })
  })

  test("revokeSessions on a superadmin ends the impersonation they drive", async () => {
    const two = await start({ superadminEmails: [ROOT, OPS] })
    try {
      const a = await signUpVerified(two, ROOT)
      const b = await signUpVerified(two, OPS)
      const u = await signUpVerified(two)
      const result = await a.client.admin.users.impersonate({
        id: u.user.id,
        reason: "support",
        client,
      })
      const session = clientFor(two, result.token)
      expect((await session.auth.me()).impersonation).not.toBeNull()
      await b.client.admin.users.revokeSessions({ id: a.user.id })
      const [gone] = await safe(session.auth.me())
      expect(gone).toMatchObject({ code: "UNAUTHORIZED" })
      const { items } = await b.client.admin.audit.list({
        targetType: "user",
        targetId: String(u.user.id),
      })
      expect(items[0]).toMatchObject({
        action: "impersonation.stopped",
        actor: { id: b.user.id },
        metadata: { via: "admin_sessions_revoked", impersonatedBy: a.user.id },
      })
      const revoked = await b.client.admin.audit.list({
        targetType: "user",
        targetId: String(a.user.id),
      })
      expect(revoked.items[0]).toMatchObject({ action: "user.sessions_revoked" })
    } finally {
      await two.stop()
    }
  }, 30_000)
})

describe("admin reads", () => {
  test("metrics count users, verification, workspaces by plan, past due, sessions", async () => {
    const owner = await signUpWithWorkspace(app)
    await app.billing.change(owner.workspaceId, "pro", "month")
    const m = await root.client.admin.metrics()
    expect(m.users).toBeGreaterThanOrEqual(2)
    expect(m.verifiedUsers).toBeLessThanOrEqual(m.users)
    expect(m.signUps7d).toBe(m.users)
    expect(m.signUps30d).toBe(m.users)
    expect(m.workspacesByPlan.pro).toBeGreaterThanOrEqual(1)
    expect(m.workspacesByPlan.free + m.workspacesByPlan.pro + m.workspacesByPlan.team).toBe(
      m.workspaces
    )
    expect(m.activeSessions).toBeGreaterThanOrEqual(2)
    expect(m).toMatchObject({
      pendingInvitations: expect.any(Number),
      waitlist: expect.any(Number),
    })
  })

  test("users.list searches by email prefix or name substring, escapes wildcards, pages", async () => {
    const ada = await signUpVerified(app, `ada.lovelace-${Date.now()}@example.com`)
    await ada.client.account.updateProfile({ name: "Countess of Lovelace" })
    const byEmail = await root.client.admin.users.list({ q: "ada.lovelace" })
    expect(byEmail.items.map((u) => u.id)).toContain(ada.user.id)
    const byName = await root.client.admin.users.list({ q: "LOVELACE" })
    expect(byName.items.map((u) => u.id)).toContain(ada.user.id)
    const wildcard = await root.client.admin.users.list({ q: "%" })
    expect(wildcard.items).toEqual([])
    const first = await root.client.admin.users.list({ limit: 1 })
    expect(first.items).toHaveLength(1)
    expect(first.nextCursor).toBe(first.items[0]?.id ?? -1)
    const second = await root.client.admin.users.list({ limit: 1, cursor: first.nextCursor ?? 0 })
    expect(second.items[0]?.id).toBeLessThan(first.items[0]?.id ?? 0)
    expect(first.items[0]).not.toHaveProperty("password_hash")
    expect(first.items[0]).toHaveProperty("suspended")
  })

  test("users.list filters to suspended accounts only with suspended=true", async () => {
    const suspended = await signUpVerified(app)
    const notSuspended = await signUpVerified(app)
    await root.client.admin.users.suspend({ userId: suspended.user.id, reason: "testing" })
    const { items } = await root.client.admin.users.list({ suspended: "true", limit: 100 })
    const ids = items.map((u) => u.id)
    expect(ids).toContain(suspended.user.id)
    expect(ids).not.toContain(notSuspended.user.id)
    expect(items.find((u) => u.id === suspended.user.id)?.suspended).toMatchObject({
      active: true,
    })
    const unfiltered = await root.client.admin.users.list({ limit: 100 })
    expect(unfiltered.items.map((u) => u.id)).toContain(notSuspended.user.id)
  })

  test("suspended.active: indefinite and future-dated suspensions are true and pass the filter", async () => {
    const indefinite = await signUpVerified(app)
    await root.client.admin.users.suspend({ userId: indefinite.user.id, reason: "testing" })
    const futureUntil = new Date(Date.now() + 3_600_000).toISOString()
    const future = await signUpVerified(app)
    await root.client.admin.users.suspend({
      userId: future.user.id,
      reason: "testing",
      until: futureUntil,
    })

    const indefiniteDetail = await root.client.admin.users.get({ id: indefinite.user.id })
    expect(indefiniteDetail.suspended).toMatchObject({ until: null, active: true })
    const futureDetail = await root.client.admin.users.get({ id: future.user.id })
    expect(futureDetail.suspended).toMatchObject({ until: futureUntil, active: true })

    const { items } = await root.client.admin.users.list({ suspended: "true", limit: 100 })
    const ids = items.map((u) => u.id)
    expect(ids).toContain(indefinite.user.id)
    expect(ids).toContain(future.user.id)
  })

  test("suspended.active: an expired-but-uncleared suspension is false and excluded by the filter", async () => {
    const target = await signUpVerified(app)
    const until = new Date(Date.now() + 100).toISOString()
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "testing", until })
    await Bun.sleep(150)

    const detail = await root.client.admin.users.get({ id: target.user.id })
    expect(detail.suspended).toMatchObject({ until, active: false })

    const { items } = await root.client.admin.users.list({ suspended: "true", limit: 100 })
    expect(items.map((u) => u.id)).not.toContain(target.user.id)
    // Still visible in the unfiltered list — the record itself is not hidden, only excluded from
    // the "currently in force" filter.
    const unfiltered = await root.client.admin.users.list({ limit: 100 })
    expect(unfiltered.items.map((u) => u.id)).toContain(target.user.id)
  })

  test("users.get: profile, memberships with plan, sessions, audit; unknown id NOT_FOUND", async () => {
    const owner = await signUpWithWorkspace(app)
    const detail = await root.client.admin.users.get({ id: owner.user.id })
    expect(detail).toMatchObject({
      email: owner.email,
      emailVerified: true,
      hasPassword: true,
      superadmin: false,
      workspaceCount: 1,
      passkeys: 0,
      twoFactorEnabled: false,
      memberships: [{ workspace: { id: owner.workspaceId }, role: "owner", plan: "free" }],
      sessions: { count: 1, impersonations: 0 },
      suspended: null,
    })
    expect(detail.sessions.lastSeenAt).not.toBeNull()
    const [missing] = await safe(root.client.admin.users.get({ id: 999_999 }))
    expect(missing).toMatchObject({ code: "NOT_FOUND" })
  })

  test("users.get: suspended shows the record, reason included, until when set", async () => {
    const target = await signUpVerified(app)
    const until = new Date(Date.now() + 3_600_000).toISOString()
    await root.client.admin.users.suspend({
      userId: target.user.id,
      reason: "abuse report",
      until,
    })
    const detail = await root.client.admin.users.get({ id: target.user.id })
    expect(detail.suspended).toEqual({
      at: expect.any(String),
      until,
      active: true,
      reason: "abuse report",
      by: { id: root.user.id, email: root.email },
    })
  })

  test("users.get: twoFactorEnabled reflects the account's two-step verification state", async () => {
    const target = await signUpVerified(app)
    expect(await root.client.admin.users.get({ id: target.user.id })).toMatchObject({
      twoFactorEnabled: false,
    })
    await enableTwoFactor(app, target.user.id)
    expect(await root.client.admin.users.get({ id: target.user.id })).toMatchObject({
      twoFactorEnabled: true,
    })
  })

  test("users.revokeSessions signs the user out everywhere and is audited", async () => {
    const u = await signUpVerified(app)
    expect(await root.client.admin.users.revokeSessions({ id: u.user.id })).toEqual({ ok: true })
    const [error] = await safe(u.client.auth.me())
    expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(u.user.id),
    })
    expect(items[0]).toMatchObject({ action: "user.sessions_revoked", actor: { id: root.user.id } })
  })

  test("workspaces.list / get: owners, plan from the live mirror row, members, billing", async () => {
    const owner = await signUpWithWorkspace(app)
    await app.billing.change(owner.workspaceId, "team", "year")
    const { items } = await root.client.admin.workspaces.list({ q: "notes" })
    const ws = items.find((w) => w.id === owner.workspaceId)
    expect(ws).toMatchObject({
      name: "Notes",
      owners: [{ id: owner.user.id, email: owner.email }],
      memberCount: 1,
      plan: "team",
      status: "active",
    })
    const detail = await root.client.admin.workspaces.get({ id: owner.workspaceId })
    expect(detail.members).toEqual([{ userId: owner.user.id, email: owner.email, role: "owner" }])
    expect(detail.billing).toMatchObject({ provider: "mock", status: "active", interval: "year" })
    const [missing] = await safe(root.client.admin.workspaces.get({ id: 999_999 }))
    expect(missing).toMatchObject({ code: "NOT_FOUND" })
  })

  test("audit.list filters by actor and target and pages newest first", async () => {
    const u = await signUpVerified(app)
    const s = await impersonate(u.user.id, "audit filters")
    await s.client.admin.stopImpersonation()
    const forUser = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(u.user.id),
    })
    expect(forUser.items.map((e) => e.action)).toEqual([
      "impersonation.stopped",
      "impersonation.started",
    ])
    const one = await root.client.admin.audit.list({ actorId: root.user.id, limit: 1 })
    expect(one.items).toHaveLength(1)
    expect(one.nextCursor).toBe(one.items[0]?.id ?? -1)
    const next = await root.client.admin.audit.list({
      actorId: root.user.id,
      limit: 1,
      cursor: one.nextCursor ?? 0,
    })
    expect(next.items[0]?.id).toBeLessThan(one.items[0]?.id ?? 0)
    const nothing = await root.client.admin.audit.list({ actorId: 999_999 })
    expect(nothing.items).toEqual([])
    // Defaults: start() passes no auditPiiRetentionDays/auditRetentionDays, so the server falls
    // back to the same 90/365 the env schema defaults to.
    expect(nothing.retention).toEqual({ piiDays: 90, rowDays: 365 })
  })

  test("audit.list's retention reflects the server's own configured retention days", async () => {
    const custom = await start({
      superadminEmails: [ROOT],
      auditPiiRetentionDays: 30,
      auditRetentionDays: 200,
    })
    try {
      const customRoot = await signUpVerified(custom, ROOT)
      const page = await customRoot.client.admin.audit.list({})
      expect(page.retention).toEqual({ piiDays: 30, rowDays: 200 })
    } finally {
      await custom.stop()
    }
  })
})

describe("admin.audit.export", () => {
  /** How many of root's most recent audit rows (by this id) are "audit.exported" — a delta
   * marker: a refused export must leave this count unchanged. */
  async function exportedCount() {
    const page = await root.client.admin.audit.list({ actorId: root.user.id, limit: 100 })
    return page.items.filter((i) => i.action === "audit.exported").length
  }

  test("exports CSV with the design's columns, a quoted header, and the matching row", async () => {
    const target = await signUpVerified(app)
    await enableTwoFactor(app, target.user.id)
    const reason = `csv export check ${Math.random().toString(36).slice(2)}`
    const { from, to } = await todayAround(() =>
      root.client.admin.users.resetTwoFactor({ userId: target.user.id, reason })
    )

    // `file.type` is not checked here: Bun's `Response.formData()` drops a multipart file part's
    // own `Content-Type` header on decode, so the api client's reconstructed `File.type` is not
    // trustworthy over this transport (see the "wire response" test below, which hits the raw
    // HTTP response instead and confirms the literal declared content type).
    const file = await root.client.admin.audit.export({ from, to, format: "csv" })
    expect(file.name).toBe(`audit-${from}-${to}.csv`)

    const text = await file.text()
    const lines = text.split("\r\n").filter(Boolean)
    expect(splitCsvRecord(lines[0] ?? "")).toEqual([
      "id",
      "at",
      "actor_id",
      "actor_email",
      "impersonated_id",
      "impersonated_email",
      "action",
      "target_type",
      "target_id",
      "reason",
      "ip",
      "user_agent",
      "metadata",
    ])
    const row = lines
      .slice(1)
      .map(splitCsvRecord)
      .find((cells) => cells[9] === reason)
    expect(row).toBeDefined()
    expect(row?.[6]).toBe("user.two_factor_reset")
    expect(row?.[3]).toBe(root.email)
    expect(row?.[7]).toBe("user")
    expect(row?.[8]).toBe(String(target.user.id))
  })

  test("exports JSON Lines with parsed metadata and real nulls", async () => {
    const target = await signUpVerified(app)
    const reason = `jsonl export check ${Math.random().toString(36).slice(2)}`
    const { from, to } = await todayAround(() =>
      root.client.admin.users.suspend({ userId: target.user.id, reason })
    )

    const file = await root.client.admin.audit.export({ from, to, format: "jsonl" })
    expect(file.name).toBe(`audit-${from}-${to}.jsonl`)

    const rows = (await file.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const row = rows.find((r) => r.reason === reason)
    expect(row).toBeDefined()
    expect(row.action).toBe("user.suspended")
    expect(row.actor_id).toBe(root.user.id)
    expect(row.actor_email).toBe(root.email)
    expect(row.impersonated_id).toBeNull()
    expect(row.impersonated_email).toBeNull()
    expect(row.target_type).toBe("user")
    expect(row.target_id).toBe(String(target.user.id))
    expect(row.metadata).toEqual({ until: null })
  })

  test("the wire response carries the declared Content-Type and filename for each format", async () => {
    const day = today()
    const csv = await rawAuditExport(app.server, root.token ?? "", {
      from: day,
      to: day,
      format: "csv",
    })
    expect(csv.contentType).toBe("text/csv; charset=utf-8")
    expect(csv.filename).toBe(`audit-${day}-${day}.csv`)
    // The BOM (U+FEFF) is the file's own first character, ahead of the quoted header.
    expect(csv.body.startsWith('﻿"id","at"')).toBe(true)

    const jsonl = await rawAuditExport(app.server, root.token ?? "", {
      from: day,
      to: day,
      format: "jsonl",
    })
    expect(jsonl.contentType).toBe("application/x-ndjson")
    expect(jsonl.filename).toBe(`audit-${day}-${day}.jsonl`)
  })

  test("filters by actorId, targetType and targetId like audit.list's", async () => {
    const own = await start({ superadminEmails: [ROOT, "filter-ops@example.com"] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const ops = await signUpVerified(own, "filter-ops@example.com")
      const target = await signUpVerified(own)
      const rootReason = `filter check root ${Math.random().toString(36).slice(2)}`
      const opsReason = `filter check ops ${Math.random().toString(36).slice(2)}`
      const { from, to } = await todayAround(async () => {
        await rootOwn.client.admin.users.suspend({ userId: target.user.id, reason: rootReason })
        await rootOwn.client.admin.users.unsuspend({
          userId: target.user.id,
          reason: "undo for filter test",
        })
        await ops.client.admin.users.suspend({ userId: target.user.id, reason: opsReason })
        await ops.client.admin.users.unsuspend({
          userId: target.user.id,
          reason: "undo for filter test",
        })
      })

      const byActor = await rootOwn.client.admin.audit.export({
        from,
        to,
        format: "jsonl",
        actorId: ops.user.id,
      })
      const actorRows = (await byActor.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(actorRows.every((r) => r.actor_id === ops.user.id)).toBe(true)
      expect(actorRows.some((r) => r.reason === opsReason)).toBe(true)
      expect(actorRows.some((r) => r.reason === rootReason)).toBe(false)

      const byTarget = await rootOwn.client.admin.audit.export({
        from,
        to,
        format: "jsonl",
        targetType: "user",
        targetId: String(target.user.id),
      })
      const targetRows = (await byTarget.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(
        targetRows.every((r) => r.target_type === "user" && r.target_id === String(target.user.id))
      ).toBe(true)
      expect(targetRows.some((r) => r.reason === rootReason)).toBe(true)
      expect(targetRows.some((r) => r.reason === opsReason)).toBe(true)
    } finally {
      await own.stop()
    }
  }, 30_000)

  test("to today includes rows written just now (inclusive whole UTC days)", async () => {
    const target = await signUpVerified(app)
    const reason = `today inclusive check ${Math.random().toString(36).slice(2)}`
    const { from, to } = await todayAround(() =>
      root.client.admin.users.suspend({ userId: target.user.id, reason })
    )
    const file = await root.client.admin.audit.export({ from, to, format: "jsonl" })
    const rows = (await file.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows.some((r) => r.reason === reason)).toBe(true)
  })

  test("from after to is BAD_REQUEST", async () => {
    const [error] = await safe(
      root.client.admin.audit.export({ from: today(), to: daysAgo(1), format: "csv" })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a range more than 366 days apart is BAD_REQUEST", async () => {
    const [error] = await safe(
      root.client.admin.audit.export({ from: daysAgo(400), to: today(), format: "csv" })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a malformed date is BAD_REQUEST", async () => {
    const [error] = await safe(
      root.client.admin.audit.export({ from: "not-a-date", to: today(), format: "csv" })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("to tomorrow (UTC) is accepted — an admin's local calendar date may already be there", async () => {
    const from = today()
    const to = daysAhead(1)
    const result = await root.client.admin.audit.export({ from, to, format: "csv" })
    expect(result.name).toBe(`audit-${from}-${to}.csv`)
  })

  test("to later than tomorrow (UTC) is BAD_REQUEST", async () => {
    const [error] = await safe(
      root.client.admin.audit.export({ from: today(), to: daysAhead(2), format: "csv" })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("the export's own audit.exported row never appears inside the file it describes", async () => {
    const day = today()
    const firstFile = await root.client.admin.audit.export({ from: day, to: day, format: "jsonl" })
    const firstRows = (await firstFile.text())
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))

    const page = await root.client.admin.audit.list({ actorId: root.user.id, limit: 1 })
    const latest = page.items[0]
    expect(latest?.action).toBe("audit.exported")
    expect(latest?.targetType).toBeNull()
    expect(latest?.metadata).toMatchObject({ from: day, to: day, format: "jsonl" })
    expect(latest?.metadata?.rows).toBe(firstRows.length)
    // The real assertion (Review Focus 5): the row describing *this* export is not inside the
    // file this export produced — not just a count that happens to match either way.
    expect(firstRows.some((r) => r.id === latest?.id)).toBe(false)

    // And the row is not filtered out of exports wholesale: a second export over the same day
    // does contain the first export's own audit.exported row.
    const secondFile = await root.client.admin.audit.export({
      from: day,
      to: day,
      format: "jsonl",
    })
    const secondRows = (await secondFile.text())
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(secondRows.some((r) => r.id === latest?.id)).toBe(true)
  })

  test("limits exports per admin; a refusal writes no audit.exported row", async () => {
    const own = await start({
      superadminEmails: [ROOT],
      auditExportLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const { from, to } = await todayAround(() =>
        rootOwn.client.admin.users.suspend({ userId: target.user.id, reason: "rate limit setup" })
      )
      await rootOwn.client.admin.audit.export({ from, to, format: "jsonl" })
      await rootOwn.client.admin.audit.export({ from, to, format: "jsonl" })
      const before = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      const beforeExported = before.items.filter((i) => i.action === "audit.exported").length
      const [error] = await safe(rootOwn.client.admin.audit.export({ from, to, format: "jsonl" }))
      expect(error).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: AUDIT_EXPORT_RATE_MESSAGE,
      })
      const after = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      const afterExported = after.items.filter((i) => i.action === "audit.exported").length
      expect(afterExported).toBe(beforeExported)
    } finally {
      await own.stop()
    }
  }, 30_000)

  test("more than the configured cap is CONFLICT, with the cap actually in force; a refusal writes no audit.exported row", async () => {
    const cap = 1
    const own = await start({ superadminEmails: [ROOT], auditExportMaxRows: cap })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const t1 = await signUpVerified(own)
      const t2 = await signUpVerified(own)
      const { from, to } = await todayAround(async () => {
        await rootOwn.client.admin.users.suspend({ userId: t1.user.id, reason: "cap test 1" })
        await rootOwn.client.admin.users.suspend({ userId: t2.user.id, reason: "cap test 2" })
      })
      const before = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      const [error] = await safe(rootOwn.client.admin.audit.export({ from, to, format: "csv" }))
      // Not the production-default AUDIT_EXPORT_CAP_MESSAGE ("100 000"): this server's own
      // auditExportMaxRows is 1, and the message must say so.
      expect(error).toMatchObject({ code: "CONFLICT", message: auditExportCapMessage(cap) })
      const after = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      expect(after.items.filter((i) => i.action === "audit.exported")).toHaveLength(
        before.items.filter((i) => i.action === "audit.exported").length
      )
    } finally {
      await own.stop()
    }
  }, 30_000)

  test("a purged actor's email is null in the export", async () => {
    const PURGEE = "audit-export-purgee@example.com"
    const own = await start({ superadminEmails: [ROOT, PURGEE] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const purgee = await signUpVerified(own, PURGEE)
      const target = await signUpVerified(own)
      await enableTwoFactor(own, target.user.id)
      const reason = `purged actor check ${Math.random().toString(36).slice(2)}`
      const { from, to } = await todayAround(() =>
        purgee.client.admin.users.resetTwoFactor({ userId: target.user.id, reason })
      )
      await own.db.transaction((tx) => tx.users.purge(purgee.user.id, new Date().toISOString()))
      const file = await rootOwn.client.admin.audit.export({ from, to, format: "jsonl" })
      const rows = (await file.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      const row = rows.find((r) => r.reason === reason)
      expect(row).toBeDefined()
      expect(row.actor_id).toBeNull()
      expect(row.actor_email).toBeNull()
    } finally {
      await own.stop()
    }
  }, 30_000)

  test("an impersonation session cannot reach it; writes no audit.exported row", async () => {
    // A dedicated server: the shared `app`'s impersonateLimiter runs at its production default
    // (10/hour) and the file's other describe blocks already use most of that budget.
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const result = await rootOwn.client.admin.users.impersonate({
        id: target.user.id,
        reason: "audit export impersonation check",
        client,
      })
      const session = clientFor(own, result.token)
      const before = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      const beforeExported = before.items.filter((i) => i.action === "audit.exported").length
      const day = today()
      const [error] = await safe(session.admin.audit.export({ from: day, to: day, format: "csv" }))
      expect(error).toMatchObject({ code: "NOT_FOUND" })
      const after = await rootOwn.client.admin.audit.list({
        actorId: rootOwn.user.id,
        limit: 100,
      })
      expect(after.items.filter((i) => i.action === "audit.exported").length).toBe(beforeExported)
    } finally {
      await own.stop()
    }
  }, 30_000)

  test("a non-admin cannot reach it; writes no audit.exported row", async () => {
    const nobody = await signUpVerified(app)
    const before = await exportedCount()
    const day = today()
    const [error] = await safe(
      nobody.client.admin.audit.export({ from: day, to: day, format: "csv" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    const after = await exportedCount()
    expect(after).toBe(before)
  })
})

describe("admin.users.resetTwoFactor", () => {
  test("turns 2FA off, ends every session, audits it, and mails the user", async () => {
    const target = await signUpVerified(app)
    await enableTwoFactor(app, target.user.id)
    const before = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    expect(before.length).toBeGreaterThan(0)

    expect(
      await root.client.admin.users.resetTwoFactor({ userId: target.user.id, reason: "lost phone" })
    ).toEqual({ ok: true })

    expect((await app.db.users.find(target.user.id))?.two_factor_enabled_at).toBeNull()
    const [sessionError] = await safe(target.client.auth.me())
    expect(sessionError).toMatchObject({ code: "UNAUTHORIZED" })

    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items[0]).toMatchObject({
      action: "user.two_factor_reset",
      actor: { id: root.user.id },
      reason: "lost phone",
    })
    await mailsTo(app, target.email, twoFactorResetSubject)

    // The user can sign in again with just a password — no challenge.
    const result = await clientFor(app).auth.signIn({
      email: target.email,
      password: "correct horse battery",
    })
    expect(result).toHaveProperty("session.token")
  })

  test("the reason must be 3-200 characters", async () => {
    const target = await signUpVerified(app)
    const [tooShort] = await safe(
      root.client.admin.users.resetTwoFactor({ userId: target.user.id, reason: "ab" })
    )
    expect(tooShort).toMatchObject({ code: "BAD_REQUEST" })
    const [tooLong] = await safe(
      root.client.admin.users.resetTwoFactor({ userId: target.user.id, reason: "x".repeat(201) })
    )
    expect(tooLong).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("unknown user is NOT_FOUND", async () => {
    const [error] = await safe(
      root.client.admin.users.resetTwoFactor({ userId: 999_999, reason: "testing" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("a user without two-step verification on is a conflict; nothing is ended or sent", async () => {
    const target = await signUpVerified(app)
    const before = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    const mailsBefore = app.mailer.sent.length

    const [error] = await safe(
      root.client.admin.users.resetTwoFactor({ userId: target.user.id, reason: "testing" })
    )
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "That user does not have two-step verification on",
    })

    const after = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    expect(after).toHaveLength(before.length)
    expect(app.mailer.sent).toHaveLength(mailsBefore)
  })

  test("limits resets per admin", async () => {
    const own = await start({
      superadminEmails: [ROOT],
      resetTwoFactorLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const [t1, t2, t3] = await Promise.all([
        signUpVerified(own),
        signUpVerified(own),
        signUpVerified(own),
      ])
      for (const t of [t1, t2, t3]) await enableTwoFactor(own, t.user.id)
      expect(
        await rootOwn.client.admin.users.resetTwoFactor({ userId: t1.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      expect(
        await rootOwn.client.admin.users.resetTwoFactor({ userId: t2.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      const [err] = await safe(
        rootOwn.client.admin.users.resetTwoFactor({ userId: t3.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("refuses to target yourself or another superadmin", async () => {
    const [self] = await safe(
      root.client.admin.users.resetTwoFactor({ userId: root.user.id, reason: "testing" })
    )
    expect(self).toMatchObject({ code: "FORBIDDEN", message: SELF_RESET_MESSAGE })

    const other = "other-root-2fa@example.com"
    const own = await start({ superadminEmails: [ROOT, other] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const otherAdmin = await signUpVerified(own, other)
      const [err] = await safe(
        rootOwn.client.admin.users.resetTwoFactor({ userId: otherAdmin.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SUPERADMIN_RESET_MESSAGE })
    } finally {
      await own.stop()
    }
  })

  test("an impersonation session cannot reach it", async () => {
    const target = await signUpVerified(app)
    const session = await impersonate(target.user.id)
    const [error] = await safe(
      session.client.admin.users.resetTwoFactor({ userId: target.user.id, reason: "testing" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    await session.client.admin.stopImpersonation()
  })
})

describe("admin.users.removePasskeys", () => {
  /** A passkey row for `userId`, directly in the database — these tests never need a real
   * WebAuthn ceremony, only that a row (and, optionally, an outstanding register challenge)
   * exists to be removed. */
  async function givePasskey(userId: number, name = "A passkey") {
    return app.db.passkeys.create({
      userId,
      credentialId: `cred-remove-${userId}-${Math.random().toString(36).slice(2)}`,
      publicKey: "pk",
      counter: 0,
      transports: null,
      name,
    })
  }

  test("removes every passkey, voids challenges, ends every session, audits it, and mails the user", async () => {
    const target = await signUpVerified(app)
    await givePasskey(target.user.id, "Phone")
    await givePasskey(target.user.id, "Laptop")
    await app.db.tokens.create({
      userId: target.user.id,
      purpose: "passkey_challenge",
      tokenHash: "remove-passkeys-challenge",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ceremony: "register",
    })
    const before = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    expect(before.length).toBeGreaterThan(0)
    expect(await root.client.admin.users.get({ id: target.user.id })).toMatchObject({
      passkeys: 2,
    })

    expect(
      await root.client.admin.users.removePasskeys({
        userId: target.user.id,
        reason: "lost every device",
      })
    ).toEqual({ ok: true })

    expect(await app.db.passkeys.countForUser(target.user.id)).toBe(0)
    expect(await root.client.admin.users.get({ id: target.user.id })).toMatchObject({
      passkeys: 0,
    })
    expect(
      await app.db.tokens.peek(
        "remove-passkeys-challenge",
        "passkey_challenge",
        new Date().toISOString()
      )
    ).toBeUndefined()
    const [sessionError] = await safe(target.client.auth.me())
    expect(sessionError).toMatchObject({ code: "UNAUTHORIZED" })

    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items[0]).toMatchObject({
      action: "user.passkeys_removed",
      actor: { id: root.user.id },
      reason: "lost every device",
    })
    const [mail] = await mailsTo(app, target.email, passkeysRemovedSubject)
    expect(mail?.text).toContain("Your password was not changed.")
  })

  test("strips a passwordless, provider-less account too: no last-way-in rule, magic link remains", async () => {
    /** Signs `email` in by magic link: creates the account the first time (no password). */
    async function magicSignIn(email: string) {
      const before = app.mailer.sent.filter(
        (m) => m.to === email && m.subject === magicLinkSubject
      ).length
      await clientFor(app).auth.magicLink.request({ email })
      const mails = await mailsTo(app, email, magicLinkSubject, before + 1)
      const token = mails.at(-1)?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
      return signedIn(await clientFor(app).auth.magicLink.consume({ token }))
    }
    const email = `passwordless-${crypto.randomUUID()}@example.com`
    const { user, session } = await magicSignIn(email)
    expect(user.hasPassword).toBe(false)
    expect(await clientFor(app, session.token).account.identities.list()).toEqual({ items: [] })
    await givePasskey(user.id, "Only key")

    expect(
      await root.client.admin.users.removePasskeys({ userId: user.id, reason: "lost the phone" })
    ).toEqual({ ok: true })

    expect(await app.db.passkeys.countForUser(user.id)).toBe(0)
    const [sessionError] = await safe(clientFor(app, session.token).auth.me())
    expect(sessionError).toMatchObject({ code: "UNAUTHORIZED" })
    // The mail does not tell an account with no password that its password was not changed.
    const [mail] = await mailsTo(app, email, passkeysRemovedSubject)
    expect(mail?.text).not.toContain("password")
    // Not locked out: a magic link to the verified address still signs the same account in.
    expect((await magicSignIn(email)).user.id).toBe(user.id)
  })

  test("succeeds even when the account has no passkeys", async () => {
    const target = await signUpVerified(app)
    expect(
      await root.client.admin.users.removePasskeys({ userId: target.user.id, reason: "testing" })
    ).toEqual({ ok: true })
  })

  test("the reason must be 3-200 characters", async () => {
    const target = await signUpVerified(app)
    const [tooShort] = await safe(
      root.client.admin.users.removePasskeys({ userId: target.user.id, reason: "ab" })
    )
    expect(tooShort).toMatchObject({ code: "BAD_REQUEST" })
    const [tooLong] = await safe(
      root.client.admin.users.removePasskeys({ userId: target.user.id, reason: "x".repeat(201) })
    )
    expect(tooLong).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("unknown user is NOT_FOUND", async () => {
    const [error] = await safe(
      root.client.admin.users.removePasskeys({ userId: 999_999, reason: "testing" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("limits removals per admin", async () => {
    const own = await start({
      superadminEmails: [ROOT],
      removePasskeysLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const [t1, t2, t3] = await Promise.all([
        signUpVerified(own),
        signUpVerified(own),
        signUpVerified(own),
      ])
      expect(
        await rootOwn.client.admin.users.removePasskeys({ userId: t1.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      expect(
        await rootOwn.client.admin.users.removePasskeys({ userId: t2.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      const [err] = await safe(
        rootOwn.client.admin.users.removePasskeys({ userId: t3.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("refuses to target yourself or another superadmin", async () => {
    const [self] = await safe(
      root.client.admin.users.removePasskeys({ userId: root.user.id, reason: "testing" })
    )
    expect(self).toMatchObject({ code: "FORBIDDEN", message: SELF_REMOVE_PASSKEYS_MESSAGE })

    const other = "other-root-passkeys@example.com"
    const own = await start({ superadminEmails: [ROOT, other] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const otherAdmin = await signUpVerified(own, other)
      const [err] = await safe(
        rootOwn.client.admin.users.removePasskeys({
          userId: otherAdmin.user.id,
          reason: "testing",
        })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SUPERADMIN_REMOVE_PASSKEYS_MESSAGE })
    } finally {
      await own.stop()
    }
  })

  test("an impersonation session cannot reach it", async () => {
    // A fresh app and its own impersonation, rather than the shared one's `impersonate()` helper:
    // this file's other tests already use up the shared app's impersonate-per-admin budget.
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const { token } = await rootOwn.client.admin.users.impersonate({
        id: target.user.id,
        reason: "testing",
        client,
      })
      const session = clientFor(own, token)
      const [error] = await safe(
        session.admin.users.removePasskeys({ userId: target.user.id, reason: "testing" })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await own.stop()
    }
  })
})

describe("admin.users.suspend", () => {
  test("suspends the account, ends sessions, audits it, and mails the user", async () => {
    const target = await signUpVerified(app)
    const before = await app.db.sessions.listForUser(target.user.id, new Date().toISOString())
    expect(before.length).toBeGreaterThan(0)

    expect(
      await root.client.admin.users.suspend({ userId: target.user.id, reason: "abuse report" })
    ).toEqual({ ok: true })

    const row = await app.db.users.find(target.user.id)
    expect(row).toMatchObject({
      suspension_reason: "abuse report",
      suspended_until: null,
      suspended_by: root.user.id,
    })
    expect(row?.suspended_at).not.toBeNull()

    const [sessionError] = await safe(target.client.auth.me())
    expect(sessionError).toMatchObject({ code: "UNAUTHORIZED" })

    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items[0]).toMatchObject({
      action: "user.suspended",
      actor: { id: root.user.id },
      reason: "abuse report",
    })
    await mailsTo(app, target.email, accountSuspendedSubject)
  })

  test("accepts an optional until date, future and at most 365 days ahead", async () => {
    const target = await signUpVerified(app)
    const until = new Date(Date.now() + 3_600_000).toISOString()
    expect(
      await root.client.admin.users.suspend({ userId: target.user.id, reason: "testing", until })
    ).toEqual({ ok: true })
    expect((await app.db.users.find(target.user.id))?.suspended_until).toBe(until)
  })

  test("refuses an until in the past or more than 365 days ahead; nothing is written", async () => {
    const target = await signUpVerified(app)
    const past = new Date(Date.now() - 3_600_000).toISOString()
    const [pastError] = await safe(
      root.client.admin.users.suspend({ userId: target.user.id, reason: "testing", until: past })
    )
    expect(pastError).toMatchObject({
      code: "BAD_REQUEST",
      message: SUSPEND_UNTIL_INVALID_MESSAGE,
    })

    const tooFar = new Date(Date.now() + 366 * 24 * 60 * 60_000).toISOString()
    const [tooFarError] = await safe(
      root.client.admin.users.suspend({ userId: target.user.id, reason: "testing", until: tooFar })
    )
    expect(tooFarError).toMatchObject({ code: "BAD_REQUEST" })

    expect((await app.db.users.find(target.user.id))?.suspended_at).toBeNull()
  })

  test("the reason must be 3-200 characters", async () => {
    const target = await signUpVerified(app)
    const [tooShort] = await safe(
      root.client.admin.users.suspend({ userId: target.user.id, reason: "ab" })
    )
    expect(tooShort).toMatchObject({ code: "BAD_REQUEST" })
    const [tooLong] = await safe(
      root.client.admin.users.suspend({ userId: target.user.id, reason: "x".repeat(201) })
    )
    expect(tooLong).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("unknown user is NOT_FOUND", async () => {
    const [error] = await safe(
      root.client.admin.users.suspend({ userId: 999_999, reason: "testing" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("re-suspending updates the reason and end date; no second mail unless the end date changed", async () => {
    const target = await signUpVerified(app)
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "first reason" })
    await app.drain()
    const mailsBefore = app.mailer.sent.filter((m) => m.to === target.email).length

    expect(
      await root.client.admin.users.suspend({ userId: target.user.id, reason: "second reason" })
    ).toEqual({ ok: true })
    await app.drain()
    const row = await app.db.users.find(target.user.id)
    expect(row?.suspension_reason).toBe("second reason")
    expect(row?.suspended_until).toBeNull()
    expect(app.mailer.sent.filter((m) => m.to === target.email).length).toBe(mailsBefore)

    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items[0]).toMatchObject({ action: "user.suspension_updated", reason: "second reason" })

    // A changed end date does mail again.
    const until = new Date(Date.now() + 3_600_000).toISOString()
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "third reason", until })
    await app.drain()
    expect(app.mailer.sent.filter((m) => m.to === target.email).length).toBe(mailsBefore + 1)
  })

  test("limits suspensions per admin", async () => {
    const own = await start({
      superadminEmails: [ROOT],
      suspendLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const [t1, t2, t3] = await Promise.all([
        signUpVerified(own),
        signUpVerified(own),
        signUpVerified(own),
      ])
      expect(
        await rootOwn.client.admin.users.suspend({ userId: t1.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      expect(
        await rootOwn.client.admin.users.suspend({ userId: t2.user.id, reason: "testing" })
      ).toEqual({ ok: true })
      const [err] = await safe(
        rootOwn.client.admin.users.suspend({ userId: t3.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("refuses to target yourself or another superadmin", async () => {
    const [self] = await safe(
      root.client.admin.users.suspend({ userId: root.user.id, reason: "testing" })
    )
    expect(self).toMatchObject({ code: "FORBIDDEN", message: SELF_SUSPEND_MESSAGE })

    const other = "other-root-suspend@example.com"
    const own = await start({ superadminEmails: [ROOT, other] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const otherAdmin = await signUpVerified(own, other)
      const [err] = await safe(
        rootOwn.client.admin.users.suspend({ userId: otherAdmin.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SUPERADMIN_SUSPEND_MESSAGE })
    } finally {
      await own.stop()
    }
  })

  test("an impersonation session cannot reach it", async () => {
    // A fresh app, like removePasskeys's own test above: this file's other tests already use up
    // the shared app's impersonate-per-admin budget.
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const { token } = await rootOwn.client.admin.users.impersonate({
        id: target.user.id,
        reason: "testing",
        client,
      })
      const session = clientFor(own, token)
      const [error] = await safe(
        session.admin.users.suspend({ userId: target.user.id, reason: "testing" })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await own.stop()
    }
  })
})

describe("admin.users.unsuspend", () => {
  test("clears the suspension, audits it, and mails the user", async () => {
    const target = await signUpVerified(app)
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "testing" })

    expect(
      await root.client.admin.users.unsuspend({ userId: target.user.id, reason: "resolved" })
    ).toEqual({ ok: true })

    const row = await app.db.users.find(target.user.id)
    expect(row).toMatchObject({
      suspended_at: null,
      suspended_until: null,
      suspension_reason: null,
      suspended_by: null,
    })

    const { items } = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(items[0]).toMatchObject({ action: "user.unsuspended", reason: "resolved" })
    await mailsTo(app, target.email, accountUnsuspendedSubject)
  })

  test("a never-suspended account is a no-op: no audit row, no mail", async () => {
    const target = await signUpVerified(app)
    await app.drain()
    const mailsBefore = app.mailer.sent.length
    const before = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })

    expect(
      await root.client.admin.users.unsuspend({ userId: target.user.id, reason: "testing" })
    ).toEqual({ ok: true })

    await app.drain()
    expect(app.mailer.sent.length).toBe(mailsBefore)
    const after = await root.client.admin.audit.list({
      targetType: "user",
      targetId: String(target.user.id),
    })
    expect(after.items.length).toBe(before.items.length)
  })

  test("an expired-but-uncleared suspension still has its columns cleared, audited and mailed", async () => {
    const target = await signUpVerified(app)
    const until = new Date(Date.now() + 100).toISOString()
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "testing", until })
    await Bun.sleep(150)
    const stillSet = await app.db.users.find(target.user.id)
    expect(stillSet?.suspended_at).not.toBeNull()

    expect(
      await root.client.admin.users.unsuspend({ userId: target.user.id, reason: "cleanup" })
    ).toEqual({ ok: true })
    expect((await app.db.users.find(target.user.id))?.suspended_at).toBeNull()
    await mailsTo(app, target.email, accountUnsuspendedSubject)
  })

  test("the reason must be 3-200 characters", async () => {
    const target = await signUpVerified(app)
    await root.client.admin.users.suspend({ userId: target.user.id, reason: "testing" })
    const [tooShort] = await safe(
      root.client.admin.users.unsuspend({ userId: target.user.id, reason: "ab" })
    )
    expect(tooShort).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("unknown user is NOT_FOUND", async () => {
    const [error] = await safe(
      root.client.admin.users.unsuspend({ userId: 999_999, reason: "testing" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("refuses to target yourself or another superadmin", async () => {
    const [self] = await safe(
      root.client.admin.users.unsuspend({ userId: root.user.id, reason: "testing" })
    )
    expect(self).toMatchObject({ code: "FORBIDDEN", message: SELF_SUSPEND_MESSAGE })

    const other = "other-root-unsuspend@example.com"
    const own = await start({ superadminEmails: [ROOT, other] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const otherAdmin = await signUpVerified(own, other)
      const [err] = await safe(
        rootOwn.client.admin.users.unsuspend({ userId: otherAdmin.user.id, reason: "testing" })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN", message: SUPERADMIN_SUSPEND_MESSAGE })
    } finally {
      await own.stop()
    }
  })

  test("an impersonation session cannot reach it", async () => {
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      // A suspended account cannot be impersonated (its session would be dead): impersonate
      // someone else and reach for the suspended one.
      const other = await signUpVerified(own)
      await rootOwn.client.admin.users.suspend({ userId: target.user.id, reason: "testing" })
      const { token } = await rootOwn.client.admin.users.impersonate({
        id: other.user.id,
        reason: "testing",
        client,
      })
      const session = clientFor(own, token)
      const [error] = await safe(
        session.admin.users.unsuspend({ userId: target.user.id, reason: "testing" })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await own.stop()
    }
  })
})

describe("admin.jobs", () => {
  test("list: counts and the dead jobs, without payloads", async () => {
    const id = await deadJob({ error: "disk full" })
    try {
      const result = await root.client.admin.jobs.list()
      expect(result.counts).toMatchObject({
        queued: expect.any(Number),
        running: expect.any(Number),
        dead: expect.any(Number),
      })
      const row = result.dead.find((j) => j.id === id)
      expect(row).toMatchObject({
        id,
        name: "test.dead",
        attempts: 1,
        maxAttempts: 1,
        lastError: "disk full",
      })
      expect(row).not.toHaveProperty("payload")
      expect(row?.finishedAt).not.toBeNull()
    } finally {
      await app.db.jobs.discard(id)
    }
  })

  test("retry: a dead row becomes queued with attempts reset, and is audited", async () => {
    const id = await deadJob()
    expect(await root.client.admin.jobs.retry({ id })).toEqual({ ok: true })

    // Claiming it confirms it came back queued with attempts reset to 0 (claim bumps it to 1
    // again); kill it so no stray running row is left for later tests.
    const [claimed] = await app.db.jobs.claim(iso(), 10, future())
    if (!claimed) throw new Error("expected a claimed row")
    expect(claimed).toMatchObject({ id, status: "running", attempts: 1 })
    await app.db.jobs.kill(claimed.id, claimed.attempts, iso(), "cleanup")

    const { items } = await root.client.admin.audit.list({
      targetType: "job",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "job.retried",
      actor: { id: root.user.id },
      targetType: "job",
      targetId: String(id),
    })
  })

  test("retry of a non-dead or missing id is NOT_FOUND", async () => {
    const [missing] = await safe(root.client.admin.jobs.retry({ id: 999_999 }))
    expect(missing).toMatchObject({ code: "NOT_FOUND" })

    await app.db.jobs.insert({
      name: "test.live",
      payload: "{}",
      maxAttempts: 1,
      runAt: iso(),
      createdAt: iso(),
    })
    const [queued] = await app.db.jobs.claim(iso(), 1, future())
    if (!queued) throw new Error("expected a claimed row")
    try {
      const [notDead] = await safe(root.client.admin.jobs.retry({ id: queued.id }))
      expect(notDead).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await app.db.jobs.kill(queued.id, queued.attempts, iso(), "cleanup")
      await app.db.jobs.discard(queued.id)
    }
  })

  test("retry colliding with a newer live copy of the dedupe key is a CONFLICT; the dead row stays dead", async () => {
    const key = `admin-jobs-test:${Date.now()}`
    const deadId = await deadJob({ dedupeKey: key, error: "first death" })
    // The key is free again once the row above is dead: this one takes it live, queued (not even
    // claimed) — exactly how a job re-enqueued after an earlier one died would collide.
    const liveId = await app.db.jobs.insert({
      name: "test.live",
      payload: "{}",
      maxAttempts: 1,
      runAt: iso(),
      dedupeKey: key,
      createdAt: iso(),
    })
    try {
      const [error] = await safe(root.client.admin.jobs.retry({ id: deadId }))
      expect(error).toMatchObject({ code: "CONFLICT", message: JOB_RETRY_CONFLICT_MESSAGE })
      // Untouched by the failed resurrect: still dead, so discarding it succeeds.
      expect(await app.db.jobs.discard(deadId)).toBe(true)
    } finally {
      const [claimedLive] = await app.db.jobs.claim(iso(), 10, future())
      if (claimedLive)
        await app.db.jobs.kill(claimedLive.id, claimedLive.attempts, iso(), "cleanup")
      await app.db.jobs.discard(liveId)
    }
  })

  test("discard: the row is gone and audited; discarding it again is NOT_FOUND", async () => {
    const id = await deadJob()
    expect(await root.client.admin.jobs.discard({ id })).toEqual({ ok: true })

    const { dead } = await root.client.admin.jobs.list()
    expect(dead.some((j) => j.id === id)).toBe(false)

    const [again] = await safe(root.client.admin.jobs.discard({ id }))
    expect(again).toMatchObject({ code: "NOT_FOUND" })

    const { items } = await root.client.admin.audit.list({
      targetType: "job",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "job.discarded",
      actor: { id: root.user.id },
      targetType: "job",
      targetId: String(id),
    })
  })

  test("discard of a missing id is NOT_FOUND", async () => {
    const [error] = await safe(root.client.admin.jobs.discard({ id: 999_999 }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("a non-admin and an impersonation session cannot reach it", async () => {
    const nobody = await signUpVerified(app)
    const [error] = await safe(nobody.client.admin.jobs.list())
    expect(error).toMatchObject({ code: "NOT_FOUND" })
    const deadId = await deadJob()
    try {
      const [retryError] = await safe(nobody.client.admin.jobs.retry({ id: deadId }))
      expect(retryError).toMatchObject({ code: "NOT_FOUND" })
      const [discardError] = await safe(nobody.client.admin.jobs.discard({ id: deadId }))
      expect(discardError).toMatchObject({ code: "NOT_FOUND" })
      // Neither touched the row: it is still dead, so the admin's discard succeeds.
      expect(await app.db.jobs.discard(deadId)).toBe(true)
    } finally {
      await app.db.jobs.discard(deadId)
    }

    // A fresh app: the shared root's impersonation limiter is nearly spent by every earlier test
    // in this file that impersonates.
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const result = await rootOwn.client.admin.users.impersonate({
        id: target.user.id,
        reason: "testing",
        client,
      })
      const session = clientFor(own, result.token)
      const [impError] = await safe(session.admin.jobs.list())
      expect(impError).toMatchObject({ code: "NOT_FOUND" })
      const ownDeadId = await deadJob({}, own.db)
      const [impRetry] = await safe(session.admin.jobs.retry({ id: ownDeadId }))
      expect(impRetry).toMatchObject({ code: "NOT_FOUND" })
      const [impDiscard] = await safe(session.admin.jobs.discard({ id: ownDeadId }))
      expect(impDiscard).toMatchObject({ code: "NOT_FOUND" })
      expect((await own.db.jobs.listDead(10)).map((j) => j.id)).toContain(ownDeadId)
      await session.admin.stopImpersonation()
    } finally {
      await own.stop()
    }
  })
})

describe("admin.analytics.summary", () => {
  const today = () => dayOf(new Date().toISOString())
  const daysAgo = (n: number) => dayOf(new Date(Date.now() - n * DAY_MS).toISOString())

  test("days: zero-filled over the range, past days from analytics_daily, today from raw rows", async () => {
    const a = await start({ superadminEmails: ["analytics-days@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-days@example.com")
      const t2 = daysAgo(2)
      const t1 = daysAgo(1)
      const t0 = today()
      const pv = (day: string, visitorId: string, app = "app", path = "/notes") =>
        a.db.analytics.insertPageview({
          app,
          path,
          referrerHost: null,
          visitorId,
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
      // t2: 3 pageviews from 2 distinct visitors — then rolled up, as the nightly job would.
      await pv(t2, "v1")
      await pv(t2, "v1")
      await pv(t2, "v2")
      await a.db.analytics.rollup(t2)
      // t0 (today): 2 pageviews from 2 distinct visitors, raw only — never rolled up.
      await pv(t0, "v3")
      await pv(t0, "v4")

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      expect(result.days).toHaveLength(7)
      const byDay = new Map(result.days.map((d) => [d.day, d]))
      expect(byDay.get(t2)).toEqual({ day: t2, pageviews: 3, visitors: 2 })
      expect(byDay.get(t0)).toEqual({ day: t0, pageviews: 2, visitors: 2 })
      // t1 and any other day in range with no data at all are zero-filled, not omitted.
      expect(byDay.get(t1)).toEqual({ day: t1, pageviews: 0, visitors: 0 })
      expect(result.days[0]?.day).toBe(daysAgo(6))
      expect(result.days.at(-1)?.day).toBe(t0)
    } finally {
      await a.stop()
    }
  })

  test("days: visitors are distinct per (day, app), not per page, then summed across apps", async () => {
    const a = await start({ superadminEmails: ["analytics-visitors@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-visitors@example.com")
      const pv = (day: string, app: string, path: string, visitorId: string) =>
        a.db.analytics.insertPageview({
          app,
          path,
          referrerHost: null,
          visitorId,
          userId: null,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })

      // One visitor views two paths of "app" on the same day: 1 distinct visitor, 2 pageviews —
      // summing each page's own distinct count (the bug) would wrongly give 2 visitors.
      const day1 = daysAgo(1)
      await pv(day1, "app", "/notes", "v1")
      await pv(day1, "app", "/settings", "v1")
      await a.db.analytics.rollup(day1)

      // The same visitor hash also appearing on a second app, the same day, counts again — the
      // help text's "the same person on two apps counts twice", summed across apps.
      const day2 = daysAgo(2)
      await pv(day2, "app", "/notes", "v1")
      await pv(day2, "www", "/", "v1")
      await a.db.analytics.rollup(day2)

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      const byDay = new Map(result.days.map((d) => [d.day, d]))
      expect(byDay.get(day1)).toEqual({ day: day1, pageviews: 2, visitors: 1 })
      expect(byDay.get(day2)).toEqual({ day: day2, pageviews: 2, visitors: 2 })
    } finally {
      await a.stop()
    }
  })

  test('topPages and topReferrers: limited to the range, merging rolled-up and live rows, excluding before-range and the "*" app-total key', async () => {
    const a = await start({ superadminEmails: ["analytics-pages@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-pages@example.com")
      const t1 = daysAgo(1)
      const t0 = today()
      const outOfRange = daysAgo(10)
      const pv = (opts: {
        day: string
        visitorId: string
        app?: string
        path?: string
        referrerHost?: string | null
      }) =>
        a.db.analytics.insertPageview({
          app: opts.app ?? "app",
          path: opts.path ?? "/notes",
          referrerHost: opts.referrerHost ?? null,
          visitorId: opts.visitorId,
          userId: null,
          workspaceId: null,
          day: opts.day,
          createdAt: `${opts.day}T12:00:00.000Z`,
        })
      // /notes: 2 views yesterday (rolled up) + 1 today (live) = 3, the top page.
      await pv({ day: t1, visitorId: "v1", referrerHost: "google.com" })
      await pv({ day: t1, visitorId: "v2" })
      await a.db.analytics.rollup(t1)
      await pv({ day: t0, visitorId: "v3", referrerHost: "bing.com" })
      // A second page, once, today only.
      await pv({ day: t0, visitorId: "v4", app: "www", path: "/pricing" })
      // Before the range entirely: never counted, whether rolled up or not.
      await pv({
        day: outOfRange,
        visitorId: "v5",
        app: "app",
        path: "/old",
        referrerHost: "old.example",
      })
      await a.db.analytics.rollup(outOfRange)

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      expect(result.topPages[0]).toEqual({ app: "app", path: "/notes", pageviews: 3 })
      expect(result.topPages).toEqual(
        expect.arrayContaining([{ app: "www", path: "/pricing", pageviews: 1 }])
      )
      expect(result.topPages.some((p) => p.path === "*")).toBe(false)
      expect(result.topPages.some((p) => p.path === "/old")).toBe(false)
      expect(result.topReferrers).toEqual(
        expect.arrayContaining([
          { host: "google.com", pageviews: 1 },
          { host: "bing.com", pageviews: 1 },
        ])
      )
      expect(result.topReferrers.some((r) => r.host === "old.example")).toBe(false)
    } finally {
      await a.stop()
    }
  })

  test("events: per (day, name) summed across sources, past days from analytics_daily, today from raw rows, before-range excluded", async () => {
    const a = await start({ superadminEmails: ["analytics-events@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-events@example.com")
      const t1 = daysAgo(1)
      const t0 = today()
      const outOfRange = daysAgo(10)
      const ev = (day: string, userId: number, source = "api", name = "note_created") =>
        a.db.analytics.insertEvent({
          name,
          source,
          props: {},
          visitorId: null,
          userId,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })
      await ev(t1, 101)
      await ev(t1, 102)
      await a.db.analytics.rollup(t1)
      await ev(t0, 103)
      // A client event tracked from two apps the same day: one row, the summed count.
      await ev(t0, 104, "app", "pricing_viewed")
      await ev(t0, 105, "www", "pricing_viewed")
      // Before the range entirely: never counted, whether rolled up or not.
      await ev(outOfRange, 106)
      await a.db.analytics.rollup(outOfRange)

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      expect(result.events).toEqual(
        expect.arrayContaining([
          { day: t1, name: "note_created", count: 2 },
          { day: t0, name: "note_created", count: 1 },
          { day: t0, name: "pricing_viewed", count: 2 },
        ])
      )
      expect(result.events.filter((e) => e.day === t0 && e.name === "pricing_viewed")).toHaveLength(
        1
      )
      expect(result.events.some((e) => e.day === outOfRange)).toBe(false)
    } finally {
      await a.stop()
    }
  })

  test("a past day with no analytics_daily rows at all (rollup never ran) falls back to raw rows, for days, top pages and events alike", async () => {
    const a = await start({ superadminEmails: ["analytics-missing@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-missing@example.com")
      const missing = daysAgo(2)
      // Never rolled up: the nightly job hasn't reached it yet, or died.
      await a.db.analytics.insertPageview({
        app: "app",
        path: "/notes",
        referrerHost: null,
        visitorId: "v1",
        userId: null,
        workspaceId: null,
        day: missing,
        createdAt: `${missing}T12:00:00.000Z`,
      })
      await a.db.analytics.insertEvent({
        name: "note_created",
        source: "api",
        props: {},
        visitorId: null,
        userId: 201,
        workspaceId: null,
        day: missing,
        createdAt: `${missing}T12:00:00.000Z`,
      })

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      const row = result.days.find((d) => d.day === missing)
      expect(row).toEqual({ day: missing, pageviews: 1, visitors: 1 })
      expect(result.topPages).toEqual(
        expect.arrayContaining([{ app: "app", path: "/notes", pageviews: 1 }])
      )
      expect(result.events).toEqual(
        expect.arrayContaining([{ day: missing, name: "note_created", count: 1 }])
      )
    } finally {
      await a.stop()
    }
  })

  test("a late raw row for D-2, after its rollup, shows once the scheduled rollup runs", async () => {
    const a = await start({ superadminEmails: ["analytics-late@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-late@example.com")
      const d2 = daysAgo(2)
      const pv = (visitorId: string) =>
        a.db.analytics.insertPageview({
          app: "app",
          path: "/late",
          referrerHost: null,
          visitorId,
          userId: null,
          workspaceId: null,
          day: d2,
          createdAt: `${d2}T23:59:00.000Z`,
        })
      await pv("v1")
      await a.db.analytics.rollup(d2)
      // Lands after D-2's own rollup (its event job retried past 00:10).
      await pv("v2")
      const shown = async () =>
        (await admin.client.admin.analytics.summary({ days: 7 })).days.find((d) => d.day === d2)
      expect(await shown()).toEqual({ day: d2, pageviews: 1, visitors: 1 })
      // What the 00:10 schedule enqueues: no day, so yesterday and the day before.
      await a.enqueue(analyticsRollupJob, {})
      await a.drain()
      expect(await shown()).toEqual({ day: d2, pageviews: 2, visitors: 2 })
    } finally {
      await a.stop()
    }
  })

  test("retentionDays: the configured ANALYTICS_RETENTION_DAYS comes back with the summary", async () => {
    const a = await start({
      superadminEmails: ["analytics-retention@example.com"],
      analyticsRetentionDays: 30,
    })
    try {
      const admin = await signUpVerified(a, "analytics-retention@example.com")
      const result = await admin.client.admin.analytics.summary({ days: 90 })
      expect(result.retentionDays).toBe(30)
    } finally {
      await a.stop()
    }
  })

  test("funnel: nested sets within the range; signed up before the range counts nowhere", async () => {
    const a = await start({ superadminEmails: ["analytics-funnel@example.com"] })
    try {
      const admin = await signUpVerified(a, "analytics-funnel@example.com")
      const baseline = await admin.client.admin.analytics.summary({ days: 7 })
      const base = new Map(baseline.funnel.map((f) => [f.step, f.users]))

      const inRange = today()
      const outOfRange = daysAgo(10)
      const ev = (name: string, userId: number, day: string) =>
        a.db.analytics.insertEvent({
          name,
          source: "api",
          props: {},
          visitorId: null,
          userId,
          workspaceId: null,
          day,
          createdAt: `${day}T12:00:00.000Z`,
        })

      // Full funnel: signs up, verifies, creates a workspace, then a note.
      await ev("signed_up", 1001, inRange)
      await ev("email_verified", 1001, inRange)
      await ev("workspace_created", 1001, inRange)
      await ev("note_created", 1001, inRange)
      // Activated via invitation_accepted instead (the funnel's OR), not note_created.
      await ev("signed_up", 1002, inRange)
      await ev("email_verified", 1002, inRange)
      await ev("workspace_created", 1002, inRange)
      await ev("invitation_accepted", 1002, inRange)
      // Stops at step 2: no workspace.
      await ev("signed_up", 1003, inRange)
      await ev("email_verified", 1003, inRange)
      // Stops at step 1: never verified.
      await ev("signed_up", 1004, inRange)
      // Required case: email_verified in range, but signed_up before the range — not counted
      // at any step, even though its one in-range event would otherwise look like progress.
      await ev("signed_up", 1005, outOfRange)
      await ev("email_verified", 1005, inRange)

      const result = await admin.client.admin.analytics.summary({ days: 7 })
      const by = new Map(result.funnel.map((f) => [f.step, f.users]))
      const delta = (step: string) => (by.get(step) ?? 0) - (base.get(step) ?? 0)

      expect(delta("signed_up")).toBe(4) // 1001-1004 (1005 signed up outside the range)
      expect(delta("email_verified")).toBe(3) // 1001-1003 (1004 never verified, 1005 excluded)
      expect(delta("workspace_created")).toBe(2) // 1001, 1002
      expect(delta("activated")).toBe(2) // 1001 via note_created, 1002 via invitation_accepted
    } finally {
      await a.stop()
    }
  })

  test("a non-admin and an impersonation session cannot reach it", async () => {
    const a = await start({ superadminEmails: ["analytics-gate@example.com"] })
    try {
      const adminUser = await signUpVerified(a, "analytics-gate@example.com")
      const nobody = await signUpVerified(a)
      const [error] = await safe(nobody.client.admin.analytics.summary({ days: 7 }))
      expect(error).toMatchObject({ code: "NOT_FOUND" })

      const target = await signUpVerified(a)
      const result = await adminUser.client.admin.users.impersonate({
        id: target.user.id,
        reason: "testing analytics gate",
        client,
      })
      const session = clientFor(a, result.token)
      const [impError] = await safe(session.admin.analytics.summary({ days: 7 }))
      expect(impError).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await a.stop()
    }
  })
})
