import { expect, test } from "bun:test"
import type { Me } from "@repo/api-contract"
import { analyticsIdentity } from "./identity"

const baseUser: Me["user"] = {
  id: 7,
  email: "user@example.com",
  name: "User",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: true,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "en",
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}

const me = (impersonation: Me["impersonation"] = null): Me => ({
  user: baseUser,
  session: { id: 1, expiresAt: "2026-01-01T00:00:00.000Z" },
  impersonation,
  localeChosen: false,
})

test("returns the user and workspace ids for an ordinary signed-in visitor", () => {
  expect(analyticsIdentity(me(), 9)).toEqual({ userId: 7, workspaceId: 9 })
  expect(analyticsIdentity(me(), null)).toEqual({ userId: 7, workspaceId: null })
})

test("returns null while signed out", () => {
  expect(analyticsIdentity(null, 9)).toBeNull()
})

test("returns null while impersonating — the admin's activity, not the user's", () => {
  const impersonating = me({
    by: { id: 1, name: "Admin", email: "admin@example.com" },
    reason: "support ticket #123",
    expiresAt: "2026-01-01T01:00:00.000Z",
  })
  expect(analyticsIdentity(impersonating, 9)).toBeNull()
})
