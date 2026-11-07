import { describe, expect, test } from "bun:test"
import { requirementWarnings } from "./two-factor-requirement"

const workspaces = [
  { name: "Acme", requireTwoFactor: true },
  { name: "Hobby", requireTwoFactor: false },
  { name: "Beta", requireTwoFactor: true },
]

describe("requirementWarnings", () => {
  test("two-step on and no passkey: turning it off would block, naming every requiring workspace", () => {
    expect(requirementWarnings({ twoFactorEnabled: true, passkeyCount: 0, workspaces })).toEqual({
      twoFactorOff: ["Acme", "Beta"],
      lastPasskey: [],
    })
  })

  test("two-step on and a passkey: turning it off still satisfies, removing a passkey too", () => {
    expect(requirementWarnings({ twoFactorEnabled: true, passkeyCount: 1, workspaces })).toEqual({
      twoFactorOff: [],
      lastPasskey: [],
    })
  })

  test("two-step off and one passkey: removing it would block", () => {
    expect(requirementWarnings({ twoFactorEnabled: false, passkeyCount: 1, workspaces })).toEqual({
      twoFactorOff: [],
      lastPasskey: ["Acme", "Beta"],
    })
  })

  test("two-step off and two passkeys: removing one still satisfies", () => {
    expect(requirementWarnings({ twoFactorEnabled: false, passkeyCount: 2, workspaces })).toEqual({
      twoFactorOff: [],
      lastPasskey: [],
    })
  })

  test("no workspace requires it: never a warning", () => {
    const none = workspaces.map((w) => ({ ...w, requireTwoFactor: false }))
    expect(
      requirementWarnings({ twoFactorEnabled: true, passkeyCount: 0, workspaces: none })
    ).toEqual({ twoFactorOff: [], lastPasskey: [] })
    expect(
      requirementWarnings({ twoFactorEnabled: false, passkeyCount: 1, workspaces: [] })
    ).toEqual({ twoFactorOff: [], lastPasskey: [] })
  })
})
