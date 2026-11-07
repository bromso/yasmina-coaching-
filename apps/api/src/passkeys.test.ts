import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ApiClient,
  IMPERSONATING_MESSAGE,
  isTwoFactorChallenge,
  MAX_PASSKEYS,
  PASSKEY_FAILED_MESSAGE,
  PASSKEY_LAST_WAY_IN_MESSAGE,
  PASSKEY_LIMIT_MESSAGE,
  PASSKEY_NAME_DEVICE,
  PASSKEY_NAME_SECURITY_KEY,
  PASSKEY_NOT_FOUND_MESSAGE,
  PASSKEY_RATE_MESSAGE,
  PASSKEY_REAUTH_MESSAGE,
  PASSKEY_REGISTER_FAILED_MESSAGE,
  TWO_FACTOR_PASSWORD_REASON,
  TWO_FACTOR_REAUTH_REASON,
} from "@repo/api-contract"
import {
  magicLinkSubject as MAGIC,
  passkeyAddedSubject,
  passkeyRemovedSubject,
  resetPasswordSubject as RESET,
} from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server"
import { tokenHash } from "./credentials"
import {
  cleanTransports,
  counterAdvances,
  parseTransports,
  relyingParty,
  userHandleFor,
} from "./passkeys"
import {
  createCredential,
  derSignature,
  getAssertion,
  type SoftCredential,
  TEST_ACCOUNT_ORIGIN,
  TEST_AUTH_ORIGIN,
  TEST_RP_ID,
} from "./test-authenticator"
import {
  auth,
  clientFor,
  enableTwoFactor,
  mailsTo,
  signedIn,
  signUp,
  signUpVerified,
  start,
} from "./test-server"

const PASSWORD = "correct horse battery"
const sv = translatorFor("sv", "api")

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

type App = typeof app
type Account = Awaited<ReturnType<typeof signUp>>

/** Runs `registerOptions` → the software authenticator → `register` for `account`. */
async function addPasskey(
  account: { client: Account["client"] },
  ceremony: Parameters<typeof createCredential>[1] & { name?: string } = {}
) {
  const { options, challengeId } = await account.client.account.passkeys.registerOptions({
    password: PASSWORD,
  })
  const { credential, response } = await createCredential(
    options as PublicKeyCredentialCreationOptionsJSON,
    ceremony
  )
  const passkey = await account.client.account.passkeys.register({
    challengeId,
    response,
    name: ceremony.name,
  })
  return { credential, passkey }
}

/** An account with one passkey, ready to sign in with. */
async function withPasskey(a: App = app) {
  const account = await signUp(a)
  const { credential, passkey } = await addPasskey(account)
  return { ...account, credential, passkey }
}

/** `auth.passkey.options` → an assertion by `credential` → `auth.passkey.verify`. */
async function signInWith(
  a: App,
  credential: SoftCredential,
  ceremony: Parameters<typeof getAssertion>[2] = {},
  locale?: string
) {
  const anonymous = clientFor(a, undefined, locale)
  const { options, challengeId } = await anonymous.auth.passkey.options()
  const response = await getAssertion(
    options as PublicKeyCredentialRequestOptionsJSON,
    credential,
    ceremony
  )
  return safe(anonymous.auth.passkey.verify({ challengeId, response }))
}

const storedRow = async (a: App, credentialId: string) => {
  const row = await a.db.passkeys.findByCredentialId(credentialId)
  if (!row) throw new Error("no passkey row")
  return row
}

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

describe("helpers", () => {
  test("parseTransports reads stored JSON defensively", () => {
    expect(parseTransports(null)).toBeUndefined()
    expect(parseTransports("not json")).toBeUndefined()
    expect(parseTransports('{"a":1}')).toBeUndefined()
    expect(parseTransports("[]")).toBeUndefined()
    expect(parseTransports('["usb","bogus",3,"usb","nfc"]')).toEqual(["usb", "nfc"])
  })

  test("cleanTransports keeps only known transport strings", () => {
    expect(cleanTransports(["internal", "hybrid", "x"])).toEqual(["internal", "hybrid"])
    expect(cleanTransports("internal")).toBeUndefined()
  })

  test("counterAdvances: both zero, or strictly greater", () => {
    expect(counterAdvances(0, 0)).toBe(true)
    expect(counterAdvances(0, 1)).toBe(true)
    expect(counterAdvances(5, 6)).toBe(true)
    expect(counterAdvances(5, 5)).toBe(false)
    expect(counterAdvances(5, 4)).toBe(false)
    expect(counterAdvances(5, 0)).toBe(false)
  })

  test("relyingParty takes the origins of AUTH_URL and ACCOUNT_URL only", () => {
    expect(
      relyingParty({
        id: "brand.com",
        name: "Brand",
        authUrl: "https://auth.brand.com/some/path",
        accountUrl: "https://account.brand.com",
      })
    ).toEqual({
      id: "brand.com",
      name: "Brand",
      origins: ["https://auth.brand.com", "https://account.brand.com"],
    })
  })

  test("derSignature encodes r and s as positive DER integers", () => {
    const raw = new Uint8Array(64)
    raw[0] = 0x80 // r needs a sign byte
    raw[63] = 0x01 // s is 1 after its leading zeros go
    expect([...derSignature(raw)].slice(0, 4)).toEqual([0x30, 2 + 33 + 3, 0x02, 33])
    expect([...derSignature(raw)].slice(-3)).toEqual([0x02, 1, 1])
  })
})

describe("account.passkeys registration", () => {
  test("register then list: named from the transports, counted on the user", async () => {
    const account = await signUp(app)
    expect(await account.client.account.passkeys.list()).toEqual([])
    const { passkey } = await addPasskey(account)
    expect(passkey).toMatchObject({ name: PASSKEY_NAME_DEVICE, lastUsedAt: null })
    expect(await account.client.account.passkeys.list()).toEqual([passkey])
    expect((await account.client.auth.me()).user.passkeys).toBe(1)

    const { passkey: key } = await addPasskey(account, { transports: ["usb", "nfc"] })
    expect(key.name).toBe(PASSKEY_NAME_SECURITY_KEY)
    const { passkey: none } = await addPasskey(account, { transports: [] })
    expect(none.name).toBe(PASSKEY_NAME_SECURITY_KEY)
    const { passkey: named } = await addPasskey(account, { name: "  Work laptop " })
    expect(named.name).toBe("Work laptop")
    expect((await account.client.account.passkeys.list()).map((p) => p.id)).toEqual([
      passkey.id,
      key.id,
      none.id,
      named.id,
    ])
  })

  test("the default name is translated", async () => {
    const account = await signUp(app)
    const swedish = { client: clientFor(app, account.token, "sv") }
    const { passkey } = await addPasskey(swedish)
    expect(passkey.name).toBe(sv("passkeyNameDevice"))
    expect(passkey.name).not.toBe(PASSKEY_NAME_DEVICE)
  })

  test("a successful register mails the account owner, naming the new passkey", async () => {
    const account = await signUp(app)
    const { passkey } = await addPasskey(account, { name: "Work laptop" })
    const [mail] = await mailsTo(app, account.email, passkeyAddedSubject)
    expect(mail?.text).toContain(passkey.name)
  })

  test("the stored row holds the credential, never the raw challenge", async () => {
    const account = await signUp(app)
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const creation = options as PublicKeyCredentialCreationOptionsJSON
    expect(challengeId).toBe(creation.challenge)
    const [stored] = await app.db
      .sql`SELECT * FROM tokens WHERE token_hash = ${tokenHash(challengeId)}`
    expect(stored).toMatchObject({
      purpose: "passkey_challenge",
      ceremony: "register",
      user_id: account.user.id,
    })
    const leaked = await app.db.sql`SELECT id FROM tokens WHERE token_hash = ${challengeId}`
    expect(leaked).toHaveLength(0)
    const { credential, response } = await createCredential(creation)
    await account.client.account.passkeys.register({ challengeId, response })
    const row = await storedRow(app, credential.id)
    expect(row).toMatchObject({ user_id: account.user.id, counter: 0 })
    expect(JSON.parse(row.transports ?? "null")).toEqual(["internal", "hybrid"])
  })

  test("creation options: our RP, the user's handle, discoverable, verified, existing excluded", async () => {
    const account = await signUp(app)
    const { credential } = await addPasskey(account, { transports: ["usb"] })
    // A malformed stored transports value must not break the next options call.
    await app.db
      .sql`UPDATE passkeys SET transports = ${"{broken"} WHERE credential_id = ${credential.id}`
    const { options } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const creation = options as PublicKeyCredentialCreationOptionsJSON
    expect(creation.rp).toMatchObject({ id: TEST_RP_ID })
    expect(creation.user).toMatchObject({ id: userHandleFor(account.user.id), name: account.email })
    expect(creation.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    })
    expect(creation.attestation).toBe("none")
    expect(creation.excludeCredentials?.map((c) => c.id)).toEqual([credential.id])
  })

  test("an account with a password must give it, and a wrong one is refused", async () => {
    const account = await signUp(app)
    for (const password of [undefined, "wrong horse battery"]) {
      const [error] = await safe(account.client.account.passkeys.registerOptions({ password }))
      expect(error).toMatchObject({
        code: "UNAUTHORIZED",
        data: { reason: TWO_FACTOR_PASSWORD_REASON },
      })
    }
  })

  test("password attempts share the management budget", async () => {
    const own = await start({
      twoFactorUserLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const account = await signUp(own)
      for (let i = 0; i < 2; i++) {
        const [error] = await safe(
          account.client.account.passkeys.registerOptions({ password: "nope" })
        )
        expect(error).toMatchObject({ code: "UNAUTHORIZED" })
      }
      const [error] = await safe(
        account.client.account.passkeys.registerOptions({ password: PASSWORD })
      )
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await own.stop()
    }
  })

  test("a passwordless account needs a session under 10 minutes old", async () => {
    const fresh = await passwordlessUser(app, "passkey-passwordless@example.com")
    const ok = await fresh.client.account.passkeys.registerOptions({})
    expect(ok.challengeId.length).toBeGreaterThan(20)

    const old = await passwordlessUser(app, "passkey-passwordless-old@example.com")
    await backdateSessions(app, old.user.id, 11 * 60_000)
    const [error] = await safe(old.client.account.passkeys.registerOptions({}))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: PASSKEY_REAUTH_MESSAGE,
      data: { reason: TWO_FACTOR_REAUTH_REASON },
    })
  })

  test("a challenge minted for another user cannot register", async () => {
    const victim = await signUp(app)
    const attacker = await signUp(app)
    const { options, challengeId } = await victim.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const { response } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
    const [error] = await safe(attacker.client.account.passkeys.register({ challengeId, response }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: PASSKEY_REGISTER_FAILED_MESSAGE })
    expect(await attacker.client.account.passkeys.list()).toEqual([])
    expect(await victim.client.account.passkeys.list()).toEqual([])
  })

  test("a registration challenge works once", async () => {
    const account = await signUp(app)
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const creation = options as PublicKeyCredentialCreationOptionsJSON
    const first = await createCredential(creation)
    await account.client.account.passkeys.register({ challengeId, response: first.response })
    const second = await createCredential(creation)
    const [error] = await safe(
      account.client.account.passkeys.register({ challengeId, response: second.response })
    )
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect(await account.client.account.passkeys.list()).toHaveLength(1)
  })

  test("a sign-in challenge cannot register, even one bound to the caller", async () => {
    const account = await signUp(app)
    const { options: creation } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const { challengeId } = await clientFor(app).auth.passkey.options()
    // A sign-in challenge names no user, which would refuse it on the user binding alone. Bind it
    // to the caller so that only the ceremony differs from a valid registration challenge.
    await app.db.sql`UPDATE tokens SET user_id = ${account.user.id}
      WHERE token_hash = ${tokenHash(challengeId)}`
    const { response } = await createCredential(
      creation as PublicKeyCredentialCreationOptionsJSON,
      {
        challenge: challengeId,
      }
    )
    const [error] = await safe(account.client.account.passkeys.register({ challengeId, response }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: PASSKEY_REGISTER_FAILED_MESSAGE })
    expect(await account.client.account.passkeys.list()).toEqual([])
  })

  test("a failed registration spends its challenge: a good response after it is refused", async () => {
    const account = await signUp(app)
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const creation = options as PublicKeyCredentialCreationOptionsJSON
    const bad = await createCredential(creation, { origin: "http://evil.example.org" })
    const [first] = await safe(
      account.client.account.passkeys.register({ challengeId, response: bad.response })
    )
    expect(first).toMatchObject({ code: "BAD_REQUEST" })
    const good = await createCredential(creation)
    const [second] = await safe(
      account.client.account.passkeys.register({ challengeId, response: good.response })
    )
    expect(second).toMatchObject({ code: "BAD_REQUEST", message: PASSKEY_REGISTER_FAILED_MESSAGE })
    expect(await account.client.account.passkeys.list()).toEqual([])
  })

  const refusedRegistrations: [string, Parameters<typeof createCredential>[1]][] = [
    ["a wrong origin", { origin: "http://evil.example.org" }],
    ["a sibling origin outside the list", { origin: "http://app.example.com" }],
    ["https instead of the configured http", { origin: "https://account.example.com" }],
    ["a wrong RP ID", { rpId: "evil.com" }],
    ["no user verification", { userVerified: false }],
    ["a response for another challenge", { challenge: "c29tZXRoaW5nLWVsc2U" }],
  ]
  for (const [label, ceremony] of refusedRegistrations) {
    test(`registration refuses ${label}`, async () => {
      const account = await signUp(app)
      const { options, challengeId } = await account.client.account.passkeys.registerOptions({
        password: PASSWORD,
      })
      const { response } = await createCredential(
        options as PublicKeyCredentialCreationOptionsJSON,
        ceremony
      )
      const [error] = await safe(
        account.client.account.passkeys.register({ challengeId, response })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: PASSKEY_REGISTER_FAILED_MESSAGE })
      expect(await account.client.account.passkeys.list()).toEqual([])
    })
  }

  test("a malformed registration response is a 400, never a 500", async () => {
    const account = await signUp(app)
    for (const response of [null, "nope", {}, { id: "x", response: {} }, { response: [] }]) {
      const { challengeId } = await account.client.account.passkeys.registerOptions({
        password: PASSWORD,
      })
      const [error] = await safe(
        account.client.account.passkeys.register({ challengeId, response })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  })

  test("a credential id already registered is the declared refusal, never a 500", async () => {
    const owner = await signUp(app)
    const { credential } = await addPasskey(owner)
    const other = await signUp(app)
    for (const account of [owner, other]) {
      const { options, challengeId } = await account.client.account.passkeys.registerOptions({
        password: PASSWORD,
      })
      const { response } = await createCredential(
        options as PublicKeyCredentialCreationOptionsJSON,
        { reuse: credential }
      )
      const [error] = await safe(
        account.client.account.passkeys.register({ challengeId, response })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: PASSKEY_REGISTER_FAILED_MESSAGE })
    }
    expect(await owner.client.account.passkeys.list()).toHaveLength(1)
    expect(await other.client.account.passkeys.list()).toEqual([])
    expect((await storedRow(app, credential.id)).user_id).toBe(owner.user.id)
  })

  test("the account origin and the auth origin may both register", async () => {
    const account = await signUp(app)
    for (const origin of [TEST_ACCOUNT_ORIGIN, TEST_AUTH_ORIGIN]) {
      await addPasskey(account, { origin })
    }
    expect(await account.client.account.passkeys.list()).toHaveLength(2)
  })
})

describe("account.passkeys rename and delete", () => {
  test("rename and delete the caller's own passkey", async () => {
    const account = await withPasskey()
    await account.client.account.passkeys.rename({ id: account.passkey.id, name: "Phone" })
    expect((await account.client.account.passkeys.list())[0]?.name).toBe("Phone")
    await account.client.account.passkeys.delete({ id: account.passkey.id })
    expect(await account.client.account.passkeys.list()).toEqual([])
    expect((await account.client.auth.me()).user.passkeys).toBe(0)
    const [signIn] = await signInWith(app, account.credential)
    expect(signIn).toMatchObject({ code: "UNAUTHORIZED" })
    const [mail] = await mailsTo(app, account.email, passkeyRemovedSubject)
    expect(mail?.text).toContain("Phone")
  })

  test("another user's passkey, or none, is NOT_FOUND and left alone", async () => {
    const owner = await withPasskey()
    const other = await signUp(app)
    for (const id of [owner.passkey.id, 999_999]) {
      const [renamed] = await safe(other.client.account.passkeys.rename({ id, name: "Mine now" }))
      expect(renamed).toMatchObject({ code: "NOT_FOUND", message: PASSKEY_NOT_FOUND_MESSAGE })
      const [deleted] = await safe(other.client.account.passkeys.delete({ id }))
      expect(deleted).toMatchObject({ code: "NOT_FOUND", message: PASSKEY_NOT_FOUND_MESSAGE })
    }
    expect(await owner.client.account.passkeys.list()).toEqual([owner.passkey])
  })

  test("rename refuses an empty or too long name", async () => {
    const account = await withPasskey()
    for (const name of ["   ", "x".repeat(61)]) {
      const [error] = await safe(
        account.client.account.passkeys.rename({ id: account.passkey.id, name })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  })
})

describe("account.passkeys.delete: the last way in", () => {
  test("deleting the only passkey is a conflict when the account has no password and no identity", async () => {
    const user = await passwordlessUser(app, "passkey-lockout@example.com")
    const { passkey } = await addPasskey(user)
    const [error] = await safe(user.client.account.passkeys.delete({ id: passkey.id }))
    expect(error).toMatchObject({ code: "CONFLICT", message: PASSKEY_LAST_WAY_IN_MESSAGE })
    expect(await user.client.account.passkeys.list()).toEqual([passkey])
  })

  test("the refusal is translated", async () => {
    const user = await passwordlessUser(app, "passkey-lockout-sv@example.com")
    const { passkey } = await addPasskey(user)
    const swedish = { client: clientFor(app, user.token, "sv") }
    const [error] = await safe(swedish.client.account.passkeys.delete({ id: passkey.id }))
    expect(error).toMatchObject({ code: "CONFLICT", message: sv("passkeyLastWayIn") })
    expect(sv("passkeyLastWayIn")).not.toBe(PASSKEY_LAST_WAY_IN_MESSAGE)
  })

  test("a password keeps the rule from ever applying", async () => {
    // withPasskey() signs up with a password, so this is the ordinary case already covered by
    // "rename and delete the caller's own passkey" above — asserted again here, explicitly, next
    // to the rule it is the counter-example for.
    const account = await withPasskey()
    await account.client.account.passkeys.delete({ id: account.passkey.id })
    expect(await account.client.account.passkeys.list()).toEqual([])
  })

  test("a connected identity keeps the rule from applying, even with no password", async () => {
    const user = await passwordlessUser(app, "passkey-identity@example.com")
    await app.db.identities.create({
      userId: user.user.id,
      provider: "github",
      providerUserId: "gh-passkey-identity",
      email: user.email,
    })
    const { passkey } = await addPasskey(user)
    await user.client.account.passkeys.delete({ id: passkey.id })
    expect(await user.client.account.passkeys.list()).toEqual([])
  })

  test("only the truly last passkey triggers the conflict", async () => {
    const user = await passwordlessUser(app, "passkey-two@example.com")
    const first = await addPasskey(user)
    const second = await addPasskey(user)
    // Two passkeys: deleting either one leaves the other, so neither delete is the last way in.
    await user.client.account.passkeys.delete({ id: first.passkey.id })
    expect(await user.client.account.passkeys.list()).toEqual([second.passkey])
    // Now there is exactly one: deleting it is refused.
    const [error] = await safe(user.client.account.passkeys.delete({ id: second.passkey.id }))
    expect(error).toMatchObject({ code: "CONFLICT", message: PASSKEY_LAST_WAY_IN_MESSAGE })
    expect(await user.client.account.passkeys.list()).toEqual([second.passkey])
  })

  test("concurrent deletes of the last two passkeys: exactly one succeeds", async () => {
    const user = await passwordlessUser(app, "passkey-race@example.com")
    const first = await addPasskey(user)
    const second = await addPasskey(user)
    const results = await Promise.all([
      safe(user.client.account.passkeys.delete({ id: first.passkey.id })),
      safe(user.client.account.passkeys.delete({ id: second.passkey.id })),
    ])
    const succeeded = results.filter(([error]) => error === null)
    const conflicts = results.filter(([error]) => (error as { code?: string })?.code === "CONFLICT")
    expect(succeeded).toHaveLength(1)
    expect(conflicts).toHaveLength(1)
    // The account is never left with zero passkeys and no other way in.
    expect(await user.client.account.passkeys.list()).toHaveLength(1)
  })
})

describe("impersonation", () => {
  test("an impersonation session may list but not add, rename or remove", async () => {
    const root = "root-passkeys@example.com"
    const own = await start({ superadminEmails: [root] })
    try {
      const admin = await signUpVerified(own, root)
      const target = await withPasskey(own)
      const { token } = await admin.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support",
      })
      const as = clientFor(own, token)
      expect(await as.account.passkeys.list()).toEqual([target.passkey])
      // Thunks, run one at a time: a rejection created early but awaited late is reported as
      // unhandled.
      const attempts: (() => Promise<unknown>)[] = [
        () => as.account.passkeys.registerOptions({ password: PASSWORD }),
        () => as.account.passkeys.register({ challengeId: "x", response: {} }),
        () => as.account.passkeys.rename({ id: target.passkey.id, name: "Hijacked" }),
        () => as.account.passkeys.delete({ id: target.passkey.id }),
      ]
      for (const attempt of attempts) {
        const error = await attempt().then(
          () => null,
          (thrown: unknown) => thrown
        )
        expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
      }
      expect(await target.client.account.passkeys.list()).toEqual([target.passkey])
    } finally {
      await own.stop()
    }
  })

  test("a challenge minted outside impersonation cannot be spent by it", async () => {
    const root = "root-passkeys-2@example.com"
    const own = await start({ superadminEmails: [root] })
    try {
      const admin = await signUpVerified(own, root)
      const target = await signUp(own)
      const { options, challengeId } = await target.client.account.passkeys.registerOptions({
        password: PASSWORD,
      })
      const { token } = await admin.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support",
      })
      const { response } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
      const [error] = await safe(
        clientFor(own, token).account.passkeys.register({ challengeId, response })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
      expect(await target.client.account.passkeys.list()).toEqual([])
    } finally {
      await own.stop()
    }
  })
})

describe("auth.passkey sign-in", () => {
  test("a registered passkey signs in: a session, the use recorded", async () => {
    const account = await withPasskey()
    const [error, result] = await signInWith(app, account.credential, {}, undefined)
    expect(error).toBeNull()
    if (!result) throw new Error("no result")
    expect(isTwoFactorChallenge(result)).toBe(false)
    expect(result.user).toMatchObject({ id: account.user.id, passkeys: 1 })
    const me = await clientFor(app, result.session.token).auth.me()
    expect(me.user.id).toBe(account.user.id)
    const row = await storedRow(app, account.credential.id)
    expect(row.counter).toBe(0)
    expect(row.last_used_at).not.toBeNull()
    expect((await account.client.account.passkeys.list())[0]?.lastUsedAt).toBe(row.last_used_at)
  })

  test("the session carries the client info, like auth.signIn's", async () => {
    const account = await withPasskey()
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      account.credential
    )
    const { session } = await anonymous.auth.passkey.verify({
      challengeId,
      response,
      client: { userAgent: "Passkey Browser", ip: "203.0.113.9" },
    })
    const [row] = await app.db
      .sql`SELECT user_agent, ip, impersonated_by FROM sessions WHERE token_hash = ${tokenHash(session.token)}`
    expect(row).toEqual({ user_agent: "Passkey Browser", ip: "203.0.113.9", impersonated_by: null })
  })

  test("request options: our RP, verification required, no allowCredentials", async () => {
    const { options, challengeId } = await clientFor(app).auth.passkey.options()
    const request = options as PublicKeyCredentialRequestOptionsJSON
    expect(request.rpId).toBe(TEST_RP_ID)
    expect(request.userVerification).toBe("required")
    expect(request.allowCredentials ?? []).toEqual([])
    expect(challengeId).toBe(request.challenge)
    const [stored] = await app.db
      .sql`SELECT * FROM tokens WHERE token_hash = ${tokenHash(challengeId)}`
    expect(stored).toMatchObject({ ceremony: "authenticate", user_id: null })
  })

  test("a 2FA account signs in by passkey with no code, while a password still challenges", async () => {
    const account = await withPasskey()
    await enableTwoFactor(app, account.user.id)
    const [error, result] = await signInWith(app, account.credential)
    expect(error).toBeNull()
    expect(result && isTwoFactorChallenge(result)).toBe(false)
    expect(result).toHaveProperty("session.token")
    const password = await clientFor(app).auth.signIn({ email: account.email, password: PASSWORD })
    expect(isTwoFactorChallenge(password)).toBe(true)
  })

  test("an account scheduled for deletion signs in (so it can cancel)", async () => {
    const account = await withPasskey()
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString()
    await app.db.sql`UPDATE users SET deletion_scheduled_at = ${at} WHERE id = ${account.user.id}`
    const [error, result] = await signInWith(app, account.credential)
    expect(error).toBeNull()
    expect(result?.user.deletionScheduledAt).toBe(at)
  })

  const refusedAssertions: [string, Parameters<typeof getAssertion>[2]][] = [
    ["a wrong origin", { origin: "http://evil.example.org" }],
    ["a sibling subdomain not in the list", { origin: "http://app.example.com" }],
    ["https instead of the configured http", { origin: "https://auth.example.com" }],
    ["a wrong RP ID", { rpId: "evil.com" }],
    ["no user verification", { userVerified: false }],
    ["a response signed for another challenge", { challenge: "b3RoZXItY2hhbGxlbmdl" }],
    ["no user handle", { userHandle: null }],
  ]
  for (const [label, ceremony] of refusedAssertions) {
    test(`refuses ${label}, with the one generic message`, async () => {
      const account = await withPasskey()
      const [error] = await signInWith(app, account.credential, ceremony)
      expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
      expect((await storedRow(app, account.credential.id)).last_used_at).toBeNull()
    })
  }

  test("a user handle naming another user is refused", async () => {
    const victim = await withPasskey()
    const attacker = await withPasskey()
    // The attacker's own, genuinely signed credential, claiming to be the victim.
    const [error] = await signInWith(app, attacker.credential, {
      userHandle: userHandleFor(victim.user.id),
    })
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
  })

  test("an unknown credential gets the same answer", async () => {
    const account = await signUp(app)
    const { options } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    // Created by the authenticator, never registered with the api.
    const { credential } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
    const [error] = await signInWith(app, credential)
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
  })

  test("the refusal is translated", async () => {
    const account = await withPasskey()
    const [error] = await signInWith(app, account.credential, { userVerified: false }, "sv")
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: sv("passkeyFailed") })
  })

  test("a malformed response is a 401, never a 500", async () => {
    for (const response of [null, "nope", {}, { id: 5, response: {} }, { id: "x" }]) {
      const { challengeId } = await clientFor(app).auth.passkey.options()
      const [error] = await safe(clientFor(app).auth.passkey.verify({ challengeId, response }))
      expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
    }
    const [unknown] = await safe(
      clientFor(app).auth.passkey.verify({ challengeId: "never-minted", response: {} })
    )
    expect(unknown).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("a replayed assertion (same challenge) is refused", async () => {
    const account = await withPasskey()
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      account.credential
    )
    await anonymous.auth.passkey.verify({ challengeId, response })
    const [error] = await safe(anonymous.auth.passkey.verify({ challengeId, response }))
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
  })

  test("a failed sign-in spends its challenge: a genuine assertion after it is refused", async () => {
    const account = await withPasskey()
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const request = options as PublicKeyCredentialRequestOptionsJSON
    const bad = await getAssertion(request, account.credential, { userVerified: false })
    const [first] = await safe(anonymous.auth.passkey.verify({ challengeId, response: bad }))
    expect(first).toMatchObject({ code: "UNAUTHORIZED" })
    const good = await getAssertion(request, account.credential)
    const [second] = await safe(anonymous.auth.passkey.verify({ challengeId, response: good }))
    expect(second).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
    // The credential itself is fine: a fresh challenge signs in.
    const [error] = await signInWith(app, account.credential)
    expect(error).toBeNull()
  })

  test("two concurrent verifies of one challenge: exactly one wins", async () => {
    const account = await withPasskey()
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      account.credential
    )
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        safe(anonymous.auth.passkey.verify({ challengeId, response }))
      )
    )
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
  })

  test("an expired challenge is refused", async () => {
    const account = await withPasskey()
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const past = new Date(Date.now() - 1000).toISOString()
    await app.db
      .sql`UPDATE tokens SET expires_at = ${past} WHERE token_hash = ${tokenHash(challengeId)}`
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      account.credential
    )
    const [error] = await safe(anonymous.auth.passkey.verify({ challengeId, response }))
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
  })

  test("the challenge lives 5 minutes", async () => {
    const { challengeId } = await clientFor(app).auth.passkey.options()
    const [row] = await app.db
      .sql`SELECT expires_at FROM tokens WHERE token_hash = ${tokenHash(challengeId)}`
    const ttl = Date.parse(row.expires_at) - Date.now()
    expect(ttl).toBeGreaterThan(4 * 60_000)
    expect(ttl).toBeLessThanOrEqual(5 * 60_000)
  })

  test("a registration challenge cannot sign in", async () => {
    const account = await withPasskey()
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    const creation = options as PublicKeyCredentialCreationOptionsJSON
    const response = await getAssertion(
      { challenge: creation.challenge, rpId: TEST_RP_ID },
      account.credential
    )
    const [error] = await safe(clientFor(app).auth.passkey.verify({ challengeId, response }))
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
  })
})

describe("the signature counter", () => {
  /** A server whose `recordFailure` lines are captured (it logs before recording telemetry). */
  async function recording() {
    const logged: string[] = []
    const own = await start({ log: (message) => logged.push(message) })
    return { own, logged, counterLines: () => logged.filter((m) => m.includes("counter")) }
  }

  test("a forged assertion with a stale counter is refused and records nothing", async () => {
    const { own, counterLines } = await recording()
    try {
      const account = await withPasskey(own)
      await own.db
        .sql`UPDATE passkeys SET counter = 5 WHERE credential_id = ${account.credential.id}`
      const forger = (await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
      )) as CryptoKeyPair
      const [error] = await signInWith(own, account.credential, { counter: 3, signWith: forger })
      expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
      expect(counterLines()).toEqual([])
      const row = await storedRow(own, account.credential.id)
      expect(row).toMatchObject({ counter: 5, last_used_at: null })
    } finally {
      await own.stop()
    }
  })

  test("a genuine assertion whose counter does not increase is refused and recorded", async () => {
    const { own, counterLines } = await recording()
    try {
      const account = await withPasskey(own)
      await own.db
        .sql`UPDATE passkeys SET counter = 5 WHERE credential_id = ${account.credential.id}`
      for (const counter of [5, 4, 0]) {
        const [error] = await signInWith(own, account.credential, { counter })
        expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
      }
      expect(counterLines()).toHaveLength(3)
      expect(await storedRow(own, account.credential.id)).toMatchObject({
        counter: 5,
        last_used_at: null,
      })
      // A counter that does move on is accepted and stored.
      const [error] = await signInWith(own, account.credential, { counter: 6 })
      expect(error).toBeNull()
      expect((await storedRow(own, account.credential.id)).counter).toBe(6)
    } finally {
      await own.stop()
    }
  })

  test("both counters zero is accepted, every time", async () => {
    const account = await withPasskey()
    for (let i = 0; i < 2; i++) {
      const [error] = await signInWith(app, account.credential, { counter: 0 })
      expect(error).toBeNull()
    }
    expect((await storedRow(app, account.credential.id)).counter).toBe(0)
  })

  test("a counter starting from zero is stored and then enforced", async () => {
    const account = await withPasskey()
    const [first] = await signInWith(app, account.credential, { counter: 1 })
    expect(first).toBeNull()
    const [again] = await signInWith(app, account.credential, { counter: 1 })
    expect(again).toMatchObject({ code: "UNAUTHORIZED" })
  })
})

describe("the passkey limiter", () => {
  test("the default is 10 failures per client", async () => {
    // `undefined` drops the test server's generous limiter for the server's own default.
    const own = await start({ passkeyLimiter: undefined })
    try {
      const account = await withPasskey(own)
      for (let i = 0; i < 10; i++) {
        const [error] = await signInWith(own, account.credential, { userVerified: false })
        expect(error).toMatchObject({ code: "UNAUTHORIZED" })
      }
      const [limited] = await signInWith(own, account.credential)
      expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS", message: PASSKEY_RATE_MESSAGE })
    } finally {
      await own.stop()
    }
  })

  test("failures count, successes are refunded, and the key is the client id", async () => {
    const own = await start({
      passkeyLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const account = await withPasskey(own)
      // Successes give their slot back: more than the limit in a row all pass.
      for (let i = 0; i < 3; i++) {
        const [error] = await signInWith(own, account.credential)
        expect(error).toBeNull()
      }
      for (let i = 0; i < 2; i++) {
        const [error] = await signInWith(own, account.credential, { userVerified: false })
        expect(error).toMatchObject({ code: "UNAUTHORIZED" })
      }
      const [limited] = await signInWith(own, account.credential)
      expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS", message: PASSKEY_RATE_MESSAGE })
      // Keyed per client id: another client is unaffected.
      const other = clientFor(own)
      const { options, challengeId } = await other.auth.passkey.options()
      const response = await getAssertion(
        options as PublicKeyCredentialRequestOptionsJSON,
        account.credential
      )
      const [elsewhere] = await safe(
        createOtherClient(own).auth.passkey.verify({ challengeId, response })
      )
      expect(elsewhere).toBeNull()
    } finally {
      await own.stop()
    }
  })
})

describe("the pre-account-hijack purge", () => {
  test("drops passkeys the squatter added before the owner proved the email", async () => {
    const squatter = await signUp(app, "passkey-squat@example.com")
    const { credential } = await addPasskey(squatter)
    // A second registration the squatter has begun but not finished.
    const { options, challengeId } = await squatter.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    await clientFor(app).auth.magicLink.request({ email: squatter.email })
    const [mail] = await mailsTo(app, squatter.email, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const { user, session } = signedIn(await clientFor(app).auth.magicLink.consume({ token }))
    expect(user).toMatchObject({ id: squatter.user.id, passkeys: 0 })
    const [error] = await signInWith(app, credential)
    expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    // The purge voided the open challenge: not even the owner's own session (same user id, so the
    // user binding alone would pass) can finish it.
    const { response } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
    const [register] = await safe(
      clientFor(app, session.token).account.passkeys.register({ challengeId, response })
    )
    expect(register).toMatchObject({
      code: "BAD_REQUEST",
      message: PASSKEY_REGISTER_FAILED_MESSAGE,
    })
    expect(await app.db.passkeys.countForUser(squatter.user.id)).toBe(0)
  })
})

describe("password reset", () => {
  /** Requests a reset link for `email` and sets `password` with it. */
  async function resetWith(email: string, password: string) {
    await clientFor(app).auth.requestPasswordReset({ email })
    const mails = await mailsTo(app, email, RESET)
    const token = mails.at(-1)?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    await clientFor(app).auth.resetPassword({ token, password })
  }

  test("on an unverified account, drops the passkeys and voids open challenges", async () => {
    // A squatter registered the address, set a password and added a passkey; the real owner then
    // recovers the account with Forgot password.
    const squatter = await signUp(app, "passkey-reset-squat@example.com")
    const { credential } = await addPasskey(squatter)
    const { options, challengeId } = await squatter.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    await resetWith(squatter.email, "the owner's own battery")
    expect(await app.db.passkeys.countForUser(squatter.user.id)).toBe(0)
    const [signIn] = await signInWith(app, credential)
    expect(signIn).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
    // The registration the squatter had begun cannot be finished either (by any session).
    const owner = signedIn(
      await clientFor(app).auth.signIn({
        email: squatter.email,
        password: "the owner's own battery",
      })
    )
    const { response } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
    const [register] = await safe(
      clientFor(app, owner.session.token).account.passkeys.register({ challengeId, response })
    )
    expect(register).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("on a verified account, leaves the passkeys alone", async () => {
    const account = await signUpVerified(app, "passkey-reset-verified@example.com")
    const { credential } = await addPasskey(account)
    await resetWith(account.email, "a brand new battery")
    expect(await app.db.passkeys.countForUser(account.user.id)).toBe(1)
    const [error, result] = await signInWith(app, credential)
    expect(error).toBeNull()
    expect(result?.user.id).toBe(account.user.id)
  })
})

/** A client with its own x-api-client-id, so it lands in another limiter bucket. */
function createOtherClient(a: App): ApiClient {
  return createORPCClient(
    new RPCLink({
      url: new URL("/rpc", a.server.url).href,
      headers: { ...auth, "x-api-client-id": "another-client" },
    })
  )
}

/** A passkey row straight into the database (no ceremony): only its existence matters here. */
const insertPasskey = (a: App, userId: number) =>
  a.db.passkeys.create({
    userId,
    credentialId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"),
    publicKey: "pk",
    counter: 0,
    transports: null,
    name: "Inserted",
  })

describe("the per-account cap", () => {
  test(`registerOptions refuses an account that already has ${MAX_PASSKEYS}`, async () => {
    const account = await signUp(app)
    for (let i = 0; i < MAX_PASSKEYS; i++) await insertPasskey(app, account.user.id)
    const [error] = await safe(
      account.client.account.passkeys.registerOptions({ password: PASSWORD })
    )
    expect(error).toMatchObject({ code: "CONFLICT", message: PASSKEY_LIMIT_MESSAGE })
    // Translated through the catalog, like every other api message.
    const swedish = clientFor(app, account.token, "sv")
    const [svError] = await safe(swedish.account.passkeys.registerOptions({ password: PASSWORD }))
    expect(svError).toMatchObject({ code: "CONFLICT", message: sv("passkeyLimit") })
    expect(sv("passkeyLimit")).not.toBe(PASSKEY_LIMIT_MESSAGE)
  })

  test(`one below the cap may still add the ${MAX_PASSKEYS}th`, async () => {
    const account = await signUp(app)
    for (let i = 0; i < MAX_PASSKEYS - 1; i++) await insertPasskey(app, account.user.id)
    await addPasskey(account)
    expect(await app.db.passkeys.countForUser(account.user.id)).toBe(MAX_PASSKEYS)
  })

  test("register re-checks: options taken below the cap, then the cap reached, is refused", async () => {
    const account = await signUp(app)
    for (let i = 0; i < MAX_PASSKEYS - 1; i++) await insertPasskey(app, account.user.id)
    const { options, challengeId } = await account.client.account.passkeys.registerOptions({
      password: PASSWORD,
    })
    await insertPasskey(app, account.user.id)
    const { response } = await createCredential(options as PublicKeyCredentialCreationOptionsJSON)
    const [error] = await safe(account.client.account.passkeys.register({ challengeId, response }))
    expect(error).toMatchObject({ code: "CONFLICT", message: PASSKEY_LIMIT_MESSAGE })
    expect(await app.db.passkeys.countForUser(account.user.id)).toBe(MAX_PASSKEYS)
    // Nothing was added, so no "passkey added" mail went out for it.
    expect(
      app.mailer.sent.filter((m) => m.to === account.email && m.subject === passkeyAddedSubject)
    ).toHaveLength(0)
  })

  test(`concurrent registers at ${MAX_PASSKEYS - 1}: exactly one passes`, async () => {
    const account = await signUp(app)
    for (let i = 0; i < MAX_PASSKEYS - 1; i++) await insertPasskey(app, account.user.id)
    // Every ceremony is prepared first (options, then the authenticator), so the registers
    // themselves start together.
    const ceremonies = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const { options, challengeId } = await account.client.account.passkeys.registerOptions({
          password: PASSWORD,
        })
        const { response } = await createCredential(
          options as PublicKeyCredentialCreationOptionsJSON
        )
        return { challengeId, response }
      })
    )
    const results = await Promise.all(
      ceremonies.map((input) => safe(account.client.account.passkeys.register(input)))
    )
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
      { code: "CONFLICT", message: PASSKEY_LIMIT_MESSAGE },
      { code: "CONFLICT", message: PASSKEY_LIMIT_MESSAGE },
    ])
    expect(await app.db.passkeys.countForUser(account.user.id)).toBe(MAX_PASSKEYS)
  })
})

describe("account.identities.disconnect counts passkeys as a way in", () => {
  /** A passwordless account with one connected provider (GitHub). */
  async function withIdentity(email: string) {
    const user = await passwordlessUser(app, email)
    await app.db.identities.create({
      userId: user.user.id,
      provider: "github",
      providerUserId: `gh-${email}`,
      email,
    })
    return user
  }

  test("no password, one provider, a passkey: the provider may go", async () => {
    const user = await withIdentity("disconnect-with-passkey@example.com")
    await addPasskey(user)
    await user.client.account.identities.disconnect({ provider: "github" })
    expect(await user.client.account.identities.list()).toEqual({ items: [] })
  })

  test("no password, one provider, no passkey: still refused", async () => {
    const user = await withIdentity("disconnect-no-passkey@example.com")
    const [error] = await safe(user.client.account.identities.disconnect({ provider: "github" }))
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "This is your only way to sign in — set a password or add a passkey first",
    })
    expect((await user.client.account.identities.list()).items).toHaveLength(1)
  })

  test("disconnecting the provider while deleting the only passkey: exactly one succeeds", async () => {
    const user = await withIdentity("disconnect-race@example.com")
    const { passkey } = await addPasskey(user)
    const results = await Promise.all([
      safe(user.client.account.identities.disconnect({ provider: "github" })),
      safe(user.client.account.passkeys.delete({ id: passkey.id })),
    ])
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    // Whichever lost, the account keeps exactly one of the two ways in.
    const ways =
      (await user.client.account.identities.list()).items.length +
      (await user.client.account.passkeys.list()).length
    expect(ways).toBe(1)
  })
})

describe("a passkey sign-in racing admin.users.removePasskeys", () => {
  const rootEmail = "root-race@example.com"
  /** Runs once, from inside the passkey limiter's `refund` — which verify calls only after its
   * session is committed — when a test sets it. */
  let onRefund: (() => Promise<unknown>) | null = null
  const inner = createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 })
  let own: App
  let root: Account
  beforeAll(async () => {
    own = await start({
      superadminEmails: [rootEmail],
      passkeyLimiter: {
        hit: (key) => inner.hit(key),
        async refund(key) {
          const hook = onRefund
          onRefund = null
          if (hook) await hook()
          return inner.refund(key)
        },
      },
    })
    root = await signUpVerified(own, rootEmail)
  })
  afterAll(() => own.stop())

  const remove = (userId: number) =>
    root.client.admin.users.removePasskeys({ userId, reason: "lost the device" })
  const liveSessions = async (userId: number) =>
    (await own.db.sessions.listForUser(userId, new Date().toISOString())).length

  test("removal landing right after the session was issued ends it", async () => {
    const target = await withPasskey(own)
    onRefund = () => remove(target.user.id)
    const [error, result] = await signInWith(own, target.credential)
    expect(error).toBeNull()
    expect(onRefund).toBeNull()
    expect(await liveSessions(target.user.id)).toBe(0)
    const [me] = await safe(clientFor(own, result?.session.token).auth.me())
    expect(me).toMatchObject({ code: "UNAUTHORIZED" })
  })

  test("removal landing after the signature check, before the session: verify fails", async () => {
    const target = await withPasskey(own)
    const original = own.db.transaction
    let removed = false
    // Verify's own transaction is the first one opened: the removal runs to completion first.
    own.db.transaction = async (fn) => {
      own.db.transaction = original
      await remove(target.user.id)
      removed = true
      return original(fn)
    }
    try {
      const [error] = await signInWith(own, target.credential)
      expect(removed).toBe(true)
      expect(error).toMatchObject({ code: "UNAUTHORIZED", message: PASSKEY_FAILED_MESSAGE })
    } finally {
      own.db.transaction = original
    }
    expect(await liveSessions(target.user.id)).toBe(0)
  })

  test("removal overlapping verify's transaction: verify fails or its session is ended", async () => {
    const target = await withPasskey(own)
    const original = own.db.transaction
    let removal: Promise<unknown> | null = null
    // The removal is sent from inside verify's transaction, before it runs a statement: on
    // Postgres the removal can take the user row's lock first (verify then waits and finds the
    // passkey gone); on SQLite it queues behind verify's transaction and ends its session.
    own.db.transaction = (fn) => {
      own.db.transaction = original
      return original(async (tx) => {
        removal = remove(target.user.id)
        await Bun.sleep(50)
        return fn(tx)
      })
    }
    let verified: Awaited<ReturnType<typeof signInWith>>
    try {
      verified = await signInWith(own, target.credential)
    } finally {
      own.db.transaction = original
    }
    expect(removal).not.toBeNull()
    await removal
    const [error, result] = verified
    if (error) expect(error).toMatchObject({ code: "UNAUTHORIZED" })
    else expect(result?.session.token).toBeString()
    expect(await liveSessions(target.user.id)).toBe(0)
    expect(await own.db.passkeys.countForUser(target.user.id)).toBe(0)
  })
})

/**
 * Holds the next `n` transactions at their very start until all `n` are open, so they really
 * overlap — each one then takes the user row's lock (or fails to wait for it) for itself. Postgres
 * only: on SQLite a second transaction cannot begin while the first is open, so this would wait
 * forever (and SQLite's single writer already serialises them anyway).
 */
function overlapNextTransactions(a: App, n: number) {
  const original = a.db.transaction
  let arrived = 0
  let release = () => {}
  const allOpen = new Promise<void>((resolve) => {
    release = resolve
  })
  a.db.transaction = (fn) => {
    arrived += 1
    if (arrived === n) {
      a.db.transaction = original
      release()
    }
    return original(async (tx) => {
      await allOpen
      return fn(tx)
    })
  }
  return () => {
    a.db.transaction = original
  }
}

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("passkey writers under real overlap (Postgres)", () => {
  test(`two registers at ${MAX_PASSKEYS - 1}, both inside their transactions: one passes`, async () => {
    const account = await signUp(app)
    for (let i = 0; i < MAX_PASSKEYS - 1; i++) await insertPasskey(app, account.user.id)
    const ceremonies = await Promise.all(
      Array.from({ length: 2 }, async () => {
        const { options, challengeId } = await account.client.account.passkeys.registerOptions({
          password: PASSWORD,
        })
        const { response } = await createCredential(
          options as PublicKeyCredentialCreationOptionsJSON
        )
        return { challengeId, response }
      })
    )
    const restore = overlapNextTransactions(app, 2)
    try {
      const results = await Promise.all(
        ceremonies.map((input) => safe(account.client.account.passkeys.register(input)))
      )
      expect(results.filter(([error]) => error === null)).toHaveLength(1)
      expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
        { code: "CONFLICT", message: PASSKEY_LIMIT_MESSAGE },
      ])
    } finally {
      restore()
    }
    expect(await app.db.passkeys.countForUser(account.user.id)).toBe(MAX_PASSKEYS)
  })

  test("disconnect and delete of the last two ways in, both inside their transactions", async () => {
    const user = await passwordlessUser(app, "disconnect-overlap@example.com")
    await app.db.identities.create({
      userId: user.user.id,
      provider: "github",
      providerUserId: "gh-disconnect-overlap",
      email: user.email,
    })
    const { passkey } = await addPasskey(user)
    const restore = overlapNextTransactions(app, 2)
    try {
      const results = await Promise.all([
        safe(user.client.account.identities.disconnect({ provider: "github" })),
        safe(user.client.account.passkeys.delete({ id: passkey.id })),
      ])
      expect(results.filter(([error]) => error === null)).toHaveLength(1)
    } finally {
      restore()
    }
    const ways =
      (await user.client.account.identities.list()).items.length +
      (await user.client.account.passkeys.list()).length
    expect(ways).toBe(1)
  })

  test("a squatter's passkey sign-in overlapping the owner's purge: no deadlock, no session kept", async () => {
    const squatter = await signUp(app, "passkey-purge-overlap@example.com")
    const { credential } = await addPasskey(squatter)
    // Both ceremonies prepared up front, so the only transactions left are the two that race:
    // verify's (recordUse + session) and the purge's, run by the owner's magic link.
    const anonymous = clientFor(app)
    const { options, challengeId } = await anonymous.auth.passkey.options()
    const response = await getAssertion(
      options as PublicKeyCredentialRequestOptionsJSON,
      credential
    )
    await clientFor(app).auth.magicLink.request({ email: squatter.email })
    const [mail] = await mailsTo(app, squatter.email, MAGIC)
    const token = mail?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1] ?? ""
    const restore = overlapNextTransactions(app, 2)
    const [[verifyError, verified], [consumeError, consumed]] = await Promise.all([
      safe(anonymous.auth.passkey.verify({ challengeId, response })),
      safe(clientFor(app).auth.magicLink.consume({ token })),
    ]).finally(restore)
    // The owner always gets in; the squatter either is refused or has the session it got ended.
    expect(consumeError).toBeNull()
    if (verifyError) expect(verifyError).toMatchObject({ code: "UNAUTHORIZED" })
    else {
      const [me] = await safe(clientFor(app, verified?.session.token).auth.me())
      expect(me).toMatchObject({ code: "UNAUTHORIZED" })
    }
    if (!consumed) throw new Error("the owner's magic link failed")
    const owner = signedIn(consumed)
    const live = await app.db.sessions.listForUser(squatter.user.id, new Date().toISOString())
    expect(live).toHaveLength(1)
    expect(await clientFor(app, owner.session.token).auth.me()).toMatchObject({
      user: { id: squatter.user.id },
    })
    expect(await app.db.passkeys.countForUser(squatter.user.id)).toBe(0)
  })
})
