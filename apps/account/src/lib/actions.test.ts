import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { IMAGE_UPLOAD_MESSAGE, MAX_IMAGE_BYTES, PASSKEY_LIMIT_MESSAGE } from "@repo/api-contract"
import { CONSENT_MAX_AGE, consentCookie } from "@repo/ui/lib/consent"
import {
  type ActionDeps,
  cancelDeletionCore,
  changePasswordCore,
  confirmEmailChangeCore,
  connectErrorMessage,
  cookieParts,
  type DeleteAccountDeps,
  deleteAccountCore,
  deletePasskeyCore,
  disableTwoFactorCore,
  disconnectIdentityCore,
  enableTwoFactorCore,
  type PrivacyDeps,
  passkeyRegisterCore,
  passkeyRegisterOptionsCore,
  regenerateRecoveryCodesCore,
  removeAvatarCore,
  renamePasskeyCore,
  requestEmailChangeCore,
  requestExportCore,
  resendVerificationCore,
  revokeOtherSessionsCore,
  revokeSessionCore,
  setAvatarCore,
  setConsentCore,
  setPasswordCore,
  setupTwoFactorCore,
  UNAVAILABLE,
  updateProfileCore,
} from "./actions"

const user = {
  id: 1,
  email: "ada@example.com",
  name: "Ada Lovelace",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: false,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "en" as const,
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string, data?: unknown) =>
  new ORPCError(code, { message, data, defined: true })
const WRONG = { reason: "wrong_code" }
const passkey = {
  id: 1,
  name: "This device",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: null,
}
const deps = (
  api: Partial<
    Omit<ActionDeps["api"], "sessions" | "twoFactor" | "avatar" | "passkeys" | "email">
  > & {
    sessions?: Partial<ActionDeps["api"]["sessions"]>
    twoFactor?: Partial<ActionDeps["api"]["twoFactor"]>
    avatar?: Partial<ActionDeps["api"]["avatar"]>
    passkeys?: Partial<ActionDeps["api"]["passkeys"]>
    email?: Partial<ActionDeps["api"]["email"]>
  }
) =>
  ({
    api: {
      ...api,
      sessions: api.sessions ?? {},
      twoFactor: api.twoFactor ?? {},
      avatar: api.avatar ?? {},
      passkeys: api.passkeys ?? {},
      email: api.email ?? {},
    },
  }) as ActionDeps
/** A complete fake api, for tests that spread it rather than build one field at a time. */
const fakeApi: ActionDeps["api"] = {
  updateProfile: async () => user,
  changePassword: async () => undefined,
  setPassword: async () => undefined,
  sessions: { revoke: async () => undefined, revokeOthers: async () => undefined },
  identities: { list: async () => ({ items: [] }), disconnect: async () => undefined },
  resendVerification: async () => ({ sent: true }),
  twoFactor: {
    get: async () => ({ enabled: false, recoveryCodesLeft: 0 }),
    setup: async () => ({ secret: "ABCDEFGHIJKLMNOP", otpauthUrl: "otpauth://totp/x" }),
    enable: async () => ({ recoveryCodes: [] }),
    disable: async () => undefined,
    regenerateRecoveryCodes: async () => ({ recoveryCodes: [] }),
  },
  avatar: {
    set: async () => ({ avatarUrl: "/files/avatars/1/x.png" }),
    remove: async () => ({ ok: true }),
  },
  passkeys: {
    registerOptions: async () => ({ options: { x: 1 }, challengeId: "challenge-1" }),
    register: async () => passkey,
    rename: async () => undefined,
    delete: async () => undefined,
  },
  email: {
    get: async () => ({ email: user.email, pending: null }),
    requestChange: async () => ({
      pending: { maskedEmail: "n***@example.com", expiresAt: "2026-01-02T00:00:00.000Z" },
    }),
    confirmChange: async () => ({ email: "new@example.com" }),
  },
}
/** A `File` of the given byte size; jsdom/bun's File accepts a plain byte buffer as content. */
const file = (size: number, name = "photo.png") =>
  new File([new Uint8Array(size)], name, { type: "image/png" })

describe("updateProfileCore", () => {
  test("trims and saves the name", async () => {
    let seen: unknown
    const d = deps({
      updateProfile: async (input) => {
        seen = input
        return { ...user, name: input.name }
      },
    })
    expect(await updateProfileCore(d, form({ name: "  Ada L. " }))).toEqual({
      ok: true,
      message: "Name updated.",
    })
    expect(seen).toEqual({ name: "Ada L." })
  })
  test("an empty name is allowed", async () => {
    const d = deps({ updateProfile: async () => ({ ...user, name: "" }) })
    expect(await updateProfileCore(d, form({ name: "" }))).toMatchObject({ ok: true })
  })
  test("a 101-char name is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      updateProfile: async () => {
        called = true
        return user
      },
    })
    expect(await updateProfileCore(d, form({ name: "x".repeat(101) }))).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
      values: { name: "x".repeat(101) },
    })
    expect(called).toBe(false)
  })
})

describe("setAvatarCore", () => {
  test('no file, or an empty one named "", is a field error and never reaches the api', async () => {
    let called = false
    const d = deps({
      avatar: {
        set: async () => {
          called = true
          return { avatarUrl: "x" }
        },
      },
    })
    expect(await setAvatarCore(d, form({}))).toEqual({
      ok: false,
      fieldErrors: { file: "Choose an image." },
    })
    const empty = new FormData()
    empty.set("file", new File([], "", { type: "image/png" }))
    expect(await setAvatarCore(d, empty)).toEqual({
      ok: false,
      fieldErrors: { file: "Choose an image." },
    })
    expect(called).toBe(false)
  })
  test("a file over MAX_IMAGE_BYTES is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      avatar: {
        set: async () => {
          called = true
          return { avatarUrl: "x" }
        },
      },
    })
    const fd = new FormData()
    fd.set("file", file(MAX_IMAGE_BYTES + 1))
    expect(await setAvatarCore(d, fd)).toEqual({
      ok: false,
      fieldErrors: { file: IMAGE_UPLOAD_MESSAGE },
    })
    expect(called).toBe(false)
  })
  test("the api's BAD_REQUEST is a field error", async () => {
    const d = deps({
      avatar: {
        set: async () => {
          throw new ORPCError("BAD_REQUEST", { message: IMAGE_UPLOAD_MESSAGE, defined: true })
        },
      },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setAvatarCore(d, fd)).toEqual({
      ok: false,
      fieldErrors: { file: IMAGE_UPLOAD_MESSAGE },
    })
  })
  test("TOO_MANY_REQUESTS is a form message", async () => {
    const d = deps({
      avatar: {
        set: async () => {
          throw defined("TOO_MANY_REQUESTS", "Too many uploads, try again later")
        },
      },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setAvatarCore(d, fd)).toEqual({
      ok: false,
      message: "Too many uploads, try again later",
    })
  })
  test("SERVICE_UNAVAILABLE (storage down) is the api's own message, not 'unavailable'", async () => {
    const d = deps({
      avatar: {
        set: async () => {
          throw defined("SERVICE_UNAVAILABLE", "File storage is unavailable, try again later")
        },
      },
    })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setAvatarCore(d, fd)).toEqual({
      ok: false,
      message: "File storage is unavailable, try again later",
    })
  })
  test("success", async () => {
    const d = deps({ avatar: { set: async () => ({ avatarUrl: "/files/avatars/1/x.png" }) } })
    const fd = new FormData()
    fd.set("file", file(100))
    expect(await setAvatarCore(d, fd)).toEqual({ ok: true, message: "Profile photo updated." })
  })
})

describe("removeAvatarCore", () => {
  test("success", async () => {
    const d = deps({ avatar: { remove: async () => ({ ok: true }) } })
    expect(await removeAvatarCore(d)).toEqual({ ok: true, message: "Profile photo removed." })
  })
})

describe("changePasswordCore", () => {
  test("success message names the side effect", async () => {
    const d = deps({ changePassword: async () => undefined })
    expect(
      await changePasswordCore(
        d,
        form({ currentPassword: "old-old-old", newPassword: "new-new-new", confirm: "new-new-new" })
      )
    ).toEqual({
      ok: true,
      message: "Password changed. Other devices were signed out.",
    })
  })
  test("mismatch, reuse, short and wrong-current are reported in that order of precedence", async () => {
    const d = deps({
      changePassword: async () => {
        throw defined("FORBIDDEN", "Current password is incorrect")
      },
    })
    expect(
      await changePasswordCore(
        d,
        form({ currentPassword: "a", newPassword: "new-new-new", confirm: "nope" })
      )
    ).toMatchObject({ fieldErrors: { confirm: "Passwords do not match" } })
    expect(
      await changePasswordCore(
        d,
        form({ currentPassword: "same-same", newPassword: "same-same", confirm: "same-same" })
      )
    ).toMatchObject({ fieldErrors: { newPassword: "Choose a password you have not used here" } })
    expect(
      await changePasswordCore(
        d,
        form({ currentPassword: "a", newPassword: "short", confirm: "short" })
      )
    ).toMatchObject({ fieldErrors: { newPassword: expect.any(String) } })
    expect(
      await changePasswordCore(
        d,
        form({ currentPassword: "wrong-wrong", newPassword: "new-new-new", confirm: "new-new-new" })
      )
    ).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect" },
    })
  })
  test("passwords are never echoed", async () => {
    const d = deps({
      changePassword: async () => {
        throw new TypeError("fetch failed")
      },
    })
    const out = await changePasswordCore(
      d,
      form({ currentPassword: "a-a-a-a-a", newPassword: "new-new-new", confirm: "new-new-new" })
    )
    expect(JSON.stringify(out)).not.toContain("new-new-new")
    expect(out).toMatchObject({
      ok: false,
      message: "The account service is unavailable right now. Try again in a moment.",
    })
  })
})

describe("sessions", () => {
  test("revoke passes the id and reports; a foreign/garbage id is the api's NOT_FOUND message", async () => {
    let seen: unknown
    const ok = deps({
      sessions: {
        revoke: async (input) => {
          seen = input
        },
      },
    })
    expect(await revokeSessionCore(ok, form({ sessionId: "7" }))).toEqual({
      ok: true,
      message: "Device signed out.",
    })
    expect(seen).toEqual({ id: 7 })
    const missing = deps({
      sessions: {
        revoke: async () => {
          throw defined("NOT_FOUND", "Session not found")
        },
      },
    })
    expect(await revokeSessionCore(missing, form({ sessionId: "999" }))).toEqual({
      ok: false,
      message: "Session not found",
    })
    seen = undefined
    expect(await revokeSessionCore(ok, form({ sessionId: "abc" }))).toMatchObject({ ok: false })
    expect(seen).toBeUndefined()
  })
  test("revokeOthers reports", async () => {
    const d = deps({ sessions: { revokeOthers: async () => undefined } })
    expect(await revokeOtherSessionsCore(d)).toEqual({
      ok: true,
      message: "All other devices were signed out.",
    })
  })
})

describe("setPasswordCore", () => {
  test("mismatched confirmation is a field error and never calls the api", async () => {
    let calls = 0
    const out = await setPasswordCore(
      {
        api: {
          ...fakeApi,
          setPassword: async () => {
            calls++
          },
        },
      },
      form({ password: "correct horse battery", confirm: "different horse" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { confirm: expect.any(String) } })
    expect(calls).toBe(0)
  })
  test("success and CONFLICT", async () => {
    expect(
      await setPasswordCore(
        { api: { ...fakeApi, setPassword: async () => undefined } },
        form({ password: "correct horse battery", confirm: "correct horse battery" })
      )
    ).toEqual({ ok: true, message: "Password set. You can now sign in with it." })
    const conflict = new ORPCError("CONFLICT", {
      defined: true,
      message: "You already have a password — change it instead",
    })
    expect(
      await setPasswordCore(
        {
          api: {
            ...fakeApi,
            setPassword: async () => {
              throw conflict
            },
          },
        },
        form({ password: "correct horse battery", confirm: "correct horse battery" })
      )
    ).toEqual({ ok: false, message: conflict.message, values: {} })
  })
  test("a stale session's reauth refusal is a notice with the sign-in link", async () => {
    const href = "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity"
    const out = await setPasswordCore(
      {
        api: {
          ...fakeApi,
          setPassword: async () => {
            throw new ORPCError("FORBIDDEN", {
              defined: true,
              message: "Sign in again to set a password.",
              data: { reason: "reauth" },
            })
          },
        },
        reauthHref: href,
      },
      form({ password: "correct horse battery", confirm: "correct horse battery" })
    )
    expect(out).toEqual({
      ok: false,
      message: "Sign in again to set a password.",
      reauthHref: href,
      values: {},
    })
  })
  test("a FORBIDDEN without the reauth reason (impersonating) stays a plain message", async () => {
    // `defined: true` is what the api really sends here: impersonation.test.ts pins it.
    const out = await setPasswordCore(
      {
        api: {
          ...fakeApi,
          setPassword: async () => {
            throw new ORPCError("FORBIDDEN", {
              defined: true,
              message: "Not available while impersonating",
            })
          },
        },
        reauthHref: "http://auth.brand.localhost:3002/login",
      },
      form({ password: "correct horse battery", confirm: "correct horse battery" })
    )
    expect(out).toEqual({ ok: false, message: "Not available while impersonating", values: {} })
  })
})

describe("disconnectIdentityCore", () => {
  test("unknown provider value is rejected before the api", async () => {
    const out = await disconnectIdentityCore({ api: fakeApi }, form({ provider: "myspace" }))
    expect(out).toMatchObject({ ok: false })
  })
  test("success, FORBIDDEN and NOT_FOUND pass the api's message through", async () => {
    expect(
      await disconnectIdentityCore(
        {
          api: {
            ...fakeApi,
            identities: { ...fakeApi.identities, disconnect: async () => undefined },
          },
        },
        form({ provider: "github" })
      )
    ).toEqual({ ok: true, message: "GitHub disconnected." })
    const forbidden = new ORPCError("FORBIDDEN", {
      defined: true,
      message: "This is your only way to sign in — set a password or add a passkey first",
    })
    expect(
      await disconnectIdentityCore(
        {
          api: {
            ...fakeApi,
            identities: {
              ...fakeApi.identities,
              disconnect: async () => {
                throw forbidden
              },
            },
          },
        },
        form({ provider: "github" })
      )
    ).toEqual({ ok: false, message: forbidden.message })
  })
})

describe("resendVerificationCore", () => {
  test("reports sent", async () => {
    const out = await resendVerificationCore({
      api: { ...fakeApi, resendVerification: async () => ({ sent: true }) },
    })
    expect(out).toEqual({ ok: true, message: "Sent — check your inbox." })
  })
  test("already verified", async () => {
    const out = await resendVerificationCore({
      api: { ...fakeApi, resendVerification: async () => ({ sent: false }) },
    })
    expect(out).toEqual({ ok: true, message: "Your email is already verified." })
  })
  test("the limiter's message is shown", async () => {
    const limited = new ORPCError("TOO_MANY_REQUESTS", {
      defined: true,
      message: "Too many requests, try again in a few minutes",
    })
    const out = await resendVerificationCore({
      api: {
        ...fakeApi,
        resendVerification: async () => {
          throw limited
        },
      },
    })
    expect(out).toEqual({ ok: false, message: "Too many requests, try again in a few minutes" })
  })
})

describe("requestEmailChangeCore", () => {
  test("sends the trimmed, lowercased address and the password; returns the pending change", async () => {
    let received: unknown
    const pending = { maskedEmail: "n***@example.com", expiresAt: "2026-01-02T00:00:00.000Z" }
    const d = deps({
      email: {
        requestChange: async (input) => {
          received = input
          return { pending }
        },
      },
    })
    expect(
      await requestEmailChangeCore(
        d,
        form({ newEmail: "  New@Example.com ", currentPassword: "pw" })
      )
    ).toEqual({ ok: true, pending, values: { newEmail: "  New@Example.com " } })
    expect(received).toEqual({ newEmail: "new@example.com", password: "pw" })
  })
  test("never echoes the password or the code, only the address", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("UNAUTHORIZED", "That code didn't work.", { reason: "code" })
        },
      },
    })
    const out = await requestEmailChangeCore(
      d,
      form({ newEmail: "new@example.com", currentPassword: "secret-pw", code: "123456" })
    )
    expect(out.ok ? undefined : out.values).toEqual({ newEmail: "new@example.com" })
    expect(JSON.stringify(out)).not.toContain("secret-pw")
    expect(JSON.stringify(out)).not.toContain("123456")
  })
  test("no password or code field sends neither", async () => {
    let received: unknown
    const d = deps({
      email: {
        requestChange: async (input) => {
          received = input
          return {
            pending: { maskedEmail: "n***@example.com", expiresAt: "2026-01-02T00:00:00.000Z" },
          }
        },
      },
    })
    await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))
    expect(received).toEqual({ newEmail: "new@example.com" })
  })
  test("a malformed address is a field error on newEmail and never reaches the api", async () => {
    let called = false
    const d = deps({
      email: {
        requestChange: async () => {
          called = true
          return { pending: { maskedEmail: "x", expiresAt: "2026-01-02T00:00:00.000Z" } }
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "not-an-email" }))).toEqual({
      ok: false,
      fieldErrors: { newEmail: "Enter a valid email address." },
      values: { newEmail: "not-an-email" },
    })
    expect(called).toBe(false)
  })
  test("a wrong password is a field error on currentPassword", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("UNAUTHORIZED", "Current password is incorrect", { reason: "password" })
        },
      },
    })
    expect(
      await requestEmailChangeCore(
        d,
        form({ newEmail: "new@example.com", currentPassword: "nope" })
      )
    ).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect" },
      // The address survives a refusal; the password is never echoed.
      values: { newEmail: "new@example.com" },
    })
  })
  test("a wrong or missing two-step code is a field error on code", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("UNAUTHORIZED", "That code didn't work.", { reason: "code" })
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))).toEqual({
      ok: false,
      fieldErrors: { code: "That code didn't work." },
      values: { newEmail: "new@example.com" },
    })
  })
  test("reauth is a notice with the sign-in link", async () => {
    const d = {
      ...deps({
        email: {
          requestChange: async () => {
            throw defined("FORBIDDEN", "Sign in again to change your email.", { reason: "reauth" })
          },
        },
      }),
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fpersonal-info",
    }
    expect(await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))).toEqual({
      ok: false,
      message: "Sign in again to change your email.",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fpersonal-info",
      values: { newEmail: "new@example.com" },
    })
  })
  test("the same address as today's is a field error on newEmail", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("BAD_REQUEST", "Enter a different email address.")
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "ada@example.com" }))).toEqual({
      ok: false,
      fieldErrors: { newEmail: "Enter a different email address." },
      values: { newEmail: "ada@example.com" },
    })
  })
  test("the rate limiter's message is a form message", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("TOO_MANY_REQUESTS", "Too many email change attempts, try again later.")
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))).toEqual({
      ok: false,
      message: "Too many email change attempts, try again later.",
      values: { newEmail: "new@example.com" },
    })
  })
  test("impersonating (FORBIDDEN, no reason) shows the api's message", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
      values: { newEmail: "new@example.com" },
    })
  })
  test("an undeclared failure is logged and unavailable", async () => {
    const d = deps({
      email: {
        requestChange: async () => {
          throw new Error("boom")
        },
      },
    })
    expect(await requestEmailChangeCore(d, form({ newEmail: "new@example.com" }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
      values: { newEmail: "new@example.com" },
    })
  })
})

describe("confirmEmailChangeCore", () => {
  test("success returns the new address", async () => {
    const d = deps({
      email: { confirmChange: async () => ({ email: "new@example.com" }) },
    })
    expect(await confirmEmailChangeCore(d, form({ token: "a-token" }))).toEqual({
      ok: true,
      email: "new@example.com",
    })
  })
  test("sends the token from the form", async () => {
    let received: unknown
    const d = deps({
      email: {
        confirmChange: async (input) => {
          received = input
          return { email: "new@example.com" }
        },
      },
    })
    await confirmEmailChangeCore(d, form({ token: "a-token" }))
    expect(received).toEqual({ token: "a-token" })
  })
  test("an invalid, expired or another account's link shows the api's message", async () => {
    const d = deps({
      email: {
        confirmChange: async () => {
          throw defined("BAD_REQUEST", "This link is invalid, expired or already used")
        },
      },
    })
    expect(await confirmEmailChangeCore(d, form({ token: "a-token" }))).toEqual({
      ok: false,
      message: "This link is invalid, expired or already used",
    })
  })
  test("the address taken meanwhile (CONFLICT) shows the api's message", async () => {
    const d = deps({
      email: {
        confirmChange: async () => {
          throw defined("CONFLICT", "That address is now in use")
        },
      },
    })
    expect(await confirmEmailChangeCore(d, form({ token: "a-token" }))).toEqual({
      ok: false,
      message: "That address is now in use",
    })
  })
  test("an undeclared failure is logged and unavailable", async () => {
    const d = deps({
      email: {
        confirmChange: async () => {
          throw new Error("boom")
        },
      },
    })
    expect(await confirmEmailChangeCore(d, form({ token: "a-token" }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})

describe("setupTwoFactorCore", () => {
  test("returns the secret, its otpauth:// URL and a server-rendered QR as an SVG string", async () => {
    const d = deps({
      twoFactor: {
        setup: async () => ({
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUrl: "otpauth://totp/Boilerplate:ada@example.com?secret=JBSWY3DPEHPK3PXP",
        }),
      },
    })
    const out = await setupTwoFactorCore(d, form({}))
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error("unreachable")
    expect(out.secret).toBe("JBSWY3DPEHPK3PXP")
    expect(out.otpauthUrl).toContain("otpauth://totp/")
    expect(out.qrSvg.startsWith("<svg")).toBe(true)
    expect(out.qrSvg).not.toContain("<script")
  })
  test("already enabled is a CONFLICT message", async () => {
    const d = deps({
      twoFactor: {
        setup: async () => {
          throw defined("CONFLICT", "Two-step verification is already on")
        },
      },
    })
    expect(await setupTwoFactorCore(d, form({}))).toEqual({
      ok: false,
      message: "Two-step verification is already on",
    })
  })
  test("an unverified email (FORBIDDEN, no reason) shows the api's message", async () => {
    const d = deps({
      twoFactor: {
        setup: async () => {
          throw defined("FORBIDDEN", "Verify your email to turn on two-step verification")
        },
      },
    })
    expect(await setupTwoFactorCore(d, form({}))).toEqual({
      ok: false,
      message: "Verify your email to turn on two-step verification",
    })
  })
  test("sends the current password", async () => {
    let received: unknown
    const d = deps({
      twoFactor: {
        setup: async (input) => {
          received = input
          return { secret: "ABCD", otpauthUrl: "otpauth://totp/x" }
        },
      },
    })
    await setupTwoFactorCore(d, form({ currentPassword: "pw" }))
    expect(received).toEqual({ currentPassword: "pw" })
  })
  test("no password field sends no currentPassword", async () => {
    let received: unknown
    const d = deps({
      twoFactor: {
        setup: async (input) => {
          received = input
          return { secret: "ABCD", otpauthUrl: "otpauth://totp/x" }
        },
      },
    })
    await setupTwoFactorCore(d, form({}))
    expect(received).toEqual({})
  })
  test("a wrong password is a field error on currentPassword", async () => {
    const d = deps({
      twoFactor: {
        setup: async () => {
          throw defined("UNAUTHORIZED", "Current password is incorrect", { reason: "password" })
        },
      },
    })
    expect(await setupTwoFactorCore(d, form({ currentPassword: "nope" }))).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect" },
    })
  })
  test("reauth is a notice with the sign-in link", async () => {
    const d = {
      ...deps({
        twoFactor: {
          setup: async () => {
            throw defined("FORBIDDEN", "Sign in again to turn on two-step verification.", {
              reason: "reauth",
            })
          },
        },
      }),
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    }
    expect(await setupTwoFactorCore(d, form({}))).toEqual({
      ok: false,
      message: "Sign in again to turn on two-step verification.",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    })
  })
})

describe("enableTwoFactorCore", () => {
  test("a malformed code is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      twoFactor: {
        enable: async () => {
          called = true
          return { recoveryCodes: [] }
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "12" }))).toMatchObject({
      ok: false,
      fieldErrors: { code: expect.any(String) },
    })
    expect(called).toBe(false)
  })
  test("success returns the ten recovery codes", async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `aaaaa-aaaa${i}`)
    const d = deps({ twoFactor: { enable: async () => ({ recoveryCodes: codes }) } })
    expect(await enableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: true,
      recoveryCodes: codes,
    })
  })
  test("a wrong code is a field error naming the api's message", async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined(
            "UNAUTHORIZED",
            "That code didn't work. Check your authenticator app and try again.",
            WRONG
          )
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "000000" }))).toEqual({
      ok: false,
      fieldErrors: {
        code: "That code didn't work. Check your authenticator app and try again.",
      },
    })
  })
  test("a wrong code in Swedish still lands on the code field (told apart by data, not text)", async () => {
    const swedish = "Koden stämmer inte. Kontrollera din autentiseringsapp och försök igen."
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined("UNAUTHORIZED", swedish, WRONG)
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "000000" }))).toEqual({
      ok: false,
      fieldErrors: { code: swedish },
    })
  })
  test("an UNAUTHORIZED carrying the English wrong-code text but no reason is a form message", async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined(
            "UNAUTHORIZED",
            "That code didn't work. Check your authenticator app and try again."
          )
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "000000" }))).toEqual({
      ok: false,
      message: "That code didn't work. Check your authenticator app and try again.",
    })
  })
  test('an expired session (UNAUTHORIZED "Sign in required") is a form message, not a code error', async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined("UNAUTHORIZED", "Sign in required")
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Sign in required",
    })
  })
  test("an unverified email (FORBIDDEN) is a plain message", async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined("FORBIDDEN", "Verify your email to turn on two-step verification")
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Verify your email to turn on two-step verification",
    })
  })
  test("no pending setup (BAD_REQUEST) is a plain message", async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined("BAD_REQUEST", "Start setup first")
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Start setup first",
    })
  })
  test("an impersonation session sees the api's message", async () => {
    const d = deps({
      twoFactor: {
        enable: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await enableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("disableTwoFactorCore", () => {
  test("success", async () => {
    const d = deps({ twoFactor: { disable: async () => undefined } })
    expect(await disableTwoFactorCore(d, form({ code: "123456" }))).toMatchObject({ ok: true })
  })
  test("a wrong code is a field error; a recovery code is accepted the same way", async () => {
    const d = deps({
      twoFactor: {
        disable: async () => {
          throw defined(
            "UNAUTHORIZED",
            "That code didn't work. Check your authenticator app and try again.",
            WRONG
          )
        },
      },
    })
    expect(await disableTwoFactorCore(d, form({ code: "abcde-fghij" }))).toEqual({
      ok: false,
      fieldErrors: {
        code: "That code didn't work. Check your authenticator app and try again.",
      },
    })
  })
  test("an expired session is a form message", async () => {
    const d = deps({
      twoFactor: {
        disable: async () => {
          throw defined("UNAUTHORIZED", "Sign in required")
        },
      },
    })
    expect(await disableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Sign in required",
    })
  })
  test("not on (CONFLICT) is a plain message", async () => {
    const d = deps({
      twoFactor: {
        disable: async () => {
          throw defined("CONFLICT", "Two-step verification is not on")
        },
      },
    })
    expect(await disableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Two-step verification is not on",
    })
  })
  test("impersonation FORBIDDEN surfaces its message", async () => {
    const d = deps({
      twoFactor: {
        disable: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await disableTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("regenerateRecoveryCodesCore", () => {
  test("success returns the new codes", async () => {
    const codes = ["bbbbb-bbbb0", "bbbbb-bbbb1"]
    const d = deps({
      twoFactor: { regenerateRecoveryCodes: async () => ({ recoveryCodes: codes }) },
    })
    expect(await regenerateRecoveryCodesCore(d, form({ code: "123456" }))).toEqual({
      ok: true,
      recoveryCodes: codes,
    })
  })
  test("a wrong code is a field error", async () => {
    const d = deps({
      twoFactor: {
        regenerateRecoveryCodes: async () => {
          throw defined(
            "UNAUTHORIZED",
            "That code didn't work. Check your authenticator app and try again.",
            WRONG
          )
        },
      },
    })
    expect(await regenerateRecoveryCodesCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      fieldErrors: {
        code: "That code didn't work. Check your authenticator app and try again.",
      },
    })
  })
  test("impersonation FORBIDDEN surfaces its message", async () => {
    const d = deps({
      twoFactor: {
        regenerateRecoveryCodes: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await regenerateRecoveryCodesCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("passkeyRegisterOptionsCore", () => {
  test("success returns the options and challenge id", async () => {
    const d = deps({
      passkeys: {
        registerOptions: async () => ({ options: { rp: { id: "x" } }, challengeId: "c-1" }),
      },
    })
    expect(await passkeyRegisterOptionsCore(d, form({}))).toEqual({
      ok: true,
      options: { rp: { id: "x" } },
      challengeId: "c-1",
    })
  })
  test("sends the current password", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        registerOptions: async (input) => {
          received = input
          return { options: {}, challengeId: "c-1" }
        },
      },
    })
    await passkeyRegisterOptionsCore(d, form({ currentPassword: "pw" }))
    expect(received).toEqual({ password: "pw" })
  })
  test("no password field sends no password", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        registerOptions: async (input) => {
          received = input
          return { options: {}, challengeId: "c-1" }
        },
      },
    })
    await passkeyRegisterOptionsCore(d, form({}))
    expect(received).toEqual({})
  })
  test("a wrong password is a field error on currentPassword", async () => {
    const d = deps({
      passkeys: {
        registerOptions: async () => {
          throw defined("UNAUTHORIZED", "Current password is incorrect", { reason: "password" })
        },
      },
    })
    expect(await passkeyRegisterOptionsCore(d, form({ currentPassword: "nope" }))).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Current password is incorrect" },
    })
  })
  test("reauth is a notice with the sign-in link", async () => {
    const d = {
      ...deps({
        passkeys: {
          registerOptions: async () => {
            throw defined("FORBIDDEN", "Sign in again to add a passkey.", { reason: "reauth" })
          },
        },
      }),
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    }
    expect(await passkeyRegisterOptionsCore(d, form({}))).toEqual({
      ok: false,
      message: "Sign in again to add a passkey.",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    })
  })
  test("an account at the cap sees the api's (translated) limit message", async () => {
    const d = deps({
      passkeys: {
        registerOptions: async () => {
          throw defined("CONFLICT", PASSKEY_LIMIT_MESSAGE)
        },
      },
    })
    expect(await passkeyRegisterOptionsCore(d, form({}))).toEqual({
      ok: false,
      message: PASSKEY_LIMIT_MESSAGE,
    })
  })
  test("an impersonation session sees the api's message", async () => {
    const d = deps({
      passkeys: {
        registerOptions: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await passkeyRegisterOptionsCore(d, form({}))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("passkeyRegisterCore", () => {
  test("success returns a confirmation message", async () => {
    const d = deps({ passkeys: { register: async () => passkey } })
    expect(
      await passkeyRegisterCore(
        d,
        form({ challengeId: "c-1", response: JSON.stringify({ id: "cred-1" }) })
      )
    ).toEqual({ ok: true, message: "Passkey added." })
  })
  test("a chosen name is sent verbatim, trimmed", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        register: async (input) => {
          received = input
          return passkey
        },
      },
    })
    await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "{}", name: "  My phone  " }))
    expect(received).toEqual({ challengeId: "c-1", response: {}, name: "My phone" })
  })
  test("a blank (or whitespace-only) name is sent as undefined, never an empty string", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        register: async (input) => {
          received = input
          return passkey
        },
      },
    })
    await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "{}", name: "   " }))
    expect(received).toEqual({ challengeId: "c-1", response: {}, name: undefined })
  })
  test("a response that is not JSON never reaches the api", async () => {
    let called = false
    const d = deps({
      passkeys: {
        register: async () => {
          called = true
          return passkey
        },
      },
    })
    expect(
      await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "not json" }))
    ).toEqual({ ok: false, message: "That didn't work. Try again." })
    expect(called).toBe(false)
  })
  test("a response the api refuses (BAD_REQUEST) shows its message", async () => {
    const d = deps({
      passkeys: {
        register: async () => {
          throw defined("BAD_REQUEST", "That passkey couldn't be added. Try again.")
        },
      },
    })
    expect(await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "{}" }))).toEqual({
      ok: false,
      message: "That passkey couldn't be added. Try again.",
    })
  })
  test("an impersonation session sees the api's message", async () => {
    const d = deps({
      passkeys: {
        register: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "{}" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
  test("the cap reached meanwhile (CONFLICT) shows the api's limit message", async () => {
    const d = deps({
      passkeys: {
        register: async () => {
          throw defined("CONFLICT", PASSKEY_LIMIT_MESSAGE)
        },
      },
    })
    expect(await passkeyRegisterCore(d, form({ challengeId: "c-1", response: "{}" }))).toEqual({
      ok: false,
      message: PASSKEY_LIMIT_MESSAGE,
    })
  })
})

describe("renamePasskeyCore", () => {
  test("success renames and confirms", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        rename: async (input) => {
          received = input
          return undefined
        },
      },
    })
    expect(await renamePasskeyCore(d, form({ id: "3", name: "Work laptop" }))).toEqual({
      ok: true,
      message: "Passkey renamed.",
    })
    expect(received).toEqual({ id: 3, name: "Work laptop" })
  })
  test("a blank name is a validation message and never reaches the api", async () => {
    let called = false
    const d = deps({
      passkeys: {
        rename: async () => {
          called = true
          return undefined
        },
      },
    })
    expect(await renamePasskeyCore(d, form({ id: "3", name: "" }))).toEqual({
      ok: false,
      message: "This field is required.",
    })
    expect(called).toBe(false)
  })
  test("a 61-char name is a validation message and never reaches the api", async () => {
    let called = false
    const d = deps({
      passkeys: {
        rename: async () => {
          called = true
          return undefined
        },
      },
    })
    expect(await renamePasskeyCore(d, form({ id: "3", name: "x".repeat(61) }))).toEqual({
      ok: false,
      message: "Use at most 60 characters.",
    })
    expect(called).toBe(false)
  })
  test("not found and impersonation surface the api's message", async () => {
    const notFound = deps({
      passkeys: {
        rename: async () => {
          throw defined("NOT_FOUND", "Passkey not found")
        },
      },
    })
    expect(await renamePasskeyCore(notFound, form({ id: "3", name: "x" }))).toEqual({
      ok: false,
      message: "Passkey not found",
    })
    const impersonating = deps({
      passkeys: {
        rename: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await renamePasskeyCore(impersonating, form({ id: "3", name: "x" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("deletePasskeyCore", () => {
  test("success removes and confirms", async () => {
    let received: unknown
    const d = deps({
      passkeys: {
        delete: async (input) => {
          received = input
          return undefined
        },
      },
    })
    expect(await deletePasskeyCore(d, form({ id: "3" }))).toEqual({
      ok: true,
      message: "Passkey removed.",
    })
    expect(received).toEqual({ id: 3 })
  })
  test("the last way in is the api's CONFLICT message", async () => {
    const d = deps({
      passkeys: {
        delete: async () => {
          throw defined(
            "CONFLICT",
            "This is your only way to sign in — set a password or connect a provider first."
          )
        },
      },
    })
    expect(await deletePasskeyCore(d, form({ id: "3" }))).toEqual({
      ok: false,
      message: "This is your only way to sign in — set a password or connect a provider first.",
    })
  })
  test("not found and impersonation surface the api's message", async () => {
    const notFound = deps({
      passkeys: {
        delete: async () => {
          throw defined("NOT_FOUND", "Passkey not found")
        },
      },
    })
    expect(await deletePasskeyCore(notFound, form({ id: "3" }))).toEqual({
      ok: false,
      message: "Passkey not found",
    })
    const impersonating = deps({
      passkeys: {
        delete: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      },
    })
    expect(await deletePasskeyCore(impersonating, form({ id: "3" }))).toEqual({
      ok: false,
      message: "Not available while impersonating",
    })
  })
})

describe("connectErrorMessage", () => {
  test("names the provider for a known code; unknown codes and ids are not trusted", () => {
    expect(connectErrorMessage("claimed", "github")).toContain("That GitHub account")
    expect(connectErrorMessage("provider", "constructor")).toContain("The provider is not")
    expect(connectErrorMessage("constructor", "google")).toBeUndefined()
    expect(connectErrorMessage(undefined, undefined)).toBeUndefined()
  })

  test("'suspended' (apps/auth's oauth callback, outside the shared oauth-error map) is the suspended message", () => {
    expect(connectErrorMessage("suspended", "github")).toBe(
      "This account is suspended. Contact support."
    )
    // The provider is irrelevant to this message, unlike every other code.
    expect(connectErrorMessage("suspended", undefined)).toBe(
      "This account is suspended. Contact support."
    )
  })
})

describe("Data & privacy", () => {
  const privacy = (api: Partial<PrivacyDeps["api"]> & { request?: () => Promise<unknown> }) =>
    ({
      api: {
        delete: api.delete,
        cancelDeletion: api.cancelDeletion,
        export: { request: api.request },
      },
    }) as PrivacyDeps

  describe("requestExportCore", () => {
    test("asks for an export and says it is being prepared", async () => {
      let called = false
      const d = privacy({
        request: async () => {
          called = true
          return { id: 1, status: "pending" }
        },
      })
      expect(await requestExportCore(d)).toEqual({ ok: true, message: "Preparing your export…" })
      expect(called).toBe(true)
    })

    test("too soon: the api's message, which carries the time", async () => {
      const message = "You can request a new export after Oct 11, 2026, 9:00 AM UTC."
      const d = privacy({
        request: async () => {
          throw defined("CONFLICT", message, { retryAt: "2026-10-11T09:00:00.000Z" })
        },
      })
      expect(await requestExportCore(d)).toEqual({ ok: false, message })
    })

    test("while impersonating: the api's refusal", async () => {
      const d = privacy({
        request: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      })
      expect(await requestExportCore(d)).toEqual({
        ok: false,
        message: "Not available while impersonating",
      })
    })
  })

  describe("setConsentCore", () => {
    const written: string[] = []
    const consentDeps = (secure: boolean) => ({
      domain: ".brand.localhost",
      secure,
      setCookie: (raw: string) => {
        written.push(raw)
      },
    })

    test("writes exactly the cookie the banner writes", async () => {
      written.length = 0
      expect(await setConsentCore(consentDeps(false), form({ consent: "necessary" }))).toEqual({
        ok: true,
        message: "Saved",
      })
      expect(await setConsentCore(consentDeps(true), form({ consent: "all" }))).toEqual({
        ok: true,
        message: "Saved",
      })
      expect(written).toEqual([
        consentCookie("necessary", { domain: ".brand.localhost", secure: false }),
        consentCookie("all", { domain: ".brand.localhost", secure: true }),
      ])
    })

    test("anything but the two choices is a field error, and nothing is written", async () => {
      written.length = 0
      expect(await setConsentCore(consentDeps(false), form({ consent: "some" }))).toEqual({
        ok: false,
        fieldErrors: { consent: "Choose one of the options." },
      })
      expect(written).toEqual([])
    })

    test("cookieParts hands Next's cookies().set the banner's attributes", () => {
      const raw = consentCookie("all", { domain: ".brand.localhost", secure: true })
      expect(cookieParts(raw)).toEqual({
        name: "consent",
        value: "all",
        options: {
          path: "/",
          maxAge: CONSENT_MAX_AGE,
          sameSite: "lax",
          domain: ".brand.localhost",
          secure: true,
        },
      })
      expect(cookieParts(consentCookie("necessary", { secure: false })).options).toEqual({
        path: "/",
        maxAge: CONSENT_MAX_AGE,
        sameSite: "lax",
      })
    })
  })

  describe("deleteAccountCore", () => {
    const AUTH = "http://auth.brand.localhost:3002"
    const REAUTH = `${AUTH}/login?reauth=1&next=x`
    class Redirected extends Error {
      constructor(readonly url: string) {
        super(url)
      }
    }
    const deleteDeps = (del: PrivacyDeps["api"]["delete"]) => {
      const calls: string[] = []
      const deps: DeleteAccountDeps = {
        ...privacy({ delete: del }),
        authUrl: AUTH,
        reauthHref: REAUTH,
        clearSession: async () => {
          calls.push("clearSession")
        },
        redirect: (url: string) => {
          calls.push(`redirect ${url}`)
          throw new Redirected(url)
        },
      }
      return { deps, calls }
    }

    test("success: signs out, then lands on the sign-in page with the deletion notice", async () => {
      let seen: unknown
      const { deps, calls } = deleteDeps(async (input) => {
        seen = input
        return { deletionScheduledAt: "2026-10-17T09:00:00.000Z" }
      })
      await expect(deleteAccountCore(deps, form({ email: " ada@example.com " }))).rejects.toThrow(
        Redirected
      )
      expect(seen).toEqual({ email: "ada@example.com" })
      expect(calls).toEqual(["clearSession", `redirect ${AUTH}/login?deleted=1`])
    })

    test("an email that is not the account's: a field error, the typed value kept", async () => {
      const message = "Type your account's email address to confirm."
      const { deps, calls } = deleteDeps(async () => {
        throw defined("BAD_REQUEST", message)
      })
      expect(await deleteAccountCore(deps, form({ email: "eve@example.com" }))).toEqual({
        ok: false,
        fieldErrors: { email: message },
        values: { email: "eve@example.com" },
      })
      expect(calls).toEqual([])
    })

    test("a session too old: the sign-in-again notice with its link", async () => {
      const message = "Sign in again to delete your account."
      const { deps } = deleteDeps(async () => {
        throw defined("FORBIDDEN", message, { reason: "reauth" })
      })
      expect(await deleteAccountCore(deps, form({ email: "ada@example.com" }))).toEqual({
        ok: false,
        message,
        reauthHref: REAUTH,
        values: { email: "ada@example.com" },
      })
    })

    test("while impersonating: the plain refusal, no sign-in link", async () => {
      const { deps } = deleteDeps(async () => {
        throw defined("FORBIDDEN", "Not available while impersonating")
      })
      const out = await deleteAccountCore(deps, form({ email: "ada@example.com" }))
      expect(out).toEqual({
        ok: false,
        message: "Not available while impersonating",
        values: { email: "ada@example.com" },
      })
    })

    test("the only owner of a shared workspace: the api's message naming it", async () => {
      const message = "Transfer ownership or delete these workspaces first: Acme"
      const { deps, calls } = deleteDeps(async () => {
        throw defined("CONFLICT", message, { names: ["Acme"] })
      })
      expect(await deleteAccountCore(deps, form({ email: "ada@example.com" }))).toEqual({
        ok: false,
        message,
        values: { email: "ada@example.com" },
      })
      expect(calls).toEqual([])
    })

    test("an outage is the unavailable message", async () => {
      const { deps } = deleteDeps(async () => {
        throw new TypeError("fetch failed")
      })
      const out = await deleteAccountCore(deps, form({ email: "ada@example.com" }))
      expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
    })
  })

  describe("cancelDeletionCore", () => {
    test("true once the api cancelled it, false on a refusal", async () => {
      expect(await cancelDeletionCore(privacy({ cancelDeletion: async () => ({}) }))).toBe(true)
      const refused = privacy({
        cancelDeletion: async () => {
          throw defined("FORBIDDEN", "Not available while impersonating")
        },
      })
      expect(await cancelDeletionCore(refused)).toBe(false)
    })
  })
})
