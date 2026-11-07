import { describe, expect, test } from "bun:test"
import { authTranslator } from "./i18n"
import { loginNotice } from "./login-notice"

describe("loginNotice", () => {
  test("deleted=1: the account is scheduled for deletion, in either language", () => {
    expect(loginNotice({ deleted: "1" }, authTranslator("en"))).toBe(
      "Your account is scheduled for deletion. Sign in to cancel."
    )
    expect(loginNotice({ deleted: "1" }, authTranslator("sv"))).toBe(
      "Ditt konto är schemalagt för radering. Logga in för att avbryta."
    )
  })

  test("the other notices keep their order, and nothing shows without one", () => {
    const t = authTranslator("en")
    expect(loginNotice({ reauth: "1", deleted: "1" }, t)).toBe("Sign in again to continue.")
    expect(loginNotice({ reset: "1" }, t)).toBe(
      "Your password was changed. Sign in with the new one."
    )
    expect(loginNotice({ signedout: "1" }, t)).toBe("You are signed out.")
    expect(loginNotice({ deleted: "0" }, t)).toBeUndefined()
    expect(loginNotice({}, t)).toBeUndefined()
  })
})
