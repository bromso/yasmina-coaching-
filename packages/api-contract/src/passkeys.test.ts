import { describe, expect, test } from "bun:test"
import {
  PASSKEY_FAILED_MESSAGE,
  PASSKEY_LAST_WAY_IN_MESSAGE,
  PASSKEY_RATE_MESSAGE,
  PasskeyNameSchema,
  PasskeyOptionsResult,
  PasskeySchema,
  PasskeyVerifyInput,
  RegisterInput,
  RegisterOptionsInput,
} from "./passkeys"

describe("passkey schemas", () => {
  test("PasskeyNameSchema trims and bounds to 1–60 characters", () => {
    expect(PasskeyNameSchema.parse("  My device  ")).toBe("My device")
    expect(PasskeyNameSchema.safeParse("").success).toBe(false)
    expect(PasskeyNameSchema.safeParse("   ").success).toBe(false)
    expect(PasskeyNameSchema.safeParse("x".repeat(60)).success).toBe(true)
    expect(PasskeyNameSchema.safeParse("x".repeat(61)).success).toBe(false)
  })

  test("PasskeySchema shapes account.passkeys.list's rows and carries no key material", () => {
    const row = {
      id: 1,
      name: "This device",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
    }
    expect(PasskeySchema.parse(row)).toEqual(row)
    expect(Object.keys(PasskeySchema.shape)).not.toContain("credentialId")
    expect(Object.keys(PasskeySchema.shape)).not.toContain("publicKey")
  })

  test("RegisterOptionsInput: an optional current password", () => {
    expect(RegisterOptionsInput.parse({})).toEqual({})
    expect(RegisterOptionsInput.parse({ password: "secret" })).toEqual({ password: "secret" })
  })

  test("RegisterInput: a challenge id, an unvalidated response, an optional 1–60 char name", () => {
    expect(RegisterInput.parse({ challengeId: "abc", response: { any: "shape" } })).toEqual({
      challengeId: "abc",
      response: { any: "shape" },
    })
    expect(
      RegisterInput.parse({ challengeId: "abc", response: {}, name: "Work laptop" })
    ).toMatchObject({ name: "Work laptop" })
    expect(RegisterInput.safeParse({ challengeId: "abc", response: {}, name: "" }).success).toBe(
      false
    )
    expect(RegisterInput.safeParse({ response: {} }).success).toBe(false)
  })

  test("PasskeyOptionsResult: the library's own options plus an opaque challenge id", () => {
    expect(PasskeyOptionsResult.parse({ options: { challenge: "c" }, challengeId: "abc" })).toEqual(
      { options: { challenge: "c" }, challengeId: "abc" }
    )
    expect(PasskeyOptionsResult.safeParse({ options: {} }).success).toBe(false)
  })

  test("PasskeyVerifyInput: a challenge id, an unvalidated response, optional client info", () => {
    expect(PasskeyVerifyInput.parse({ challengeId: "abc", response: {} })).toMatchObject({
      challengeId: "abc",
    })
    expect(
      PasskeyVerifyInput.parse({
        challengeId: "abc",
        response: {},
        client: { userAgent: "UA", ip: "127.0.0.1" },
      })
    ).toMatchObject({ client: { userAgent: "UA", ip: "127.0.0.1" } })
  })

  test("the three message constants", () => {
    expect(PASSKEY_LAST_WAY_IN_MESSAGE).toBe(
      "This is your only way to sign in — set a password or connect a provider first."
    )
    expect(PASSKEY_FAILED_MESSAGE).toBe(
      "That passkey didn't work. Try again or use another way to sign in."
    )
    expect(PASSKEY_RATE_MESSAGE).toBe("Too many passkey attempts, try again later.")
  })
})
