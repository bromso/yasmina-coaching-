import { describe, expect, test } from "bun:test"
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  ChangePasswordSchema,
  PASSKEY_FAILED_MESSAGE,
  SignInSchema,
  SignUpSchema,
  TWO_FACTOR_TIMED_OUT_MESSAGE,
  TwoFactorVerifySchema,
} from "@repo/api-contract"
import { LOCALES } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { OAUTH_ERROR_MESSAGES, type OauthErrorCode } from "@repo/ui/lib/oauth-errors"
import {
  MAGIC_INVALID,
  MAGIC_SENT,
  PASSKEY_CANCELLED,
  PASSKEY_FAILED,
  RESET_SENT,
  UNAVAILABLE,
} from "./actions"
import { authTranslator, oauthErrorMessageIn, zodMessage } from "./i18n"
import { TWO_FACTOR_INVALID_CODE_MESSAGE } from "./two-factor"

const issues = (schema: { safeParse(v: unknown): { error?: { issues: unknown[] } } }, v: unknown) =>
  (schema.safeParse(v).error?.issues ?? []) as Parameters<ReturnType<typeof zodMessage>>[0][]

describe("zodMessage", () => {
  const sv = zodMessage(authTranslator("sv"))
  const en = zodMessage(authTranslator("en"))

  test("an email format issue is invalidEmail", () => {
    const [issue] = issues(SignUpSchema, { email: "nope", password: "12345678" })
    expect(sv(issue)).toBe("Ange en giltig e-postadress.")
    expect(en(issue)).toBe("Enter a valid email address.")
  })

  test("a short password names its minimum; a long one its maximum", () => {
    const [short] = issues(SignUpSchema, { email: "a@b.co", password: "short" })
    expect(sv(short)).toBe("Använd minst 8 tecken.")
    const [long] = issues(SignUpSchema, { email: "a@b.co", password: "x".repeat(129) })
    expect(sv(long)).toBe("Använd högst 128 tecken.")
    expect(en(long)).toBe("Use at most 128 characters.")
  })

  test("an empty required field (minimum 1) is required", () => {
    const [, password] = issues(SignInSchema, { email: "nope", password: "" })
    expect(sv(password)).toBe("Fältet måste fyllas i.")
  })

  test("a non-password field too long or short is tooLong / tooShort", () => {
    const name = issues(SignUpSchema, {
      email: "a@b.co",
      password: "12345678",
      name: "x".repeat(101),
    })
    expect(sv(name[0])).toBe("Använd högst 100 tecken.")
    const [code] = issues(TwoFactorVerifySchema, { challenge: "c", code: "1" })
    expect(sv(code)).toBe("Använd minst 6 tecken.")
  })

  test("a custom refine's params.key picks the key, never the English message", () => {
    const [reused] = issues(ChangePasswordSchema, {
      currentPassword: "abcdefgh",
      newPassword: "abcdefgh",
    })
    expect(sv(reused)).toBe("Välj ett lösenord som du inte har använt här")
    expect(en(reused)).toBe("Choose a password you have not used here")
  })

  test("anything unmapped is the generic invalid", () => {
    expect(sv({ code: "invalid_type", path: ["x"], message: "Expected string" } as never)).toBe(
      "Kontrollera fältet."
    )
    // An unknown params.key is unmapped too, not a raw key on screen.
    expect(
      sv({ code: "custom", path: ["x"], message: "m", params: { key: "nope" } } as never)
    ).toBe("Kontrollera fältet.")
  })
})

describe("the English catalog is today's English", () => {
  const t = authTranslator("en")
  test("the action constants", () => {
    expect(t("common.unavailable")).toBe(UNAVAILABLE)
    expect(t("forgotPassword.sent")).toBe(RESET_SENT)
    expect(t("magic.sent")).toBe(MAGIC_SENT)
    expect(t("magic.invalid")).toBe(MAGIC_INVALID)
    expect(t("twoFactor.invalidCode")).toBe(TWO_FACTOR_INVALID_CODE_MESSAGE)
    expect(t("twoFactor.timedOut")).toBe(TWO_FACTOR_TIMED_OUT_MESSAGE)
    expect(t("passkey.cancelled")).toBe(PASSKEY_CANCELLED)
    // Word-for-word the api's own `passkeyFailed` catalog entry: one sentence for "that didn't
    // work" whether the failure happened in the browser or on the api.
    expect(t("passkey.failed")).toBe(PASSKEY_FAILED)
    expect(t("passkey.failed")).toBe(PASSKEY_FAILED_MESSAGE)
    // Word-for-word the api's own `accountSuspended` message: the oauth callback redirect loses
    // the api's own (already-translated) message, so this app renders its own copy instead — kept
    // identical to what the other sign-in paths show straight from the api.
    expect(t("common.accountSuspended")).toBe(ACCOUNT_SUSPENDED_MESSAGE)
  })

  test("every provider error, named and not", () => {
    for (const code of Object.keys(OAUTH_ERROR_MESSAGES) as OauthErrorCode[]) {
      for (const provider of ["GitHub", undefined]) {
        expect(oauthErrorMessageIn(t, code, provider)).toBe(OAUTH_ERROR_MESSAGES[code](provider))
      }
    }
    expect(oauthErrorMessageIn(t, "bogus", "GitHub")).toBeUndefined()
    expect(oauthErrorMessageIn(t, undefined, undefined)).toBeUndefined()
  })
})

test("provider errors in Swedish name the provider", () => {
  expect(oauthErrorMessageIn(authTranslator("sv"), "provider", "GitHub")).toBe(
    "GitHub svarar inte just nu. Försök igen om en stund."
  )
})

test("common.accountSuspended matches the api's own accountSuspended, in every locale", () => {
  // oauth.ts's isSuspendedRefusal compares the api's thrown FORBIDDEN message against this app's
  // own auth.json copy (the oauth redirect cannot carry the api's already-translated string, so
  // this app renders its own copy instead — see oauth.ts). This pins that copy to the live api
  // catalog, in every supported locale, so a wording edit to either side that drifts the other
  // fails here instead of silently breaking isSuspendedRefusal's match.
  for (const locale of LOCALES) {
    expect(authTranslator(locale)("common.accountSuspended")).toBe(
      translatorFor(locale, "api")("accountSuspended")
    )
  }
})
