import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  DELETION_GRACE_MS,
  EMAIL_CHANGE_CODE_REASON,
  EMAIL_CHANGE_LINK_INVALID_MESSAGE,
  EMAIL_CHANGE_RATE_LIMIT,
  EMAIL_CHANGE_RATE_MESSAGE,
  EMAIL_CHANGE_REAUTH_MESSAGE,
  EMAIL_CHANGE_REVERT_TAKEN_MESSAGE,
  EMAIL_CHANGE_SAME_EMAIL_MESSAGE,
  EMAIL_CHANGE_TAKEN_MESSAGE,
  EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE,
  IMPERSONATING_MESSAGE,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_REASON,
  TWO_FACTOR_WRONG_CODE_MESSAGE,
} from "@repo/api-contract"
import {
  emailChangedSubject as CHANGED,
  emailChangeConfirmSubject as CONFIRM,
  magicLinkSubject as MAGIC,
  emailChangeRequestedSubject as REQUESTED,
  resetPasswordSubject as RESET,
  emailChangeRevertedSubject as REVERTED,
} from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { newToken, tokenHash } from "./credentials"
import { maskEmail } from "./mail/mailer"
import type { Profile } from "./oauth/provider"
import type { TokenPurpose } from "./queries/tokens"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  providersWith,
  signedIn,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"
import { TOTP_PERIOD_SECONDS, totpCodeAt } from "./two-factor/totp"

const PASSWORD = "correct horse battery"
const svEmail = translatorFor("sv", "email")
const DAY_MS = 24 * 60 * 60_000

// Fake providers whose profile each test sets: what the provider says about whoever signs in.
const profiles: { google: Profile; github: Profile } = {
  google: { providerUserId: "g-0", email: null, emailVerified: false, name: null },
  github: { providerUserId: "gh-0", email: null, emailVerified: false, name: null },
}

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    providers: providersWith({ google: () => profiles.google, github: () => profiles.github }),
  })
})
afterAll(() => app.stop())

type App = typeof app

let counter = 0
const fresh = (label: string) => `${label}-${++counter}-${Date.now()}@example.com`

/** Successive TOTP codes, one step apart: the replay guard refuses a step twice. */
function codes(secret: Uint8Array) {
  let step = Math.floor(Date.now() / 1000)
  return () => {
    const code = totpCodeAt(secret, step)
    step += TOTP_PERIOD_SECONDS
    return code
  }
}

/** Every mail `a` sent to `to`, after running the queue. */
async function sentTo(a: App, to: string) {
  await a.drain()
  return a.mailer.sent.filter((m) => m.to === to)
}

/** The token in the latest `subject` mail to `to`, from its `path?token=…` link. */
async function linkToken(a: App, to: string, subject: string, path: string) {
  const mails = await mailsTo(a, to, subject)
  const match = mails.at(-1)?.text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`))
  if (!match?.[1]) throw new Error(`no ${path} link in "${subject}" to ${to}`)
  return match[1]
}

type TokenRow = {
  purpose: string
  email: string | null
  consumed_at: string | null
  expires_at: string
  created_at: string
}

const tokenRows = (a: App, userId: number, purpose: TokenPurpose): Promise<TokenRow[]> =>
  a.db
    .sql`SELECT purpose, email, consumed_at, expires_at, created_at FROM tokens WHERE user_id = ${userId} AND purpose = ${purpose} ORDER BY id`

const liveTokens = async (a: App, userId: number, purpose: TokenPurpose) =>
  (await tokenRows(a, userId, purpose)).filter((row) => row.consumed_at === null)

const backdateSessions = (a: App, userId: number, ms: number) =>
  a.db
    .sql`UPDATE sessions SET created_at = ${new Date(Date.now() - ms).toISOString()} WHERE user_id = ${userId}`

/** A passwordless account (magic link to a fresh address), signed in with a fresh session. */
async function passwordlessUser(a: App, email: string) {
  await clientFor(a).auth.magicLink.request({ email })
  const [mail] = await mailsTo(a, email, MAGIC)
  const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
  const { user, session } = signedIn(await clientFor(a).auth.magicLink.consume({ token }))
  return { user, token: session.token, client: clientFor(a, session.token), email }
}

/** A verified account with a password that asked to change to `newEmail`; returns the confirm token. */
async function requested(a: App, newEmail = fresh("new")) {
  const account = await signUpVerified(a, fresh("old"))
  await account.client.account.email.requestChange({ newEmail, password: PASSWORD })
  const token = await linkToken(a, newEmail, CONFIRM, "/email/confirm")
  return { ...account, newEmail, token }
}

describe("account.email.get", () => {
  test("the current address, and no pending change", async () => {
    const account = await signUpVerified(app, fresh("get"))
    expect(await account.client.account.email.get()).toEqual({
      email: account.email,
      pending: null,
    })
  })

  test("a pending change shows masked, with its expiry", async () => {
    const { client, email, newEmail } = await requested(app)
    const status = await client.account.email.get()
    expect(status.email).toBe(email)
    expect(status.pending?.maskedEmail).toBe(maskEmail(newEmail))
    const expires = Date.parse(status.pending?.expiresAt ?? "")
    expect(Math.abs(expires - (Date.now() + DAY_MS))).toBeLessThan(60_000)
  })
})

describe("account.email.requestChange", () => {
  test("mails a confirm link to the new address and a cancel link to the current one", async () => {
    const account = await signUpVerified(app, fresh("req"))
    const newEmail = fresh("target")
    const result = await account.client.account.email.requestChange({
      newEmail: newEmail.toUpperCase(),
      password: PASSWORD,
    })
    expect(result.pending.maskedEmail).toBe(maskEmail(newEmail))
    expect(Math.abs(Date.parse(result.pending.expiresAt) - (Date.now() + DAY_MS))).toBeLessThan(
      60_000
    )
    const [confirm] = await mailsTo(app, newEmail, CONFIRM)
    expect(confirm?.text).toContain("http://account.example.com/email/confirm?token=")
    const [notice] = await mailsTo(app, account.email, REQUESTED)
    expect(notice?.text).toContain("http://auth.example.com/email/cancel?token=")
    // The current address only ever sees the new one masked.
    expect(notice?.text).toContain(maskEmail(newEmail))
    expect(notice?.text).not.toContain(newEmail)
    expect(notice?.html).not.toContain(newEmail)
    const [change] = await liveTokens(app, account.user.id, "email_change")
    expect(change?.email).toBe(newEmail)
    expect(await liveTokens(app, account.user.id, "email_change_cancel")).toHaveLength(1)
    // Nothing changes until it is confirmed.
    expect((await account.client.auth.me()).user.email).toBe(account.email)
  })

  test("a wrong password is UNAUTHORIZED with reason password, and nothing is sent", async () => {
    const account = await signUpVerified(app, fresh("pw"))
    const newEmail = fresh("pw-target")
    const [error] = await safe(
      account.client.account.email.requestChange({ newEmail, password: "wrong password!" })
    )
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: TWO_FACTOR_PASSWORD_REASON },
    })
    const [missing] = await safe(account.client.account.email.requestChange({ newEmail }))
    expect(missing).toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: TWO_FACTOR_PASSWORD_REASON },
    })
    expect(await sentTo(app, newEmail)).toHaveLength(0)
    expect(await tokenRows(app, account.user.id, "email_change")).toHaveLength(0)
  })

  test("passwordless: a fresh session passes, a stale one is FORBIDDEN with reason reauth", async () => {
    const user = await passwordlessUser(app, fresh("nopw"))
    const first = fresh("nopw-target")
    await user.client.account.email.requestChange({ newEmail: first })
    expect(await mailsTo(app, first, CONFIRM)).toHaveLength(1)

    await backdateSessions(app, user.user.id, 11 * 60_000)
    const second = fresh("nopw-stale")
    const [error] = await safe(user.client.account.email.requestChange({ newEmail: second }))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: EMAIL_CHANGE_REAUTH_MESSAGE,
      data: { reason: TWO_FACTOR_REAUTH_REASON },
    })
    expect(await sentTo(app, second)).toHaveLength(0)
  })

  test("two-step on: a code is required, a wrong one is UNAUTHORIZED with reason code", async () => {
    const account = await signUpVerified(app, fresh("2fa"))
    const next = codes(await enableTwoFactor(app, account.user.id))
    const newEmail = fresh("2fa-target")
    const [missing] = await safe(
      account.client.account.email.requestChange({ newEmail, password: PASSWORD })
    )
    expect(missing).toMatchObject({
      code: "UNAUTHORIZED",
      message: TWO_FACTOR_WRONG_CODE_MESSAGE,
      data: { reason: EMAIL_CHANGE_CODE_REASON },
    })
    const [wrong] = await safe(
      account.client.account.email.requestChange({ newEmail, password: PASSWORD, code: "000000" })
    )
    expect(wrong).toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: EMAIL_CHANGE_CODE_REASON },
    })
    expect(await sentTo(app, newEmail)).toHaveLength(0)
    await account.client.account.email.requestChange({ newEmail, password: PASSWORD, code: next() })
    expect(await mailsTo(app, newEmail, CONFIRM)).toHaveLength(1)
  })

  test("two-step on: a recovery code is accepted, and spent", async () => {
    const account = await signUpVerified(app, fresh("2fa-rec"))
    const next = codes(await enableTwoFactor(app, account.user.id))
    const { recoveryCodes } = await account.client.account.twoFactor.regenerateRecoveryCodes({
      code: next(),
    })
    const recovery = recoveryCodes[0] as string
    const newEmail = fresh("2fa-rec-target")
    await account.client.account.email.requestChange({
      newEmail,
      password: PASSWORD,
      code: recovery,
    })
    expect(await mailsTo(app, newEmail, CONFIRM)).toHaveLength(1)
    const [again] = await safe(
      account.client.account.email.requestChange({
        newEmail: fresh("2fa-rec-again"),
        password: PASSWORD,
        code: recovery,
      })
    )
    expect(again).toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: EMAIL_CHANGE_CODE_REASON },
    })
  })

  test("wrong codes share account.twoFactor.disable's budget (2fa:manage)", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const account = await signUpVerified(own, fresh("budget"))
      const next = codes(await enableTwoFactor(own, account.user.id))
      for (let i = 0; i < 2; i++) {
        const [error] = await safe(
          account.client.account.email.requestChange({
            newEmail: fresh("budget-target"),
            password: PASSWORD,
            code: "000000",
          })
        )
        expect(error).toMatchObject({ code: "UNAUTHORIZED" })
      }
      const [refused] = await safe(account.client.account.twoFactor.disable({ code: next() }))
      expect(refused).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("refused while impersonating, for request and confirm; get still answers", async () => {
    const root = "root-email-change@example.com"
    const own = await start({ superadminEmails: [root] })
    try {
      const admin = await signUpVerified(own, root)
      const target = await requested(own)
      const { token } = await admin.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support",
      })
      const as = clientFor(own, token)
      expect((await as.account.email.get()).email).toBe(target.email)
      const [request] = await safe(
        as.account.email.requestChange({ newEmail: fresh("imp"), password: PASSWORD })
      )
      expect(request).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
      const [confirm] = await safe(as.account.email.confirmChange({ token: target.token }))
      expect(confirm).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
      expect((await target.client.auth.me()).user.email).toBe(target.email)
    } finally {
      await own.stop()
    }
  })

  test("the current address (any case) is BAD_REQUEST", async () => {
    const account = await signUpVerified(app, fresh("same"))
    const [error] = await safe(
      account.client.account.email.requestChange({
        newEmail: ` ${account.email.toUpperCase()} `,
        password: PASSWORD,
      })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: EMAIL_CHANGE_SAME_EMAIL_MESSAGE })
  })

  test(`limited to ${EMAIL_CHANGE_RATE_LIMIT} per user per window`, async () => {
    const account = await signUpVerified(app, fresh("rate"))
    for (let i = 0; i < EMAIL_CHANGE_RATE_LIMIT; i++)
      await account.client.account.email.requestChange({
        newEmail: fresh("rate-target"),
        password: PASSWORD,
      })
    const newEmail = fresh("rate-over")
    const [error] = await safe(
      account.client.account.email.requestChange({ newEmail, password: PASSWORD })
    )
    expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS", message: EMAIL_CHANGE_RATE_MESSAGE })
    expect(await sentTo(app, newEmail)).toHaveLength(0)
  })

  test("a new request replaces the pending one: its tokens are void", async () => {
    const first = await requested(app)
    const firstCancel = await linkToken(app, first.email, REQUESTED, "/email/cancel")
    const second = fresh("second")
    await first.client.account.email.requestChange({ newEmail: second, password: PASSWORD })
    const [change] = await liveTokens(app, first.user.id, "email_change")
    expect(change?.email).toBe(second)
    expect(await liveTokens(app, first.user.id, "email_change")).toHaveLength(1)
    expect(await liveTokens(app, first.user.id, "email_change_cancel")).toHaveLength(1)
    const voided = await app.db
      .sql`SELECT consumed_at FROM tokens WHERE token_hash = ${tokenHash(firstCancel)}`
    expect(voided[0]?.consumed_at).not.toBeNull()
    expect((await first.client.account.email.get()).pending?.maskedEmail).toBe(maskEmail(second))
  })

  describe("an address another account holds", () => {
    /** The notice's text with what differs per account (masked address, cancel token) blanked. */
    const shapeOf = (text: string, masked: string) =>
      text
        .replaceAll(masked, "<masked>")
        .replace(/cancel\?token=[A-Za-z0-9_-]+/g, "cancel?token=<t>")

    test("leaves the same answer, pending state and notice; only the taken address gets nothing", async () => {
      const other = await signUp(app, fresh("taken"))
      const free = fresh("free")
      const a = await signUpVerified(app, fresh("probe-a"))
      const b = await signUpVerified(app, fresh("probe-b"))
      const success = await a.client.account.email.requestChange({
        newEmail: free,
        password: PASSWORD,
      })
      const taken = await b.client.account.email.requestChange({
        newEmail: other.email,
        password: PASSWORD,
      })
      // Same keys, same masking, same expiry (to the minute).
      expect(Object.keys(taken)).toEqual(Object.keys(success))
      expect(Object.keys(taken.pending)).toEqual(Object.keys(success.pending))
      expect(taken.pending.maskedEmail).toBe(maskEmail(other.email))
      expect(
        Math.abs(Date.parse(taken.pending.expiresAt) - Date.parse(success.pending.expiresAt))
      ).toBeLessThan(60_000)

      // `get` shows a pending change either way.
      expect(await b.client.account.email.get()).toEqual({
        email: b.email,
        pending: taken.pending,
      })
      expect(await a.client.account.email.get()).toEqual({
        email: a.email,
        pending: success.pending,
      })

      // The current address gets the same notice, with a working cancel link.
      const [noticeA] = await mailsTo(app, a.email, REQUESTED)
      const [noticeB] = await mailsTo(app, b.email, REQUESTED)
      expect(noticeB?.text).toContain("http://auth.example.com/email/cancel?token=")
      expect(shapeOf(noticeB?.text ?? "", maskEmail(other.email))).toBe(
        shapeOf(noticeA?.text ?? "", maskEmail(free))
      )
      expect(noticeB?.text).not.toContain(other.email)

      // The same rows: one live change (holding the taken address) and one live cancel link.
      const [change] = await liveTokens(app, b.user.id, "email_change")
      expect(change?.email).toBe(other.email)
      expect(await liveTokens(app, b.user.id, "email_change")).toHaveLength(1)
      expect(await liveTokens(app, b.user.id, "email_change_cancel")).toHaveLength(1)

      // The only difference: the taken address's owner is never mailed.
      expect(await mailsTo(app, free, CONFIRM)).toHaveLength(1)
      const toOther = (await sentTo(app, other.email)).filter(
        (m) => m.subject === CONFIRM || m.subject === REQUESTED
      )
      expect(toOther).toHaveLength(0)
    })

    test("still re-authenticates, replaces the pending change and counts against the limiter", async () => {
      const other = await signUp(app, fresh("taken-2"))
      const account = await requested(app)
      const [unauthed] = await safe(
        account.client.account.email.requestChange({ newEmail: other.email, password: "nope!!!!" })
      )
      expect(unauthed).toMatchObject({ code: "UNAUTHORIZED" })
      await account.client.account.email.requestChange({
        newEmail: other.email,
        password: PASSWORD,
      })
      // The earlier pending change is void and replaced, exactly as a free address would leave it.
      const [earlier] = await app.db
        .sql`SELECT consumed_at FROM tokens WHERE token_hash = ${tokenHash(account.token)}`
      expect(earlier?.consumed_at).not.toBeNull()
      const live = await liveTokens(app, account.user.id, "email_change")
      expect(live.map((row) => row.email)).toEqual([other.email])
      expect(await liveTokens(app, account.user.id, "email_change_cancel")).toHaveLength(1)
      // requested() spent one, this spent one: one left, then refused.
      await account.client.account.email.requestChange({
        newEmail: other.email,
        password: PASSWORD,
      })
      const [limited] = await safe(
        account.client.account.email.requestChange({ newEmail: other.email, password: PASSWORD })
      )
      expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    })

    test("the stored change can never take the address: confirming it is CONFLICT", async () => {
      const other = await signUpVerified(app, fresh("taken-3"))
      const account = await signUpVerified(app, fresh("taken-3-asker"))
      await account.client.account.email.requestChange({
        newEmail: other.email,
        password: PASSWORD,
      })
      // No link was ever mailed for it; stand in for one that leaked by pinning a known token.
      const token = newToken()
      await app.db.sql`
        UPDATE tokens SET token_hash = ${tokenHash(token)}
        WHERE user_id = ${account.user.id} AND purpose = 'email_change' AND consumed_at IS NULL
      `
      const [error] = await safe(account.client.account.email.confirmChange({ token }))
      expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_TAKEN_MESSAGE })
      expect((await account.client.auth.me()).user.email).toBe(account.email)
      expect((await other.client.auth.me()).user.email).toBe(other.email)
      expect(await tokenRows(app, account.user.id, "email_change_revert")).toHaveLength(0)
      const holders = await app.db.sql`SELECT id FROM users WHERE email = ${other.email}`
      expect(holders.map((row: { id: number }) => row.id)).toEqual([other.user.id])
    })
  })

  test("mail locale: the confirm link is self-initiated, the old-mailbox notices are the account's", async () => {
    // Saved sv, request en: every mail in Swedish.
    const chose = await signUpVerified(app, fresh("loc-chose"))
    await chose.client.account.setLocale({ locale: "sv" })
    const choseNew = fresh("loc-chose-new")
    const choseEn = clientFor(app, chose.token, "en")
    await choseEn.account.email.requestChange({ newEmail: choseNew, password: PASSWORD })
    expect(await mailsTo(app, choseNew, svEmail("emailChangeConfirm.subject"))).toHaveLength(1)
    expect(await mailsTo(app, chose.email, svEmail("emailChangeRequested.subject"))).toHaveLength(1)
    await choseEn.account.email.confirmChange({
      token: await linkToken(
        app,
        choseNew,
        svEmail("emailChangeConfirm.subject"),
        "/email/confirm"
      ),
    })
    expect(await mailsTo(app, chose.email, svEmail("emailChanged.subject"))).toHaveLength(1)

    // Never chose, request sv: the confirm link (to the requester's new mailbox) in Swedish; the
    // notices to the current mailbox — maybe not the requester's — in English.
    const never = await signUpVerified(app, fresh("loc-never"))
    const neverNew = fresh("loc-never-new")
    const neverSv = clientFor(app, never.token, "sv")
    await neverSv.account.email.requestChange({ newEmail: neverNew, password: PASSWORD })
    expect(await mailsTo(app, neverNew, svEmail("emailChangeConfirm.subject"))).toHaveLength(1)
    expect(await mailsTo(app, never.email, REQUESTED)).toHaveLength(1)
    await neverSv.account.email.confirmChange({
      token: await linkToken(
        app,
        neverNew,
        svEmail("emailChangeConfirm.subject"),
        "/email/confirm"
      ),
    })
    expect(await mailsTo(app, never.email, CHANGED)).toHaveLength(1)
    const swedish = new Set([
      svEmail("emailChangeRequested.subject"),
      svEmail("emailChanged.subject"),
    ])
    expect((await sentTo(app, never.email)).filter((m) => swedish.has(m.subject))).toHaveLength(0)

    // Neither: English.
    const english = await signUpVerified(app, fresh("loc-en"))
    const englishNew = fresh("loc-en-new")
    await english.client.account.email.requestChange({ newEmail: englishNew, password: PASSWORD })
    expect(await mailsTo(app, englishNew, CONFIRM)).toHaveLength(1)
  })

  test("a failed notice enqueue rolls the request back: the old pending change stays", async () => {
    const account = await requested(app)
    // Only the current mailbox's notice fails: it must sit in the request's transaction too.
    const restore = failJobInserts(app, "emailChangeRequested")
    const newEmail = fresh("enqueue-fail")
    const [error] = await safe(
      account.client.account.email.requestChange({ newEmail, password: PASSWORD })
    ).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    const live = await liveTokens(app, account.user.id, "email_change")
    expect(live.map((row) => row.email)).toEqual([account.newEmail])
    expect(await liveTokens(app, account.user.id, "email_change_cancel")).toHaveLength(1)
    expect(await sentTo(app, newEmail)).toHaveLength(0)
  })

  test("a user deleted under the request is refused, and nothing is stored", async () => {
    const account = await signUpVerified(app, fresh("gone"))
    const restore = patchTransactions(app, (tx) => ({
      ...tx,
      users: { ...tx.users, lockForSession: async () => undefined },
    }))
    const [error] = await safe(
      account.client.account.email.requestChange({
        newEmail: fresh("gone-new"),
        password: PASSWORD,
      })
    ).finally(restore)
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: "Sign in required" })
    expect(await tokenRows(app, account.user.id, "email_change")).toHaveLength(0)
    expect(await tokenRows(app, account.user.id, "email_change_cancel")).toHaveLength(0)
  })
})

describe("a squatter's pending change when the owner proves the mailbox", () => {
  // Someone signed up with the owner's address (unverified, with their own password), then asked
  // to move the account to their own mailbox. Once the owner proves the address, the purge locks
  // the squatter out — and voids that pending change, whose confirm link they hold.
  async function squatted() {
    const victim = fresh("victim")
    const squatter = await signUp(app, victim)
    const own = fresh("squatter-own")
    await squatter.client.account.email.requestChange({ newEmail: own, password: PASSWORD })
    const confirm = await linkToken(app, own, CONFIRM, "/email/confirm")
    const cancel = await linkToken(app, victim, REQUESTED, "/email/cancel")
    expect(await liveTokens(app, squatter.user.id, "email_change")).toHaveLength(1)
    return { victim, squatter, own, confirm, cancel }
  }

  async function expectVoided(s: Awaited<ReturnType<typeof squatted>>, ownerToken: string) {
    expect(await liveTokens(app, s.squatter.user.id, "email_change")).toHaveLength(0)
    expect(await liveTokens(app, s.squatter.user.id, "email_change_cancel")).toHaveLength(0)
    // The owner, tricked into pressing the squatter's confirm link, moves nothing.
    const [error] = await safe(
      clientFor(app, ownerToken).account.email.confirmChange({ token: s.confirm })
    )
    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: EMAIL_CHANGE_LINK_INVALID_MESSAGE,
    })
    expect((await app.db.users.find(s.squatter.user.id))?.email).toBe(s.victim)
  }

  test("a magic link to the address voids it", async () => {
    const s = await squatted()
    await clientFor(app).auth.magicLink.request({ email: s.victim })
    const [mail] = await mailsTo(app, s.victim, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const { user, session } = signedIn(await clientFor(app).auth.magicLink.consume({ token }))
    expect(user.id).toBe(s.squatter.user.id)
    await expectVoided(s, session.token)
  })

  test("a provider's verified email for the address voids it", async () => {
    const s = await squatted()
    profiles.google = {
      providerUserId: `g-owner-${s.squatter.user.id}`,
      email: s.victim,
      emailVerified: true,
      name: null,
    }
    const { user, session } = signedIn(
      await clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
    )
    expect(user.id).toBe(s.squatter.user.id)
    await expectVoided(s, session.token)
  })
})

describe("account.email.confirmChange", () => {
  test("a failed revert-mail enqueue rolls the change back", async () => {
    const account = await requested(app)
    const other = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    )
    const restore = failJobInserts(app)
    const [error] = await safe(
      account.client.account.email.confirmChange({ token: account.token })
    ).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect((await account.client.auth.me()).user.email).toBe(account.email)
    expect(await tokenRows(app, account.user.id, "email_change_revert")).toHaveLength(0)
    expect(await liveTokens(app, account.user.id, "email_change")).toHaveLength(1)
    expect((await clientFor(app, other.session.token).auth.me()).user.id).toBe(account.user.id)
    // The link still works once the queue is back.
    await account.client.account.email.confirmChange({ token: account.token })
    expect((await account.client.auth.me()).user.email).toBe(account.newEmail)
  })

  test("sets the new address, verified, and mails a revert link to the old one", async () => {
    const account = await requested(app)
    const result = await account.client.account.email.confirmChange({ token: account.token })
    expect(result).toEqual({ email: account.newEmail })
    const { user } = await account.client.auth.me()
    expect(user.email).toBe(account.newEmail)
    expect(user.emailVerified).toBe(true)
    expect(await account.client.account.email.get()).toEqual({
      email: account.newEmail,
      pending: null,
    })

    const [revert] = await liveTokens(app, account.user.id, "email_change_revert")
    expect(revert?.email).toBe(account.email)
    expect(Math.abs(Date.parse(revert?.expires_at ?? "") - (Date.now() + 7 * DAY_MS))).toBeLessThan(
      60_000
    )
    const [changed] = await mailsTo(app, account.email, CHANGED)
    expect(changed?.text).toContain("http://auth.example.com/email/revert?token=")
    expect(changed?.text).toContain(maskEmail(account.newEmail))
    expect(changed?.text).not.toContain(account.newEmail)
    expect(changed?.html).not.toContain(account.newEmail)
    const link = changed?.text.match(/email\/revert\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const stored = await app.db
      .sql`SELECT purpose FROM tokens WHERE token_hash = ${tokenHash(link)}`
    expect(stored[0]?.purpose).toBe("email_change_revert")
  })

  test("an unverified account's new address is verified too", async () => {
    const account = await signUp(app, fresh("unverified"))
    const newEmail = fresh("unverified-new")
    await account.client.account.email.requestChange({ newEmail, password: PASSWORD })
    const token = await linkToken(app, newEmail, CONFIRM, "/email/confirm")
    await account.client.account.email.confirmChange({ token })
    expect((await account.client.auth.me()).user.emailVerified).toBe(true)
    // Recorded once per account, like every other path that verifies an email.
    await app.drain()
    const events = await app.db.sql`
      SELECT id FROM analytics_events WHERE name = 'email_verified' AND user_id = ${account.user.id}
    `
    expect(events).toHaveLength(1)
  })

  test("ends every other session and keeps the caller's", async () => {
    const account = await requested(app)
    const other = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    )
    const otherClient = clientFor(app, other.session.token)
    expect((await otherClient.auth.me()).user.id).toBe(account.user.id)
    await account.client.account.email.confirmChange({ token: account.token })
    const [ended] = await safe(otherClient.auth.me())
    expect(ended).toMatchObject({ code: "UNAUTHORIZED" })
    expect((await account.client.auth.me()).user.email).toBe(account.newEmail)
    const rows = await app.db.sql`SELECT id FROM sessions WHERE user_id = ${account.user.id}`
    expect(rows).toHaveLength(1)
  })

  test("voids the account's reset, verify, magic-link and cancel links", async () => {
    const account = await requested(app)
    const at = new Date(Date.now() + DAY_MS).toISOString()
    const purposes: TokenPurpose[] = ["password_reset", "email_verify", "magic_link"]
    for (const purpose of purposes)
      await app.db.tokens.create({
        userId: account.user.id,
        purpose,
        tokenHash: tokenHash(newToken()),
        expiresAt: at,
      })
    // A pre-account magic link to the new address would sign in as whoever owns it next.
    const preAccount = newToken()
    await app.db.tokens.create({
      userId: null,
      purpose: "magic_link",
      tokenHash: tokenHash(preAccount),
      expiresAt: at,
      email: account.newEmail,
    })
    expect(await liveTokens(app, account.user.id, "email_change_cancel")).toHaveLength(1)
    await account.client.account.email.confirmChange({ token: account.token })
    for (const purpose of [...purposes, "email_change_cancel", "email_change"] as TokenPurpose[])
      expect(await liveTokens(app, account.user.id, purpose)).toHaveLength(0)
    const [magic] = await app.db
      .sql`SELECT consumed_at FROM tokens WHERE token_hash = ${tokenHash(preAccount)}`
    expect(magic?.consumed_at).not.toBeNull()
  })

  test("audits user.email_changed with both addresses masked", async () => {
    const account = await requested(app)
    await account.client.account.email.confirmChange({ token: account.token })
    const rows: Array<{
      actor_user_id: number
      impersonated_user_id: number | null
      target_type: string
      metadata: string
    }> = await app.db.sql`
      SELECT actor_user_id, impersonated_user_id, target_type, metadata FROM audit_log
      WHERE action = 'user.email_changed' AND target_id = ${String(account.user.id)}
    `
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row?.actor_user_id).toBe(account.user.id)
    expect(row?.impersonated_user_id).toBeNull()
    expect(row?.target_type).toBe("user")
    expect(JSON.parse(row?.metadata ?? "{}")).toEqual({
      from: maskEmail(account.email),
      to: maskEmail(account.newEmail),
    })
    expect(row?.metadata).not.toContain(account.email)
    expect(row?.metadata).not.toContain(account.newEmail)
  })

  test("billing_customers.email that held the old address follows the new one", async () => {
    const owner = await signUpWithWorkspace(app, fresh("billing"))
    await app.db.billing.customers.upsert({
      workspaceId: owner.workspaceId,
      provider: "mock",
      customerId: `cus_${owner.user.id}`,
      email: owner.email.toUpperCase(),
    })
    const bystander = await signUpWithWorkspace(app, fresh("billing-other"))
    await app.db.billing.customers.upsert({
      workspaceId: bystander.workspaceId,
      provider: "mock",
      customerId: `cus_${bystander.user.id}`,
      email: bystander.email,
    })
    const newEmail = fresh("billing-new")
    await owner.client.account.email.requestChange({ newEmail, password: PASSWORD })
    const token = await linkToken(app, newEmail, CONFIRM, "/email/confirm")
    await owner.client.account.email.confirmChange({ token })
    expect((await app.db.billing.customers.find(owner.workspaceId))?.email).toBe(newEmail)
    expect((await app.db.billing.customers.find(bystander.workspaceId))?.email).toBe(
      bystander.email
    )
  })

  test("another account's link is refused and stays usable by its owner", async () => {
    const account = await requested(app)
    const stranger = await signUpVerified(app, fresh("stranger"))
    const [error] = await safe(
      stranger.client.account.email.confirmChange({ token: account.token })
    )
    expect(error).toMatchObject({
      code: "BAD_REQUEST",
      message: EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE,
    })
    expect((await stranger.client.auth.me()).user.email).toBe(stranger.email)
    expect((await account.client.auth.me()).user.email).toBe(account.email)
    await account.client.account.email.confirmChange({ token: account.token })
    expect((await account.client.auth.me()).user.email).toBe(account.newEmail)
  })

  test("an unknown, used, expired or replaced link is BAD_REQUEST", async () => {
    const invalid = { code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE }
    const used = await requested(app)
    const [unknown] = await safe(used.client.account.email.confirmChange({ token: "nope" }))
    expect(unknown).toMatchObject(invalid)
    await used.client.account.email.confirmChange({ token: used.token })
    const [again] = await safe(used.client.account.email.confirmChange({ token: used.token }))
    expect(again).toMatchObject(invalid)

    const expired = await requested(app)
    await app.db.sql`
      UPDATE tokens SET expires_at = ${new Date(Date.now() - 1000).toISOString()}
      WHERE token_hash = ${tokenHash(expired.token)}
    `
    const [late] = await safe(expired.client.account.email.confirmChange({ token: expired.token }))
    expect(late).toMatchObject(invalid)
    expect((await expired.client.auth.me()).user.email).toBe(expired.email)

    const replaced = await requested(app)
    await replaced.client.account.email.requestChange({
      newEmail: fresh("replacement"),
      password: PASSWORD,
    })
    const [stale] = await safe(
      replaced.client.account.email.confirmChange({ token: replaced.token })
    )
    expect(stale).toMatchObject(invalid)
    expect((await replaced.client.auth.me()).user.email).toBe(replaced.email)
  })

  test("an address taken since the request is CONFLICT and nothing changes", async () => {
    const account = await requested(app)
    const other = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    )
    // Someone signs up with the new address between request and confirm.
    await signUp(app, account.newEmail)
    const [error] = await safe(account.client.account.email.confirmChange({ token: account.token }))
    expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_TAKEN_MESSAGE })
    const { user } = await account.client.auth.me()
    expect(user.email).toBe(account.email)
    // Thrown, so rolled back: the confirm link is still unspent (and still refused while taken).
    expect(await liveTokens(app, account.user.id, "email_change")).toHaveLength(1)
    const [again] = await safe(account.client.account.email.confirmChange({ token: account.token }))
    expect(again).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_TAKEN_MESSAGE })
    // No session ended, no revert link, no audit row, no mail.
    expect((await clientFor(app, other.session.token).auth.me()).user.id).toBe(account.user.id)
    expect(await tokenRows(app, account.user.id, "email_change_revert")).toHaveLength(0)
    const audits = await app.db.sql`
      SELECT id FROM audit_log WHERE action = 'user.email_changed' AND target_id = ${String(account.user.id)}
    `
    expect(audits).toHaveLength(0)
    expect((await sentTo(app, account.email)).filter((m) => m.subject === CHANGED)).toHaveLength(0)
  })
})

type Tx = Parameters<Parameters<App["db"]["transaction"]>[0]>[0]

/** Every transaction until restored sees `patch(tx)` instead of its own query helpers. */
function patchTransactions(a: App, patch: (tx: Tx) => Tx) {
  const original = a.db.transaction
  a.db.transaction = (fn) => original((tx) => fn(patch(tx)))
  return () => {
    a.db.transaction = original
  }
}

/**
 * Job inserts inside a transaction fail until restored (the queue's table is unreachable) — every
 * one, or with `template` only the `mail.send` job for that template, so a test pins that one
 * mail inside the transaction rather than whichever insert happens to come first.
 */
const failJobInserts = (a: App, template?: string) =>
  patchTransactions(a, (tx) => ({
    ...tx,
    jobs: {
      ...tx.jobs,
      insert: async (row) => {
        if (template && JSON.parse(row.payload).template !== template) return tx.jobs.insert(row)
        throw new Error("jobs table unreachable")
      },
    },
  }))

/**
 * Holds the next `n` transactions at their very start until all `n` are open, so they really
 * overlap. Postgres only: on SQLite a second transaction cannot begin while the first is open.
 */
function overlapNextTransactions(a: App, n: number, timeoutMs = 5_000) {
  const original = a.db.transaction
  let arrived = 0
  let release = () => {}
  let timedOut: Error | undefined
  let abort = (_error: Error) => {}
  const allOpen = new Promise<void>((resolve, reject) => {
    release = resolve
    abort = reject
  })
  // Never wait forever: if fewer than `n` transactions open (a request refused before its
  // transaction, say), the held ones roll back — releasing their connections — and restoring
  // throws, so the test fails saying why instead of dying on the file's timeout.
  const timer = setTimeout(() => {
    timedOut = new Error(
      `overlapNextTransactions: only ${arrived} of ${n} transactions opened within ${timeoutMs} ms`
    )
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

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("confirm under real overlap (Postgres)", () => {
  test("two accounts confirming the same new address: one wins, the other is CONFLICT", async () => {
    const target = fresh("race")
    const a = await signUpVerified(app, fresh("race-a"))
    const b = await signUpVerified(app, fresh("race-b"))
    await a.client.account.email.requestChange({ newEmail: target, password: PASSWORD })
    await b.client.account.email.requestChange({ newEmail: target, password: PASSWORD })
    const [tokenA, tokenB] = (await mailsTo(app, target, CONFIRM, 2)).map(
      (m) => m.text.match(/email\/confirm\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    )
    const restore = overlapNextTransactions(app, 2)
    const results = await Promise.all([
      safe(a.client.account.email.confirmChange({ token: tokenA as string })),
      safe(b.client.account.email.confirmChange({ token: tokenB as string })),
    ]).finally(restore)
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
      { code: "CONFLICT", message: EMAIL_CHANGE_TAKEN_MESSAGE },
    ])
    const holders = await app.db.sql`SELECT id FROM users WHERE email = ${target}`
    expect(holders).toHaveLength(1)
    const loser = holders[0]?.id === a.user.id ? b : a
    expect((await loser.client.auth.me()).user.email).toBe(loser.email)
    expect(await tokenRows(app, loser.user.id, "email_change_revert")).toHaveLength(0)
    // The loser's CONFLICT rolled back its consume: its link is still unspent.
    expect(await liveTokens(app, loser.user.id, "email_change")).toHaveLength(1)
  })
})

/** A verified account with a password that changed its address; returns the revert token. */
async function changed(a: App, newEmail = fresh("changed")) {
  const account = await requested(a, newEmail)
  await account.client.account.email.confirmChange({ token: account.token })
  const revert = await linkToken(a, account.email, CHANGED, "/email/revert")
  return { ...account, revert }
}

const sessionCount = async (a: App, userId: number) =>
  (await a.db.sql`SELECT id FROM sessions WHERE user_id = ${userId}`).length

const auditRows = (a: App, action: string, userId: number): Promise<Array<{ metadata: string }>> =>
  a.db.sql`
    SELECT metadata FROM audit_log WHERE action = ${action} AND target_id = ${String(userId)}
  `

const addPasskey = (a: App, userId: number) =>
  a.db.passkeys.create({
    userId,
    credentialId: `cred-${userId}-${newToken()}`,
    publicKey: "pk",
    counter: 0,
    transports: null,
    name: "Laptop",
  })

describe("auth.emailChange.cancel", () => {
  test("voids the pending change, ends every session and audits with the address masked", async () => {
    const account = await requested(app)
    const other = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    )
    const cancel = await linkToken(app, account.email, REQUESTED, "/email/cancel")
    const result = await clientFor(app).auth.emailChange.cancel({ token: cancel })
    expect(result).toBeUndefined()
    expect(await liveTokens(app, account.user.id, "email_change")).toHaveLength(0)
    expect(await liveTokens(app, account.user.id, "email_change_cancel")).toHaveLength(0)
    // The request may have come from a stolen session: every one ends, the requester's too.
    expect(await sessionCount(app, account.user.id)).toBe(0)
    const [mine] = await safe(account.client.auth.me())
    expect(mine).toMatchObject({ code: "UNAUTHORIZED" })
    const [theirs] = await safe(clientFor(app, other.session.token).auth.me())
    expect(theirs).toMatchObject({ code: "UNAUTHORIZED" })
    // The address is unchanged, and the confirm link is dead.
    const again = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    )
    const client = clientFor(app, again.session.token)
    expect(await client.account.email.get()).toEqual({ email: account.email, pending: null })
    const [confirm] = await safe(client.account.email.confirmChange({ token: account.token }))
    expect(confirm).toMatchObject({
      code: "BAD_REQUEST",
      message: EMAIL_CHANGE_LINK_INVALID_MESSAGE,
    })

    const rows = await auditRows(app, "user.email_change_cancelled", account.user.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.metadata ?? "{}")).toEqual({
      to: maskEmail(account.newEmail),
      via: "email_link",
    })
    expect(rows[0]?.metadata).not.toContain(account.newEmail)
  })

  test("an unknown, used, expired or already-confirmed link is BAD_REQUEST, nothing changes", async () => {
    const invalid = { code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE }
    const anonymous = clientFor(app)
    const [unknown] = await safe(anonymous.auth.emailChange.cancel({ token: "nope" }))
    expect(unknown).toMatchObject(invalid)

    const used = await requested(app)
    const usedCancel = await linkToken(app, used.email, REQUESTED, "/email/cancel")
    await anonymous.auth.emailChange.cancel({ token: usedCancel })
    const [again] = await safe(anonymous.auth.emailChange.cancel({ token: usedCancel }))
    expect(again).toMatchObject(invalid)

    const expired = await requested(app)
    const expiredCancel = await linkToken(app, expired.email, REQUESTED, "/email/cancel")
    await app.db.sql`
      UPDATE tokens SET expires_at = ${new Date(Date.now() - 1000).toISOString()}
      WHERE token_hash = ${tokenHash(expiredCancel)}
    `
    const [late] = await safe(anonymous.auth.emailChange.cancel({ token: expiredCancel }))
    expect(late).toMatchObject(invalid)
    expect(await sessionCount(app, expired.user.id)).toBe(1)
    expect(await liveTokens(app, expired.user.id, "email_change")).toHaveLength(1)

    // Confirmed: the cancel link died with it; the revert link is the way back now.
    const confirmed = await requested(app)
    const confirmedCancel = await linkToken(app, confirmed.email, REQUESTED, "/email/cancel")
    await confirmed.client.account.email.confirmChange({ token: confirmed.token })
    const [after] = await safe(anonymous.auth.emailChange.cancel({ token: confirmedCancel }))
    expect(after).toMatchObject(invalid)
    expect((await confirmed.client.auth.me()).user.email).toBe(confirmed.newEmail)
    expect(await auditRows(app, "user.email_change_cancelled", confirmed.user.id)).toHaveLength(0)
  })
})

describe("auth.emailChange.revert", () => {
  test("restores the old address, verified, and locks the account down", async () => {
    const account = await changed(app)
    const id = account.user.id
    const other = signedIn(
      await clientFor(app).auth.signIn({ email: account.newEmail, password: PASSWORD })
    )
    await addPasskey(app, id)
    // A change requested after the confirm, and every other kind of open link.
    const pendingNew = fresh("pending")
    await account.client.account.email.requestChange({ newEmail: pendingNew, password: PASSWORD })
    const at = new Date(Date.now() + DAY_MS).toISOString()
    const purposes: TokenPurpose[] = [
      "password_reset",
      "email_verify",
      "magic_link",
      "two_factor_challenge",
      "passkey_challenge",
    ]
    for (const purpose of purposes)
      await app.db.tokens.create({
        userId: id,
        purpose,
        tokenHash: tokenHash(newToken()),
        expiresAt: at,
      })
    // A pre-account magic link to the address being left.
    const preAccount = newToken()
    await app.db.tokens.create({
      userId: null,
      purpose: "magic_link",
      tokenHash: tokenHash(preAccount),
      expiresAt: at,
      email: account.newEmail,
    })

    const result = await clientFor(app).auth.emailChange.revert({ token: account.revert })
    expect(result).toEqual({ passwordReset: true })
    // No address from the token ever reaches the caller.
    expect(JSON.stringify(result)).not.toContain("@")

    const user = await app.db.users.find(id)
    expect(user?.email).toBe(account.email)
    expect(user?.email_verified_at).not.toBeNull()
    expect(user?.password_hash).toBeNull()
    expect(user?.sessions_revoked_at).not.toBeNull()
    // Every session ends, the one that made the change and any other.
    expect(await sessionCount(app, id)).toBe(0)
    for (const token of [account.token, other.session.token]) {
      const [error] = await safe(clientFor(app, token).auth.me())
      expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    }
    expect(await app.db.passkeys.countForUser(id)).toBe(0)
    for (const purpose of [
      ...purposes.filter((p) => p !== "password_reset"),
      "email_change",
      "email_change_cancel",
      "email_change_revert",
    ] as TokenPurpose[])
      expect(await liveTokens(app, id, purpose)).toHaveLength(0)
    const [magic] = await app.db
      .sql`SELECT consumed_at FROM tokens WHERE token_hash = ${tokenHash(preAccount)}`
    expect(magic?.consumed_at).not.toBeNull()
    // Only the fresh reset link just mailed is live.
    expect(await liveTokens(app, id, "password_reset")).toHaveLength(1)
    const [reused] = await safe(clientFor(app).auth.emailChange.revert({ token: account.revert }))
    expect(reused).toMatchObject({ code: "BAD_REQUEST" })

    // The restored mailbox gets the notice and a normal reset link that works.
    const [reverted] = await mailsTo(app, account.email, REVERTED)
    expect(reverted?.text).not.toContain(account.newEmail)
    const reset = await linkToken(app, account.email, RESET, "/reset-password")
    await clientFor(app).auth.resetPassword({ token: reset, password: "a brand new password" })
    const back = signedIn(
      await clientFor(app).auth.signIn({ email: account.email, password: "a brand new password" })
    )
    expect(back.user.id).toBe(id)
    const [old] = await safe(
      clientFor(app).auth.signIn({ email: account.newEmail, password: PASSWORD })
    )
    expect(old).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("a pending change requested after the confirm cannot be confirmed afterwards", async () => {
    const account = await changed(app)
    const pendingNew = fresh("after")
    await account.client.account.email.requestChange({ newEmail: pendingNew, password: PASSWORD })
    const pendingToken = await linkToken(app, pendingNew, CONFIRM, "/email/confirm")
    await clientFor(app).auth.emailChange.revert({ token: account.revert })
    const back = signedIn(
      await clientFor(app)
        .auth.resetPassword({
          token: await linkToken(app, account.email, RESET, "/reset-password"),
          password: "a brand new password",
        })
        .then(() =>
          clientFor(app).auth.signIn({ email: account.email, password: "a brand new password" })
        )
    )
    const [error] = await safe(
      clientFor(app, back.session.token).account.email.confirmChange({ token: pendingToken })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE })
    expect((await app.db.users.find(account.user.id))?.email).toBe(account.email)
  })

  test("audits user.email_change_reverted with both addresses masked", async () => {
    const account = await changed(app)
    await clientFor(app).auth.emailChange.revert({ token: account.revert })
    const rows = await auditRows(app, "user.email_change_reverted", account.user.id)
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]?.metadata ?? "{}")).toEqual({
      from: maskEmail(account.newEmail),
      to: maskEmail(account.email),
      via: "email_link",
      passwordReset: true,
      passkeysRemoved: 0,
      identitiesRemoved: 0,
      twoFactorDisabled: false,
      deletionCancelled: false,
    })
    expect(rows[0]?.metadata).not.toContain(account.email)
    expect(rows[0]?.metadata).not.toContain(account.newEmail)
  })

  test("billing_customers.email follows the address back", async () => {
    const owner = await signUpWithWorkspace(app, fresh("rb"))
    await app.db.billing.customers.upsert({
      workspaceId: owner.workspaceId,
      provider: "mock",
      customerId: `cus_r${owner.user.id}`,
      email: owner.email,
    })
    const newEmail = fresh("rb-new")
    await owner.client.account.email.requestChange({ newEmail, password: PASSWORD })
    await owner.client.account.email.confirmChange({
      token: await linkToken(app, newEmail, CONFIRM, "/email/confirm"),
    })
    expect((await app.db.billing.customers.find(owner.workspaceId))?.email).toBe(newEmail)
    await clientFor(app).auth.emailChange.revert({
      token: await linkToken(app, owner.email, CHANGED, "/email/revert"),
    })
    expect((await app.db.billing.customers.find(owner.workspaceId))?.email).toBe(owner.email)
  })

  test("a passwordless account gets no reset link", async () => {
    const user = await passwordlessUser(app, fresh("rnopw"))
    const newEmail = fresh("rnopw-new")
    await user.client.account.email.requestChange({ newEmail })
    await user.client.account.email.confirmChange({
      token: await linkToken(app, newEmail, CONFIRM, "/email/confirm"),
    })
    const result = await clientFor(app).auth.emailChange.revert({
      token: await linkToken(app, user.email, CHANGED, "/email/revert"),
    })
    expect(result).toEqual({ passwordReset: false })
    const row = await app.db.users.find(user.user.id)
    expect(row?.email).toBe(user.email)
    expect(row?.password_hash).toBeNull()
    await mailsTo(app, user.email, REVERTED)
    expect((await sentTo(app, user.email)).filter((m) => m.subject === RESET)).toHaveLength(0)
    expect(await liveTokens(app, user.user.id, "password_reset")).toHaveLength(0)
  })

  describe("rolls back what changed since the change was requested", () => {
    /** The rollback cutoff the revert link carries: when the change was requested. */
    const requestedAt = async (a: App, token: string) => {
      const [row]: Array<{ requested_at: string }> = await a.db
        .sql`SELECT requested_at FROM tokens WHERE token_hash = ${tokenHash(token)}`
      return row?.requested_at ?? ""
    }
    const before = (iso: string) => new Date(Date.parse(iso) - 60_000).toISOString()

    test("a provider linked by the new address's verified email is gone, an older one stays", async () => {
      const account = await signUpVerified(app, fresh("idv"))
      // The owner's own GitHub, connected from a fresh session before any change.
      profiles.github = {
        providerUserId: `gh-own-${account.user.id}`,
        email: null,
        emailVerified: false,
        name: null,
      }
      await account.client.auth.oauth.callback({ provider: "github", code: "c" })
      const newEmail = fresh("idv-new")
      await account.client.account.email.requestChange({ newEmail, password: PASSWORD })
      await account.client.account.email.confirmChange({
        token: await linkToken(app, newEmail, CONFIRM, "/email/confirm"),
      })
      // Signed out, whoever holds the new address signs in with a Google account verified for it:
      // the callback links it to this account.
      profiles.google = {
        providerUserId: `g-attacker-${account.user.id}`,
        email: newEmail,
        emailVerified: true,
        name: null,
      }
      const linked = signedIn(
        await clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(linked.user.id).toBe(account.user.id)

      const revert = await linkToken(app, account.email, CHANGED, "/email/revert")
      await clientFor(app).auth.emailChange.revert({ token: revert })
      const providers = (await app.db.identities.listForUser(account.user.id)).map(
        (row) => row.provider
      )
      expect(providers).toEqual(["github"])
      // The same Google account no longer reaches this one (its address now makes a new account).
      const after = signedIn(
        await clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(after.user.id).not.toBe(account.user.id)
      // The owner's GitHub still signs in.
      const own = signedIn(
        await clientFor(app).auth.oauth.callback({ provider: "github", code: "c" })
      )
      expect(own.user.id).toBe(account.user.id)
      const [row] = await auditRows(app, "user.email_change_reverted", account.user.id)
      expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({ identitiesRemoved: 1 })
      const [mail] = await mailsTo(app, account.email, REVERTED)
      expect(mail?.text).toContain(
        "1 sign-in provider connected since the change was disconnected."
      )
    })

    test("a provider connected from a session after the change is gone", async () => {
      const account = await changed(app)
      // The session that confirmed is still fresh: it connects a provider of its own.
      profiles.google = {
        providerUserId: `g-connect-${account.user.id}`,
        email: null,
        emailVerified: false,
        name: null,
      }
      await account.client.auth.oauth.callback({ provider: "google", code: "c" })
      expect(await app.db.identities.countForUser(account.user.id)).toBe(1)
      await clientFor(app).auth.emailChange.revert({ token: account.revert })
      expect(await app.db.identities.countForUser(account.user.id)).toBe(0)
      // No email on the profile: with the identity gone it reaches no account at all.
      const [error] = await safe(
        clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN" })
    })

    test("two-step turned on after the change is turned off; turned on before, it stays", async () => {
      const after = await changed(app)
      await enableTwoFactor(app, after.user.id)
      await app.db.twoFactor.replaceRecoveryCodes(after.user.id, [tokenHash(newToken())])
      await clientFor(app).auth.emailChange.revert({ token: after.revert })
      const off = await app.db.users.find(after.user.id)
      expect(off?.two_factor_enabled_at).toBeNull()
      expect(off?.two_factor_secret).toBeNull()
      expect(off?.two_factor_last_step).toBeNull()
      const codes = await app.db
        .sql`SELECT id FROM two_factor_recovery_codes WHERE user_id = ${after.user.id}`
      expect(codes).toHaveLength(0)
      const [row] = await auditRows(app, "user.email_change_reverted", after.user.id)
      expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({ twoFactorDisabled: true })
      const [mail] = await mailsTo(app, after.email, REVERTED)
      expect(mail?.text).toContain("Two-step verification, turned on since the change")

      const earlier = await changed(app)
      await enableTwoFactor(app, earlier.user.id)
      const enabledAt = before(await requestedAt(app, earlier.revert))
      await app.db
        .sql`UPDATE users SET two_factor_enabled_at = ${enabledAt} WHERE id = ${earlier.user.id}`
      await clientFor(app).auth.emailChange.revert({ token: earlier.revert })
      const kept = await app.db.users.find(earlier.user.id)
      expect(kept?.two_factor_enabled_at).toBe(enabledAt)
      expect(kept?.two_factor_secret).not.toBeNull()
      const [kRow] = await auditRows(app, "user.email_change_reverted", earlier.user.id)
      expect(JSON.parse(kRow?.metadata ?? "{}")).toMatchObject({ twoFactorDisabled: false })
    })

    test("the revert link carries the request's time, not the confirm's", async () => {
      const account = await requested(app)
      const [change]: Array<{ created_at: string }> = await app.db
        .sql`SELECT created_at FROM tokens WHERE token_hash = ${tokenHash(account.token)}`
      await Bun.sleep(5)
      await account.client.account.email.confirmChange({ token: account.token })
      const revert = await linkToken(app, account.email, CHANGED, "/email/revert")
      const [row]: Array<{ created_at: string; requested_at: string }> = await app.db
        .sql`SELECT created_at, requested_at FROM tokens WHERE token_hash = ${tokenHash(revert)}`
      expect(row?.requested_at).toBe(change?.created_at ?? "")
      expect((row?.requested_at ?? "") < (row?.created_at ?? "")).toBe(true)
    })

    test("a provider and two-step added between request and confirm are rolled back", async () => {
      const account = await signUpVerified(app, fresh("between"))
      const newEmail = fresh("between-new")
      await account.client.account.email.requestChange({ newEmail, password: PASSWORD })
      await Bun.sleep(5)
      // The fresh (stolen) session, before confirming: a provider of its own and its own factor.
      profiles.google = {
        providerUserId: `g-between-${account.user.id}`,
        email: null,
        emailVerified: false,
        name: null,
      }
      await account.client.auth.oauth.callback({ provider: "google", code: "c" })
      await enableTwoFactor(app, account.user.id)
      await account.client.account.email.confirmChange({
        token: await linkToken(app, newEmail, CONFIRM, "/email/confirm"),
      })
      await clientFor(app).auth.emailChange.revert({
        token: await linkToken(app, account.email, CHANGED, "/email/revert"),
      })
      expect(await app.db.identities.countForUser(account.user.id)).toBe(0)
      expect((await app.db.users.find(account.user.id))?.two_factor_enabled_at).toBeNull()
      const [error] = await safe(
        clientFor(app).auth.oauth.callback({ provider: "google", code: "c" })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN" })
    })

    test("a provider and two-step from before the request survive", async () => {
      const account = await signUpVerified(app, fresh("prior"))
      profiles.github = {
        providerUserId: `gh-prior-${account.user.id}`,
        email: null,
        emailVerified: false,
        name: null,
      }
      await account.client.auth.oauth.callback({ provider: "github", code: "c" })
      const next = codes(await enableTwoFactor(app, account.user.id))
      const enabledAt = (await app.db.users.find(account.user.id))?.two_factor_enabled_at
      await Bun.sleep(5)
      const newEmail = fresh("prior-new")
      await account.client.account.email.requestChange({
        newEmail,
        password: PASSWORD,
        code: next(),
      })
      await account.client.account.email.confirmChange({
        token: await linkToken(app, newEmail, CONFIRM, "/email/confirm"),
      })
      await clientFor(app).auth.emailChange.revert({
        token: await linkToken(app, account.email, CHANGED, "/email/revert"),
      })
      expect(
        (await app.db.identities.listForUser(account.user.id)).map((row) => row.provider)
      ).toEqual(["github"])
      expect((await app.db.users.find(account.user.id))?.two_factor_enabled_at).toBe(
        enabledAt ?? ""
      )
      const [row] = await auditRows(app, "user.email_change_reverted", account.user.id)
      expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({
        identitiesRemoved: 0,
        twoFactorDisabled: false,
      })
    })

    test("a deletion requested after the change is cancelled; one requested before stays", async () => {
      const after = await changed(app)
      await after.client.account.delete({ email: after.newEmail })
      expect((await app.db.users.find(after.user.id))?.deletion_scheduled_at).not.toBeNull()
      await clientFor(app).auth.emailChange.revert({ token: after.revert })
      expect((await app.db.users.find(after.user.id))?.deletion_scheduled_at).toBeNull()
      const [row] = await auditRows(app, "user.email_change_reverted", after.user.id)
      expect(JSON.parse(row?.metadata ?? "{}")).toMatchObject({ deletionCancelled: true })
      const [mail] = await mailsTo(app, after.email, REVERTED)
      expect(mail?.text).toContain("The account deletion requested since the change was cancelled.")

      const earlier = await changed(app)
      const askedAt = Date.parse(before(await requestedAt(app, earlier.revert)))
      const purgeAt = new Date(askedAt + DELETION_GRACE_MS).toISOString()
      await app.db
        .sql`UPDATE users SET deletion_scheduled_at = ${purgeAt} WHERE id = ${earlier.user.id}`
      await clientFor(app).auth.emailChange.revert({ token: earlier.revert })
      expect((await app.db.users.find(earlier.user.id))?.deletion_scheduled_at).toBe(purgeAt)
    })
  })

  test("the old address taken meanwhile by a verified account is CONFLICT, nothing changes", async () => {
    const account = await changed(app)
    // Someone signs up with the address the account left, and proves that mailbox.
    await signUpVerified(app, account.email)
    const [error] = await safe(clientFor(app).auth.emailChange.revert({ token: account.revert }))
    expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_REVERT_TAKEN_MESSAGE })
    const row = await app.db.users.find(account.user.id)
    expect(row?.email).toBe(account.newEmail)
    expect(row?.password_hash).not.toBeNull()
    expect((await account.client.auth.me()).user.email).toBe(account.newEmail)
    expect(await liveTokens(app, account.user.id, "email_change_revert")).toHaveLength(1)
    expect(await auditRows(app, "user.email_change_reverted", account.user.id)).toHaveLength(0)
    const after = (await sentTo(app, account.email)).filter(
      (m) => m.subject === REVERTED || m.subject === RESET
    )
    expect(after).toHaveLength(0)
  })

  describe("an unverified account on the old address", () => {
    // The squat: whoever changed the address signs the freed one up (no mailbox proof needed) so
    // the owner's undo would find it taken. The revert link proves that mailbox, so the
    // unverified holder is displaced: purged like any squatter, then the address restored.
    test("is purged and the address restored: the undo cannot be defeated by a sign-up", async () => {
      const account = await changed(app)
      const decoy = await signUp(app, account.email)
      await clientFor(app).auth.magicLink.request({ email: account.email })
      await app.drain()
      expect(await sessionCount(app, decoy.user.id)).toBe(1)
      expect(
        (await app.db.sql`SELECT id FROM tokens WHERE user_id = ${decoy.user.id}`).length
      ).toBeGreaterThan(0)

      const result = await clientFor(app).auth.emailChange.revert({ token: account.revert })
      expect(result).toEqual({ passwordReset: true })
      const row = await app.db.users.find(account.user.id)
      expect(row?.email).toBe(account.email)
      expect(row?.email_verified_at).not.toBeNull()
      // The decoy is gone, with its sessions and tokens (the magic link to the address too).
      expect(await app.db.users.find(decoy.user.id)).toBeUndefined()
      expect(await sessionCount(app, decoy.user.id)).toBe(0)
      expect(await app.db.sql`SELECT id FROM tokens WHERE user_id = ${decoy.user.id}`).toHaveLength(
        0
      )
      expect(
        await app.db.sql`
          SELECT id FROM tokens WHERE email = ${account.email} AND purpose = 'magic_link'
            AND consumed_at IS NULL
        `
      ).toHaveLength(0)
      expect((await safe(decoy.client.auth.me()))[0]).toMatchObject({ code: "UNAUTHORIZED" })
      // Audited as the system's doing, the address masked.
      const [audit] = await auditRows(app, "user.displaced_by_revert", decoy.user.id)
      expect(audit).toBeDefined()
      const [actor] = await app.db.sql`
        SELECT actor_user_id FROM audit_log
        WHERE action = 'user.displaced_by_revert' AND target_id = ${String(decoy.user.id)}
      `
      expect(actor?.actor_user_id).toBeNull()
      expect(JSON.parse(audit?.metadata ?? "{}")).toEqual({
        email: maskEmail(account.email),
        revertedUserId: account.user.id,
      })
      expect(await mailsTo(app, account.email, REVERTED)).toHaveLength(1)
    })

    test("a member of a workspace is never purged by a revert: CONFLICT, nothing changes", async () => {
      const account = await changed(app)
      const decoy = await signUp(app, account.email)
      // Unreachable through the api (joining needs a verified email); the guard holds anyway.
      const owner = await signUpWithWorkspace(app, fresh("ws-owner"))
      await app.db.memberships.add({
        workspaceId: owner.workspaceId,
        userId: decoy.user.id,
        role: "member",
      })
      const [error] = await safe(clientFor(app).auth.emailChange.revert({ token: account.revert }))
      expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_REVERT_TAKEN_MESSAGE })
      expect((await app.db.users.find(decoy.user.id))?.email).toBe(account.email)
      expect((await app.db.users.find(account.user.id))?.email).toBe(account.newEmail)
      expect(await liveTokens(app, account.user.id, "email_change_revert")).toHaveLength(1)
      expect(await auditRows(app, "user.displaced_by_revert", decoy.user.id)).toHaveLength(0)
    })
  })

  test("an unknown, used or expired link is BAD_REQUEST", async () => {
    const invalid = { code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE }
    const anonymous = clientFor(app)
    const [unknown] = await safe(anonymous.auth.emailChange.revert({ token: "nope" }))
    expect(unknown).toMatchObject(invalid)
    const used = await changed(app)
    await anonymous.auth.emailChange.revert({ token: used.revert })
    const [again] = await safe(anonymous.auth.emailChange.revert({ token: used.revert }))
    expect(again).toMatchObject(invalid)
    const expired = await changed(app)
    await app.db.sql`
      UPDATE tokens SET expires_at = ${new Date(Date.now() - 1000).toISOString()}
      WHERE token_hash = ${tokenHash(expired.revert)}
    `
    const [late] = await safe(anonymous.auth.emailChange.revert({ token: expired.revert }))
    expect(late).toMatchObject(invalid)
    expect((await app.db.users.find(expired.user.id))?.email).toBe(expired.newEmail)
    expect(await sessionCount(app, expired.user.id)).toBe(1)
  })

  describe("after a second change", () => {
    /** A → B (revert link 1 to A, the owner's) → C (revert link 2 to B, the new holder's). */
    async function twice() {
      const first = await changed(app)
      const third = fresh("third")
      await first.client.account.email.requestChange({ newEmail: third, password: PASSWORD })
      await first.client.account.email.confirmChange({
        token: await linkToken(app, third, CONFIRM, "/email/confirm"),
      })
      const second = await linkToken(app, first.newEmail, CHANGED, "/email/revert")
      return { ...first, third, ownerRevert: first.revert, laterRevert: second }
    }

    test("the first link restores the first address, and the later link dies", async () => {
      const t = await twice()
      await clientFor(app).auth.emailChange.revert({ token: t.ownerRevert })
      expect((await app.db.users.find(t.user.id))?.email).toBe(t.email)
      expect(await liveTokens(app, t.user.id, "email_change_revert")).toHaveLength(0)
      const [later] = await safe(clientFor(app).auth.emailChange.revert({ token: t.laterRevert }))
      expect(later).toMatchObject({ code: "BAD_REQUEST" })
      expect((await app.db.users.find(t.user.id))?.email).toBe(t.email)
    })

    test("the later link cannot take the first one with it: the owner still gets back", async () => {
      const t = await twice()
      // Whoever holds B undoes their own step first…
      await clientFor(app).auth.emailChange.revert({ token: t.laterRevert })
      expect((await app.db.users.find(t.user.id))?.email).toBe(t.newEmail)
      // …and the owner's older link still restores A.
      await clientFor(app).auth.emailChange.revert({ token: t.ownerRevert })
      const row = await app.db.users.find(t.user.id)
      expect(row?.email).toBe(t.email)
      expect(await liveTokens(app, t.user.id, "email_change_revert")).toHaveLength(0)
      expect(await sessionCount(app, t.user.id)).toBe(0)
    })

    test("the first address verified by another account meanwhile is CONFLICT", async () => {
      const t = await twice()
      await signUpVerified(app, t.email)
      const [error] = await safe(clientFor(app).auth.emailChange.revert({ token: t.ownerRevert }))
      expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_REVERT_TAKEN_MESSAGE })
      expect((await app.db.users.find(t.user.id))?.email).toBe(t.third)
      expect(await liveTokens(app, t.user.id, "email_change_revert")).toHaveLength(2)
    })
  })

  test("mail locale: the account's saved language, else English — never the request's", async () => {
    const chose = await changed(app)
    await chose.client.account.setLocale({ locale: "sv" })
    await clientFor(app, undefined, "en").auth.emailChange.revert({ token: chose.revert })
    expect(await mailsTo(app, chose.email, svEmail("emailChangeReverted.subject"))).toHaveLength(1)
    expect(await mailsTo(app, chose.email, svEmail("resetPassword.subject"))).toHaveLength(1)

    const never = await changed(app)
    await clientFor(app, undefined, "sv").auth.emailChange.revert({ token: never.revert })
    expect(await mailsTo(app, never.email, REVERTED)).toHaveLength(1)
    expect(await mailsTo(app, never.email, RESET)).toHaveLength(1)
  })

  test("a failed notice enqueue rolls the revert back", async () => {
    const account = await changed(app)
    // Only the restored mailbox's notice fails (the reset link's insert comes first and passes).
    const restore = failJobInserts(app, "emailChangeReverted")
    const [error] = await safe(
      clientFor(app).auth.emailChange.revert({ token: account.revert })
    ).finally(restore)
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    const row = await app.db.users.find(account.user.id)
    expect(row?.email).toBe(account.newEmail)
    expect(row?.password_hash).not.toBeNull()
    expect(await sessionCount(app, account.user.id)).toBe(1)
    expect(await liveTokens(app, account.user.id, "email_change_revert")).toHaveLength(1)
    await clientFor(app).auth.emailChange.revert({ token: account.revert })
    expect((await app.db.users.find(account.user.id))?.email).toBe(account.email)
  })
})

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("cancel under real overlap (Postgres)", () => {
  test("a cancel racing a confirm: exactly one lands, and the account is consistent", async () => {
    const account = await requested(app)
    const cancel = await linkToken(app, account.email, REQUESTED, "/email/cancel")
    const restore = overlapNextTransactions(app, 2)
    const [confirmed, cancelled] = await Promise.all([
      safe(account.client.account.email.confirmChange({ token: account.token })),
      safe(clientFor(app).auth.emailChange.cancel({ token: cancel })),
    ]).finally(restore)
    const invalid = { code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE }
    const row = await app.db.users.find(account.user.id)
    if (cancelled?.[0] === null) {
      // Cancel first: the confirm link was void when the confirm got the lock.
      expect(confirmed?.[0]).toMatchObject(invalid)
      expect(row?.email).toBe(account.email)
      expect(await tokenRows(app, account.user.id, "email_change_revert")).toHaveLength(0)
      expect(await sessionCount(app, account.user.id)).toBe(0)
    } else {
      // Confirm first: it voided the cancel link, and kept the caller's session.
      expect(cancelled?.[0]).toMatchObject(invalid)
      expect(confirmed?.[0]).toBeNull()
      expect(row?.email).toBe(account.newEmail)
      expect(await liveTokens(app, account.user.id, "email_change_revert")).toHaveLength(1)
      expect(await sessionCount(app, account.user.id)).toBe(1)
    }
    expect(await liveTokens(app, account.user.id, "email_change")).toHaveLength(0)
  })
})

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("revert under real overlap (Postgres)", () => {
  test("a confirm racing a revert: the account ends on the original address", async () => {
    const account = await changed(app)
    const third = fresh("race-third")
    await account.client.account.email.requestChange({ newEmail: third, password: PASSWORD })
    const confirm = await linkToken(app, third, CONFIRM, "/email/confirm")
    const restore = overlapNextTransactions(app, 2)
    const results = await Promise.all([
      safe(account.client.account.email.confirmChange({ token: confirm })),
      safe(clientFor(app).auth.emailChange.revert({ token: account.revert })),
    ]).finally(restore)
    // The revert always lands; the confirm either lost (its link voided) or went first.
    expect(results[1]?.[0]).toBeNull()
    const row = await app.db.users.find(account.user.id)
    expect(row?.email).toBe(account.email)
    expect(await sessionCount(app, account.user.id)).toBe(0)
    expect(await liveTokens(app, account.user.id, "email_change_revert")).toHaveLength(0)
    expect(await liveTokens(app, account.user.id, "email_change")).toHaveLength(0)
    const holders = await app.db.sql`SELECT id FROM users WHERE email = ${third}`
    expect(holders).toHaveLength(0)
  })

  test("two reverts of the same account: the oldest link's address wins either way", async () => {
    const first = await changed(app)
    const third = fresh("race2-third")
    await first.client.account.email.requestChange({ newEmail: third, password: PASSWORD })
    await first.client.account.email.confirmChange({
      token: await linkToken(app, third, CONFIRM, "/email/confirm"),
    })
    const later = await linkToken(app, first.newEmail, CHANGED, "/email/revert")
    const restore = overlapNextTransactions(app, 2)
    await Promise.all([
      safe(clientFor(app).auth.emailChange.revert({ token: later })),
      safe(clientFor(app).auth.emailChange.revert({ token: first.revert })),
    ]).finally(restore)
    expect((await app.db.users.find(first.user.id))?.email).toBe(first.email)
    expect(await liveTokens(app, first.user.id, "email_change_revert")).toHaveLength(0)
    expect(await sessionCount(app, first.user.id)).toBe(0)
  })

  // A sign-up on the old address racing the revert: the unique index decides, and either way the
  // answer is a clean one (never the index's 500) and one account holds the address.
  test("a sign-up committing after the revert's holder check: the revert is CONFLICT", async () => {
    const account = await changed(app)
    let checked = () => {}
    const holderChecked = new Promise<void>((resolve) => {
      checked = resolve
    })
    let signedUp = () => {}
    const signUpDone = new Promise<void>((resolve) => {
      signedUp = resolve
    })
    const restore = patchTransactions(app, (tx) => ({
      ...tx,
      users: {
        ...tx.users,
        findByEmail: async (email: string) => {
          const found = await tx.users.findByEmail(email)
          checked()
          await signUpDone
          return found
        },
      },
    }))
    const revert = safe(clientFor(app).auth.emailChange.revert({ token: account.revert }))
    await holderChecked
    const decoy = await signUp(app, account.email).finally(signedUp)
    const [error] = await revert.finally(restore)
    expect(error).toMatchObject({ code: "CONFLICT", message: EMAIL_CHANGE_REVERT_TAKEN_MESSAGE })
    expect((await app.db.users.find(account.user.id))?.email).toBe(account.newEmail)
    // The link stayed unspent: a second try displaces the (unverified) decoy.
    await clientFor(app).auth.emailChange.revert({ token: account.revert })
    expect((await app.db.users.find(account.user.id))?.email).toBe(account.email)
    expect(await app.db.users.find(decoy.user.id)).toBeUndefined()
  })

  test("a sign-up arriving while the revert writes the address: the sign-up is CONFLICT", async () => {
    const account = await changed(app)
    let written = () => {}
    const addressWritten = new Promise<void>((resolve) => {
      written = resolve
    })
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const restore = patchTransactions(app, (tx) => ({
      ...tx,
      users: {
        ...tx.users,
        changeEmail: async (id: number, email: string, at: string) => {
          await tx.users.changeEmail(id, email, at)
          written()
          await released
        },
      },
    }))
    const revert = safe(clientFor(app).auth.emailChange.revert({ token: account.revert }))
    await addressWritten
    // The sign-up's insert waits on the revert's uncommitted row, then hits the unique index.
    const signUpResult = safe(
      clientFor(app).auth.signUp({ email: account.email, password: PASSWORD })
    )
    await Bun.sleep(200)
    release()
    const [revertError] = await revert.finally(restore)
    const [signUpError] = await signUpResult
    expect(revertError).toBeNull()
    expect(signUpError).toMatchObject({ code: "CONFLICT" })
    const holders = await app.db.sql`SELECT id FROM users WHERE email = ${account.email}`
    expect(holders.map((row: { id: number }) => row.id)).toEqual([account.user.id])
  })

  test("the same link twice at once: one restores, the other is BAD_REQUEST", async () => {
    const account = await changed(app)
    const restore = overlapNextTransactions(app, 2)
    const results = await Promise.all([
      safe(clientFor(app).auth.emailChange.revert({ token: account.revert })),
      safe(clientFor(app).auth.emailChange.revert({ token: account.revert })),
    ]).finally(restore)
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
      { code: "BAD_REQUEST", message: EMAIL_CHANGE_LINK_INVALID_MESSAGE },
    ])
    expect((await app.db.users.find(account.user.id))?.email).toBe(account.email)
    await app.drain()
    expect(
      app.mailer.sent.filter((m) => m.to === account.email && m.subject === REVERTED)
    ).toHaveLength(1)
  })
})
