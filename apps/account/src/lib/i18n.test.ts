import { describe, expect, test } from "bun:test"
import {
  ChangePasswordSchema,
  FEATURES,
  featureCopy,
  IMAGE_UPLOAD_MESSAGE,
  ROLES,
  SEAT_LIMIT_MESSAGE,
  TwoFactorCodeSchema,
  UpdateProfileSchema,
} from "@repo/api-contract"
import { LOCALES } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { OAUTH_ERROR_MESSAGES, oauthErrorMessage } from "@repo/ui/lib/oauth-errors"
import { UNAVAILABLE } from "./actions"
import { accountTranslator, oauthErrorMessageIn, type ZodLikeIssue, zodMessage } from "./i18n"

const issues = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, v: unknown) =>
  (schema.safeParse(v).error?.issues ?? []) as ZodLikeIssue[]

describe("accountTranslator", () => {
  test("English by default, Swedish on request", () => {
    expect(accountTranslator()("security.twoFactor")).toBe("Two-step verification")
    expect(accountTranslator("sv")("security.twoFactor")).toBe("Tvåstegsverifiering")
  })

  test("English equals the constants it replaces", () => {
    const en = accountTranslator("en")
    // The avatar size message is never IMAGE_UPLOAD_MESSAGE itself, but reads the same in English.
    expect(en("image.tooLarge")).toBe(IMAGE_UPLOAD_MESSAGE)
    expect(en("common.unavailable")).toBe(UNAVAILABLE)
    // The invite form's full-workspace notice and the plan picker's feature labels are catalog
    // keys, never the contract's constants, but read the same in English.
    expect(en("invite.seatLimit")).toBe(SEAT_LIMIT_MESSAGE)
    for (const feature of FEATURES)
      expect(en(`features.${feature}`)).toBe(featureCopy(feature).label)
  })

  test("common.accountSuspended matches the api's own accountSuspended, in every locale", () => {
    // connectErrorMessage's "suspended" branch renders this app's own copy (the auth app's oauth
    // redirect cannot carry the api's already-translated message) — pinned to the live api
    // catalog so a wording edit to either side that drifts the other fails here.
    for (const locale of LOCALES) {
      expect(accountTranslator(locale)("common.accountSuspended")).toBe(
        translatorFor(locale, "api")("accountSuspended")
      )
    }
  })

  test("the seat limit and the features in Swedish", () => {
    const sv = accountTranslator("sv")
    // The same words the api answers with when it refuses the invite.
    expect(sv("invite.seatLimit")).toBe(translatorFor("sv", "api")("seatLimit"))
    expect(sv("features.chat")).toBe("AI-chatt")
  })

  test("roles use the api's role words, capitalised as labels", () => {
    for (const locale of ["en", "sv"] as const) {
      const t = accountTranslator(locale)
      const api = translatorFor(locale, "api")
      for (const role of ROLES) expect(t(`roles.${role}`).toLowerCase()).toBe(api(`roles.${role}`))
    }
  })

  test("the recovery-code count is an ICU plural, with or without the warning", () => {
    const en = accountTranslator("en")
    const sv = accountTranslator("sv")
    expect(en("twoFactor.codesLeft", { count: 1, low: "yes" })).toBe(
      "1 recovery code left — regenerate soon."
    )
    expect(en("twoFactor.codesLeft", { count: 8, low: "no" })).toBe("8 recovery codes left.")
    expect(sv("twoFactor.codesLeft", { count: 1, low: "yes" })).toBe(
      "1 återställningskod kvar – skapa nya snart."
    )
    expect(sv("twoFactor.codesLeft", { count: 8, low: "no" })).toBe("8 återställningskoder kvar.")
  })
})

describe("zodMessage", () => {
  const en = zodMessage(accountTranslator("en"))
  const sv = zodMessage(accountTranslator("sv"))

  test("a reused password is told apart by its params key", () => {
    const [issue] = issues(ChangePasswordSchema, {
      currentPassword: "same-same",
      newPassword: "same-same",
    })
    expect(en(issue)).toBe("Choose a password you have not used here")
    expect(sv(issue)).toBe("Välj ett lösenord som du inte har använt här")
  })

  test("a short password names the minimum", () => {
    const [issue] = issues(ChangePasswordSchema, { currentPassword: "a", newPassword: "short" })
    expect(en(issue)).toBe("Use at least 8 characters.")
    expect(sv(issue)).toBe("Använd minst 8 tecken.")
  })

  test("an over-long name names the maximum", () => {
    const [issue] = issues(UpdateProfileSchema, { name: "x".repeat(101) })
    expect(sv(issue)).toBe("Använd högst 100 tecken.")
  })

  test("a malformed two-step code asks for the code", () => {
    const [issue] = issues(TwoFactorCodeSchema, { code: "12" })
    expect(en(issue)).toBe("Enter the 6-digit code from your app, or a recovery code.")
    expect(sv(issue)).toBe("Ange den sexsiffriga koden från appen, eller en återställningskod.")
  })
})

describe("oauthErrorMessageIn", () => {
  const en = accountTranslator("en")
  const sv = accountTranslator("sv")

  test("in English, exactly @repo/ui's message for every code, named and unnamed", () => {
    for (const code of Object.keys(OAUTH_ERROR_MESSAGES)) {
      expect(oauthErrorMessageIn(en, code, "GitHub")).toBe(oauthErrorMessage(code, "GitHub"))
      expect(oauthErrorMessageIn(en, code, undefined)).toBe(oauthErrorMessage(code, undefined))
    }
  })

  test("in Swedish for every code", () => {
    for (const code of Object.keys(OAUTH_ERROR_MESSAGES)) {
      const text = oauthErrorMessageIn(sv, code, "GitHub")
      expect(text).toBeString()
      expect(text).not.toBe(oauthErrorMessage(code, "GitHub"))
    }
    expect(oauthErrorMessageIn(sv, "claimed", "GitHub")).toStartWith("Det här GitHub-kontot")
    expect(oauthErrorMessageIn(sv, "provider", undefined)).toBe(
      "Leverantören svarar inte just nu. Försök igen om en stund."
    )
    expect(oauthErrorMessageIn(sv, "cancelled", "Google")).toBe("Du avbröt inloggningen.")
  })

  test("unknown codes, prototype keys or none show nothing", () => {
    expect(oauthErrorMessageIn(sv, "constructor", "Google")).toBeUndefined()
    expect(oauthErrorMessageIn(sv, "nope", "Google")).toBeUndefined()
    expect(oauthErrorMessageIn(sv, undefined, undefined)).toBeUndefined()
  })
})
