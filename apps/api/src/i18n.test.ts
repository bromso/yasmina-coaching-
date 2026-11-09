import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  API_KEY_LIMIT_MESSAGE,
  API_KEY_NOT_FOUND_MESSAGE,
  AUTH_ERRORS,
  BOOKING_CANCEL_CUTOFF_HOURS,
  BOOKING_CANCEL_LATE_MESSAGE,
  BOOKING_RATE_MESSAGE,
  BOOKING_SEATS_FULL_MESSAGE,
  BOOKING_SLOT_TAKEN_MESSAGE,
  CONNECT_REAUTH_MESSAGE,
  CV_UPLOAD_MESSAGE,
  contract,
  DELETE_EMAIL_MISMATCH_MESSAGE,
  DELETE_REAUTH_MESSAGE,
  EMAIL_CHANGE_LINK_INVALID_MESSAGE,
  EMAIL_CHANGE_RATE_MESSAGE,
  EMAIL_CHANGE_REAUTH_MESSAGE,
  EMAIL_CHANGE_REVERT_TAKEN_MESSAGE,
  EMAIL_CHANGE_SAME_EMAIL_MESSAGE,
  EMAIL_CHANGE_TAKEN_MESSAGE,
  EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE,
  EXPORT_NOT_FOUND_MESSAGE,
  FEATURE_MESSAGES,
  FEATURES,
  IMAGE_UPLOAD_MESSAGE,
  IMPERSONATING_MESSAGE,
  INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE,
  INVITE_DOMAIN_RESTRICTED_MESSAGE,
  INVITE_DOMAINS_INVALID_MESSAGE,
  INVITE_DOMAINS_LIMIT_MESSAGE,
  JOBS_RATE_MESSAGE,
  LAST_OWNER,
  MAX_INVITE_DOMAINS,
  MAX_PASSKEYS,
  OWNER_TWO_FACTOR_MESSAGE,
  PASSKEY_FAILED_MESSAGE,
  PASSKEY_LAST_WAY_IN_MESSAGE,
  PASSKEY_LIMIT_MESSAGE,
  PASSKEY_NAME_DEVICE,
  PASSKEY_NAME_SECURITY_KEY,
  PASSKEY_NOT_FOUND_MESSAGE,
  PASSKEY_RATE_MESSAGE,
  PASSKEY_REAUTH_MESSAGE,
  PASSKEY_REGISTER_FAILED_MESSAGE,
  ROLES,
  SEAT_LIMIT_MESSAGE,
  SET_PASSWORD_REAUTH_MESSAGE,
  STORAGE_UNAVAILABLE_MESSAGE,
  SUPPORT_RATE_MESSAGE,
  TWO_FACTOR_REAUTH_MESSAGE,
  TWO_FACTOR_TIMED_OUT_MESSAGE,
  TWO_FACTOR_VERIFY_EMAIL_MESSAGE,
  TWO_FACTOR_WRONG_CODE_MESSAGE,
  TWO_FACTOR_WRONG_CODE_REASON,
  UPLOAD_RATE_MESSAGE,
  WEBHOOK_LIMIT_MESSAGE,
  WEBHOOK_NOT_FOUND_MESSAGE,
  WEBHOOK_TEST_DISABLED_MESSAGE,
  WEBHOOK_TEST_RATE_MESSAGE,
  WEBHOOK_URL_BLOCKED_MESSAGE,
  WEBHOOK_URL_INVALID_MESSAGE,
  WEBHOOK_URL_UNRESOLVED_MESSAGE,
  WORKSPACE_ERRORS,
  WORKSPACE_TWO_FACTOR_REQUIRED_MESSAGE,
} from "@repo/api-contract"
import { messagesFor } from "@repo/i18n/messages"
import { translatorFor } from "@repo/i18n/translate"
import { createMemoryRateLimiter } from "@repo/service-kit"
import {
  type ApiMessageKey,
  apiMessage,
  FEATURE_MESSAGE_KEYS,
  localeFromHeader,
  namesEnglish,
  requiresRoleMessage,
} from "./i18n"
import {
  clientFor,
  enableTwoFactor,
  mailsTo,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
} from "./test-server"
import { LAST_OWNER_MESSAGE } from "./workspaces"

const en = translatorFor("en", "api")
const sv = translatorFor("sv", "api")
const svEmail = translatorFor("sv", "email")

/** A declared error's default message in the contract, by procedure path and code. */
function declared(path: string, code: string): string {
  // biome-ignore lint/suspicious/noExplicitAny: walking the contract tree by a dotted path
  let node: any = contract
  for (const part of path.split(".")) node = node[part]
  const message = node["~orpc"].errorMap[code]?.message
  if (typeof message !== "string") throw new Error(`${path} declares no ${code} message`)
  return message
}

describe("the api catalog's English equals today's strings", () => {
  // Every key with a named constant: the constant is the English text and the test's anchor.
  const constants: [ApiMessageKey, string][] = [
    ["signInRequired", AUTH_ERRORS.UNAUTHORIZED.message],
    ["accountSuspended", ACCOUNT_SUSPENDED_MESSAGE],
    ["twoFactorWrongCode", TWO_FACTOR_WRONG_CODE_MESSAGE],
    ["twoFactorTimedOut", TWO_FACTOR_TIMED_OUT_MESSAGE],
    ["twoFactorVerifyEmail", TWO_FACTOR_VERIFY_EMAIL_MESSAGE],
    ["twoFactorReauth", TWO_FACTOR_REAUTH_MESSAGE],
    ["setPasswordReauth", SET_PASSWORD_REAUTH_MESSAGE],
    ["connectReauth", CONNECT_REAUTH_MESSAGE],
    ["impersonating", IMPERSONATING_MESSAGE],
    ["imageUpload", IMAGE_UPLOAD_MESSAGE],
    ["uploadRate", UPLOAD_RATE_MESSAGE],
    ["supportRate", SUPPORT_RATE_MESSAGE],
    ["cvUpload", CV_UPLOAD_MESSAGE],
    ["storageUnavailable", STORAGE_UNAVAILABLE_MESSAGE],
    ["jobsRate", JOBS_RATE_MESSAGE],
    ["bookingRate", BOOKING_RATE_MESSAGE],
    ["bookingSlotTaken", BOOKING_SLOT_TAKEN_MESSAGE],
    ["bookingSeatsFull", BOOKING_SEATS_FULL_MESSAGE],
    ["exportNotFound", EXPORT_NOT_FOUND_MESSAGE],
    ["deleteEmailMismatch", DELETE_EMAIL_MISMATCH_MESSAGE],
    ["deleteReauth", DELETE_REAUTH_MESSAGE],
    ["emailChangeReauth", EMAIL_CHANGE_REAUTH_MESSAGE],
    ["emailChangeSameEmail", EMAIL_CHANGE_SAME_EMAIL_MESSAGE],
    ["emailChangeRate", EMAIL_CHANGE_RATE_MESSAGE],
    ["emailChangeWrongAccount", EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE],
    ["emailChangeLinkInvalid", EMAIL_CHANGE_LINK_INVALID_MESSAGE],
    ["emailChangeTaken", EMAIL_CHANGE_TAKEN_MESSAGE],
    ["emailChangeRevertTaken", EMAIL_CHANGE_REVERT_TAKEN_MESSAGE],
    ["seatLimit", SEAT_LIMIT_MESSAGE],
    ["apiKeyLimit", API_KEY_LIMIT_MESSAGE],
    ["apiKeyNotFound", API_KEY_NOT_FOUND_MESSAGE],
    ["webhookLimit", WEBHOOK_LIMIT_MESSAGE],
    ["webhookNotFound", WEBHOOK_NOT_FOUND_MESSAGE],
    ["webhookUrlInvalid", WEBHOOK_URL_INVALID_MESSAGE],
    ["webhookUrlBlocked", WEBHOOK_URL_BLOCKED_MESSAGE],
    ["webhookUrlUnresolved", WEBHOOK_URL_UNRESOLVED_MESSAGE],
    ["webhookTestDisabled", WEBHOOK_TEST_DISABLED_MESSAGE],
    ["webhookTestRate", WEBHOOK_TEST_RATE_MESSAGE],
    ["passkeyLastWayIn", PASSKEY_LAST_WAY_IN_MESSAGE],
    ["passkeyFailed", PASSKEY_FAILED_MESSAGE],
    ["passkeyRate", PASSKEY_RATE_MESSAGE],
    ["passkeyReauth", PASSKEY_REAUTH_MESSAGE],
    ["passkeyRegisterFailed", PASSKEY_REGISTER_FAILED_MESSAGE],
    ["passkeyNotFound", PASSKEY_NOT_FOUND_MESSAGE],
    ["passkeyLimit", PASSKEY_LIMIT_MESSAGE],
    ["passkeyNameDevice", PASSKEY_NAME_DEVICE],
    ["passkeyNameSecurityKey", PASSKEY_NAME_SECURITY_KEY],
    ["workspaceNotFound", WORKSPACE_ERRORS.NOT_FOUND.message],
    ["lastOwner", LAST_OWNER.CONFLICT.message],
    ["lastOwner", LAST_OWNER_MESSAGE],
    ["inviteDomainsInvalid", INVITE_DOMAINS_INVALID_MESSAGE],
    ["inviteDomainsLimit", INVITE_DOMAINS_LIMIT_MESSAGE],
    ["inviteDomainNoLongerAllowed", INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE],
  ]
  for (const [key, constant] of constants) {
    test(`${key} === "${constant}"`, () => expect(en(key)).toBe(constant))
  }

  test("every feature's upgrade message", () => {
    for (const feature of FEATURES) {
      expect(en(FEATURE_MESSAGE_KEYS[feature])).toBe(FEATURE_MESSAGES[feature])
    }
  })

  // The rest exist only as a procedure's declared default: compare with the contract itself.
  const defaults: [ApiMessageKey, string, string][] = [
    ["emailTaken", "auth.signUp", "CONFLICT"],
    ["signUpRate", "auth.signUp", "TOO_MANY_REQUESTS"],
    ["invalidCredentials", "auth.signIn", "UNAUTHORIZED"],
    ["tooManyAttempts", "auth.signIn", "TOO_MANY_REQUESTS"],
    ["resetLinkInvalid", "auth.resetPassword", "BAD_REQUEST"],
    ["verifyLinkInvalid", "auth.verifyEmail", "BAD_REQUEST"],
    ["magicLinkInvalid", "auth.magicLink.consume", "BAD_REQUEST"],
    ["providerNotConfigured", "auth.oauth.start", "NOT_FOUND"],
    ["providerNotConfigured", "auth.oauth.callback", "NOT_FOUND"],
    ["providerSignInFailed", "auth.oauth.callback", "BAD_REQUEST"],
    ["providerUnavailable", "auth.oauth.callback", "BAD_GATEWAY"],
    ["providerEmailUnverified", "auth.oauth.callback", "FORBIDDEN"],
    ["providerAlreadyConnected", "auth.oauth.callback", "CONFLICT"],
    ["tooManyAttempts", "auth.twoFactor.verify", "TOO_MANY_REQUESTS"],
    ["tooManyRequests", "account.resendVerification", "TOO_MANY_REQUESTS"],
    ["currentPasswordIncorrect", "account.changePassword", "FORBIDDEN"],
    ["passwordAlreadySet", "account.setPassword", "CONFLICT"],
    ["providerNotConnected", "account.identities.disconnect", "NOT_FOUND"],
    ["lastSignInMethod", "account.identities.disconnect", "FORBIDDEN"],
    ["sessionNotFound", "account.sessions.revoke", "NOT_FOUND"],
    ["twoFactorAlreadyOn", "account.twoFactor.setup", "CONFLICT"],
    ["twoFactorStartSetup", "account.twoFactor.enable", "BAD_REQUEST"],
    ["twoFactorNotOn", "account.twoFactor.disable", "CONFLICT"],
    ["noteNotFound", "notes.delete", "NOT_FOUND"],
    ["workspaceVerifyEmail", "workspaces.create", "FORBIDDEN"],
    ["workspaceCreateRate", "workspaces.create", "TOO_MANY_REQUESTS"],
    ["subscriptionCancelFailed", "workspaces.delete", "INTERNAL_SERVER_ERROR"],
    ["notAMember", "workspaces.transferOwnership", "BAD_REQUEST"],
    ["alreadyMember", "workspaces.invitations.create", "CONFLICT"],
    ["inviteRate", "workspaces.invitations.create", "TOO_MANY_REQUESTS"],
    ["invitationNotFound", "workspaces.invitations.revoke", "NOT_FOUND"],
    ["invitationInvalid", "invitations.preview", "NOT_FOUND"],
    ["invitationVerifyEmail", "invitations.acceptById", "FORBIDDEN"],
    ["notFound", "files.get", "NOT_FOUND"],
    ["exportNotFound", "account.export.download", "NOT_FOUND"],
    ["deleteEmailMismatch", "account.delete", "BAD_REQUEST"],
    ["deleteReauth", "account.delete", "FORBIDDEN"],
    ["billingUsePortal", "billing.checkout", "CONFLICT"],
    ["planUnavailable", "billing.checkout", "BAD_REQUEST"],
    ["noBillingAccount", "billing.portal", "NOT_FOUND"],
    ["tooManyRequests", "waitlist.join", "TOO_MANY_REQUESTS"],
    ["tooManyRequests", "auth.notificationEmail.unsubscribe", "TOO_MANY_REQUESTS"],
    ["tooManyRequests", "auth.notificationEmail.peek", "TOO_MANY_REQUESTS"],
    ["impersonating", "account.notificationPreferences.set", "FORBIDDEN"],
    ["supportRate", "support.create", "TOO_MANY_REQUESTS"],
    ["cvUpload", "jobs.apply", "BAD_REQUEST"],
    ["jobsRate", "jobs.apply", "TOO_MANY_REQUESTS"],
    ["bookingRate", "booking.book", "TOO_MANY_REQUESTS"],
    ["bookingSlotTaken", "booking.book", "CONFLICT"],
    ["bookingSeatsFull", "booking.reserve", "CONFLICT"],
    ["passkeyFailed", "auth.passkey.verify", "UNAUTHORIZED"],
    ["passkeyRate", "auth.passkey.verify", "TOO_MANY_REQUESTS"],
    ["passkeyReauth", "account.passkeys.registerOptions", "FORBIDDEN"],
    ["passkeyRegisterFailed", "account.passkeys.register", "BAD_REQUEST"],
    ["passkeyNotFound", "account.passkeys.rename", "NOT_FOUND"],
    ["passkeyNotFound", "account.passkeys.delete", "NOT_FOUND"],
    ["passkeyLastWayIn", "account.passkeys.delete", "CONFLICT"],
    ["passkeyLimit", "account.passkeys.registerOptions", "CONFLICT"],
    ["passkeyLimit", "account.passkeys.register", "CONFLICT"],
    ["emailChangeReauth", "account.email.requestChange", "FORBIDDEN"],
    ["emailChangeSameEmail", "account.email.requestChange", "BAD_REQUEST"],
    ["emailChangeRate", "account.email.requestChange", "TOO_MANY_REQUESTS"],
    ["emailChangeLinkInvalid", "account.email.confirmChange", "BAD_REQUEST"],
    ["emailChangeTaken", "account.email.confirmChange", "CONFLICT"],
    ["emailChangeLinkInvalid", "auth.emailChange.cancel", "BAD_REQUEST"],
    ["emailChangeLinkInvalid", "auth.emailChange.revert", "BAD_REQUEST"],
    ["emailChangeRevertTaken", "auth.emailChange.revert", "CONFLICT"],
    ["accountSuspended", "auth.signIn", "FORBIDDEN"],
    ["accountSuspended", "auth.magicLink.consume", "FORBIDDEN"],
    ["accountSuspended", "auth.twoFactor.verify", "FORBIDDEN"],
    ["accountSuspended", "auth.passkey.verify", "FORBIDDEN"],
    ["apiKeyLimit", "workspaces.apiKeys.create", "CONFLICT"],
    ["apiKeyNotFound", "workspaces.apiKeys.revoke", "NOT_FOUND"],
    ["upgradeApi", "workspaces.apiKeys.create", "FORBIDDEN"],
    ["webhookLimit", "workspaces.webhooks.create", "CONFLICT"],
    ["webhookUrlInvalid", "workspaces.webhooks.create", "BAD_REQUEST"],
    ["webhookUrlInvalid", "workspaces.webhooks.update", "BAD_REQUEST"],
    ["webhookNotFound", "workspaces.webhooks.update", "NOT_FOUND"],
    ["webhookNotFound", "workspaces.webhooks.rotateSecret", "NOT_FOUND"],
    ["webhookNotFound", "workspaces.webhooks.delete", "NOT_FOUND"],
    ["webhookNotFound", "workspaces.webhooks.deliveries", "NOT_FOUND"],
    ["webhookNotFound", "workspaces.webhooks.test", "NOT_FOUND"],
    ["webhookTestDisabled", "workspaces.webhooks.test", "CONFLICT"],
    ["webhookTestRate", "workspaces.webhooks.test", "TOO_MANY_REQUESTS"],
    ["upgradeApi", "workspaces.webhooks.test", "FORBIDDEN"],
    ["upgradeApi", "workspaces.webhooks.create", "FORBIDDEN"],
    ["upgradeApi", "workspaces.webhooks.update", "FORBIDDEN"],
    ["upgradeApi", "workspaces.webhooks.rotateSecret", "FORBIDDEN"],
    ["inviteDomainsInvalid", "workspaces.security.setInviteDomains", "BAD_REQUEST"],
  ]
  for (const [key, path, code] of defaults) {
    test(`${key} === ${path}'s declared ${code}`, () => expect(en(key)).toBe(declared(path, code)))
  }

  // Checked through FEATURE_MESSAGE_KEYS, or interpolated / without a contract anchor (below).
  const elsewhere: string[] = [
    ...Object.values(FEATURE_MESSAGE_KEYS),
    "requiresRole",
    "invitationSentTo",
    "mockBillingDisabled",
    "exportTooSoon",
    "deleteSoleOwner",
    "workspaceTwoFactorRequired",
    "ownerTwoFactorRequired",
    "inviteDomainRestricted",
    "bookingCancelLate",
    "bookingNotFound",
    "roles",
  ]
  test("every key in messages/en/api.json is checked above", () => {
    const checked = new Set([
      ...constants.map(([key]) => key),
      ...defaults.map(([key]) => key),
      ...elsewhere,
    ])
    expect([...checked].sort()).toEqual(
      Object.keys(messagesFor("en", ["api"]).api as object).sort()
    )
  })

  test("the interpolated ones keep today's shape", () => {
    for (const role of ROLES) {
      expect(requiresRoleMessage({ locale: "en" }, role)).toBe(`Requires the ${role} role`)
    }
    expect(en("invitationSentTo", { email: "a***@example.com" })).toBe(
      "This invitation was sent to a***@example.com. Sign in with that address to accept it."
    )
    expect(en("mockBillingDisabled")).toBe("Mock billing is not enabled")
    expect(en("bookingCancelLate", { hours: BOOKING_CANCEL_CUTOFF_HOURS })).toBe(
      BOOKING_CANCEL_LATE_MESSAGE
    )
    expect(en("bookingNotFound")).toBe("We could not find that booking link.")
    expect(en("exportTooSoon", { time: "Oct 11, 2026, 2:05 PM UTC" })).toBe(
      "You can request a new export after Oct 11, 2026, 2:05 PM UTC."
    )
    expect(sv("exportTooSoon", { time: "11 okt. 2026 14:05 UTC" })).toBe(
      "Du kan begära en ny export efter 11 okt. 2026 14:05 UTC."
    )
    expect(en("deleteSoleOwner", { names: "Acme, Beta" })).toBe(
      "Transfer ownership or delete these workspaces first: Acme, Beta"
    )
    expect(sv("deleteSoleOwner", { names: "Acme, Beta" })).toBe(
      "Överlåt ägarskapet eller radera de här arbetsytorna först: Acme, Beta"
    )
    expect(en("workspaceTwoFactorRequired", { workspace: "Acme" })).toBe(
      WORKSPACE_TWO_FACTOR_REQUIRED_MESSAGE.replace("{workspace}", "Acme")
    )
    expect(sv("workspaceTwoFactorRequired", { workspace: "Acme" })).toBe(
      "Slå på tvåstegsverifiering för att komma åt Acme."
    )
    expect(en("inviteDomainRestricted", { domains: "acme.com and acme.se" })).toBe(
      INVITE_DOMAIN_RESTRICTED_MESSAGE.replace("{domains}", "acme.com and acme.se")
    )
    expect(sv("inviteDomainRestricted", { domains: "acme.com och acme.se" })).toBe(
      "Inbjudningar till den här arbetsytan är begränsade till: acme.com och acme.se."
    )
    expect(sv("inviteDomainNoLongerAllowed")).toBe(
      "Den här arbetsytan tar inte längre emot inbjudningar till den här adressen."
    )
    expect(en("ownerTwoFactorRequired")).toBe(OWNER_TWO_FACTOR_MESSAGE)
    expect(sv("ownerTwoFactorRequired")).toBe(
      "Slå på tvåstegsverifiering för ditt eget konto först."
    )
  })

  test("the passkey cap's message names MAX_PASSKEYS, in both languages", () => {
    // Written out rather than interpolated: raising the cap must fail here, not leave both
    // catalogs (and the contract's default) quoting the old number.
    const max = String(MAX_PASSKEYS)
    expect(PASSKEY_LIMIT_MESSAGE).toContain(max)
    expect(en("passkeyLimit")).toContain(max)
    expect(sv("passkeyLimit")).toContain(max)
  })

  test("the invitation domain cap's message names MAX_INVITE_DOMAINS, in both languages", () => {
    const max = String(MAX_INVITE_DOMAINS)
    expect(INVITE_DOMAINS_LIMIT_MESSAGE).toContain(max)
    expect(en("inviteDomainsLimit")).toContain(max)
    expect(sv("inviteDomainsLimit")).toContain(max)
  })

  test("Swedish names the role in Swedish", () => {
    expect(requiresRoleMessage({ locale: "sv" }, "admin")).toBe(
      sv("requiresRole", { role: sv("roles.admin") })
    )
    expect(requiresRoleMessage({ locale: "sv" }, "admin")).not.toContain("admin role")
  })

  test("apiMessage reads the context's locale", () => {
    expect(apiMessage({ locale: "en" }, "seatLimit")).toBe(SEAT_LIMIT_MESSAGE)
    expect(apiMessage({ locale: "sv" }, "seatLimit")).toBe(sv("seatLimit"))
    expect(sv("seatLimit")).not.toBe(SEAT_LIMIT_MESSAGE)
  })
})

describe("localeFromHeader", () => {
  test("a supported locale, trimmed", () => {
    expect(localeFromHeader("sv")).toEqual({ locale: "sv", requestedLocale: "sv" })
    expect(localeFromHeader("  sv ")).toEqual({ locale: "sv", requestedLocale: "sv" })
    expect(localeFromHeader("en")).toEqual({ locale: "en", requestedLocale: "en" })
  })
  test("a region or a list is negotiated", () => {
    expect(localeFromHeader("sv-SE")).toEqual({ locale: "sv", requestedLocale: "sv" })
    expect(localeFromHeader("en-US")).toEqual({ locale: "en", requestedLocale: "en" })
    expect(localeFromHeader("de, sv;q=0.5")).toEqual({ locale: "sv", requestedLocale: "sv" })
  })
  test("missing, empty or unsupported is English, and not a request to store anything", () => {
    expect(localeFromHeader(null)).toEqual({ locale: "en", requestedLocale: null })
    expect(localeFromHeader("")).toEqual({ locale: "en", requestedLocale: null })
    expect(localeFromHeader("xx")).toEqual({ locale: "en", requestedLocale: null })
    expect(localeFromHeader("../../etc")).toEqual({ locale: "en", requestedLocale: null })
  })
  test("a q=0 tag is not acceptable: neither answered in nor stored", () => {
    expect(localeFromHeader("de, sv;q=0")).toEqual({ locale: "en", requestedLocale: null })
    expect(localeFromHeader("de, en;q=0")).toEqual({ locale: "en", requestedLocale: null })
    expect(localeFromHeader("de, en;q=0.5")).toEqual({ locale: "en", requestedLocale: "en" })
  })
  test("namesEnglish skips q=0 and malformed weights", () => {
    expect(namesEnglish("de, en;q=0")).toBe(false)
    expect(namesEnglish("de, en-GB;q=0.000")).toBe(false)
    expect(namesEnglish("en;q=2")).toBe(false)
    expect(namesEnglish("de, en;q=0.1")).toBe(true)
    expect(namesEnglish("en-US")).toBe(true)
  })
  test("capped at 35 characters before parsing", () => {
    expect(localeFromHeader(`${"x".repeat(35)}sv`)).toEqual({ locale: "en", requestedLocale: null })
  })
})

describe("over the wire", () => {
  const ROOT = "root-i18n@example.com"
  let app: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    app = await start({
      superadminEmails: [ROOT],
      signInLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
    })
  })
  afterAll(() => app.stop())

  const wrongPassword = (locale?: string) =>
    safe(
      clientFor(app, undefined, locale).auth.signIn({
        email: `nobody-${locale ?? "none"}@example.com`,
        password: "wrong password!",
      })
    )

  test("a refused sign-in answers in the caller's language", async () => {
    const [error] = await wrongPassword("sv")
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: sv("invalidCredentials") })
    expect(sv("invalidCredentials")).not.toBe(en("invalidCredentials"))
  })

  test("an unsupported x-locale, or none, answers in English", async () => {
    const [xx] = await wrongPassword("xx")
    expect(xx).toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" })
    const [none] = await wrongPassword()
    expect(none).toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" })
  })

  test("the rate limit answers in Swedish", async () => {
    const client = clientFor(app, undefined, "sv")
    const input = { email: "limited@example.com", password: "wrong password!" }
    for (let i = 0; i < 3; i++) await safe(client.auth.signIn(input))
    const [error] = await safe(client.auth.signIn(input))
    expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS", message: sv("tooManyAttempts") })
  })

  test("a session refusal answers in Swedish", async () => {
    const [error] = await safe(clientFor(app, "no-such-token", "sv").auth.me())
    expect(error).toMatchObject({ code: "UNAUTHORIZED", message: sv("signInRequired") })
  })

  test("a wrong 2FA code carries data.reason, in any language", async () => {
    const { user, token } = await signUp(app)
    await enableTwoFactor(app, user.id)
    const [error] = await safe(
      clientFor(app, token, "sv").account.twoFactor.disable({ code: "abcde-fghij" })
    )
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      defined: true,
      message: sv("twoFactorWrongCode"),
      data: { reason: TWO_FACTOR_WRONG_CODE_REASON },
    })
  })

  test("a wrong code at the sign-in challenge carries the reason too", async () => {
    const { user, email } = await signUp(app)
    await enableTwoFactor(app, user.id)
    const anonymous = clientFor(app)
    const result = await anonymous.auth.signIn({ email, password: "correct horse battery" })
    if (!("twoFactor" in result)) throw new Error("expected a challenge")
    const [error] = await safe(
      anonymous.auth.twoFactor.verify({
        challenge: result.twoFactor.challenge,
        code: "abcde-fghij",
      })
    )
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      defined: true,
      message: TWO_FACTOR_WRONG_CODE_MESSAGE,
      data: { reason: TWO_FACTOR_WRONG_CODE_REASON },
    })
  })

  test("a missing session on a code-checking procedure is still a declared 'Sign in required'", async () => {
    const [error] = await safe(clientFor(app).account.twoFactor.disable({ code: "123456" }))
    expect(error).toMatchObject({
      code: "UNAUTHORIZED",
      defined: true,
      message: "Sign in required",
    })
    expect((error as { data?: unknown }).data).toBeUndefined()
  })

  test("sign-up stores the request's locale", async () => {
    const { user } = await clientFor(app, undefined, "sv").auth.signUp({
      email: "svensk@example.com",
      password: "correct horse battery",
    })
    expect(user.locale).toBe("sv")
    expect((await app.db.users.find(user.id))?.locale).toBe("sv")
  })

  test("sign-up without x-locale stores nothing and reads as English", async () => {
    const { user, client } = await signUp(app)
    expect(user.locale).toBe("en")
    expect((await app.db.users.find(user.id))?.locale).toBeNull()
    expect((await client.auth.me()).user.locale).toBe("en")
  })

  test("a magic link creating an account stores the request's locale", async () => {
    const email = "magic-sv@example.com"
    const anonymous = clientFor(app, undefined, "sv")
    await anonymous.auth.magicLink.request({ email })
    await app.drain()
    const deadline = Date.now() + 2_000
    let token: string | undefined
    while (!token && Date.now() < deadline) {
      await app.drain()
      token = app.mailer.sent
        .filter((m) => m.to === email)
        .at(-1)
        ?.text.match(/magic\?token=([A-Za-z0-9_-]+)/)?.[1]
      if (!token) await Bun.sleep(5)
    }
    if (!token) throw new Error("no magic link")
    const result = await anonymous.auth.magicLink.consume({ token })
    if (!("user" in result)) throw new Error("expected a session")
    expect(result.user.locale).toBe("sv")
  })

  test("account.setLocale stores the choice; auth.me reads it back", async () => {
    const { client } = await signUp(app)
    expect(await client.account.setLocale({ locale: "sv" })).toEqual({ locale: "sv" })
    expect((await client.auth.me()).user.locale).toBe("sv")
    await client.account.setLocale({ locale: "en" })
    expect((await client.auth.me()).user.locale).toBe("en")
  })

  test("auth.me tells a chosen locale from the English an unset one reads as", async () => {
    const { client } = await signUp(app)
    expect(await client.auth.me()).toMatchObject({ user: { locale: "en" }, localeChosen: false })
    await client.account.setLocale({ locale: "en" })
    expect(await client.auth.me()).toMatchObject({ user: { locale: "en" }, localeChosen: true })
    const { session } = await clientFor(app, undefined, "sv").auth.signUp({
      email: "chosen-sv@example.com",
      password: "correct horse battery",
    })
    expect(await clientFor(app, session.token).auth.me()).toMatchObject({
      user: { locale: "sv" },
      localeChosen: true,
    })
  })

  test("account.setLocale refuses an unsupported locale", async () => {
    const { client } = await signUp(app)
    // biome-ignore lint/suspicious/noExplicitAny: an input the type forbids, on purpose
    const [error] = await safe(client.account.setLocale({ locale: "xx" } as any))
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
    expect((await client.auth.me()).user.locale).toBe("en")
  })

  test("account.setLocale while impersonating is allowed and audited", async () => {
    const root = await signUpVerified(app, ROOT)
    const target = await signUpVerified(app)
    const { token } = await root.client.admin.users.impersonate({
      id: target.user.id,
      reason: "support",
    })
    await clientFor(app, token).account.setLocale({ locale: "sv" })
    expect((await target.client.auth.me()).user.locale).toBe("sv")
    const { items } = await root.client.admin.audit.list({ actorId: root.user.id, limit: 5 })
    expect(items.find((e) => e.action === "user.locale_set")).toMatchObject({
      actor: { id: root.user.id },
      impersonated: { id: target.user.id },
      targetType: "user",
      targetId: String(target.user.id),
      metadata: { locale: "sv" },
    })
  })

  test("the seat limit answers in Swedish", async () => {
    const owner = await signUpWithWorkspace(app)
    for (const extra of [await signUp(app), await signUp(app)]) {
      await app.db.memberships.add({
        workspaceId: owner.workspaceId,
        userId: extra.user.id,
        role: "member",
      })
    }
    const [error] = await safe(
      clientFor(app, owner.token, "sv").workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: "fourth@example.com",
        role: "member",
      })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: sv("seatLimit") })
  })

  test("a role refusal names the role in Swedish", async () => {
    const owner = await signUpWithWorkspace(app)
    const viewer = await signUp(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: viewer.user.id,
      role: "viewer",
    })
    const [error] = await safe(
      clientFor(app, viewer.token, "sv").notes.create({
        workspaceId: owner.workspaceId,
        title: "t",
        body: "",
      })
    )
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: requiresRoleMessage({ locale: "sv" }, "member"),
    })
  })

  test("a sv sign-up's verification mail is Swedish", async () => {
    const email = "verify-sv@example.com"
    await clientFor(app, undefined, "sv").auth.signUp({
      email,
      password: "correct horse battery",
    })
    const [mail] = await mailsTo(app, email, svEmail("verifyEmail.subject"))
    expect(mail?.subject).not.toBe("Verify your email")
    expect(mail?.text).toMatch(/http:\/\/auth\.example\.com\/verify-email\?token=/)
  })

  test("a magic link to an address with no account uses the requester's own locale", async () => {
    // No saved locale exists to read — the requester is almost always the recipient, so their
    // negotiated x-locale carries over rather than falling back to English.
    const email = "magic-sv-unknown@example.com"
    await clientFor(app, undefined, "sv").auth.magicLink.request({ email })
    const [mail] = await mailsTo(app, email, svEmail("magicLink.subject"))
    expect(mail?.subject).not.toBe("Your sign-in link")
    expect(mail?.text).toMatch(/http:\/\/auth\.example\.com\/magic\?token=/)
  })

  test("an invitation sent with x-locale sv is Swedish", async () => {
    // signUpWithWorkspace names the workspace "Notes"; the subject interpolates that name.
    const owner = await signUpWithWorkspace(app)
    const inviteeEmail = "invitee-sv@example.com"
    await clientFor(app, owner.token, "sv").workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: inviteeEmail,
      role: "member",
    })
    const subject = svEmail("invitation.subject", { workspace: "Notes" })
    const [mail] = await mailsTo(app, inviteeEmail, subject)
    expect(mail?.text).toMatch(/http:\/\/app\.example\.com\/invitations\//)
    expect(mail?.text).toMatch(/7 dagar/)
  })

  test("mail uses the recipient's saved locale, not the request's: a sv user changing their password with no x-locale still gets Swedish mail", async () => {
    const email = "changepw-sv@example.com"
    const { session } = await clientFor(app, undefined, "sv").auth.signUp({
      email,
      password: "correct horse battery",
    })
    // No third argument: this request carries no x-locale at all, so context.locale for THIS
    // request is English — proving the mail followed the user's saved "sv", not the request.
    await clientFor(app, session.token).account.changePassword({
      currentPassword: "correct horse battery",
      newPassword: "a brand new password",
    })
    const [mail] = await mailsTo(app, email, svEmail("passwordChanged.subject"))
    expect(mail?.subject).not.toBe("Your password was changed")
  })
})

describe("which locale each mail uses", () => {
  let app: Awaited<ReturnType<typeof start>>
  beforeAll(async () => {
    app = await start()
  })
  afterAll(() => app.stop())

  const enEmail = translatorFor("en", "email")
  let n = 0
  const address = (label: string) => `mail-locale-${label}-${++n}@example.com`
  /** An account that never chose a locale: signed up with no x-locale, `users.locale` null. */
  const unchosen = async (label: string) => {
    const user = await signUp(app, address(label))
    expect((await app.db.users.find(user.user.id))?.locale).toBeNull()
    return user
  }

  test("password reset: no saved locale falls back to the request's, then English", async () => {
    const sv1 = await unchosen("reset-sv")
    await clientFor(app, undefined, "sv").auth.requestPasswordReset({ email: sv1.email })
    await mailsTo(app, sv1.email, svEmail("resetPassword.subject"))
    const plain = await unchosen("reset-none")
    await clientFor(app).auth.requestPasswordReset({ email: plain.email })
    await mailsTo(app, plain.email, enEmail("resetPassword.subject"))
  })

  test("password reset: a saved locale beats the request's", async () => {
    const user = await unchosen("reset-saved")
    await user.client.account.setLocale({ locale: "en" })
    await clientFor(app, undefined, "sv").auth.requestPasswordReset({ email: user.email })
    await mailsTo(app, user.email, enEmail("resetPassword.subject"))
  })

  test("magic link to a known account with no saved locale: the request's locale", async () => {
    const user = await unchosen("magic-known")
    await clientFor(app, undefined, "sv").auth.magicLink.request({ email: user.email })
    await mailsTo(app, user.email, svEmail("magicLink.subject"))
    const saved = await unchosen("magic-saved")
    await saved.client.account.setLocale({ locale: "en" })
    await clientFor(app, undefined, "sv").auth.magicLink.request({ email: saved.email })
    await mailsTo(app, saved.email, enEmail("magicLink.subject"))
  })

  test("resend verification with no saved locale: the request's locale", async () => {
    const user = await unchosen("resend")
    await clientFor(app, user.token, "sv").account.resendVerification()
    await mailsTo(app, user.email, svEmail("verifyEmail.subject"))
  })

  test("an invitation to an account with a chosen locale uses the invitee's locale", async () => {
    const owner = await signUpWithWorkspace(app, address("owner-a"))
    const inviteeEmail = address("invitee-sv")
    await clientFor(app, undefined, "sv").auth.signUp({
      email: inviteeEmail,
      password: "correct horse battery",
    })
    // The inviter's own request names no locale (English): the invitee's saved sv wins.
    await clientFor(app, owner.token).workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: inviteeEmail,
      role: "member",
    })
    await mailsTo(app, inviteeEmail, svEmail("invitation.subject", { workspace: "Notes" }))

    const chosenEn = await unchosen("invitee-en")
    await chosenEn.client.account.setLocale({ locale: "en" })
    await clientFor(app, owner.token, "sv").workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: chosenEn.email,
      role: "member",
    })
    await mailsTo(app, chosenEn.email, enEmail("invitation.subject", { workspace: "Notes" }))
  })

  test("an invitation to an account with no chosen locale, or no account: the inviter's", async () => {
    const owner = await signUpWithWorkspace(app, address("owner-b"))
    const invitee = await unchosen("invitee-unchosen")
    const stranger = address("invitee-new")
    for (const email of [invitee.email, stranger]) {
      await clientFor(app, owner.token, "sv").workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email,
        role: "member",
      })
      await mailsTo(app, email, svEmail("invitation.subject", { workspace: "Notes" }))
    }
  })
})
