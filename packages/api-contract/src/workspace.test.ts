import { describe, expect, test } from "bun:test"
import {
  CreateInvitationSchema,
  CreateWorkspaceSchema,
  ROLES,
  type Role,
  roleAtLeast,
  SetRoleSchema,
  WORKSPACE_ERRORS,
  WORKSPACE_TWO_FACTOR_REASON,
  WorkspaceForbiddenDataSchema,
  WorkspaceSchema,
} from "./workspace"

describe("roleAtLeast", () => {
  test.each(
    ROLES.flatMap((role, i) => ROLES.map((min, j) => [role, min, i >= j] as [Role, Role, boolean]))
  )("%s at least %s is %p", (role, min, expected) => {
    expect(roleAtLeast(role, min)).toBe(expected)
  })

  test("the order is viewer < member < admin < owner", () => {
    expect(roleAtLeast("member", "viewer")).toBe(true)
    expect(roleAtLeast("admin", "member")).toBe(true)
    expect(roleAtLeast("owner", "admin")).toBe(true)
    expect(roleAtLeast("viewer", "member")).toBe(false)
    expect(roleAtLeast("admin", "owner")).toBe(false)
    expect(roleAtLeast("owner", "owner")).toBe(true)
  })
})

describe("workspace schemas", () => {
  test("the output schema accepts a stored name with a tab; the create input refuses it", () => {
    const name = "Ada\tLovelace's workspace"
    const workspace = {
      id: 1,
      name,
      slug: "ada",
      createdAt: new Date().toISOString(),
      logoUrl: null,
    }
    expect(WorkspaceSchema.safeParse(workspace).success).toBe(true)
    expect(CreateWorkspaceSchema.safeParse({ name }).success).toBe(false)
  })

  test("CreateInvitationSchema normalises the email", () => {
    expect(
      CreateInvitationSchema.parse({ workspaceId: "3", email: " Ada@Example.COM ", role: "member" })
    ).toEqual({ workspaceId: 3, email: "ada@example.com", role: "member" })
  })

  test("a workspace name with a control character is rejected", () => {
    const result = CreateWorkspaceSchema.safeParse({ name: "Acme\r\nBcc: x@example.com" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe("Name contains an invalid character")
    expect(CreateWorkspaceSchema.parse({ name: "  Acme Ops " })).toEqual({ name: "Acme Ops" })
  })

  test("SetRoleSchema rejects owner", () => {
    const input = { workspaceId: 1, userId: 2 }
    expect(SetRoleSchema.safeParse({ ...input, role: "owner" }).success).toBe(false)
    expect(SetRoleSchema.safeParse({ ...input, role: "admin" }).success).toBe(true)
  })
})

describe("the two-step refusal's data", () => {
  test("carries the reason only, and is optional for the other FORBIDDEN refusals", () => {
    expect(WORKSPACE_TWO_FACTOR_REASON).toBe("two_factor_required")
    expect(WorkspaceForbiddenDataSchema.safeParse({ reason: "two_factor_required" }).success).toBe(
      true
    )
    expect(WorkspaceForbiddenDataSchema.safeParse(undefined).success).toBe(true)
    expect(WorkspaceForbiddenDataSchema.safeParse({ reason: "other" }).success).toBe(false)
    // Extra keys are stripped, never forwarded: nothing but the reason reaches a client.
    expect(
      WorkspaceForbiddenDataSchema.parse({ reason: "two_factor_required", members: 3 })
    ).toEqual({ reason: "two_factor_required" })
    expect(WORKSPACE_ERRORS.FORBIDDEN.data).toBe(WorkspaceForbiddenDataSchema)
  })
})
