import { describe, expect, mock, test } from "bun:test"
import { renderIn } from "@/test-intl"

mock.module("server-only", () => ({}))

// No `mock.module` of the form here: Bun's module mocks are process-wide, so a stub of
// `@/components/email-revert-form` would leak into `email-revert-form.test.tsx` whenever this
// file happened to run first. The view's own job — computing the Security url server-side and
// rendering the real form with the token — is checked directly instead.
const { EmailRevertView, emailRevertSecurityUrl } = await import("./email-revert-view")

describe("EmailRevertView", () => {
  test("computes the account Security url server-side", () => {
    expect(emailRevertSecurityUrl()).toBe("http://account.brand.localhost:3003/security")
  })

  test("renders the real revert form carrying the token", () => {
    const html = renderIn("en", <EmailRevertView token="a-token" />)
    expect(html).toContain("Restore your email")
    expect(html).toContain('value="a-token"')
  })
})
