import { describe, expect, test } from "bun:test"
import { ChangePasswordSchema, PasswordSchema, SignInSchema, SignUpSchema } from "./auth"

describe("auth schemas", () => {
  test("emails are normalised, passwords bounded", () => {
    expect(SignInSchema.parse({ email: "  Ada@Example.COM ", password: "12345678" }).email).toBe(
      "ada@example.com"
    )
    expect(PasswordSchema.safeParse("1234567").success).toBe(false)
    expect(PasswordSchema.safeParse("x".repeat(129)).success).toBe(false)
    expect(PasswordSchema.safeParse("correct horse").success).toBe(true)
  })

  test("sign-up name is optional and trimmed; client info is optional", () => {
    const parsed = SignUpSchema.parse({ email: "a@b.co", password: "12345678", name: "  Ada " })
    expect(parsed.name).toBe("Ada")
    expect(SignUpSchema.parse({ email: "a@b.co", password: "12345678" }).name).toBe("")
    expect(
      SignUpSchema.parse({ email: "a@b.co", password: "12345678", client: { userAgent: "UA" } })
        .client?.userAgent
    ).toBe("UA")
  })

  test("change-password rejects reusing the current password", () => {
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: "same-same", newPassword: "same-same" })
        .success
    ).toBe(false)
  })
})
