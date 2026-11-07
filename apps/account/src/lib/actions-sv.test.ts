import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { MAX_IMAGE_BYTES } from "@repo/api-contract"
import { consentCookie } from "@repo/ui/lib/consent"
import {
  type ActionDeps,
  cancelDeletionCore,
  changePasswordCore,
  confirmEmailChangeCore,
  connectErrorMessage,
  type DeleteAccountDeps,
  deleteAccountCore,
  disableTwoFactorCore,
  disconnectIdentityCore,
  enableTwoFactorCore,
  type PrivacyDeps,
  regenerateRecoveryCodesCore,
  removeAvatarCore,
  requestEmailChangeCore,
  requestExportCore,
  resendVerificationCore,
  revokeOtherSessionsCore,
  revokeSessionCore,
  setAvatarCore,
  setConsentCore,
  setLocaleCore,
  setPasswordCore,
  setupTwoFactorCore,
  updateProfileCore,
} from "./actions"

// The action cores in Swedish: the request's locale arrives as `deps.locale`. The api's own
// messages already come in it (the client sends `x-locale`), so they pass through untouched.

const user = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: true,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "sv" as const,
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}
const form = (fields: Record<string, string | File>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string, data?: unknown) =>
  new ORPCError(code, { message, data, defined: true })
const down = async (): Promise<never> => {
  throw new TypeError("fetch failed")
}
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
    registerOptions: async () => ({ options: {}, challengeId: "c-1" }),
    register: async () => ({
      id: 1,
      name: "This device",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
    }),
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
const sv = (api: Partial<ActionDeps["api"]> = {}): ActionDeps => ({
  api: { ...fakeApi, ...api },
  locale: "sv",
})
const UNAVAILABLE_SV = "Kontotjänsten är inte tillgänglig just nu. Försök igen om en stund."
const png = (size: number) => new File([new Uint8Array(size)], "a.png", { type: "image/png" })
const passwords = { currentPassword: "old-old-old", newPassword: "new-new-new" }

describe("profile and avatar, in Swedish", () => {
  test("a saved name, an over-long one and an unavailable api", async () => {
    expect(await updateProfileCore(sv(), form({ name: "Ada" }))).toEqual({
      ok: true,
      message: "Namnet har uppdaterats.",
    })
    expect(await updateProfileCore(sv(), form({ name: "x".repeat(101) }))).toMatchObject({
      fieldErrors: { name: "Använd högst 100 tecken." },
    })
    expect(
      await updateProfileCore(sv({ updateProfile: down }), form({ name: "Ada" }))
    ).toMatchObject({ ok: false, message: UNAVAILABLE_SV })
  })

  test("no file, a file over the limit, an upload and a removal", async () => {
    expect(await setAvatarCore(sv(), form({}))).toEqual({
      ok: false,
      fieldErrors: { file: "Välj en bild." },
    })
    expect(await setAvatarCore(sv(), form({ file: png(MAX_IMAGE_BYTES + 1) }))).toEqual({
      ok: false,
      fieldErrors: { file: "Ladda upp en PNG-, JPEG- eller WebP-bild på högst 2 MB." },
    })
    expect(await setAvatarCore(sv(), form({ file: png(10) }))).toEqual({
      ok: true,
      message: "Profilbilden har uppdaterats.",
    })
    expect(await removeAvatarCore(sv())).toEqual({
      ok: true,
      message: "Profilbilden har tagits bort.",
    })
  })
})

describe("passwords, in Swedish", () => {
  test("changed, mismatched, reused, too short", async () => {
    expect(await changePasswordCore(sv(), form({ ...passwords, confirm: "new-new-new" }))).toEqual({
      ok: true,
      message: "Lösenordet har bytts. Andra enheter har loggats ut.",
    })
    expect(await changePasswordCore(sv(), form({ ...passwords, confirm: "nope" }))).toEqual({
      ok: false,
      fieldErrors: { confirm: "Lösenorden stämmer inte överens" },
    })
    expect(
      await changePasswordCore(
        sv(),
        form({ currentPassword: "same-same", newPassword: "same-same", confirm: "same-same" })
      )
    ).toMatchObject({
      fieldErrors: { newPassword: "Välj ett lösenord som du inte har använt här" },
    })
    expect(
      await changePasswordCore(
        sv(),
        form({ currentPassword: "a", newPassword: "short", confirm: "short" })
      )
    ).toMatchObject({ fieldErrors: { newPassword: "Använd minst 8 tecken." } })
  })

  test("the api's wrong-current-password message passes through on its field", async () => {
    const api = sv({
      changePassword: async () => {
        throw defined("FORBIDDEN", "Nuvarande lösenord är fel")
      },
    })
    expect(await changePasswordCore(api, form({ ...passwords, confirm: "new-new-new" }))).toEqual({
      ok: false,
      fieldErrors: { currentPassword: "Nuvarande lösenord är fel" },
    })
  })

  test("a first password: set, and mismatched", async () => {
    expect(
      await setPasswordCore(sv(), form({ password: "pw-pw-pw-pw", confirm: "pw-pw-pw-pw" }))
    ).toEqual({ ok: true, message: "Lösenordet har sparats. Nu kan du logga in med det." })
    expect(await setPasswordCore(sv(), form({ password: "pw-pw-pw-pw", confirm: "x" }))).toEqual({
      ok: false,
      fieldErrors: { confirm: "Lösenorden stämmer inte överens" },
    })
  })
})

describe("two-step verification, in Swedish", () => {
  const wrong = async (): Promise<never> => {
    throw defined("UNAUTHORIZED", "Koden fungerade inte.", { reason: "wrong_code" })
  }

  test("a malformed code asks for the code", async () => {
    for (const core of [enableTwoFactorCore, disableTwoFactorCore, regenerateRecoveryCodesCore]) {
      expect(await core(sv(), form({ code: "12" }))).toEqual({
        ok: false,
        fieldErrors: { code: "Ange den sexsiffriga koden från appen, eller en återställningskod." },
      })
    }
  })

  test("a wrong code lands on the code field with the api's (Swedish) message", async () => {
    const api = sv({ twoFactor: { ...fakeApi.twoFactor, enable: wrong, disable: wrong } })
    const regen = sv({
      twoFactor: { ...fakeApi.twoFactor, regenerateRecoveryCodes: wrong },
    })
    const expected = { ok: false as const, fieldErrors: { code: "Koden fungerade inte." } }
    expect(await enableTwoFactorCore(api, form({ code: "123456" }))).toEqual(expected)
    expect(await disableTwoFactorCore(api, form({ code: "123456" }))).toEqual(expected)
    expect(await regenerateRecoveryCodesCore(regen, form({ code: "123456" }))).toEqual(expected)
  })

  test("turned off, and an unavailable api", async () => {
    expect(await disableTwoFactorCore(sv(), form({ code: "123456" }))).toEqual({
      ok: true,
      message: "Tvåstegsverifiering är inaktiverad.",
    })
    const broken = sv({
      twoFactor: { ...fakeApi.twoFactor, setup: down, enable: down },
    })
    expect(await setupTwoFactorCore(broken, form({}))).toEqual({
      ok: false,
      message: UNAVAILABLE_SV,
    })
    expect(await enableTwoFactorCore(broken, form({ code: "123456" }))).toEqual({
      ok: false,
      message: UNAVAILABLE_SV,
    })
  })

  // The api's reauth message (already translated via `x-locale`) passes through untouched, as
  // every other declared-error message in this suite does.
  test("reauth is a notice with the sign-in link, in Swedish", async () => {
    const d = {
      ...sv({
        twoFactor: {
          ...fakeApi.twoFactor,
          setup: async () => {
            throw defined("FORBIDDEN", "Logga in igen för att slå på tvåstegsverifiering.", {
              reason: "reauth",
            })
          },
        },
      }),
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    }
    expect(await setupTwoFactorCore(d, form({}))).toEqual({
      ok: false,
      message: "Logga in igen för att slå på tvåstegsverifiering.",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1&next=%2Fsecurity",
    })
  })
})

describe("devices, connected accounts and verification, in Swedish", () => {
  test("sessions", async () => {
    expect(await revokeSessionCore(sv(), form({ sessionId: "7" }))).toEqual({
      ok: true,
      message: "Enheten har loggats ut.",
    })
    expect(await revokeSessionCore(sv(), form({ sessionId: "x" }))).toEqual({
      ok: false,
      message: "Sessionen hittades inte",
    })
    expect(await revokeOtherSessionsCore(sv())).toEqual({
      ok: true,
      message: "Alla andra enheter har loggats ut.",
    })
  })

  test("identities", async () => {
    expect(await disconnectIdentityCore(sv(), form({ provider: "github" }))).toEqual({
      ok: true,
      message: "GitHub har kopplats bort.",
    })
    expect(await disconnectIdentityCore(sv(), form({ provider: "myspace" }))).toEqual({
      ok: false,
      message: "Leverantören känns inte igen",
    })
  })

  test("resend verification", async () => {
    expect(await resendVerificationCore(sv())).toEqual({
      ok: true,
      message: "Skickat – kolla din inkorg.",
    })
    expect(
      await resendVerificationCore(sv({ resendVerification: async () => ({ sent: false }) }))
    ).toEqual({ ok: true, message: "Din e-postadress är redan verifierad." })
  })

  test("a failed connect from the auth app", () => {
    expect(connectErrorMessage("claimed", "github", "sv")).toStartWith("Det här GitHub-kontot")
    expect(connectErrorMessage("provider", "constructor", "sv")).toBe(
      "Leverantören svarar inte just nu. Försök igen om en stund."
    )
    expect(connectErrorMessage("constructor", "google", "sv")).toBeUndefined()
    expect(connectErrorMessage("suspended", "github", "sv")).toBe(
      "Det här kontot är avstängt. Kontakta supporten."
    )
  })
})

describe("email change, in Swedish", () => {
  test("a malformed address is a field error on newEmail", async () => {
    expect(await requestEmailChangeCore(sv(), form({ newEmail: "not-an-email" }))).toEqual({
      ok: false,
      fieldErrors: { newEmail: "Ange en giltig e-postadress." },
      values: { newEmail: "not-an-email" },
    })
  })
  test("success returns the pending change the api answered", async () => {
    const pending = { maskedEmail: "n***@example.com", expiresAt: "2026-01-02T00:00:00.000Z" }
    const out = await requestEmailChangeCore(
      sv({ email: { ...fakeApi.email, requestChange: async () => ({ pending }) } }),
      form({ newEmail: "new@example.com" })
    )
    expect(out).toEqual({ ok: true, pending, values: { newEmail: "new@example.com" } })
  })
  test("an undeclared failure is logged and unavailable, in Swedish", async () => {
    const out = await requestEmailChangeCore(
      sv({ email: { ...fakeApi.email, requestChange: down } }),
      form({ newEmail: "new@example.com" })
    )
    expect(out).toEqual({
      ok: false,
      message: UNAVAILABLE_SV,
      values: { newEmail: "new@example.com" },
    })
  })
  test("confirmChange success returns the new address", async () => {
    const out = await confirmEmailChangeCore(sv(), form({ token: "a-token" }))
    expect(out).toEqual({ ok: true, email: "new@example.com" })
  })
  test("confirmChange: an undeclared failure is logged and unavailable, in Swedish", async () => {
    const out = await confirmEmailChangeCore(
      sv({ email: { ...fakeApi.email, confirmChange: down } }),
      form({ token: "a-token" })
    )
    expect(out).toEqual({ ok: false, message: UNAVAILABLE_SV })
  })
})

describe("setLocaleCore (the Language card)", () => {
  const deps = (setLocale: (locale: "en" | "sv") => Promise<void>, locale?: "en" | "sv") => {
    const calls = { saved: [] as string[], revalidated: 0 }
    return {
      calls,
      deps: {
        locale,
        setLocale: async (l: "en" | "sv") => {
          await setLocale(l)
          calls.saved.push(l)
        },
        revalidate: () => {
          calls.revalidated++
        },
      },
    }
  }

  test("a valid choice is saved, revalidated, and confirmed in the new language", async () => {
    const toSv = deps(async () => undefined, "en")
    expect(await setLocaleCore(toSv.deps, form({ locale: "sv" }))).toEqual({
      ok: true,
      message: "Språket har sparats.",
    })
    expect(toSv.calls).toEqual({ saved: ["sv"], revalidated: 1 })
    const toEn = deps(async () => undefined, "sv")
    expect(await setLocaleCore(toEn.deps, form({ locale: "en" }))).toEqual({
      ok: true,
      message: "Language saved.",
    })
  })

  test("an unsupported value is a field error in the current language, and saves nothing", async () => {
    const { deps: d, calls } = deps(async () => undefined, "sv")
    for (const locale of ["de", "", "constructor"]) {
      expect(await setLocaleCore(d, form({ locale }))).toEqual({
        ok: false,
        fieldErrors: { locale: "Välj ett av språken i listan." },
      })
    }
    expect(await setLocaleCore(d, new FormData())).toMatchObject({ ok: false })
    expect(calls).toEqual({ saved: [], revalidated: 0 })
  })

  test("a save that fails is a form message, never a throw, and nothing is revalidated", async () => {
    const { deps: d, calls } = deps(down, "sv")
    expect(await setLocaleCore(d, form({ locale: "en" }))).toEqual({
      ok: false,
      message: "Det gick inte att spara språket. Försök igen.",
    })
    expect(calls.revalidated).toBe(0)
    const english = deps(down)
    expect(await setLocaleCore(english.deps, form({ locale: "sv" }))).toEqual({
      ok: false,
      message: "Your language could not be saved. Try again.",
    })
  })
})

describe("Data & privacy, in Swedish", () => {
  const privacy = (api: Partial<PrivacyDeps["api"]> & { request?: () => Promise<unknown> }) =>
    ({
      api: {
        delete: api.delete,
        cancelDeletion: api.cancelDeletion,
        export: { request: api.request },
      },
      locale: "sv",
    }) as PrivacyDeps

  test("an export request: being prepared, the api's own refusal, or unavailable", async () => {
    expect(
      await requestExportCore(privacy({ request: async () => ({ id: 1, status: "pending" }) }))
    ).toEqual({ ok: true, message: "Din export förbereds…" })
    const tooSoon = "Du kan begära en ny export efter 11 okt. 2026 09:00 UTC."
    expect(
      await requestExportCore(
        privacy({
          request: async () => {
            throw defined("CONFLICT", tooSoon, { retryAt: "2026-10-11T09:00:00.000Z" })
          },
        })
      )
    ).toEqual({ ok: false, message: tooSoon })
    expect(await requestExportCore(privacy({ request: down }))).toEqual({
      ok: false,
      message: UNAVAILABLE_SV,
    })
  })

  test("consent: saved in Swedish, the same cookie, and a Swedish field error", async () => {
    const written: string[] = []
    const deps = {
      domain: ".brand.localhost",
      secure: false,
      locale: "sv" as const,
      setCookie: (raw: string) => {
        written.push(raw)
      },
    }
    expect(await setConsentCore(deps, form({ consent: "all" }))).toEqual({
      ok: true,
      message: "Sparat",
    })
    expect(written).toEqual([consentCookie("all", { domain: ".brand.localhost", secure: false })])
    expect(await setConsentCore(deps, form({}))).toEqual({
      ok: false,
      fieldErrors: { consent: "Välj ett av alternativen." },
    })
  })

  test("delete: the api's Swedish messages pass through; success signs out", async () => {
    const calls: string[] = []
    const deps = (del: PrivacyDeps["api"]["delete"]): DeleteAccountDeps => ({
      ...privacy({ delete: del }),
      authUrl: "http://auth.brand.localhost:3002",
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1",
      clearSession: async () => {
        calls.push("clearSession")
      },
      redirect: (url: string) => {
        calls.push(url)
        throw new Error("redirected")
      },
    })
    const mismatch = "Skriv kontots e-postadress för att bekräfta."
    expect(
      await deleteAccountCore(
        deps(async () => {
          throw defined("BAD_REQUEST", mismatch)
        }),
        form({ email: "x@example.com" })
      )
    ).toEqual({ ok: false, fieldErrors: { email: mismatch }, values: { email: "x@example.com" } })
    const reauth = "Logga in igen för att radera ditt konto."
    expect(
      await deleteAccountCore(
        deps(async () => {
          throw defined("FORBIDDEN", reauth, { reason: "reauth" })
        }),
        form({ email: "ada@example.com" })
      )
    ).toMatchObject({
      message: reauth,
      reauthHref: "http://auth.brand.localhost:3002/login?reauth=1",
    })
    const soleOwner = "Överför ägarskapet eller ta bort de här arbetsytorna först: Acme"
    expect(
      await deleteAccountCore(
        deps(async () => {
          throw defined("CONFLICT", soleOwner, { names: ["Acme"] })
        }),
        form({ email: "ada@example.com" })
      )
    ).toMatchObject({ ok: false, message: soleOwner })
    expect(calls).toEqual([])
    await expect(
      deleteAccountCore(
        deps(async () => ({ deletionScheduledAt: "2026-10-17T09:00:00.000Z" })),
        form({ email: "ada@example.com" })
      )
    ).rejects.toThrow("redirected")
    expect(calls).toEqual(["clearSession", "http://auth.brand.localhost:3002/login?deleted=1"])
  })

  test("cancelling the deletion", async () => {
    expect(await cancelDeletionCore(privacy({ cancelDeletion: async () => ({}) }))).toBe(true)
    expect(await cancelDeletionCore(privacy({ cancelDeletion: down }))).toBe(false)
  })
})
