import { describe, expect, test } from "bun:test"
import { IMPERSONATING_MESSAGE } from "@repo/api-contract"
import { isSuperadmin, parseSuperadminEmails, refuseWhileImpersonating } from "./admin"
import { likePattern } from "./queries/admin"

describe("isSuperadmin", () => {
  const emails = parseSuperadminEmails([" Root@Example.com ", "", "ops@example.com"])
  test("normalises the configured list", () => {
    expect([...emails]).toEqual(["root@example.com", "ops@example.com"])
  })
  test("a listed, verified email is a superadmin; unverified or unlisted is not", () => {
    const at = "2026-01-01T00:00:00.000Z"
    expect(isSuperadmin({ email: "root@example.com", email_verified_at: at }, emails)).toBe(true)
    expect(isSuperadmin({ email: "ROOT@example.com", email_verified_at: at }, emails)).toBe(true)
    expect(isSuperadmin({ email: "root@example.com", email_verified_at: null }, emails)).toBe(false)
    expect(isSuperadmin({ email: "someone@example.com", email_verified_at: at }, emails)).toBe(
      false
    )
    expect(isSuperadmin({ email: "root@example.com", email_verified_at: at }, new Set())).toBe(
      false
    )
  })
})

describe("refuseWhileImpersonating", () => {
  test("throws FORBIDDEN with the shared message only while impersonating", () => {
    expect(() => refuseWhileImpersonating({ impersonating: false, locale: "en" })).not.toThrow()
    expect(() => refuseWhileImpersonating({ impersonating: true, locale: "en" })).toThrow(
      IMPERSONATING_MESSAGE
    )
  })
})

test("likePattern escapes LIKE wildcards", () => {
  expect(likePattern("50%_off\\")).toBe("50\\%\\_off\\\\")
  expect(likePattern("ada")).toBe("ada")
})
