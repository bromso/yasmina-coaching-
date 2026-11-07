import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"
import {
  accountResetSubject as ACCOUNT_RESET,
  passwordChangedSubject as CHANGED,
  magicLinkSubject as MAGIC,
  resetPasswordSubject as RESET,
  verifyEmailSubject as VERIFY,
} from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { SQL } from "bun"
import { newToken, tokenHash } from "./credentials"
import { ProviderExchangeError } from "./oauth/provider"
import {
  auth,
  clientFor,
  fakeProvider,
  mailsTo,
  providersWith,
  signedIn,
  signUp,
  signUpWithWorkspace,
  start,
} from "./test-server"

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

describe("sign up / sign in / me / sign out", () => {
  test("sign-up returns the user and a session that me() accepts", async () => {
    const { client, user, email } = await signUp(app)
    expect(user.email).toBe(email)
    const me = await client.auth.me()
    expect(me.user.id).toBe(user.id)
    expect(me.session.expiresAt > new Date().toISOString()).toBe(true)
    expect(me).toMatchObject({ user: { superadmin: false }, impersonation: null })
  })

  test("a duplicate email is CONFLICT, whatever its case", async () => {
    const { email } = await signUp(app)
    const [error] = await safe(
      clientFor(app).auth.signUp({ email: email.toUpperCase(), password: "12345678" })
    )
    expect(error).toMatchObject({ code: "CONFLICT" })
  })

  test("two concurrent sign-ups for one email: one succeeds, the other is CONFLICT", async () => {
    const anon = clientFor(app)
    const input = { email: "race@example.com", password: "correct horse battery" }
    const results = await Promise.all([
      safe(anon.auth.signUp(input)),
      safe(anon.auth.signUp(input)),
    ])
    expect(results.filter((r) => !r.error)).toHaveLength(1)
    expect(results.find((r) => r.error)?.error).toMatchObject({ code: "CONFLICT" })
  })

  test("wrong password and unknown email produce the same error", async () => {
    const { email } = await signUp(app)
    const anon = clientFor(app)
    const [wrong] = await safe(anon.auth.signIn({ email, password: "nope-nope" }))
    const [unknown] = await safe(
      anon.auth.signIn({ email: "ghost@example.com", password: "nope-nope" })
    )
    expect(wrong).toMatchObject({ code: "UNAUTHORIZED" })
    expect(unknown).toMatchObject({ code: "UNAUTHORIZED" })
    expect(wrong?.message).toBe(unknown?.message)
    expect(wrong?.message).toBe("Invalid email or password")
  })

  test("sign-in issues a fresh session and records the client", async () => {
    const { email } = await signUp(app)
    const { session, user } = signedIn(
      await clientFor(app).auth.signIn({
        email,
        password: "correct horse battery",
        client: { userAgent: "TestBrowser/1.0", ip: "203.0.113.9" },
      })
    )
    const me = await clientFor(app, session.token).auth.me()
    expect(me.user.id).toBe(user.id)
    const list = await clientFor(app, session.token).account.sessions.list()
    expect(list.items.some((s) => s.current && s.userAgent === "TestBrowser/1.0")).toBe(true)
  })

  test("me() without, with garbage, or with a signed-out token is UNAUTHORIZED", async () => {
    const [none] = await safe(clientFor(app).auth.me())
    const [garbage] = await safe(clientFor(app, "not-a-token").auth.me())
    expect(none).toMatchObject({ code: "UNAUTHORIZED" })
    expect(garbage).toMatchObject({ code: "UNAUTHORIZED" })
    const { client } = await signUp(app)
    await client.auth.signOut()
    const [after] = await safe(client.auth.me())
    expect(after).toMatchObject({ code: "UNAUTHORIZED" })
    expect(after?.message).toBe("Sign in required")
  })

  test("the sign-in limiter trips per email", async () => {
    const own = await start({
      signInLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
    })
    try {
      const { email } = await signUp(own)
      const anon = clientFor(own)
      for (let i = 0; i < 3; i++) await safe(anon.auth.signIn({ email, password: "wrong-wrong" }))
      const [limited] = await safe(anon.auth.signIn({ email, password: "correct horse battery" }))
      expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      const [other] = await safe(
        anon.auth.signIn({ email: "someone-else@example.com", password: "wrong-wrong" })
      )
      expect(other).toMatchObject({ code: "UNAUTHORIZED" })
    } finally {
      await own.stop()
    }
  })
})

describe("password reset", () => {
  test("mails a link whose token resets the password once and signs out every session", async () => {
    const { email, client: oldSession } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email })
    const [mail] = await mailsTo(app, email, RESET)
    expect(mail?.to).toBe(email)
    const token = new URL(mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "").searchParams.get("token")
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mail?.text).toContain("http://auth.example.com/reset-password?token=")

    await clientFor(app).auth.resetPassword({
      token: token as string,
      password: "new password 123",
    })
    const [reuse] = await safe(
      clientFor(app).auth.resetPassword({ token: token as string, password: "another one 123" })
    )
    expect(reuse).toMatchObject({ code: "BAD_REQUEST" })
    const [old] = await safe(oldSession.auth.me())
    expect(old).toMatchObject({ code: "UNAUTHORIZED" })
    await clientFor(app).auth.signIn({ email, password: "new password 123" })
  })

  const tokenOf = (mail: { text: string } | undefined) =>
    new URL(mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "").searchParams.get("token") as string

  test("a successful reset burns the user's other outstanding reset links", async () => {
    const { email } = await signUp(app)
    const anon = clientFor(app)
    app.mailer.sent.length = 0
    await anon.auth.requestPasswordReset({ email })
    const first = tokenOf((await mailsTo(app, email, RESET, 1))[0])
    await anon.auth.requestPasswordReset({ email })
    const second = tokenOf((await mailsTo(app, email, RESET, 2))[1])
    expect(second).not.toBe(first)
    await anon.auth.resetPassword({ token: second, password: "new password 123" })
    const [stale] = await safe(
      anon.auth.resetPassword({ token: first, password: "other pass 123" })
    )
    expect(stale).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("changePassword burns outstanding reset links", async () => {
    const { client, email } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email })
    const [mail] = await mailsTo(app, email, RESET)
    const token = tokenOf(mail)
    await client.account.changePassword({
      currentPassword: "correct horse battery",
      newPassword: "brand new pass",
    })
    const [stale] = await safe(
      clientFor(app).auth.resetPassword({ token, password: "other pass 123" })
    )
    expect(stale).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("the reset limiter trips per email, silently", async () => {
    const own = await start()
    try {
      const { email } = await signUp(own)
      const other = await signUp(own)
      own.mailer.sent.length = 0
      const anon = clientFor(own)
      for (let i = 0; i < 3; i++) await anon.auth.requestPasswordReset({ email })
      // Each request's enqueue is detached (a macrotask): mailsTo drains (and bounds the wait).
      expect(await mailsTo(own, email, RESET, 3)).toHaveLength(3)
      // The 4th answers exactly like success but sends nothing.
      expect(await anon.auth.requestPasswordReset({ email })).toBeUndefined()
      await anon.auth.requestPasswordReset({ email: other.email })
      // The 4th request for `email` sent nothing: only `other.email`'s mail joins the first 3.
      await mailsTo(own, other.email, RESET, 1)
      expect(own.mailer.sent).toHaveLength(4)
    } finally {
      await own.stop()
    }
  })

  test("a failing mail provider changes nothing the caller sees; the failure is logged", async () => {
    const logged: string[] = []
    const own = await start({
      mailer: { kind: "log", send: () => Promise.reject(new Error("provider down")) },
      log: (message) => logged.push(message),
    })
    try {
      const { email } = await signUp(own)
      expect(await clientFor(own).auth.requestPasswordReset({ email })).toBeUndefined()
      const failedLog = "job mail.send failed (attempt 1/5), retrying"
      for (let i = 0; i < 400 && !logged.includes(failedLog); i++) {
        await own.drain()
        await Bun.sleep(5)
      }
      expect(logged).toContain(failedLog)
    } finally {
      await own.stop()
    }
  })

  test("the api-wide cap holds across addresses, silently", async () => {
    const own = await start({
      resetGlobalLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const [a, b, c] = [await signUp(own), await signUp(own), await signUp(own)]
      await clientFor(own).auth.requestPasswordReset({ email: a.email })
      await clientFor(own).auth.requestPasswordReset({ email: b.email })
      await mailsTo(own, b.email, RESET)
      // Over the cap: the same void answer as success, and no mail.
      expect(await clientFor(own).auth.requestPasswordReset({ email: c.email })).toBeUndefined()
      await Bun.sleep(50)
      expect(own.mailer.sent.filter((m) => m.to === c.email && m.subject === RESET)).toHaveLength(0)
    } finally {
      await own.stop()
    }
  })

  test("a tripped api-wide cap is logged once per minute, not per request", async () => {
    const logged: string[] = []
    const own = await start({
      resetGlobalLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      log: (message) => logged.push(message),
    })
    try {
      for (const email of ["r1@example.com", "r2@example.com", "r3@example.com"]) {
        await clientFor(own).auth.requestPasswordReset({ email })
      }
      expect(logged.filter((m) => m.startsWith("rate cap tripped: reset:global"))).toHaveLength(1)
    } finally {
      await own.stop()
    }
  })

  test("case and whitespace variants of an address share its per-email limit", async () => {
    const own = await start({
      resetLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      const { email } = await signUp(own)
      const other = await signUp(own)
      own.mailer.sent.length = 0
      await clientFor(own).auth.requestPasswordReset({ email })
      await mailsTo(own, email, RESET)
      // EmailSchema trims and lowercases before the handler: the same key, so no second mail.
      await clientFor(own).auth.requestPasswordReset({ email: ` ${email.toUpperCase()} ` })
      // A barrier: once the next address's mail lands, any second mail for the first would have.
      await clientFor(own).auth.requestPasswordReset({ email: other.email })
      await mailsTo(own, other.email, RESET)
      expect(own.mailer.sent.filter((m) => m.to === email && m.subject === RESET)).toHaveLength(1)
    } finally {
      await own.stop()
    }
  })

  test("an unknown email is accepted silently and sends nothing", async () => {
    const { email } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email: "nobody@example.com" })
    // A known address after it: once its mail lands, any mail for the unknown one would have too.
    await clientFor(app).auth.requestPasswordReset({ email })
    await mailsTo(app, email, RESET)
    const resets = app.mailer.sent.filter((mail) => mail.subject === RESET)
    expect(resets.map((mail) => mail.to)).toEqual([email])
  })

  test("an unknown email and a known one take the same code path length", async () => {
    // Not a timing assertion (too flaky to pin); it pins that both branches await the same
    // database work and the mail enqueue is detached the same way, so nothing else differs.
    const { email } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email: "ghost@example.com" })
    await clientFor(app).auth.requestPasswordReset({ email })
    await mailsTo(app, email, RESET)
    expect(app.mailer.sent.filter((mail) => mail.subject === RESET)).toHaveLength(1)
  })

  test("a reset request leaves stale tokens for the schedule: the request path no longer prunes", async () => {
    // A fresh tempfile database with its own raw connection (so the raw query sees the same rows
    // the api writes), as prune.test.ts uses for the same reason: proving a row's absence or
    // presence needs a direct read the query layer has no "is this still here" method for.
    const dir = mkdtempSync(join(tmpdir(), "auth-prune-test-"))
    const databaseUrl = `sqlite://${join(dir, "t.db")}`
    const raw = new SQL(databaseUrl)
    const isolated = await start({ databaseUrl })
    try {
      const { email, user } = await signUp(isolated)
      const staleHash = tokenHash("stale-reset-token")
      await isolated.db.tokens.create({
        userId: user.id,
        purpose: "password_reset",
        tokenHash: staleHash,
        expiresAt: new Date(Date.now() - 1_000).toISOString(), // already expired
      })
      const before: { token_hash: string }[] = await raw`SELECT token_hash FROM tokens`
      expect(before.some((r) => r.token_hash === staleHash)).toBe(true)

      await clientFor(isolated).auth.requestPasswordReset({ email })

      // Still there: only the tokens.prune schedule removes it now, not this request.
      const after: { token_hash: string }[] = await raw`SELECT token_hash FROM tokens`
      expect(after.some((r) => r.token_hash === staleHash)).toBe(true)
      expect(after.length).toBe(before.length + 1) // plus the fresh reset token just issued
    } finally {
      await isolated.stop()
      await raw.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("email verification", () => {
  const linkOf = (text: string | undefined) =>
    text?.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]
  const resetLinkOf = (text: string | undefined) =>
    text?.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1]

  test("sign-up sends one verify mail and me() reports unverified", async () => {
    const { client, email, user } = await signUp(app)
    const verify = await mailsTo(app, email, VERIFY)
    expect(verify).toHaveLength(1)
    expect(verify[0]?.text).toContain("http://auth.example.com/verify-email?token=")
    expect(verify[0]?.idempotencyKey).toStartWith(`verify:${user.id}:`)
    expect(user.emailVerified).toBe(false)
    expect((await client.auth.me()).user.emailVerified).toBe(false)
  })

  test("the link verifies once; reuse and other purposes are BAD_REQUEST", async () => {
    const { client, email: verified } = await signUp(app)
    const token = linkOf((await mailsTo(app, verified, VERIFY))[0]?.text)
    expect(token).toBeTruthy()
    await clientFor(app).auth.verifyEmail({ token: token as string })
    expect((await client.auth.me()).user.emailVerified).toBe(true)
    const [again] = await safe(clientFor(app).auth.verifyEmail({ token: token as string }))
    expect(again).toMatchObject({ code: "BAD_REQUEST" })
    // A reset token is not a verification token.
    const { email } = await signUp(app)
    await clientFor(app).auth.requestPasswordReset({ email })
    const resetToken = resetLinkOf((await mailsTo(app, email, RESET))[0]?.text)
    expect(resetToken).toBeTruthy()
    const [crossed] = await safe(clientFor(app).auth.verifyEmail({ token: resetToken as string }))
    expect(crossed).toMatchObject({ code: "BAD_REQUEST" })
    // ...and was not consumed by the attempt: it still resets the password.
    await clientFor(app).auth.resetPassword({
      token: resetToken as string,
      password: "another horse 123",
    })
    // Let the reset's detached notice land here, not in the next test.
    await mailsTo(app, email, CHANGED)
  })

  test("verifying an already-verified account (its old link still valid) records no second event", async () => {
    const { user, email } = await signUp(app)
    // The sign-up verify link stays outstanding — nothing here invalidates it.
    const outstanding = linkOf((await mailsTo(app, email, VERIFY, 1))[0]?.text)
    expect(outstanding).toBeTruthy()
    // A magic link proves the mailbox a different way and verifies the account itself
    // (`purgeUnverifiedAccount` records the first `email_verified`; it never touches
    // `email_verify` tokens, so `outstanding` is still live).
    await clientFor(app).auth.magicLink.request({ email })
    const magicToken = (await mailsTo(app, email, MAGIC))[0]?.text.match(
      /magic\?token=([A-Za-z0-9_-]+)/
    )?.[1]
    expect(magicToken).toBeTruthy()
    signedIn(await clientFor(app).auth.magicLink.consume({ token: magicToken as string }))
    // The still-valid old link now verifies an already-verified account: it consumes, but
    // `markEmailVerified`'s atomic check-and-set reports no change, so `auth.verifyEmail`
    // records no second `email_verified` (the race this guards against: two verifications of
    // one account, racing or not, must only ever count once).
    await clientFor(app).auth.verifyEmail({ token: outstanding as string })
    await app.drain()
    const now = Date.now()
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const [today, yesterday] = await Promise.all([
      app.db.analytics.eventsForDay(day(now)),
      app.db.analytics.eventsForDay(day(now - 24 * 60 * 60 * 1000)),
    ])
    const recorded = [...today, ...yesterday].filter(
      (r) => r.name === "email_verified" && r.user_id === user.id
    )
    expect(recorded).toHaveLength(1)
  })

  test("a verifyEmail racing the hijack purge's own verify still records only one event", async () => {
    // The squatter: an unverified password account, which is exactly what
    // `purgeUnverifiedAccount` acts on once a magic link proves someone else owns the email.
    const { user, email } = await signUp(app)
    const verifyToken = linkOf((await mailsTo(app, email, VERIFY))[0]?.text)
    expect(verifyToken).toBeTruthy()
    await clientFor(app).auth.magicLink.request({ email })
    const magicToken = (await mailsTo(app, email, MAGIC))[0]?.text.match(
      /magic\?token=([A-Za-z0-9_-]+)/
    )?.[1]
    expect(magicToken).toBeTruthy()
    // Race them: if `auth.verifyEmail` wins the atomic check-and-set first, the purge's own read
    // of the user is stale by the time its transaction runs — `markEmailVerified` inside it then
    // reports no change, and (per the fix) records no second `email_verified`.
    await Promise.allSettled([
      clientFor(app).auth.magicLink.consume({ token: magicToken as string }),
      clientFor(app).auth.verifyEmail({ token: verifyToken as string }),
    ])
    await app.drain()
    const now = Date.now()
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const [today, yesterday] = await Promise.all([
      app.db.analytics.eventsForDay(day(now)),
      app.db.analytics.eventsForDay(day(now - 24 * 60 * 60 * 1000)),
    ])
    const recorded = [...today, ...yesterday].filter(
      (r) => r.name === "email_verified" && r.user_id === user.id
    )
    expect(recorded).toHaveLength(1)
  })

  test("resend issues a new link, burns the old one, no-ops when verified, and is limited per user", async () => {
    const a = await signUp(app)
    const first = linkOf((await mailsTo(app, a.email, VERIFY, 1))[0]?.text)
    expect(first).toBeTruthy()
    expect(await a.client.account.resendVerification()).toEqual({ sent: true })
    const second = linkOf((await mailsTo(app, a.email, VERIFY, 2))[1]?.text)
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    const [old] = await safe(clientFor(app).auth.verifyEmail({ token: first as string }))
    expect(old).toMatchObject({ code: "BAD_REQUEST" })
    await a.client.account.resendVerification()
    // Drained before the next resend: each verify mail is a separate job, concurrently runnable,
    // so two enqueued back to back race for delivery order; draining one in makes "the newest
    // link" below unambiguous.
    await app.drain()
    await a.client.account.resendVerification()
    const [limited] = await safe(a.client.account.resendVerification())
    expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    // Another user is not affected by A's limit.
    const b = await signUp(app)
    expect(await b.client.account.resendVerification()).toEqual({ sent: true })
    await mailsTo(app, b.email, VERIFY, 2)
    // Only the newest of A's links verifies; verified users get sent: false.
    const latest = linkOf((await mailsTo(app, a.email, VERIFY, 4))[3]?.text)
    expect(latest).toBeTruthy()
    await clientFor(app).auth.verifyEmail({ token: latest as string })
    expect(await a.client.account.resendVerification()).toEqual({ sent: false })
  })

  test("a rejecting mailer does not break sign-up", async () => {
    const logged: string[] = []
    const failing = await start({
      log: (message) => logged.push(message),
      mailer: {
        kind: "log",
        send: async () => {
          throw new Error("down")
        },
      },
    })
    try {
      const { user } = await signUp(failing)
      expect(user.emailVerified).toBe(false)
      expect(logged).toContain("job mail.send failed (attempt 1/5), retrying")
    } finally {
      await failing.stop()
    }
  })

  test("reset and change-password send a password-changed notice", async () => {
    const { email } = await signUp(app)
    await clientFor(app).auth.requestPasswordReset({ email })
    const [reset] = await mailsTo(app, email, RESET)
    await clientFor(app).auth.resetPassword({
      token: resetLinkOf(reset?.text) ?? "",
      password: "another horse battery",
    })
    const [notice] = await mailsTo(app, email, CHANGED, 1)
    expect(notice?.text).toContain("http://account.example.com/security")
    expect(notice?.text).toMatch(/If it was not you, reset your password now at/)
    expect(notice?.text).toContain("http://auth.example.com/forgot-password")
    const { session } = signedIn(
      await clientFor(app).auth.signIn({
        email,
        password: "another horse battery",
      })
    )
    await clientFor(app, session.token).account.changePassword({
      currentPassword: "another horse battery",
      newPassword: "third horse battery",
    })
    expect(await mailsTo(app, email, CHANGED, 2)).toHaveLength(2)
  })
})

describe("account", () => {
  test("updateProfile changes the name", async () => {
    const { client } = await signUp(app)
    expect((await client.account.updateProfile({ name: "Ada" })).name).toBe("Ada")
    expect((await client.auth.me()).user.name).toBe("Ada")
  })

  test("changePassword keeps this session and drops the others; wrong current is FORBIDDEN", async () => {
    const { client, email } = await signUp(app)
    const other = signedIn(
      await clientFor(app).auth.signIn({ email, password: "correct horse battery" })
    )
    const otherClient = clientFor(app, other.session.token)
    const [bad] = await safe(
      client.account.changePassword({
        currentPassword: "wrong-wrong",
        newPassword: "brand new pass",
      })
    )
    expect(bad).toMatchObject({ code: "FORBIDDEN" })
    await client.account.changePassword({
      currentPassword: "correct horse battery",
      newPassword: "brand new pass",
    })
    await client.auth.me()
    const [gone] = await safe(otherClient.auth.me())
    expect(gone).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("sessions: list marks the current one; revoke is owner-scoped; revokeOthers keeps this one", async () => {
    const a = await signUp(app)
    const b = await signUp(app)
    const second = signedIn(
      await clientFor(app).auth.signIn({
        email: a.email,
        password: "correct horse battery",
      })
    )
    const list = await a.client.account.sessions.list()
    expect(list.items).toHaveLength(2)
    expect(list.items.filter((s) => s.current)).toHaveLength(1)
    const foreignId = (await b.client.account.sessions.list()).items[0]?.id as number
    const [foreign] = await safe(a.client.account.sessions.revoke({ id: foreignId }))
    expect(foreign).toMatchObject({ code: "NOT_FOUND" })
    await a.client.account.sessions.revokeOthers()
    expect((await a.client.account.sessions.list()).items).toHaveLength(1)
    const [revoked] = await safe(clientFor(app, second.session.token).auth.me())
    expect(revoked).toMatchObject({ code: "UNAUTHORIZED" })
  })
})

describe("notes are per workspace", () => {
  test("a workspace never sees another's notes; a foreign id is NOT_FOUND", async () => {
    const a = await signUpWithWorkspace(app)
    const b = await signUpWithWorkspace(app)
    const mine = await a.client.notes.create({ workspaceId: a.workspaceId, title: "mine" })
    const theirs = await b.client.notes.create({ workspaceId: b.workspaceId, title: "theirs" })
    const list = await a.client.notes.list({ workspaceId: a.workspaceId })
    expect(list.items.map((n) => n.title)).toEqual(["mine"])
    // B's note asked for under A's workspace, by a member of A: not there.
    const [foreign] = await safe(a.client.notes.find({ workspaceId: a.workspaceId, id: theirs.id }))
    expect(foreign).toMatchObject({ code: "NOT_FOUND", message: "Note not found" })
    const [foreignDelete] = await safe(
      a.client.notes.delete({ workspaceId: a.workspaceId, id: theirs.id })
    )
    expect(foreignDelete).toMatchObject({ code: "NOT_FOUND", message: "Note not found" })
    // A's workspace asked for by an outsider: the workspace itself is not there.
    const [outsider] = await safe(b.client.notes.find({ workspaceId: a.workspaceId, id: mine.id }))
    expect(outsider).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
    const [anon] = await safe(clientFor(app).notes.list({ workspaceId: a.workspaceId }))
    expect(anon).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("viewers read, members write and delete their own, admins delete any", async () => {
    const owner = await signUpWithWorkspace(app)
    const { workspaceId } = owner
    const join = async (role: "viewer" | "member" | "admin") => {
      const actor = await signUp(app)
      await app.db.memberships.add({ workspaceId, userId: actor.user.id, role })
      return actor
    }
    const viewer = await join("viewer")
    const member = await join("member")
    const other = await join("member")
    const admin = await join("admin")

    const ownersNote = await owner.client.notes.create({ workspaceId, title: "owner's" })
    expect((await viewer.client.notes.list({ workspaceId })).items).toEqual([ownersNote])
    expect(await viewer.client.notes.find({ workspaceId, id: ownersNote.id })).toEqual(ownersNote)
    const [viewerCreate] = await safe(viewer.client.notes.create({ workspaceId, title: "no" }))
    expect(viewerCreate).toMatchObject({ code: "FORBIDDEN", message: "Requires the member role" })

    const membersNote = await member.client.notes.create({ workspaceId, title: "member's" })
    expect(membersNote.authorId).toBe(member.user.id)
    const [viewerDelete] = await safe(
      viewer.client.notes.delete({ workspaceId, id: membersNote.id })
    )
    expect(viewerDelete).toMatchObject({ code: "FORBIDDEN", message: "Requires the member role" })
    const [otherDelete] = await safe(other.client.notes.delete({ workspaceId, id: membersNote.id }))
    expect(otherDelete).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
    await member.client.notes.delete({ workspaceId, id: membersNote.id })

    const othersNote = await other.client.notes.create({ workspaceId, title: "other's" })
    await admin.client.notes.delete({ workspaceId, id: othersNote.id })
    await admin.client.notes.delete({ workspaceId, id: ownersNote.id })
    expect((await owner.client.notes.list({ workspaceId })).items).toEqual([])
  })
})

describe("oauth", () => {
  const verified = {
    providerUserId: "g-1",
    email: "ada@example.com",
    emailVerified: true,
    name: "Ada",
  }

  test("providers() lists the configured ones; start gives a URL, state and verifier", async () => {
    const own = await start({ providers: providersWith(["google", "github"]) })
    try {
      expect(await clientFor(own).auth.providers()).toEqual({ providers: ["google", "github"] })
      const s = await clientFor(own).auth.oauth.start({ provider: "google" })
      expect(s.url).toContain("code_challenge")
      expect(typeof s.state).toBe("string")
      expect(s.state.length).toBeGreaterThan(0)
      expect(s.codeVerifier).toBeTruthy()
      const [missing] = await safe(clientFor(own).auth.oauth.start({ provider: "apple" }))
      expect(missing).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await own.stop()
    }
  })

  test("a verified unknown email creates a passwordless, verified account", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { user, session } = signedIn(
        await clientFor(own).auth.oauth.callback({
          provider: "google",
          code: "c",
          codeVerifier: "v",
        })
      )
      expect(user).toMatchObject({
        email: "ada@example.com",
        name: "Ada",
        emailVerified: true,
        hasPassword: false,
      })
      expect((await clientFor(own, session.token).auth.me()).user.id).toBe(user.id)
      // Password sign-in on it fails like a wrong password.
      const [err] = await safe(
        clientFor(own).auth.signIn({ email: "ada@example.com", password: "whatever-12345" })
      )
      expect(err).toMatchObject({ code: "UNAUTHORIZED" })
    } finally {
      await own.stop()
    }
  })

  test("an account a provider creates stores the request's locale, and nothing without one", async () => {
    const own = await start({
      providers: providersWith({
        google: { ...verified, email: "locale-sv@example.com" },
        github: { ...verified, providerUserId: "gh-1", email: "locale-none@example.com" },
      }),
    })
    try {
      const sv = signedIn(
        await clientFor(own, undefined, "sv").auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(sv.user.locale).toBe("sv")
      expect((await own.db.users.find(sv.user.id))?.locale).toBe("sv")
      // An unsupported browser language is no real signal: nothing is stored, it reads as English.
      const none = signedIn(
        await clientFor(own, undefined, "de").auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(none.user.locale).toBe("en")
      expect((await own.db.users.find(none.user.id))?.locale).toBeNull()
    } finally {
      await own.stop()
    }
  })

  test("a verified email links to the existing account and marks it verified", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { user: existing } = await signUp(own, "ada@example.com")
      const { user } = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(user.id).toBe(existing.id)
      expect(user.emailVerified).toBe(true)
      // It was never verified, so the password set at sign-up is dropped (see the hijack test).
      expect(user.hasPassword).toBe(false)
    } finally {
      await own.stop()
    }
  })

  test("linking to a never-verified account drops the squatter's password and sessions", async () => {
    const victim = { ...verified, email: "victim@example.com" }
    const own = await start({ providers: providersWith({ google: victim }) })
    try {
      const squatter = await signUp(own, "victim@example.com")
      const { user } = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(user.id).toBe(squatter.user.id)
      expect(user).toMatchObject({ hasPassword: false, emailVerified: true })
      const [signIn] = await safe(
        clientFor(own).auth.signIn({
          email: "victim@example.com",
          password: "correct horse battery",
        })
      )
      expect(signIn).toMatchObject({ code: "UNAUTHORIZED" })
      const [me] = await safe(squatter.client.auth.me())
      expect(me).toMatchObject({ code: "UNAUTHORIZED" })
      // The owner is told why the password and devices went.
      const [notice] = await mailsTo(own, "victim@example.com", ACCOUNT_RESET)
      expect(notice?.text).toContain("http://account.example.com/security")
    } finally {
      await own.stop()
    }
  })

  test("linking to an already-verified account keeps its password and sessions", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const owner = await signUp(own, "ada@example.com")
      const mail = await mailsTo(own, "ada@example.com", VERIFY)
      const token = mail[0]?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]
      await clientFor(own).auth.verifyEmail({ token: token as string })
      const { user } = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(user.id).toBe(owner.user.id)
      expect(user.hasPassword).toBe(true)
      expect((await owner.client.auth.me()).user.id).toBe(owner.user.id)
      await Bun.sleep(50)
      expect(own.mailer.sent.filter((m) => m.subject === ACCOUNT_RESET)).toEqual([])
    } finally {
      await own.stop()
    }
  })

  test("a known identity wins even after the provider email changed", async () => {
    const profile = { ...verified }
    const own = await start({ providers: providersWith({ google: () => profile }) })
    try {
      const first = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      profile.email = "new@example.com"
      const second = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(second.user.id).toBe(first.user.id)
      expect(second.user.email).toBe("ada@example.com")
    } finally {
      await own.stop()
    }
  })

  test("an identity whose user is gone is dropped and the sign-in proceeds as for a new one", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      // What a sign-in racing `users.purge` leaves behind: an identity naming no user.
      await own.db.identities.create({
        userId: 999_999,
        provider: "google",
        providerUserId: verified.providerUserId,
        email: verified.email,
      })
      const first = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(first.user).toMatchObject({ email: "ada@example.com", emailVerified: true })
      expect(first.user.id).not.toBe(999_999)
      const identity = await own.db.identities.findByProviderUser("google", "g-1")
      expect(identity?.user_id).toBe(first.user.id)
      // And the next sign-in uses the re-linked identity.
      const second = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(second.user.id).toBe(first.user.id)
    } finally {
      await own.stop()
    }
  })

  test("an unverified email is FORBIDDEN and creates nothing", async () => {
    const own = await start({
      providers: providersWith({
        github: { providerUserId: "42", email: "x@example.com", emailVerified: false, name: "x" },
      }),
    })
    try {
      const [err] = await safe(
        clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN" })
      // No account holds the profile's email: signing up with it succeeds.
      const { user } = await signUp(own, "x@example.com")
      expect(user.email).toBe("x@example.com")
    } finally {
      await own.stop()
    }
  })

  test("a missing or malformed provider email is FORBIDDEN and creates nothing", async () => {
    const own = await start({
      providers: providersWith({
        github: { providerUserId: "43", email: null, emailVerified: false, name: "x" },
        google: { providerUserId: "g-9", email: "not-an-email", emailVerified: true, name: "x" },
      }),
    })
    try {
      const [missing] = await safe(
        clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(missing).toMatchObject({ code: "FORBIDDEN" })
      const [malformed] = await safe(
        clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(malformed).toMatchObject({ code: "FORBIDDEN" })
      // Neither identity was stored: a signed-in caller can still connect both.
      const me = await signUp(own)
      await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      await me.client.auth.oauth.callback({ provider: "google", code: "c" })
      expect((await me.client.account.identities.list()).items).toHaveLength(2)
    } finally {
      await own.stop()
    }
  })

  test("an unverified email matching a verified account is FORBIDDEN and links nothing", async () => {
    const own = await start({
      providers: providersWith({
        github: {
          providerUserId: "44",
          email: "ada@example.com",
          emailVerified: false,
          name: null,
        },
      }),
    })
    try {
      const owner = await signUp(own, "ada@example.com")
      const mail = await mailsTo(own, "ada@example.com", VERIFY)
      const token = mail[0]?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]
      await clientFor(own).auth.verifyEmail({ token: token as string })
      const [err] = await safe(
        clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(err).toMatchObject({ code: "FORBIDDEN" })
      expect((await owner.client.account.identities.list()).items).toEqual([])
      expect((await owner.client.auth.me()).user.id).toBe(owner.user.id)
    } finally {
      await own.stop()
    }
  })

  test("the hijack purge also drops identities the squatter connected", async () => {
    const own = await start({
      providers: providersWith({
        google: { ...verified, email: "victim@example.com" },
        github: {
          providerUserId: "evil",
          email: "evil@example.com",
          emailVerified: true,
          name: null,
        },
      }),
    })
    try {
      const squatter = await signUp(own, "victim@example.com")
      await squatter.client.auth.oauth.callback({ provider: "github", code: "c" })
      const owner = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(owner.user.id).toBe(squatter.user.id)
      const back = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(back.user.id).not.toBe(owner.user.id)
      expect(back.user.email).toBe("evil@example.com")
      const items = (await clientFor(own, owner.session.token).account.identities.list()).items
      expect(items.map((i) => i.provider)).toEqual(["google"])
    } finally {
      await own.stop()
    }
  })

  test("connecting while signed in links an unclaimed identity (any email) and is idempotent", async () => {
    const own = await start({
      providers: providersWith({
        github: { providerUserId: "7", email: "work@example.com", emailVerified: true, name: null },
      }),
    })
    try {
      const me = await signUp(own)
      const linked = signedIn(
        await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(linked.user.id).toBe(me.user.id)
      const again = signedIn(await me.client.auth.oauth.callback({ provider: "github", code: "c" }))
      expect(again.user.id).toBe(me.user.id)
      expect((await me.client.account.identities.list()).items).toEqual([
        expect.objectContaining({ provider: "github", email: "work@example.com" }),
      ])
    } finally {
      await own.stop()
    }
  })

  test("an identity claimed by another account is CONFLICT when connecting", async () => {
    const own = await start({
      providers: providersWith({
        github: { providerUserId: "7", email: "a@example.com", emailVerified: true, name: null },
      }),
    })
    try {
      await signUp(own, "a@example.com") // owner; the callback below links to this account
      await clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })
      const other = await signUp(own, "b@example.com")
      const [err] = await safe(other.client.auth.oauth.callback({ provider: "github", code: "c" }))
      expect(err).toMatchObject({ code: "CONFLICT" })
    } finally {
      await own.stop()
    }
  })

  test("disconnect refuses the last way in; setPassword then allows it", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const { session } = signedIn(
        await clientFor(own).auth.oauth.callback({
          provider: "google",
          code: "c",
        })
      )
      const c = clientFor(own, session.token)
      const [last] = await safe(c.account.identities.disconnect({ provider: "google" }))
      expect(last).toMatchObject({ code: "FORBIDDEN" })
      await c.account.setPassword({ password: "correct horse battery" })
      expect((await c.auth.me()).user.hasPassword).toBe(true)
      const [twice] = await safe(c.account.setPassword({ password: "another horse battery" }))
      expect(twice).toMatchObject({ code: "CONFLICT" })
      await c.account.identities.disconnect({ provider: "google" })
      expect((await c.account.identities.list()).items).toEqual([])
      const [none] = await safe(c.account.identities.disconnect({ provider: "google" }))
      expect(none).toMatchObject({ code: "NOT_FOUND" })
      expect((await mailsTo(own, "ada@example.com", CHANGED)).length).toBe(1)
    } finally {
      await own.stop()
    }
  })

  test("a second identity of a provider already connected is CONFLICT; disconnect guard holds", async () => {
    const profile = { ...verified }
    const own = await start({ providers: providersWith({ google: () => profile }) })
    try {
      const { session } = signedIn(
        await clientFor(own).auth.oauth.callback({
          provider: "google",
          code: "c",
        })
      )
      const c = clientFor(own, session.token)
      profile.providerUserId = "g-2"
      profile.email = "other@example.com"
      const [err] = await safe(c.auth.oauth.callback({ provider: "google", code: "c" }))
      expect(err).toMatchObject({ code: "CONFLICT" })
      expect((await c.account.identities.list()).items).toEqual([
        expect.objectContaining({ provider: "google", email: "ada@example.com" }),
      ])
      const [last] = await safe(c.account.identities.disconnect({ provider: "google" }))
      expect(last).toMatchObject({ code: "FORBIDDEN" })
      // The refused identity was not stored: it can still create an account of its own.
      const fresh = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(fresh.user.email).toBe("other@example.com")
    } finally {
      await own.stop()
    }
  })

  test("a second identity of a provider linked by verified email is CONFLICT too", async () => {
    const profile = { ...verified }
    const own = await start({ providers: providersWith({ google: () => profile }) })
    try {
      const first = signedIn(
        await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      profile.providerUserId = "g-2" // same verified email, another provider user
      const [err] = await safe(
        clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(err).toMatchObject({ code: "CONFLICT" })
      const items = (await clientFor(own, first.session.token).account.identities.list()).items
      expect(items).toHaveLength(1)
    } finally {
      await own.stop()
    }
  })

  test("a garbage session token falls back to the anonymous path", async () => {
    const own = await start({ providers: providersWith({ google: verified }) })
    try {
      const owner = await signUp(own, "ada@example.com")
      const verify = await mailsTo(own, "ada@example.com", VERIFY)
      const token = verify[0]?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
      await clientFor(own).auth.verifyEmail({ token })
      const { user } = signedIn(
        await clientFor(own, "not-a-session").auth.oauth.callback({
          provider: "google",
          code: "c",
        })
      )
      expect(user.id).toBe(owner.user.id)
      expect((await owner.client.account.identities.list()).items).toEqual([
        expect.objectContaining({ provider: "google" }),
      ])
    } finally {
      await own.stop()
    }
  })

  test("provider failures map to BAD_REQUEST / BAD_GATEWAY", async () => {
    const own = await start({
      providers: new Map([
        [
          "google",
          fakeProvider("google", () => {
            throw new ProviderExchangeError("invalid_code", "google")
          }),
        ],
        [
          "github",
          fakeProvider("github", () => {
            throw new ProviderExchangeError("unreachable", "github")
          }),
        ],
      ]),
    })
    try {
      expect(
        (await safe(clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })))[0]
      ).toMatchObject({ code: "BAD_REQUEST" })
      expect(
        (await safe(clientFor(own).auth.oauth.callback({ provider: "github", code: "c" })))[0]
      ).toMatchObject({ code: "BAD_GATEWAY" })
    } finally {
      await own.stop()
    }
  })
})

describe("magic link", () => {
  const tokenOf = (text?: string) => text?.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""

  test("an existing user gets a link that signs them in once", async () => {
    const { email, user } = await signUp(app)
    await clientFor(app).auth.magicLink.request({ email })
    const [mail] = await mailsTo(app, email, MAGIC)
    const token = tokenOf(mail?.text)
    const { user: linked, session } = signedIn(
      await clientFor(app).auth.magicLink.consume({ token })
    )
    expect(linked.id).toBe(user.id)
    expect(linked.emailVerified).toBe(true)
    expect((await clientFor(app, session.token).auth.me()).user.id).toBe(user.id)
    const [again] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(again).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("an unknown email gets a link too; consuming creates a passwordless verified account", async () => {
    await clientFor(app).auth.magicLink.request({ email: "fresh@example.com" })
    const [mail] = await mailsTo(app, "fresh@example.com", MAGIC)
    const { user } = signedIn(
      await clientFor(app).auth.magicLink.consume({ token: tokenOf(mail?.text) })
    )
    expect(user).toMatchObject({
      email: "fresh@example.com",
      emailVerified: true,
      hasPassword: false,
    })
  })

  // The account was registered with a password but never verified: the link proves who owns the
  // email, so it signs that account in after the pre-account-hijack purge (password gone).
  test("if the address signs up with a password before clicking, the link signs that account in", async () => {
    await clientFor(app).auth.magicLink.request({ email: "late@example.com" })
    const [mail] = await mailsTo(app, "late@example.com", MAGIC)
    const { user: viaPassword } = await signUp(app, "late@example.com")
    const { user } = signedIn(
      await clientFor(app).auth.magicLink.consume({ token: tokenOf(mail?.text) })
    )
    expect(user.id).toBe(viaPassword.id)
    expect(user.hasPassword).toBe(false)
  })

  test("an unverified password account is purged before the link signs it in", async () => {
    const squatter = await signUp(app, "squat@example.com")
    expect(squatter.user.emailVerified).toBe(false)
    await clientFor(app).auth.magicLink.request({ email: "squat@example.com" })
    const [mail] = await mailsTo(app, "squat@example.com", MAGIC)
    const { user, session } = signedIn(
      await clientFor(app).auth.magicLink.consume({
        token: tokenOf(mail?.text),
      })
    )
    expect(user).toMatchObject({ id: squatter.user.id, hasPassword: false, emailVerified: true })
    const [dead] = await safe(squatter.client.auth.me())
    expect(dead).toMatchObject({ code: "UNAUTHORIZED" })
    const [signIn] = await safe(
      clientFor(app).auth.signIn({ email: "squat@example.com", password: "correct horse battery" })
    )
    expect(signIn).toMatchObject({ code: "UNAUTHORIZED" })
    expect((await clientFor(app, session.token).auth.me()).user.id).toBe(squatter.user.id)
    const [notice] = await mailsTo(app, "squat@example.com", ACCOUNT_RESET)
    expect(notice?.subject).toBe("Your account was reset")
  })

  test("a verified account keeps its password and sessions", async () => {
    const owner = await signUp(app)
    const verify = await mailsTo(app, owner.email, VERIFY)
    const verifyToken = verify[0]?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    await clientFor(app).auth.verifyEmail({ token: verifyToken })
    await clientFor(app).auth.magicLink.request({ email: owner.email })
    const [mail] = await mailsTo(app, owner.email, MAGIC)
    const { user } = signedIn(
      await clientFor(app).auth.magicLink.consume({ token: tokenOf(mail?.text) })
    )
    expect(user).toMatchObject({ id: owner.user.id, hasPassword: true, emailVerified: true })
    expect((await owner.client.auth.me()).user.id).toBe(owner.user.id)
  })

  test("a newer link burns the older one; the limiter is silent", async () => {
    const own = await start({
      magicLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { email } = await signUp(own)
      await clientFor(own).auth.magicLink.request({ email })
      // Drained before the second request: two jobs enqueued back to back race for delivery
      // order, so collecting the first one here makes "the newer link" below unambiguous.
      const [first] = await mailsTo(own, email, MAGIC, 1)
      await clientFor(own).auth.magicLink.request({ email })
      const [, second] = await mailsTo(own, email, MAGIC, 2)
      await clientFor(own).auth.magicLink.request({ email }) // over the limit: void, no third mail
      await Bun.sleep(50)
      expect((await mailsTo(own, email, MAGIC, 2)).length).toBe(2)
      expect(own.mailer.sent.filter((m) => m.to === email && m.subject === MAGIC)).toHaveLength(2)
      const [old] = await safe(
        clientFor(own).auth.magicLink.consume({ token: tokenOf(first?.text) })
      )
      expect(old).toMatchObject({ code: "BAD_REQUEST" })
      await clientFor(own).auth.magicLink.consume({ token: tokenOf(second?.text) })
    } finally {
      await own.stop()
    }
  })

  test("the api-wide cap holds across addresses, silently", async () => {
    const own = await start({
      magicGlobalLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      await clientFor(own).auth.magicLink.request({ email: "m1@example.com" })
      await clientFor(own).auth.magicLink.request({ email: "m2@example.com" })
      await mailsTo(own, "m2@example.com", MAGIC)
      // Over the cap: the same void answer as success, and no mail.
      await clientFor(own).auth.magicLink.request({ email: "m3@example.com" })
      await Bun.sleep(50)
      expect(own.mailer.sent.filter((m) => m.to === "m3@example.com")).toHaveLength(0)
    } finally {
      await own.stop()
    }
  })

  test("a newer link burns the older one for an unknown email too", async () => {
    const anon = clientFor(app)
    await anon.auth.magicLink.request({ email: "twice@example.com" })
    // Drained before the second request, for the same reason as the test above.
    const [first] = await mailsTo(app, "twice@example.com", MAGIC, 1)
    await anon.auth.magicLink.request({ email: "Twice@Example.com" })
    const [, second] = await mailsTo(app, "twice@example.com", MAGIC, 2)
    const [old] = await safe(anon.auth.magicLink.consume({ token: tokenOf(first?.text) }))
    expect(old).toMatchObject({ code: "BAD_REQUEST" })
    const { user } = signedIn(await anon.auth.magicLink.consume({ token: tokenOf(second?.text) }))
    expect(user.email).toBe("twice@example.com")
  })

  test("an expired link is BAD_REQUEST and signs nobody in", async () => {
    const { user } = await signUp(app)
    const token = newToken()
    await app.db.tokens.create({
      userId: user.id,
      purpose: "magic_link",
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })
    const [err] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a verify or reset token is not a magic link", async () => {
    const { email } = await signUp(app)
    await clientFor(app).auth.requestPasswordReset({ email })
    const [reset] = await mailsTo(app, email, RESET)
    const token = reset?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const [err] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
    const [verify] = await mailsTo(app, email, VERIFY)
    const vToken = verify?.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const [vErr] = await safe(clientFor(app).auth.magicLink.consume({ token: vToken }))
    expect(vErr).toMatchObject({ code: "BAD_REQUEST" })
  })
})

describe("sign-up limiters", () => {
  const password = "correct horse battery"
  const as = (app: { server: { url: URL } }, clientId: string) =>
    createORPCClient<ApiClient>(
      new RPCLink({
        url: new URL("/rpc", app.server.url),
        headers: { ...auth, "x-api-client-id": clientId },
      })
    )

  test("the global cap holds across rotating client ids", async () => {
    const limited = await start({
      signUpLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      await as(limited, "anon:a").auth.signUp({ email: "g1@example.com", password })
      await as(limited, "anon:b").auth.signUp({ email: "g2@example.com", password })
      const [error] = await safe(
        as(limited, "anon:c").auth.signUp({ email: "g3@example.com", password })
      )
      expect(error).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: "Too many sign-ups right now, try again in a few minutes",
      })
    } finally {
      await limited.stop()
    }
  })

  test("the per-address cap stops repeats for one email, before the existence check", async () => {
    const limited = await start({
      signUpEmailLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      await as(limited, "anon:a").auth.signUp({ email: "Victim@Example.com", password })
      // A different client and a differently-cased address: still the same normalised email.
      const [repeat] = await safe(
        as(limited, "anon:b").auth.signUp({ email: "victim@example.com", password })
      )
      expect(repeat).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      // Another address is unaffected.
      await as(limited, "anon:c").auth.signUp({ email: "other@example.com", password })
    } finally {
      await limited.stop()
    }
  })

  test("a per-address refusal spends no global token", async () => {
    const limited = await start({
      signUpEmailLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      signUpLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      await as(limited, "anon:a").auth.signUp({ email: "same@example.com", password })
      const [repeat] = await safe(
        as(limited, "anon:b").auth.signUp({ email: "same@example.com", password })
      )
      expect(repeat).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      // The second global token is still there: the per-address cap ran first.
      await as(limited, "anon:c").auth.signUp({ email: "next@example.com", password })
    } finally {
      await limited.stop()
    }
  })

  test("CONFLICT probes count toward the per-address cap", async () => {
    const limited = await start({
      signUpEmailLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      await as(limited, "anon:a").auth.signUp({ email: "probe@example.com", password })
      const [conflict] = await safe(
        as(limited, "anon:b").auth.signUp({ email: "probe@example.com", password })
      )
      expect(conflict).toMatchObject({ code: "CONFLICT" })
      // The probe spent a token, so the next attempt no longer learns whether the account exists.
      const [limitedProbe] = await safe(
        as(limited, "anon:c").auth.signUp({ email: "probe@example.com", password })
      )
      expect(limitedProbe).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("a refused sign-up creates no account and sends no mail", async () => {
    const limited = await start({
      signUpLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      await as(limited, "anon:a").auth.signUp({ email: "first@example.com", password })
      await mailsTo(limited, "first@example.com", VERIFY)
      const [error] = await safe(
        as(limited, "anon:b").auth.signUp({ email: "refused@example.com", password })
      )
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      await Bun.sleep(50)
      expect(limited.mailer.sent.filter((m) => m.to === "refused@example.com")).toHaveLength(0)
      const [signIn] = await safe(
        as(limited, "anon:c").auth.signIn({ email: "refused@example.com", password })
      )
      expect(signIn).toMatchObject({ code: "UNAUTHORIZED" })
    } finally {
      await limited.stop()
    }
  })
})
