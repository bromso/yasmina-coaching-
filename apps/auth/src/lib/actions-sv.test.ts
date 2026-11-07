import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  type ActionDeps,
  consumeMagicLinkCore,
  forgotPasswordCore,
  requestMagicLinkCore,
  resetPasswordCore,
  signInCore,
  signUpCore,
} from "./actions"
import {
  cancelEmailChangeCore,
  type EmailChangeApi,
  type EmailChangeDeps,
  revertEmailChangeCore,
} from "./email-change"
import { verifyTwoFactorCore } from "./two-factor"

// The same cores as actions.test.ts, with the request's locale: Swedish. The api answers in the
// caller's language already (x-locale), so its messages pass through untouched.
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const UNAVAILABLE_SV = "Inloggningstjänsten är inte tillgänglig just nu. Försök igen om en stund."

function deps(api: Partial<ActionDeps["api"]>): ActionDeps {
  return {
    api: api as ActionDeps["api"],
    setSession: async () => {},
    safeNextUrl: () => "http://app.brand.localhost:3001",
    client: {},
    locale: "sv",
  }
}

describe("action cores in Swedish", () => {
  test("a bad email is a Swedish field error, and the api is never called", async () => {
    let called = false
    const d = deps({
      signIn: async () => {
        called = true
        throw new Error("unreachable")
      },
    })
    expect(await signInCore(d, form({ email: "not-an-email", password: "" }))).toMatchObject({
      ok: false,
      fieldErrors: { email: "Ange en giltig e-postadress.", password: "Fältet måste fyllas i." },
    })
    expect(called).toBe(false)
  })

  test("sign-up's short password names the minimum in Swedish", async () => {
    expect(await signUpCore(deps({}), form({ email: "a@b.co", password: "short" }))).toMatchObject({
      fieldErrors: { password: "Använd minst 8 tecken." },
    })
  })

  test("an api refusal is the api's (already Swedish) message, untouched", async () => {
    const d = deps({
      signIn: async () => {
        throw defined("UNAUTHORIZED", "Fel e-postadress eller lösenord")
      },
    })
    expect(await signInCore(d, form({ email: "a@b.co", password: "nope-nope" }))).toEqual({
      ok: false,
      message: "Fel e-postadress eller lösenord",
      values: { email: "a@b.co" },
    })
  })

  test("an unreachable api is UNAVAILABLE in Swedish", async () => {
    const d = deps({
      signIn: async () => {
        throw new Error("ECONNREFUSED")
      },
    })
    const original = console.error
    console.error = () => {}
    try {
      expect(await signInCore(d, form({ email: "a@b.co", password: "nope-nope" }))).toMatchObject({
        message: UNAVAILABLE_SV,
      })
    } finally {
      console.error = original
    }
  })

  test("the sent / invalid sentences are Swedish", async () => {
    const quiet = deps({
      requestPasswordReset: async () => {},
      magicLink: { request: async () => {}, consume: async () => ({}) } as never,
    })
    expect(await forgotPasswordCore(quiet, form({ email: "a@b.co" }))).toEqual({
      ok: true,
      message: "Om det finns ett konto med den e-postadressen är en återställningslänk på väg.",
    })
    expect(await requestMagicLinkCore(quiet, form({ email: "a@b.co" }))).toEqual({
      ok: true,
      message: "Titta i inkorgen efter en inloggningslänk.",
    })
    expect(await consumeMagicLinkCore(quiet, form({ token: "short" }))).toEqual({
      ok: false,
      message: "Inloggningslänken har gått ut eller har redan använts.",
    })
  })

  test("mismatched passwords are Swedish", async () => {
    expect(
      await resetPasswordCore(deps({}), form({ password: "abcdefgh", confirm: "abcdefgi" }))
    ).toEqual({ ok: false, fieldErrors: { confirm: "Lösenorden stämmer inte överens" } })
  })

  test("the code step: a short code and an unreachable api are Swedish", async () => {
    const base = {
      setSession: async () => {},
      safeNextUrl: () => "http://app.brand.localhost:3001",
      client: {},
      challenge: "c".repeat(43),
      locale: "sv" as const,
    }
    expect(
      await verifyTwoFactorCore(
        { ...base, api: { verify: async () => ({}) as never } },
        form({ code: "1" })
      )
    ).toEqual({
      ok: false,
      fieldErrors: { code: "Ange den sexsiffriga koden från appen, eller en återställningskod." },
    })
    const original = console.error
    console.error = () => {}
    try {
      expect(
        await verifyTwoFactorCore(
          {
            ...base,
            api: {
              verify: async () => {
                throw new Error("down")
              },
            },
          },
          form({ code: "123456" })
        )
      ).toEqual({ ok: false, message: UNAVAILABLE_SV })
    } finally {
      console.error = original
    }
  })
})

function emailChangeDeps(api: Partial<EmailChangeApi>): EmailChangeDeps {
  return { api: api as EmailChangeApi, clearSession: async () => {}, locale: "sv" }
}

describe("cancelEmailChangeCore / revertEmailChangeCore in Swedish", () => {
  test("an implausible token's invalid-link sentence is Swedish", async () => {
    expect(await cancelEmailChangeCore(emailChangeDeps({}), form({ token: "short" }))).toEqual({
      ok: false,
      message: "Länken är ogiltig, har gått ut eller har redan använts.",
    })
    expect(await revertEmailChangeCore(emailChangeDeps({}), form({ token: "short" }))).toEqual({
      ok: false,
      message: "Länken är ogiltig, har gått ut eller har redan använts.",
    })
  })

  test("cancel success is Swedish", async () => {
    const d = emailChangeDeps({ cancel: async () => {} })
    expect(await cancelEmailChangeCore(d, form({ token: "a".repeat(43) }))).toEqual({
      ok: true,
      message: "Ändringen avbröts och alla sessioner loggades ut.",
    })
  })

  test("revert's CONFLICT (the old address is taken) is the api's own Swedish message", async () => {
    const d = emailChangeDeps({
      revert: async () => {
        throw defined("CONFLICT", "Den adressen används nu av ett annat konto.")
      },
    })
    expect(await revertEmailChangeCore(d, form({ token: "a".repeat(43) }))).toEqual({
      ok: false,
      message: "Den adressen används nu av ett annat konto.",
    })
  })

  test("an unreachable api is UNAVAILABLE in Swedish", async () => {
    const d = emailChangeDeps({
      cancel: async () => {
        throw new Error("down")
      },
    })
    const original = console.error
    console.error = () => {}
    try {
      expect(await cancelEmailChangeCore(d, form({ token: "a".repeat(43) }))).toEqual({
        ok: false,
        message: UNAVAILABLE_SV,
      })
    } finally {
      console.error = original
    }
  })
})
