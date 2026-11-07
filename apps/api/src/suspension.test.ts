import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  isTwoFactorChallenge,
  PASSKEY_FAILED_MESSAGE,
  SUSPENDED_TARGET_MESSAGE,
  TWO_FACTOR_TIMED_OUT_MESSAGE,
  TWO_FACTOR_WRONG_CODE_MESSAGE,
} from "@repo/api-contract"
import { magicLinkSubject as MAGIC } from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server"
import { newToken, tokenHash } from "./credentials"
import { ProviderExchangeError } from "./oauth/provider"
import { createCredential, getAssertion, type SoftCredential } from "./test-authenticator"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  openStream,
  providersWith,
  signedIn,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"
import { TOTP_PERIOD_SECONDS, totpCodeAt } from "./two-factor/totp"

// Enforcement of a suspension (`isSuspended`): every sign-in path refuses a suspended account —
// only once its own credential checked out — and every session of one resolves as dead.

const ROOT = "root@example.com"
const PASSWORD = "correct horse battery"
const INVALID = "Invalid email or password"
const sv = translatorFor("sv", "api")

/** The api's clock, `offsetMs` ahead of the system's: the expiry tests move it. */
let offsetMs = 0
let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>

/** `u:<email>` signs in as a verified GitHub profile for that address; `bad` is a dead code. */
const github = (input: { code: string }) => {
  if (input.code === "bad") throw new ProviderExchangeError("invalid_code", "github")
  const email = input.code.slice(2)
  return { providerUserId: `gh-${email}`, email, emailVerified: true, name: "Gh" }
}

beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    providers: providersWith({ github }),
    now: () => new Date(Date.now() + offsetMs),
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

type App = typeof app

const suspend = (userId: number, until?: string) =>
  root.client.admin.users.suspend({ userId, reason: "abuse report", until })
const unsuspend = (userId: number) =>
  root.client.admin.users.unsuspend({ userId, reason: "appeal granted" })

const liveSessions = async (a: App, userId: number) => {
  const [row] = await a.db.sql`
    SELECT COUNT(*) AS n FROM sessions WHERE user_id = ${userId} AND expires_at > ${new Date().toISOString()}
  `
  return Number(row.n)
}

/** A session row written straight to the table: what a sign-in racing the suspension leaves. */
async function rawSession(a: App, userId: number, impersonatedBy: number | null = null) {
  const token = newToken()
  await a.db.sessions.create({
    userId,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    userAgent: null,
    ip: null,
    impersonatedBy,
    reason: impersonatedBy ? "support" : null,
  })
  return token
}

const signIn = (email: string, password = PASSWORD, locale?: string) =>
  safe(clientFor(app, undefined, locale).auth.signIn({ email, password }))

const suspended = { code: "FORBIDDEN", message: ACCOUNT_SUSPENDED_MESSAGE }
const signInRequired = { code: "UNAUTHORIZED" }

describe("password sign-in", () => {
  test("a wrong password answers as for anyone; the right one is refused as suspended", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    const [unknown] = await signIn("nobody-at-all@example.com", "wrong password here")
    const [wrong] = await signIn(account.email, "wrong password here")
    expect(unknown).toMatchObject({ code: "UNAUTHORIZED", message: INVALID })
    expect(wrong).toMatchObject({ code: "UNAUTHORIZED", message: INVALID })
    const [right, result] = await signIn(account.email)
    expect(result).toBeUndefined()
    expect(right).toMatchObject(suspended)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })

  test("in Swedish when the request names it", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    const [error] = await signIn(account.email, PASSWORD, "sv")
    expect(error).toMatchObject({ code: "FORBIDDEN", message: sv("accountSuspended") })
    expect(sv("accountSuspended")).not.toBe(ACCOUNT_SUSPENDED_MESSAGE)
  })

  test("with two-step verification on: refused before any challenge is issued", async () => {
    const account = await signUp(app)
    await enableTwoFactor(app, account.user.id)
    await suspend(account.user.id)
    const [error, result] = await signIn(account.email)
    expect(result).toBeUndefined()
    expect(error).toMatchObject(suspended)
    const [row] = await app.db.sql`
      SELECT COUNT(*) AS n FROM tokens
      WHERE user_id = ${account.user.id} AND purpose = 'two_factor_challenge'
    `
    expect(Number(row.n)).toBe(0)
  })

  test("signs in again once unsuspended", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    await unsuspend(account.user.id)
    const [error, result] = await signIn(account.email)
    expect(error).toBeNull()
    expect(signedIn(result as NonNullable<typeof result>).user.id).toBe(account.user.id)
  })

  test("a session created while the suspension commits is refused, and deleted", async () => {
    const account = await signUp(app)
    const sessions = app.db.sessions
    const original = sessions.create
    // The sign-in has read the (unsuspended) user; the suspension commits before its session row.
    sessions.create = async (row) => {
      if (row.userId === account.user.id && row.impersonatedBy === null) {
        sessions.create = original
        await suspend(account.user.id)
      }
      return original(row)
    }
    let token: string
    try {
      const [error, result] = await signIn(account.email)
      expect(error).toBeNull()
      token = signedIn(result as NonNullable<typeof result>).session.token
    } finally {
      sessions.create = original
    }
    expect(await liveSessions(app, account.user.id)).toBe(1)
    const [me] = await safe(clientFor(app, token).auth.me())
    expect(me).toMatchObject(signInRequired)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })
})

describe("magic link", () => {
  async function linkFor(email: string) {
    await clientFor(app).auth.magicLink.request({ email })
    const mails = await mailsTo(app, email, MAGIC)
    return mails.at(-1)?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
  }

  test("a dead link answers as before; a good one is refused as suspended", async () => {
    const account = await signUpVerified(app)
    await suspend(account.user.id)
    // The request stays silent, suspended or not.
    const token = await linkFor(account.email)
    const [dead] = await safe(clientFor(app).auth.magicLink.consume({ token: "not-a-real-token" }))
    expect(dead).toMatchObject({
      code: "BAD_REQUEST",
      message: "This sign-in link is invalid, expired or already used",
    })
    const [error, result] = await safe(clientFor(app).auth.magicLink.consume({ token }))
    expect(result).toBeUndefined()
    expect(error).toMatchObject(suspended)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })
})

describe("provider sign-in", () => {
  const callback = (code: string, sessionToken?: string) =>
    safe(clientFor(app, sessionToken).auth.oauth.callback({ provider: "github", code }))

  test("a dead code answers as before; a known identity is refused as suspended", async () => {
    const account = await signUpVerified(app)
    // Linked by its verified email, then signed in through it.
    const [linkError] = await callback(`u:${account.email}`)
    expect(linkError).toBeNull()
    await suspend(account.user.id)
    const [dead] = await callback("bad")
    expect(dead).toMatchObject({ code: "BAD_REQUEST", message: "Sign-in failed, try again" })
    const [error, result] = await callback(`u:${account.email}`)
    expect(result).toBeUndefined()
    expect(error).toMatchObject(suspended)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })

  test("a verified email naming a suspended account is refused as suspended", async () => {
    const account = await signUpVerified(app)
    await suspend(account.user.id)
    const [error] = await callback(`u:${account.email}`)
    expect(error).toMatchObject(suspended)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })

  test("connecting on a suspended user's session: never answered with that session", async () => {
    const account = await signUpVerified(app)
    await suspend(account.user.id)
    const token = await rawSession(app, account.user.id)
    // The dead session makes this a plain sign-in, which refuses the suspended account.
    const [error, result] = await callback(`u:${account.email}`, token)
    expect(result).toBeUndefined()
    expect(error).toMatchObject(suspended)
  })

  test("a live connect is unaffected", async () => {
    const account = await signUpVerified(app)
    const [error, result] = await callback("u:connect-elsewhere@example.com", account.token)
    expect(error).toBeNull()
    expect(signedIn(result as NonNullable<typeof result>).session.token).toBe(account.token)
  })
})

describe("passkey sign-in", () => {
  async function withPasskey() {
    const account = await signUp(app)
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const { credential, response } = await createCredential(
      options as PublicKeyCredentialCreationOptionsJSON
    )
    await account.client.account.passkeys.register({ challengeId, response })
    return { ...account, credential }
  }

  async function signInWith(credential: SoftCredential, ceremony = {}) {
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      credential,
      ceremony
    )
    return safe(anonymous.auth.passkey.verify({ challengeId, response }))
  }

  test("a bad signature answers as before; a genuine one is refused, its use rolled back", async () => {
    const account = await withPasskey()
    await suspend(account.user.id)
    const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])
    const [bad] = await signInWith(account.credential, { signWith: other })
    expect(bad).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
    const before = await app.db.passkeys.findByCredentialId(account.credential.id)
    const [error, result] = await signInWith(account.credential)
    expect(result).toBeUndefined()
    expect(error).toMatchObject(suspended)
    const after = await app.db.passkeys.findByCredentialId(account.credential.id)
    expect(after?.last_used_at).toBe(before?.last_used_at as string)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })
})

describe("two-step verify", () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000)
  const verifyWith = (challenge: string, code: string) =>
    safe(clientFor(app).auth.twoFactor.verify({ challenge, code }))

  async function challenged() {
    const account = await signUp(app)
    const secret = await enableTwoFactor(app, account.user.id)
    const [, result] = await signIn(account.email)
    if (!result || !isTwoFactorChallenge(result)) throw new Error("expected a challenge")
    return { ...account, secret, challenge: result.twoFactor.challenge }
  }

  test("a challenge from before the suspension dies with it, and stays dead after", async () => {
    const account = await challenged()
    await suspend(account.user.id)
    // The suspension ended every session and challenge: a right code answers exactly like a
    // wrong one on any dead challenge — nothing says "suspended" for a challenge.
    const [wrong] = await verifyWith(account.challenge, "000000")
    const [right, result] = await verifyWith(
      account.challenge,
      totpCodeAt(account.secret, nowSeconds())
    )
    expect(result).toBeUndefined()
    expect(wrong).toMatchObject({ code: "BAD_REQUEST", message: TWO_FACTOR_TIMED_OUT_MESSAGE })
    expect(right).toMatchObject({ code: "BAD_REQUEST", message: TWO_FACTOR_TIMED_OUT_MESSAGE })
    await unsuspend(account.user.id)
    const [after] = await verifyWith(
      account.challenge,
      totpCodeAt(account.secret, nowSeconds() + TOTP_PERIOD_SECONDS)
    )
    expect(after).toMatchObject({ code: "BAD_REQUEST", message: TWO_FACTOR_TIMED_OUT_MESSAGE })
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })

  test("a challenge issued after the suspension (a racing sign-in) is refused directly", async () => {
    const account = await signUp(app)
    const secret = await enableTwoFactor(app, account.user.id)
    await suspend(account.user.id)
    await Bun.sleep(5)
    const challenge = newToken()
    await app.db.tokens.create({
      userId: account.user.id,
      purpose: "two_factor_challenge",
      tokenHash: tokenHash(challenge),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    // A wrong code answers as before; only the right one says why.
    const [wrong] = await verifyWith(challenge, "000000")
    expect(wrong).toMatchObject({ code: "UNAUTHORIZED", message: TWO_FACTOR_WRONG_CODE_MESSAGE })
    const [error] = await verifyWith(challenge, totpCodeAt(secret, nowSeconds()))
    expect(error).toMatchObject(suspended)
    expect(await liveSessions(app, account.user.id)).toBe(0)
    // The refusal rolled back: the challenge still answers the same, never a session.
    const [again] = await verifyWith(
      challenge,
      totpCodeAt(secret, nowSeconds() + TOTP_PERIOD_SECONDS)
    )
    expect(again).toMatchObject(suspended)
  })
})

describe("impersonation", () => {
  test("a suspended account cannot be impersonated", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    const [error] = await safe(
      root.client.admin.users.impersonate({ id: account.user.id, reason: "check their notes" })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: SUSPENDED_TARGET_MESSAGE })
  })

  test("an impersonation session of a suspended account is dead", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    const token = await rawSession(app, account.user.id, root.user.id)
    const [error] = await safe(clientFor(app, token).auth.me())
    expect(error).toMatchObject(signInRequired)
  })
})

describe("existing sessions", () => {
  test("refused by every procedure, as an expired one is", async () => {
    const account = await signUpWithWorkspace(app)
    await suspend(account.user.id)
    const token = await rawSession(app, account.user.id)
    const client = clientFor(app, token)
    const [me] = await safe(client.auth.me())
    expect(me).toMatchObject({ code: "UNAUTHORIZED", message: "Sign in required" })
    // Deleted on sight; a second raced session is refused by the next procedure just the same.
    const second = clientFor(app, await rawSession(app, account.user.id))
    const [notes] = await safe(second.notes.list({ workspaceId: account.workspaceId }))
    expect(notes).toMatchObject(signInRequired)
    const [signOut] = await safe(
      clientFor(app, await rawSession(app, account.user.id)).auth.signOut()
    )
    expect(signOut).toMatchObject(signInRequired)
    expect(await liveSessions(app, account.user.id)).toBe(0)
  })

  test("the events stream answers 401", async () => {
    const account = await signUpWithWorkspace(app)
    await suspend(account.user.id)
    const token = await rawSession(app, account.user.id)
    const stream = await openStream(app, { token, workspaceId: account.workspaceId })
    expect(stream.status).toBe(401)
  })

  test("a support request on one is anonymous", async () => {
    const account = await signUp(app)
    await suspend(account.user.id)
    const token = await rawSession(app, account.user.id)
    await clientFor(app, token).support.create({
      email: account.email,
      name: "",
      topic: "account",
      message: "Why was I suspended, please?",
      page: "",
    })
    const [row] = await app.db.sql`
      SELECT user_id FROM support_requests WHERE email = ${account.email}
    `
    expect(row.user_id).toBeNull()
  })
})

describe("expiry", () => {
  test("a suspension past its end date is not enforced (the api's clock)", async () => {
    const account = await signUp(app)
    const until = new Date(Date.now() + 60 * 60_000).toISOString()
    await suspend(account.user.id, until)
    const token = await rawSession(app, account.user.id)
    // Still in force: refused. (Fresh raced rows below: a refused one is deleted.)
    expect((await signIn(account.email))[0]).toMatchObject(suspended)
    offsetMs = 2 * 60 * 60_000
    try {
      const [error, result] = await signIn(account.email)
      expect(error).toBeNull()
      expect(signedIn(result as NonNullable<typeof result>).user.id).toBe(account.user.id)
      // `token` was never presented while the suspension held, so it was never deleted.
      expect((await clientFor(app, token).auth.me()).user.id).toBe(account.user.id)
    } finally {
      offsetMs = 0
    }
    // Back on the real clock it is in force again.
    expect((await signIn(account.email))[0]).toMatchObject(suspended)
  })
})

describe("the admin side reads the same clock", () => {
  const auditOf = async (userId: number) =>
    (await root.client.admin.audit.list({ targetType: "user", targetId: String(userId) })).items
  const mailCount = async (email: string) => {
    await app.drain()
    return app.mailer.sent.filter((m) => m.to === email).length
  }

  test("the detail and the suspended filter drop a suspension the api's clock has expired", async () => {
    const account = await signUp(app)
    await suspend(account.user.id, new Date(Date.now() + 60 * 60_000).toISOString())
    offsetMs = 2 * 60 * 60_000
    try {
      const detail = await root.client.admin.users.get({ id: account.user.id })
      expect(detail.suspended).toMatchObject({ active: false })
      const { items } = await root.client.admin.users.list({ suspended: "true", limit: 100 })
      expect(items.map((u) => u.id)).not.toContain(account.user.id)
    } finally {
      offsetMs = 0
    }
  })

  test("until is validated, and the suspension stamped, on the api's clock", async () => {
    const account = await signUp(app)
    offsetMs = 2 * 24 * 60 * 60_000
    try {
      // In the future by the system clock, already past by the api's.
      const [error] = await safe(
        suspend(account.user.id, new Date(Date.now() + 60 * 60_000).toISOString())
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      await suspend(account.user.id, new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString())
      const row = await app.db.users.find(account.user.id)
      expect(Date.parse(row?.suspended_at ?? "")).toBeGreaterThan(Date.now() + 24 * 60 * 60_000)
    } finally {
      offsetMs = 0
    }
  })

  test("re-suspending over an expired record is a fresh suspension: audited and mailed", async () => {
    const account = await signUp(app)
    await suspend(account.user.id, new Date(Date.now() + 60 * 60_000).toISOString())
    offsetMs = 2 * 60 * 60_000
    try {
      const before = await mailCount(account.email)
      await suspend(account.user.id, new Date(Date.now() + 3 * 60 * 60_000).toISOString())
      expect(await mailCount(account.email)).toBe(before + 1)
      expect((await auditOf(account.user.id))[0]).toMatchObject({ action: "user.suspended" })
    } finally {
      offsetMs = 0
    }
  })

  test("until is stored normalised, so the same instant written differently is no change", async () => {
    const account = await signUp(app)
    const instant = new Date(Math.floor(Date.now() / 1000) * 1000 + 60 * 60_000)
    const short = instant.toISOString().replace(".000Z", "Z")
    await suspend(account.user.id, short)
    expect((await app.db.users.find(account.user.id))?.suspended_until).toBe(instant.toISOString())
    const before = await mailCount(account.email)
    await suspend(account.user.id, instant.toISOString())
    expect(await mailCount(account.email)).toBe(before)
    expect((await auditOf(account.user.id))[0]).toMatchObject({ action: "user.suspension_updated" })
  })

  test("an end date exactly 365 days ahead is accepted; a millisecond more is not", async () => {
    // A frozen clock, so "now" is the same instant the test computes from.
    const fixed = new Date(Math.floor(Date.now() / 1000) * 1000)
    const own = await start({ superadminEmails: [ROOT], now: () => fixed })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUp(own)
      const edge = fixed.getTime() + 365 * 24 * 60 * 60_000
      const [tooFar] = await safe(
        rootOwn.client.admin.users.suspend({
          userId: target.user.id,
          reason: "testing",
          until: new Date(edge + 1).toISOString(),
        })
      )
      expect(tooFar).toMatchObject({ code: "BAD_REQUEST" })
      const until = new Date(edge).toISOString()
      expect(
        await rootOwn.client.admin.users.suspend({
          userId: target.user.id,
          reason: "testing",
          until,
        })
      ).toEqual({ ok: true })
      expect((await own.db.users.find(target.user.id))?.suspended_until).toBe(until)
    } finally {
      await own.stop()
    }
  })

  test("a target purged before the lock: NOT_FOUND, no mail, no audit row", async () => {
    const suspendTarget = await signUp(app)
    const unsuspendTarget = await signUp(app)
    await suspend(unsuspendTarget.user.id)
    for (const [account, run] of [
      [suspendTarget, suspend],
      [unsuspendTarget, unsuspend],
    ] as const) {
      const id = account.user.id
      const before = await mailCount(account.email)
      const auditBefore = (await auditOf(id)).length
      // The hourly purge lands between the handler's lookup and its transaction.
      const original = app.db.transaction
      app.db.transaction = async (fn) => {
        app.db.transaction = original
        await original((tx) => tx.users.purge(id, new Date().toISOString()))
        return original(fn)
      }
      try {
        const [error] = await safe(run(id))
        expect(error).toMatchObject({ code: "NOT_FOUND" })
      } finally {
        app.db.transaction = original
      }
      expect(await mailCount(account.email)).toBe(before)
      expect((await auditOf(id)).length).toBe(auditBefore)
    }
  })
})

/**
 * Holds the next `n` transactions at their very start until all `n` are open, so they really
 * overlap. Postgres only: on SQLite a second transaction cannot begin while the first is open.
 */
function overlapNextTransactions(a: App, n: number, timeoutMs = 5_000) {
  const original = a.db.transaction
  let arrived = 0
  let release = () => {}
  let abort = (_error: Error) => {}
  let timedOut: Error | undefined
  const allOpen = new Promise<void>((resolve, reject) => {
    release = resolve
    abort = reject
  })
  const timer = setTimeout(() => {
    timedOut = new Error(`overlapNextTransactions: only ${arrived} of ${n} opened`)
    a.db.transaction = original
    abort(timedOut)
  }, timeoutMs)
  allOpen.catch(() => {})
  a.db.transaction = (fn) => {
    arrived += 1
    if (arrived === n) {
      a.db.transaction = original
      clearTimeout(timer)
      release()
    }
    return original(async (tx) => {
      await allOpen
      return fn(tx)
    })
  }
  return () => {
    clearTimeout(timer)
    a.db.transaction = original
    if (timedOut) throw timedOut
  }
}

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("sign-in racing a suspension (Postgres)", () => {
  test("two-step verify and suspend in overlapping transactions: no usable session", async () => {
    for (let i = 0; i < 3; i++) {
      const account = await signUp(app)
      const secret = await enableTwoFactor(app, account.user.id)
      const [, challenged] = await signIn(account.email)
      if (!challenged || !isTwoFactorChallenge(challenged)) throw new Error("expected a challenge")
      const restore = overlapNextTransactions(app, 2)
      const [verified] = await Promise.all([
        safe(
          clientFor(app).auth.twoFactor.verify({
            challenge: challenged.twoFactor.challenge,
            code: totpCodeAt(secret, Math.floor(Date.now() / 1000)),
          })
        ),
        suspend(account.user.id),
      ])
      restore()
      const [error, result] = verified
      if (error) expect(["FORBIDDEN", "BAD_REQUEST"]).toContain((error as { code: string }).code)
      else {
        const [me] = await safe(clientFor(app, result.session.token).auth.me())
        expect(me).toMatchObject(signInRequired)
      }
      expect(await liveSessions(app, account.user.id)).toBe(0)
    }
  })

  test("password sign-ins racing a suspension: no usable session", async () => {
    for (let i = 0; i < 5; i++) {
      const account = await signUp(app)
      const [signedInResult] = await Promise.all([signIn(account.email), suspend(account.user.id)])
      const [error, result] = signedInResult
      if (error) expect(error).toMatchObject(suspended)
      else {
        const [me] = await safe(
          clientFor(app, signedIn(result as NonNullable<typeof result>).session.token).auth.me()
        )
        expect(me).toMatchObject(signInRequired)
      }
      // The sign-up's own session died with the suspension; a raced one died on sight.
      expect(await liveSessions(app, account.user.id)).toBe(0)
    }
  })
})
