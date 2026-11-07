import { describe, expect, test } from "bun:test"
import { entitlementsFor, type WorkspaceSummary } from "@repo/api-contract"
import {
  blockedByTwoFactor,
  pickWorkspace,
  readWorkspaceCookie,
  readWorkspaceId,
  WORKSPACE_COOKIE,
  WORKSPACE_MAX_AGE_SECONDS,
  workspaceCookieOptions,
} from "./workspace"

describe("workspaceCookieOptions", () => {
  test("development: lax, HttpOnly, parent domain, 365 days, not secure", () => {
    expect(workspaceCookieOptions({ domain: ".brand.localhost", production: false })).toEqual({
      name: "workspace",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
      domain: ".brand.localhost",
      maxAge: 31536000,
    })
  })
  test("production differs only in secure", () => {
    const prod = workspaceCookieOptions({ domain: ".brand.com", production: true })
    expect(prod.secure).toBe(true)
    expect(prod.name).toBe(WORKSPACE_COOKIE)
    expect(prod.maxAge).toBe(WORKSPACE_MAX_AGE_SECONDS)
  })
})

describe("readWorkspaceId", () => {
  test("a positive integer string is the id", () => {
    expect(readWorkspaceId("12")).toBe(12)
  })
  test("anything else is null", () => {
    for (const value of ["abc", "-1", "", "0", "1.5", " 2", "1234567890123", undefined, null]) {
      expect(readWorkspaceId(value)).toBeNull()
    }
  })
})

describe("readWorkspaceCookie", () => {
  test("reads the id from a raw Cookie header", () => {
    expect(readWorkspaceCookie("session=tok; workspace=12")).toBe(12)
  })
  test("the last workspace= wins, as in Next's cookie map", () => {
    expect(readWorkspaceCookie("workspace=1; session=tok; workspace=2")).toBe(2)
  })
  test("a percent-encoded value is decoded before it is checked", () => {
    expect(readWorkspaceCookie("workspace=%33")).toBe(3)
  })
  test("absent, malformed or not an id reads as null, never a throw", () => {
    for (const header of [
      null,
      "",
      "session=tok",
      "workspace=",
      "workspace=abc",
      "workspace=0",
      "workspace=%E0%A4%A",
      "myworkspace=4",
    ]) {
      expect(readWorkspaceCookie(header)).toBeNull()
    }
  })
})

describe("pickWorkspace", () => {
  const ws = (id: number): WorkspaceSummary => ({
    id,
    name: `Workspace ${id}`,
    slug: `workspace-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    role: "owner",
    memberCount: 1,
    entitlements: entitlementsFor({ subscription: null, memberCount: 1, portalAvailable: false }),
    logoUrl: null,
    requireTwoFactor: false,
  })
  const list = (...ids: number[]) => ({ items: ids.map(ws), pendingInvitations: [] })
  const cases: Array<[string, number[], number | null, number | null]> = [
    ["the wanted workspace, if a member", [1, 2], 2, 2],
    ["the wanted one even when it is the only one", [1], 1, 1],
    ["stale wanted id, one workspace: that one", [1], 9, 1],
    ["no wanted id, one workspace: that one", [1], null, 1],
    ["stale wanted id, two workspaces: none", [1, 2], 9, null],
    ["no wanted id, two workspaces: none", [1, 2], null, null],
    ["no workspaces: none", [], 1, null],
    ["no workspaces, no wanted id: none", [], null, null],
  ]
  for (const [name, ids, wanted, expected] of cases) {
    test(name, () => {
      expect(pickWorkspace(list(...ids), wanted)?.id ?? null).toBe(expected)
    })
  }
})

describe("blockedByTwoFactor", () => {
  test("only a workspace requiring two-step blocks, and only a user without it", () => {
    expect(blockedByTwoFactor({ requireTwoFactor: true }, { twoFactorSatisfied: false })).toBe(true)
    expect(blockedByTwoFactor({ requireTwoFactor: true }, { twoFactorSatisfied: true })).toBe(false)
    expect(blockedByTwoFactor({ requireTwoFactor: false }, { twoFactorSatisfied: false })).toBe(
      false
    )
    expect(blockedByTwoFactor({ requireTwoFactor: false }, { twoFactorSatisfied: true })).toBe(
      false
    )
  })
})
