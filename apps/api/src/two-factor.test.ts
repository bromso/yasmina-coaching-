import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { safe } from "@orpc/client"
import { decodeBase32IgnorePadding } from "@oslojs/encoding"
import {
  CONNECT_REAUTH_MESSAGE,
  IMPERSONATING_MESSAGE,
  isTwoFactorChallenge,
  SET_PASSWORD_REAUTH_MESSAGE,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_MESSAGE,
  TWO_FACTOR_REAUTH_REASON,
  TWO_FACTOR_VERIFY_EMAIL_MESSAGE,
} from "@repo/api-contract"
import {
  magicLinkSubject as MAGIC,
  resetPasswordSubject as RESET,
  twoFactorDisabledSubject,
  twoFactorEnabledSubject,
} from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { SQL } from "bun"
import { newToken, tokenHash } from "./credentials"
import { DEV_TWO_FACTOR_KEY } from "./env"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  providersWith,
  signUp,
  signUpVerified,
  start,
} from "./test-server"
import { generateRecoveryCodes } from "./two-factor/recovery"
import { encryptSecret } from "./two-factor/secret"
import { generateTotpSecret, TOTP_PERIOD_SECONDS, totpCodeAt } from "./two-factor/totp"

const PASSWORD = "correct horse battery"
const WRONG = "That code didn't work. Check your authenticator app and try again."
const TIMED_OUT = "Your sign-in timed out. Sign in again."

const nowSeconds = () => Math.floor(Date.now() / 1000)
/** The code an authenticator app would show right now for a `setup()`-returned base32 secret. */
const codeFor = (secretBase32: string) =>
  totpCodeAt(decodeBase32IgnorePadding(secretBase32), nowSeconds())

/**
 * Successive codes for one secret, one TOTP step apart: replay protection refuses the same step
 * twice, so a test that confirms setup and then immediately disables (or regenerates) needs a
 * fresh step each time, not the instant-replay `codeFor` would produce.
 */
function codeSequence(secretBase32: string) {
  const bytes = decodeBase32IgnorePadding(secretBase32)
  let step = nowSeconds()
  return () => {
    const code = totpCodeAt(bytes, step)
    step += TOTP_PERIOD_SECONDS
    return code
  }
}

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

/**
 * A server on a tempfile SQLite database plus a raw connection to the same file, so a test can
 * reach past the api's own queries — re-opening a consumed challenge, or back-dating a session's
 * `created_at` to test the re-auth window.
 */
async function withRawDatabase(
  options: Parameters<typeof start>[0],
  fn: (own: typeof app, raw: SQL) => Promise<void>
) {
  const dir = mkdtempSync(join(tmpdir(), "two-factor-revoked-"))
  const databaseUrl = `sqlite://${join(dir, "t.db")}`
  const own = await start({ ...options, databaseUrl })
  const raw = new SQL(databaseUrl)
  try {
    await fn(own, raw)
  } finally {
    await own.stop()
    await raw.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const sessionCount = async (a: typeof app, userId: number) =>
  (await a.db.sessions.listForUser(userId, new Date().toISOString())).length

/** A 2FA account and a fresh sign-in challenge for it. */
async function challenged(a: typeof app = app) {
  const account = await signUp(a)
  const secret = await enableTwoFactor(a, account.user.id)
  const result = await clientFor(a).auth.signIn({ email: account.email, password: PASSWORD })
  if (!isTwoFactorChallenge(result)) throw new Error("expected a two-factor challenge")
  return { ...account, secret, challenge: result.twoFactor.challenge }
}

const verifyWith = (a: typeof app, challenge: string, code: string) =>
  safe(clientFor(a).auth.twoFactor.verify({ challenge, code }))

describe("the challenge replaces the session", () => {
  test("a non-2FA account still gets a session straight from signIn", async () => {
    const { email } = await signUp(app)
    const result = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    expect(isTwoFactorChallenge(result)).toBe(false)
    expect(result).toHaveProperty("session.token")
  })

  test("signIn answers a challenge and creates no session", async () => {
    const { email, user } = await signUp(app)
    await enableTwoFactor(app, user.id)
    const before = await sessionCount(app, user.id)
    const result = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    expect(isTwoFactorChallenge(result)).toBe(true)
    expect(result).not.toHaveProperty("session")
    if (!isTwoFactorChallenge(result)) return
    expect(result.twoFactor.challenge.length).toBeGreaterThan(20)
    const ttl = Date.parse(result.twoFactor.expiresAt) - Date.now()
    expect(ttl).toBeGreaterThan(4 * 60_000)
    expect(ttl).toBeLessThanOrEqual(5 * 60_000)
    expect(await sessionCount(app, user.id)).toBe(before)
  })

  test("a wrong password is still UNAUTHORIZED, never a challenge", async () => {
    const { email, user } = await signUp(app)
    await enableTwoFactor(app, user.id)
    const [err] = await safe(clientFor(app).auth.signIn({ email, password: "nope nope nope" }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" })
  })

  test("magic-link consume answers a challenge and creates no session", async () => {
    const { email, user } = await signUpVerified(app)
    await enableTwoFactor(app, user.id)
    await clientFor(app).auth.magicLink.request({ email })
    const [mail] = await mailsTo(app, email, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const before = await sessionCount(app, user.id)
    const result = await clientFor(app).auth.magicLink.consume({ token })
    expect(isTwoFactorChallenge(result)).toBe(true)
    expect(await sessionCount(app, user.id)).toBe(before)
  })

  test("purge still clears a 2FA row on an unverified account (defense in depth)", async () => {
    // setup/enable refuse an unverified account, so this row can only be set directly.
    const { email, user } = await signUp(app)
    await enableTwoFactor(app, user.id)
    await clientFor(app).auth.magicLink.request({ email })
    const [mail] = await mailsTo(app, email, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const result = await clientFor(app).auth.magicLink.consume({ token })
    expect(isTwoFactorChallenge(result)).toBe(false)
    expect((await app.db.users.find(user.id))?.two_factor_enabled_at).toBeNull()
  })

  test("an OAuth sign-in answers a challenge, by email link and by known identity", async () => {
    const email = "twofactor-google@example.com"
    const own = await start({
      providers: providersWith({
        google: { providerUserId: "g-2fa", email, emailVerified: true, name: "G" },
      }),
    })
    try {
      const { user } = await signUpVerified(own, email)
      const secret = await enableTwoFactor(own, user.id)
      const before = await sessionCount(own, user.id)
      const first = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      expect(isTwoFactorChallenge(first)).toBe(true)
      const again = await clientFor(own).auth.oauth.callback({ provider: "google", code: "c" })
      expect(isTwoFactorChallenge(again)).toBe(true)
      expect(await sessionCount(own, user.id)).toBe(before)
      if (!isTwoFactorChallenge(again)) return
      const [err, ok] = await verifyWith(
        own,
        again.twoFactor.challenge,
        totpCodeAt(secret, nowSeconds())
      )
      expect(err).toBeNull()
      expect(ok?.user.id).toBe(user.id)
    } finally {
      await own.stop()
    }
  })

  test("connecting a provider while signed in is unaffected", async () => {
    const own = await start({
      providers: providersWith({
        github: {
          providerUserId: "gh-2fa",
          email: "elsewhere@example.com",
          emailVerified: true,
          name: "GH",
        },
      }),
    })
    try {
      const me = await signUp(own)
      await enableTwoFactor(own, me.user.id)
      const result = await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      expect(isTwoFactorChallenge(result)).toBe(false)
      expect(result).toMatchObject({ user: { id: me.user.id } })
      const identities = await me.client.account.identities.list()
      expect(identities.items.map((i) => i.provider)).toEqual(["github"])
    } finally {
      await own.stop()
    }
  })
})

describe("auth.twoFactor.verify", () => {
  test("the right TOTP code issues a session that works", async () => {
    const { challenge, secret, user } = await challenged()
    const before = await sessionCount(app, user.id)
    const [err, result] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds()))
    expect(err).toBeNull()
    expect(result?.user.id).toBe(user.id)
    expect(await sessionCount(app, user.id)).toBe(before + 1)
    const me = await clientFor(app, result?.session.token).auth.me()
    expect(me.user.id).toBe(user.id)
  })

  test("a code with spaces in it is accepted, and the client info lands on the session", async () => {
    const { challenge, secret, user, client } = await challenged()
    const code = totpCodeAt(secret, nowSeconds())
    const [err, result] = await safe(
      clientFor(app).auth.twoFactor.verify({
        challenge,
        code: ` ${code.slice(0, 3)} ${code.slice(3)} `,
        client: { userAgent: "TwoFactorBrowser/1.0" },
      })
    )
    expect(err).toBeNull()
    expect(result?.user.id).toBe(user.id)
    const sessions = await client.account.sessions.list()
    expect(sessions.items.some((s) => s.userAgent === "TwoFactorBrowser/1.0")).toBe(true)
  })

  test("a challenge is single use", async () => {
    const { challenge, secret } = await challenged()
    const [first] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds()))
    expect(first).toBeNull()
    const [second] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds() + 30))
    expect(second).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("a code from before the accepted step is refused (replay)", async () => {
    const c = await challenged()
    expect((await verifyWith(app, c.challenge, totpCodeAt(c.secret, nowSeconds())))[0]).toBeNull()
    const next = await clientFor(app).auth.signIn({ email: c.email, password: PASSWORD })
    if (!isTwoFactorChallenge(next)) throw new Error("expected a challenge")
    const earlier = totpCodeAt(c.secret, nowSeconds() - 30)
    const [err] = await verifyWith(app, next.twoFactor.challenge, earlier)
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })

  test("reusing the exact accepted code is UNAUTHORIZED", async () => {
    const c = await challenged()
    const code = totpCodeAt(c.secret, nowSeconds())
    expect((await verifyWith(app, c.challenge, code))[0]).toBeNull()
    const next = await clientFor(app).auth.signIn({ email: c.email, password: PASSWORD })
    if (!isTwoFactorChallenge(next)) throw new Error("expected a challenge")
    const [err] = await verifyWith(app, next.twoFactor.challenge, code)
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })

  test("five wrong codes burn the challenge", async () => {
    const { challenge, secret, user } = await challenged()
    const before = await sessionCount(app, user.id)
    for (let i = 0; i < 4; i++) {
      const [err] = await verifyWith(app, challenge, "000000")
      expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    }
    const [fifth] = await verifyWith(app, challenge, "000000")
    expect(fifth).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
    const [after] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds()))
    expect(after).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
    expect(await sessionCount(app, user.id)).toBe(before)
  })

  test("an expired or unknown challenge is BAD_REQUEST", async () => {
    const { user, secret } = await challenged()
    const expired = newToken()
    await app.db.tokens.create({
      userId: user.id,
      purpose: "two_factor_challenge",
      tokenHash: tokenHash(expired),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const code = totpCodeAt(secret, nowSeconds())
    expect((await verifyWith(app, expired, code))[0]).toMatchObject({
      code: "BAD_REQUEST",
      message: TIMED_OUT,
    })
    expect((await verifyWith(app, newToken(), code))[0]).toMatchObject({
      code: "BAD_REQUEST",
      message: TIMED_OUT,
    })
  })

  test("a token of another purpose is not a challenge", async () => {
    const { user, secret } = await challenged()
    const other = newToken()
    await app.db.tokens.create({
      userId: user.id,
      purpose: "magic_link",
      tokenHash: tokenHash(other),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const [err] = await verifyWith(app, other, totpCodeAt(secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a recovery code works once", async () => {
    const { user, email, challenge } = await challenged()
    const [code] = generateRecoveryCodes(1)
    if (!code) throw new Error("no code")
    await app.db.twoFactor.replaceRecoveryCodes(user.id, [tokenHash(code)])
    // Upper case and without the dash still names the same code.
    const [err, ok] = await verifyWith(app, challenge, code.toUpperCase().replace("-", ""))
    expect(err).toBeNull()
    expect(ok?.user.id).toBe(user.id)
    expect(await app.db.twoFactor.recoveryCodesLeft(user.id)).toBe(0)
    const next = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    if (!isTwoFactorChallenge(next)) throw new Error("expected a challenge")
    const [again] = await verifyWith(app, next.twoFactor.challenge, code)
    expect(again).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })

  test("a challenge for an account whose 2FA was turned off since is dead", async () => {
    const { user, secret, challenge } = await challenged()
    await app.db.twoFactor.disable(user.id)
    const [err] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("the per-user limiter caps attempts across challenges", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { email, secret } = await challenged(own)
      const fresh = async () => {
        const r = await clientFor(own).auth.signIn({ email, password: PASSWORD })
        if (!isTwoFactorChallenge(r)) throw new Error("expected a challenge")
        return r.twoFactor.challenge
      }
      expect((await verifyWith(own, await fresh(), "000000"))[0]).toMatchObject({
        code: "UNAUTHORIZED",
      })
      expect((await verifyWith(own, await fresh(), "000000"))[0]).toMatchObject({
        code: "UNAUTHORIZED",
      })
      const [err] = await verifyWith(own, await fresh(), totpCodeAt(secret, nowSeconds()))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("a correct code never spends the verify budget", async () => {
    // limit 2: two right codes in a row, on two challenges, both sign in. A success must never
    // spend the budget — today those two successes alone exhaust it, so a third attempt right
    // after (even a wrong code, on its own fresh challenge) is already TOO_MANY_REQUESTS instead
    // of being checked on its own merits.
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { email, secret } = await challenged(own)
      const fresh = async () => {
        const r = await clientFor(own).auth.signIn({ email, password: PASSWORD })
        if (!isTwoFactorChallenge(r)) throw new Error("expected a challenge")
        return r.twoFactor.challenge
      }
      const [first] = await verifyWith(own, await fresh(), totpCodeAt(secret, nowSeconds()))
      expect(first).toBeNull()
      const [second] = await verifyWith(own, await fresh(), totpCodeAt(secret, nowSeconds() + 30))
      expect(second).toBeNull()
      const [third] = await verifyWith(own, await fresh(), "000000")
      expect(third).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    } finally {
      await own.stop()
    }
  })

  test("a parallel burst of wrong codes is checked only up to the budget", async () => {
    // limit 3, 8 wrong codes at once (each on its own challenge, so the per-challenge burn of 5
    // plays no part): a peek-then-spend budget let every one of them through to the code check;
    // the reservation lets exactly 3 be checked and refuses the rest.
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
    })
    try {
      const { email } = await challenged(own)
      const challenges = await Promise.all(
        Array.from({ length: 8 }, async () => {
          const r = await clientFor(own).auth.signIn({ email, password: PASSWORD })
          if (!isTwoFactorChallenge(r)) throw new Error("expected a challenge")
          return r.twoFactor.challenge
        })
      )
      const results = await Promise.all(challenges.map((c) => verifyWith(own, c, "000000")))
      const codes = results.map(([err]) => (err as { code?: string } | null)?.code)
      expect(codes.filter((code) => code === "UNAUTHORIZED")).toHaveLength(3)
      expect(codes.filter((code) => code === "TOO_MANY_REQUESTS")).toHaveLength(5)
    } finally {
      await own.stop()
    }
  })

  test("after `limit` wrong codes the next verify is refused before the code is checked", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { email, secret } = await challenged(own)
      const fresh = async () => {
        const r = await clientFor(own).auth.signIn({ email, password: PASSWORD })
        if (!isTwoFactorChallenge(r)) throw new Error("expected a challenge")
        return r.twoFactor.challenge
      }
      expect((await verifyWith(own, await fresh(), "000000"))[0]).toMatchObject({
        code: "UNAUTHORIZED",
      })
      expect((await verifyWith(own, await fresh(), "000000"))[0]).toMatchObject({
        code: "UNAUTHORIZED",
      })
      // Budget exhausted by two wrong codes: the next attempt is refused before even the right
      // code is looked at.
      const [err] = await verifyWith(own, await fresh(), totpCodeAt(secret, nowSeconds()))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("management calls do not spend the sign-in budget", async () => {
    // limit 2: two wrong codes to account.twoFactor.disable must not touch the sign-in budget —
    // today they share one key, so the sign-in challenge below would also be TOO_MANY_REQUESTS.
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { client, user, email } = await signUp(own)
      const secret = await enableTwoFactor(own, user.id)
      await safe(client.account.twoFactor.disable({ code: "000000" }))
      await safe(client.account.twoFactor.disable({ code: "000000" }))
      const result = await clientFor(own).auth.signIn({ email, password: PASSWORD })
      if (!isTwoFactorChallenge(result)) throw new Error("expected a challenge")
      const [err, ok] = await verifyWith(
        own,
        result.twoFactor.challenge,
        totpCodeAt(secret, nowSeconds())
      )
      expect(err).toBeNull()
      expect(ok?.user.id).toBe(user.id)
    } finally {
      await own.stop()
    }
  })

  test("input outside the schema is refused before anything is checked", async () => {
    const [err] = await verifyWith(app, "x", "12345")
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("another user's TOTP code or recovery code does not pass this user's challenge", async () => {
    const a = await challenged()
    const b = await challenged()
    const [wrongTotp] = await verifyWith(app, a.challenge, totpCodeAt(b.secret, nowSeconds()))
    expect(wrongTotp).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    const [codeB] = generateRecoveryCodes(1)
    if (!codeB) throw new Error("no code")
    await app.db.twoFactor.replaceRecoveryCodes(b.user.id, [tokenHash(codeB)])
    const [wrongRecovery] = await verifyWith(app, a.challenge, codeB)
    expect(wrongRecovery).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    // a's challenge survived both wrong attempts and still verifies with a's own code.
    const [ok] = await verifyWith(app, a.challenge, totpCodeAt(a.secret, nowSeconds()))
    expect(ok).toBeNull()
  })

  test("a stored secret the key cannot decrypt is UNAUTHORIZED, not a crash", async () => {
    const { user, email } = await signUp(app)
    const secret = "v1:not-valid-base64:also-not-valid"
    await app.db.twoFactor.setPendingSecret(user.id, secret)
    await app.db.twoFactor.enable(user.id, secret, new Date().toISOString(), [])
    const result = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    if (!isTwoFactorChallenge(result)) throw new Error("expected a challenge")
    const [err] = await verifyWith(app, result.twoFactor.challenge, "000000")
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })
})

describe("a challenge does not survive a password reset", () => {
  test("a challenge obtained before resetPassword no longer verifies after it", async () => {
    const c = await challenged()
    await clientFor(app).auth.requestPasswordReset({ email: c.email })
    const [mail] = await mailsTo(app, c.email, RESET)
    const token = mail?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    await clientFor(app).auth.resetPassword({ token, password: "another horse battery" })
    const [err] = await verifyWith(app, c.challenge, totpCodeAt(c.secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })
})

describe("OAuth while signed in never challenges, and never touches another account", () => {
  test("connecting a provider while signed in creates no session for anyone else", async () => {
    const own = await start({
      providers: providersWith({
        github: {
          providerUserId: "gh-isolated",
          email: "bystander-2fa@example.com",
          emailVerified: true,
          name: "GH",
        },
      }),
    })
    try {
      const bystander = await signUp(own, "bystander-2fa@example.com")
      const before = await sessionCount(own, bystander.user.id)
      const me = await signUp(own)
      const result = await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      // The result is for the signed-in caller, not whoever already owns that email address.
      expect(isTwoFactorChallenge(result)).toBe(false)
      expect(result).toMatchObject({ user: { id: me.user.id } })
      expect(await sessionCount(own, bystander.user.id)).toBe(before)
    } finally {
      await own.stop()
    }
  })

  test("connecting a provider while signed in keeps the caller's own session, minting none", async () => {
    // A fresh session would reset the re-auth window (REAUTH_WINDOW_MS) for a stolen cookie.
    const own = await start({
      providers: providersWith({
        github: {
          providerUserId: "gh-keep-session",
          email: "keep-session-elsewhere@example.com",
          emailVerified: true,
          name: "GH",
        },
      }),
    })
    try {
      const me = await signUp(own)
      const at = () => new Date().toISOString()
      const [before] = await own.db.sessions.listForUser(me.user.id, at())
      if (!before) throw new Error("expected the sign-up session")
      const result = await me.client.auth.oauth.callback({ provider: "github", code: "c" })
      if (isTwoFactorChallenge(result)) throw new Error("expected a session")
      expect(result.session.token).toBe(me.token)
      const after = await own.db.sessions.listForUser(me.user.id, at())
      expect(after).toHaveLength(1)
      expect(after[0]?.id).toBe(before.id)
      expect(after[0]?.created_at).toBe(before.created_at)
      expect(result.session.expiresAt).toBe(before.expires_at)
    } finally {
      await own.stop()
    }
  })

  test("connecting a provider needs a session under 10 minutes old, at start and callback", async () => {
    const github = {
      providerUserId: "gh-reauth-connect",
      email: "reauth-connect-elsewhere@example.com",
      emailVerified: false,
      name: "GH",
    }
    await withRawDatabase({ providers: providersWith({ github }) }, async (own, raw) => {
      const old = await signUp(own)
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString()
      await raw`UPDATE sessions SET created_at = ${elevenMinutesAgo} WHERE user_id = ${old.user.id}`
      const refused = {
        code: "FORBIDDEN",
        message: CONNECT_REAUTH_MESSAGE,
        data: { reason: TWO_FACTOR_REAUTH_REASON },
      }
      // Refused before the browser is sent to the provider…
      const [atStart] = await safe(old.client.auth.oauth.start({ provider: "github" }))
      expect(atStart).toMatchObject(refused)
      // …and again at the callback, with no identity written.
      const [atCallback] = await safe(
        old.client.auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(atCallback).toMatchObject(refused)
      expect(await own.db.identities.findForUserProvider(old.user.id, "github")).toBeUndefined()

      // A fresh session connects.
      const fresh = await signUp(own)
      const started = await fresh.client.auth.oauth.start({ provider: "github" })
      expect(started.url.length).toBeGreaterThan(0)
      const result = await fresh.client.auth.oauth.callback({ provider: "github", code: "c" })
      expect(result).toMatchObject({ user: { id: fresh.user.id } })
      expect(await own.db.identities.findForUserProvider(fresh.user.id, "github")).toBeDefined()

      // A signed-out browser is unaffected: starting needs no session at all.
      const anonymous = await clientFor(own).auth.oauth.start({ provider: "github" })
      expect(anonymous.url.length).toBeGreaterThan(0)
    })
  })

  test("a known identity signing in while already signed in as its owner needs no challenge", async () => {
    const own = await start({
      providers: providersWith({
        google: {
          providerUserId: "g-reconfirm",
          email: "reconfirm-2fa@example.com",
          emailVerified: true,
          name: "G",
        },
      }),
    })
    try {
      const me = await signUp(own)
      await enableTwoFactor(own, me.user.id)
      // First callback links the identity (the "connect" branch; no challenge, a session already exists).
      await me.client.auth.oauth.callback({ provider: "google", code: "c1" })
      // Second callback: now a known identity, still signed in as its owner.
      const result = await me.client.auth.oauth.callback({ provider: "google", code: "c2" })
      expect(isTwoFactorChallenge(result)).toBe(false)
      expect(result).toMatchObject({ user: { id: me.user.id } })
    } finally {
      await own.stop()
    }
  })
})

describe("sign-up and impersonation never challenge", () => {
  test("sign-up returns a session", async () => {
    const result = await clientFor(app).auth.signUp({
      email: "fresh-2fa@example.com",
      password: PASSWORD,
    })
    expect(result.session.token.length).toBeGreaterThan(20)
  })

  test("a superadmin impersonating a 2FA account gets a session", async () => {
    const root = "root-2fa@example.com"
    const own = await start({ superadminEmails: [root] })
    try {
      const admin = await signUpVerified(own, root)
      const target = await signUp(own)
      await enableTwoFactor(own, target.user.id)
      const { token } = await admin.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support",
      })
      expect((await clientFor(own, token).auth.me()).user.id).toBe(target.user.id)
    } finally {
      await own.stop()
    }
  })
})

describe("account.twoFactor", () => {
  test("an unverified account cannot start or enable setup", async () => {
    const { client, user } = await signUp(app)
    const [setupErr] = await safe(client.account.twoFactor.setup({ currentPassword: PASSWORD }))
    expect(setupErr).toMatchObject({ code: "FORBIDDEN", message: TWO_FACTOR_VERIFY_EMAIL_MESSAGE })
    // Even with a pending secret planted directly, enable refuses before looking at the code.
    const secret = generateTotpSecret()
    await app.db.twoFactor.setPendingSecret(
      user.id,
      await encryptSecret(secret, DEV_TWO_FACTOR_KEY)
    )
    const [enableErr] = await safe(
      client.account.twoFactor.enable({ code: totpCodeAt(secret, nowSeconds()) })
    )
    expect(enableErr).toMatchObject({ code: "FORBIDDEN", message: TWO_FACTOR_VERIFY_EMAIL_MESSAGE })
    expect(await client.account.twoFactor.get()).toEqual({ enabled: false, recoveryCodesLeft: 0 })
  })

  test("setup then enable with the right code turns it on with 10 unique recovery codes", async () => {
    const { client } = await signUpVerified(app)
    expect(await client.account.twoFactor.get()).toEqual({ enabled: false, recoveryCodesLeft: 0 })
    const { secret, otpauthUrl } = await client.account.twoFactor.setup({
      currentPassword: PASSWORD,
    })
    expect(otpauthUrl).toContain("otpauth://totp/")
    const { recoveryCodes } = await client.account.twoFactor.enable({ code: codeFor(secret) })
    expect(recoveryCodes).toHaveLength(10)
    expect(new Set(recoveryCodes).size).toBe(10)
    expect(await client.account.twoFactor.get()).toEqual({
      enabled: true,
      recoveryCodesLeft: 10,
    })
  })

  test("enable with a wrong code is refused and leaves it disabled", async () => {
    const { client } = await signUpVerified(app)
    await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const [err] = await safe(client.account.twoFactor.enable({ code: "000000" }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    expect(await client.account.twoFactor.get()).toEqual({ enabled: false, recoveryCodesLeft: 0 })
  })

  test("setup again while pending replaces the secret", async () => {
    const { client } = await signUpVerified(app)
    const first = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const second = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    expect(second.secret).not.toBe(first.secret)
    const [err] = await safe(client.account.twoFactor.enable({ code: codeFor(first.secret) }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    const ok = await client.account.twoFactor.enable({ code: codeFor(second.secret) })
    expect(ok.recoveryCodes).toHaveLength(10)
  })

  test("setup while enabled is a conflict", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    await client.account.twoFactor.enable({ code: codeFor(secret) })
    const [err] = await safe(client.account.twoFactor.setup({ currentPassword: PASSWORD }))
    expect(err).toMatchObject({ code: "CONFLICT" })
  })

  test("enable while already enabled is a conflict", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const code = codeSequence(secret)
    await client.account.twoFactor.enable({ code: code() })
    const [err] = await safe(client.account.twoFactor.enable({ code: code() }))
    expect(err).toMatchObject({ code: "CONFLICT" })
  })

  test("enable without a pending secret is a bad request", async () => {
    const { client } = await signUpVerified(app)
    const [err] = await safe(client.account.twoFactor.enable({ code: "123456" }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("enable accepts only a TOTP code — a recovery-code-shaped string is refused", async () => {
    const { client } = await signUpVerified(app)
    await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const [fakeRecovery] = generateRecoveryCodes(1)
    if (!fakeRecovery) throw new Error("no code")
    const [err] = await safe(client.account.twoFactor.enable({ code: fakeRecovery }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })

  test("disable and regenerateRecoveryCodes both refuse when 2FA is not on", async () => {
    const { client } = await signUpVerified(app)
    const [disableErr] = await safe(client.account.twoFactor.disable({ code: "000000" }))
    expect(disableErr).toMatchObject({ code: "CONFLICT" })
    const [regenErr] = await safe(
      client.account.twoFactor.regenerateRecoveryCodes({ code: "000000" })
    )
    expect(regenErr).toMatchObject({ code: "CONFLICT" })
  })

  test("regenerateRecoveryCodes while only pending (setup, not yet enabled) is refused", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const [err] = await safe(
      client.account.twoFactor.regenerateRecoveryCodes({ code: codeFor(secret) })
    )
    expect(err).toMatchObject({ code: "CONFLICT" })
  })

  test("repeated wrong disable attempts trip the per-user limiter (brute force with a stolen session)", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 10, windowMs: 60_000 }),
    })
    try {
      const { client, user } = await signUp(own)
      await enableTwoFactor(own, user.id)
      for (let i = 0; i < 10; i++) {
        const [err] = await safe(client.account.twoFactor.disable({ code: "000000" }))
        expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
      }
      const [eleventh] = await safe(client.account.twoFactor.disable({ code: "000000" }))
      expect(eleventh).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("disable without a valid code is refused; a TOTP code is accepted", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const code = codeSequence(secret)
    await client.account.twoFactor.enable({ code: code() })
    const [err] = await safe(client.account.twoFactor.disable({ code: "000000" }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
    expect((await client.account.twoFactor.get()).enabled).toBe(true)
    await client.account.twoFactor.disable({ code: code() })
    expect(await client.account.twoFactor.get()).toEqual({ enabled: false, recoveryCodesLeft: 0 })
  })

  test("disable also accepts a recovery code", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const { recoveryCodes } = await client.account.twoFactor.enable({ code: codeFor(secret) })
    const [first] = recoveryCodes
    if (!first) throw new Error("no code")
    await client.account.twoFactor.disable({ code: first })
    expect((await client.account.twoFactor.get()).enabled).toBe(false)
  })

  test("a disable mid-challenge kills the challenge: it is not left in `verify`-able limbo", async () => {
    const { client, email } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const code = codeSequence(secret)
    await client.account.twoFactor.enable({ code: code() })
    const challenge = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    if (!isTwoFactorChallenge(challenge)) throw new Error("expected a challenge")
    await client.account.twoFactor.disable({ code: code() })
    const [err] = await verifyWith(app, challenge.twoFactor.challenge, code())
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("regenerateRecoveryCodes replaces the set; an old code stops working", async () => {
    const { client } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const code = codeSequence(secret)
    const { recoveryCodes: original } = await client.account.twoFactor.enable({ code: code() })
    const { recoveryCodes: fresh } = await client.account.twoFactor.regenerateRecoveryCodes({
      code: code(),
    })
    expect(fresh).not.toEqual(original)
    const [first] = original
    if (!first) throw new Error("no code")
    const [err] = await safe(client.account.twoFactor.disable({ code: first }))
    expect(err).toMatchObject({ code: "UNAUTHORIZED", message: WRONG })
  })

  test("enable and disable each send their notice mail", async () => {
    const { client, email } = await signUpVerified(app)
    const { secret } = await client.account.twoFactor.setup({ currentPassword: PASSWORD })
    const code = codeSequence(secret)
    await client.account.twoFactor.enable({ code: code() })
    await mailsTo(app, email, twoFactorEnabledSubject)
    await client.account.twoFactor.disable({ code: code() })
    await mailsTo(app, email, twoFactorDisabledSubject)
  })

  test("an impersonation session is refused on every write, but may still read", async () => {
    const own = await start({ superadminEmails: ["root-2fa-manage@example.com"] })
    try {
      const root = await signUpVerified(own, "root-2fa-manage@example.com")
      const target = await signUp(own)
      const { token } = await root.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support ticket",
      })
      const asTarget = clientFor(own, token)
      await expect(asTarget.account.twoFactor.get()).resolves.toEqual({
        enabled: false,
        recoveryCodesLeft: 0,
      })
      const writes: Array<() => Promise<unknown>> = [
        () => asTarget.account.twoFactor.setup({ currentPassword: PASSWORD }),
        () => asTarget.account.twoFactor.enable({ code: "000000" }),
        () => asTarget.account.twoFactor.disable({ code: "000000" }),
        () => asTarget.account.twoFactor.regenerateRecoveryCodes({ code: "000000" }),
      ]
      for (const write of writes) {
        const [err] = await safe(write())
        expect(err).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
      }
    } finally {
      await own.stop()
    }
  })
})

describe("setup re-checks who is asking", () => {
  const CURRENT_PASSWORD_INCORRECT = "Current password is incorrect"

  /** A fresh, passwordless, verified account: a magic link to an unknown address creates one. */
  async function passwordlessUser(a: typeof app, email: string) {
    await clientFor(a).auth.magicLink.request({ email })
    const [mail] = await mailsTo(a, email, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const result = await clientFor(a).auth.magicLink.consume({ token })
    if (isTwoFactorChallenge(result)) throw new Error("expected a session")
    return {
      user: result.user,
      token: result.session.token,
      client: clientFor(a, result.session.token),
      email,
    }
  }

  test("setup needs the current password on an account that has one", async () => {
    const { client } = await signUpVerified(app)
    const [none] = await safe(client.account.twoFactor.setup({}))
    expect(none).toMatchObject({
      code: "UNAUTHORIZED",
      message: CURRENT_PASSWORD_INCORRECT,
      data: { reason: TWO_FACTOR_PASSWORD_REASON },
    })
    const [wrong] = await safe(client.account.twoFactor.setup({ currentPassword: "wrong" }))
    expect(wrong).toMatchObject({
      code: "UNAUTHORIZED",
      message: CURRENT_PASSWORD_INCORRECT,
      data: { reason: TWO_FACTOR_PASSWORD_REASON },
    })
    const { secret, otpauthUrl } = await client.account.twoFactor.setup({
      currentPassword: PASSWORD,
    })
    expect(secret.length).toBeGreaterThan(0)
    expect(otpauthUrl).toContain("otpauth://totp/")
  })

  test("a wrong setup password spends the management budget", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const { client } = await signUpVerified(own)
      for (let i = 0; i < 2; i++) {
        const [err] = await safe(client.account.twoFactor.setup({ currentPassword: "wrong" }))
        expect(err).toMatchObject({ code: "UNAUTHORIZED" })
      }
      const [third] = await safe(client.account.twoFactor.setup({ currentPassword: PASSWORD }))
      expect(third).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("a passwordless account needs a session under 10 minutes old", async () => {
    await withRawDatabase({}, async (own, raw) => {
      const fresh = await passwordlessUser(own, "passwordless-2fa@example.com")
      const { secret } = await fresh.client.account.twoFactor.setup({})
      expect(secret.length).toBeGreaterThan(0)

      const old = await passwordlessUser(own, "passwordless-2fa-old@example.com")
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString()
      await raw`UPDATE sessions SET created_at = ${elevenMinutesAgo} WHERE user_id = ${old.user.id}`
      const [err] = await safe(old.client.account.twoFactor.setup({}))
      expect(err).toMatchObject({
        code: "FORBIDDEN",
        message: TWO_FACTOR_REAUTH_MESSAGE,
        data: { reason: TWO_FACTOR_REAUTH_REASON },
      })

      const young = await passwordlessUser(own, "passwordless-2fa-young@example.com")
      const nineMinutesAgo = new Date(Date.now() - 9 * 60_000).toISOString()
      await raw`UPDATE sessions SET created_at = ${nineMinutesAgo} WHERE user_id = ${young.user.id}`
      const ok = await young.client.account.twoFactor.setup({})
      expect(ok.secret.length).toBeGreaterThan(0)
    })
  })

  test("setPassword on a passwordless account needs a session under 10 minutes old", async () => {
    // Otherwise an old, stolen session would set a password, then pass setup's password check.
    await withRawDatabase({}, async (own, raw) => {
      const fresh = await passwordlessUser(own, "passwordless-set@example.com")
      await fresh.client.account.setPassword({ password: "a fresh horse battery" })
      expect((await fresh.client.auth.me()).user.hasPassword).toBe(true)

      const old = await passwordlessUser(own, "passwordless-set-old@example.com")
      const elevenMinutesAgo = new Date(Date.now() - 11 * 60_000).toISOString()
      await raw`UPDATE sessions SET created_at = ${elevenMinutesAgo} WHERE user_id = ${old.user.id}`
      const [err] = await safe(old.client.account.setPassword({ password: "a stolen horse" }))
      expect(err).toMatchObject({
        code: "FORBIDDEN",
        message: SET_PASSWORD_REAUTH_MESSAGE,
        data: { reason: TWO_FACTOR_REAUTH_REASON },
      })
      expect((await old.client.auth.me()).user.hasPassword).toBe(false)
      // And so setup stays out of reach too.
      const [setup] = await safe(
        old.client.account.twoFactor.setup({ currentPassword: "a stolen horse" })
      )
      expect(setup).toMatchObject({ code: "FORBIDDEN", data: { reason: TWO_FACTOR_REAUTH_REASON } })
    })
  })

  test("a passwordless account's currentPassword is ignored", async () => {
    const fresh = await passwordlessUser(app, "passwordless-2fa-ignored@example.com")
    const { secret } = await fresh.client.account.twoFactor.setup({ currentPassword: "anything" })
    expect(secret.length).toBeGreaterThan(0)
  })
})

describe("a pending challenge does not survive the account changing hands", () => {
  /** A live challenge row for `userId`, as signIn / magic link / OAuth would have left it. */
  async function plantChallenge(a: typeof app, userId: number) {
    const challenge = newToken()
    await a.db.tokens.create({
      userId,
      purpose: "two_factor_challenge",
      tokenHash: tokenHash(challenge),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    return challenge
  }

  test("account.changePassword kills it", async () => {
    const c = await challenged()
    await c.client.account.changePassword({
      currentPassword: PASSWORD,
      newPassword: "another horse battery",
    })
    const [err] = await verifyWith(app, c.challenge, totpCodeAt(c.secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("account.setPassword kills it", async () => {
    const { client, user } = await signUp(app)
    const secret = await enableTwoFactor(app, user.id)
    await app.db.users.update(user.id, { passwordHash: null })
    const challenge = await plantChallenge(app, user.id)
    await client.account.setPassword({ password: "another horse battery" })
    const [err] = await verifyWith(app, challenge, totpCodeAt(secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("account.sessions.revokeOthers kills it", async () => {
    const c = await challenged()
    await c.client.account.sessions.revokeOthers()
    const [err] = await verifyWith(app, c.challenge, totpCodeAt(c.secret, nowSeconds()))
    expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
  })

  test("admin.users.revokeSessions kills it", async () => {
    const root = "root-2fa-revoke@example.com"
    const own = await start({ superadminEmails: [root] })
    try {
      const admin = await signUpVerified(own, root)
      const c = await challenged(own)
      await admin.client.admin.users.revokeSessions({ id: c.user.id })
      const [err] = await verifyWith(own, c.challenge, totpCodeAt(c.secret, nowSeconds()))
      expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
    } finally {
      await own.stop()
    }
  })
})

describe("racing verifies on two challenges", () => {
  async function secondChallenge(email: string) {
    const result = await clientFor(app).auth.signIn({ email, password: PASSWORD })
    if (!isTwoFactorChallenge(result)) throw new Error("expected a challenge")
    return result.twoFactor.challenge
  }

  test("the same TOTP code on two challenges at once issues exactly one session", async () => {
    const c = await challenged()
    const other = await secondChallenge(c.email)
    const before = await sessionCount(app, c.user.id)
    const code = totpCodeAt(c.secret, nowSeconds())
    const results = await Promise.all([
      verifyWith(app, c.challenge, code),
      verifyWith(app, other, code),
    ])
    expect(results.filter(([err]) => err === null)).toHaveLength(1)
    expect(results.map(([err]) => err).filter(Boolean)).toMatchObject([
      { code: "UNAUTHORIZED", message: WRONG },
    ])
    expect(await sessionCount(app, c.user.id)).toBe(before + 1)
  })

  test("the same recovery code on two challenges at once succeeds exactly once", async () => {
    const c = await challenged()
    const other = await secondChallenge(c.email)
    const [code] = generateRecoveryCodes(1)
    if (!code) throw new Error("no code")
    await app.db.twoFactor.replaceRecoveryCodes(c.user.id, [tokenHash(code)])
    const before = await sessionCount(app, c.user.id)
    const results = await Promise.all([
      verifyWith(app, c.challenge, code),
      verifyWith(app, other, code),
    ])
    expect(results.filter(([err]) => err === null)).toHaveLength(1)
    expect(results.map(([err]) => err).filter(Boolean)).toMatchObject([
      { code: "UNAUTHORIZED", message: WRONG },
    ])
    expect(await sessionCount(app, c.user.id)).toBe(before + 1)
    expect(await app.db.twoFactor.recoveryCodesLeft(c.user.id)).toBe(0)
  })
})

describe("no two-factor session survives a reset", () => {
  const reopen = (raw: SQL, challenge: string) =>
    raw`UPDATE tokens SET consumed_at = NULL WHERE token_hash = ${tokenHash(challenge)}`

  test("a challenge issued before a password change never becomes a session", async () => {
    await withRawDatabase({}, async (own, raw) => {
      const c = await challenged(own)
      await c.client.account.changePassword({
        currentPassword: PASSWORD,
        newPassword: "another horse battery",
      })
      await reopen(raw, c.challenge)
      const before = await sessionCount(own, c.user.id)
      const [err] = await verifyWith(own, c.challenge, totpCodeAt(c.secret, nowSeconds()))
      expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
      expect(await sessionCount(own, c.user.id)).toBe(before)
    })
  })

  test("a challenge issued before admin revokeSessions never becomes a session", async () => {
    const root = "root-2fa-stamp@example.com"
    await withRawDatabase({ superadminEmails: [root] }, async (own, raw) => {
      const admin = await signUpVerified(own, root)
      const c = await challenged(own)
      await admin.client.admin.users.revokeSessions({ id: c.user.id })
      await reopen(raw, c.challenge)
      const [err] = await verifyWith(own, c.challenge, totpCodeAt(c.secret, nowSeconds()))
      expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
      expect(await sessionCount(own, c.user.id)).toBe(0)
    })
  })

  test("a challenge issued before setPassword never becomes a session", async () => {
    await withRawDatabase({}, async (own, raw) => {
      const c = await challenged(own)
      // Make the account passwordless (as a provider or magic-link account is); its session from
      // sign-up is fresh, so setPassword is allowed.
      await raw`UPDATE users SET password_hash = NULL WHERE id = ${c.user.id}`
      await c.client.account.setPassword({ password: "another horse battery" })
      await reopen(raw, c.challenge)
      const before = await sessionCount(own, c.user.id)
      const [err] = await verifyWith(own, c.challenge, totpCodeAt(c.secret, nowSeconds()))
      expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
      expect(await sessionCount(own, c.user.id)).toBe(before)
    })
  })

  test("a challenge issued before revokeOthers never becomes a session", async () => {
    await withRawDatabase({}, async (own, raw) => {
      const c = await challenged(own)
      await c.client.account.sessions.revokeOthers()
      await reopen(raw, c.challenge)
      const before = await sessionCount(own, c.user.id)
      const [err] = await verifyWith(own, c.challenge, totpCodeAt(c.secret, nowSeconds()))
      expect(err).toMatchObject({ code: "BAD_REQUEST", message: TIMED_OUT })
      expect(await sessionCount(own, c.user.id)).toBe(before)
    })
  })

  test("two recovery codes racing on one challenge spend only the winner's", async () => {
    // Hold both requests at the budget reservation (after each has peeked the live challenge)
    // until both are there, so they really overlap rather than run one after the other.
    const inner = createMemoryRateLimiter({ limit: 10, windowMs: 60_000 })
    let arrived = 0
    let release = () => {}
    const bothHere = new Promise<void>((resolve) => {
      release = resolve
    })
    const own = await start({
      twoFactorUserLimiter: {
        async hit(key) {
          arrived += 1
          if (arrived === 2) release()
          if (arrived <= 2) await bothHere
          return inner.hit(key)
        },
        refund: (key) => inner.refund(key),
      },
    })
    try {
      const c = await challenged(own)
      const codes = generateRecoveryCodes(10)
      await own.db.twoFactor.replaceRecoveryCodes(c.user.id, codes.map(tokenHash))
      const [a, b] = codes
      if (!a || !b) throw new Error("no codes")
      const before = await sessionCount(own, c.user.id)
      const results = await Promise.all([
        verifyWith(own, c.challenge, a),
        verifyWith(own, c.challenge, b),
      ])
      expect(results.filter(([err]) => err === null)).toHaveLength(1)
      expect(results.map(([err]) => err).filter(Boolean)).toMatchObject([
        { code: "BAD_REQUEST", message: TIMED_OUT },
      ])
      expect(await sessionCount(own, c.user.id)).toBe(before + 1)
      expect(await own.db.twoFactor.recoveryCodesLeft(c.user.id)).toBe(9)
    } finally {
      await own.stop()
    }
  })
})
