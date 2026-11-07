import { describe, expect, test } from "bun:test"
import * as root from "./index"
import { WORKSPACE_ACTIVITY_ACTIONS } from "./workspace-activity"
import { WorkspaceActivityListSchema } from "./workspace-activity-schema"

describe("WORKSPACE_ACTIVITY_ACTIONS", () => {
  test("is re-exported from the root and lists each action once", () => {
    expect(root.WORKSPACE_ACTIVITY_ACTIONS).toBe(WORKSPACE_ACTIVITY_ACTIONS)
    expect(new Set(WORKSPACE_ACTIVITY_ACTIONS).size).toBe(WORKSPACE_ACTIVITY_ACTIONS.length)
  })

  test("never names a note action: those rows stay impersonation-only", () => {
    expect(WORKSPACE_ACTIVITY_ACTIONS.some((action) => action.startsWith("note."))).toBe(false)
  })

  test("the subpath imports nothing, so a client component can use it", async () => {
    const source = await Bun.file(new URL("./workspace-activity.ts", import.meta.url)).text()
    expect(source).not.toMatch(/^import /m)
  })
})

describe("workspaces.activity.list's input", () => {
  const parse = (input: Record<string, unknown>) =>
    WorkspaceActivityListSchema.safeParse({ workspaceId: 1, ...input }).success

  test("takes an activity action, a well-formed cursor and a limit of 1 to 100", () => {
    expect(parse({})).toBe(true)
    expect(parse({ action: "workspace.renamed", cursor: "2026-10-19T10:00:00.000Z_7" })).toBe(true)
    expect(parse({ limit: 100 })).toBe(true)
  })

  test("refuses any other action, a malformed or impossible cursor and an out-of-range limit", () => {
    for (const action of ["note.created", "user.suspended", "WORKSPACE.RENAMED"])
      expect(parse({ action })).toBe(false)
    for (const cursor of ["x", "2026-02-30T10:00:00.000Z_7", "2026-10-19T10:00:00.000Z_0"])
      expect(parse({ cursor })).toBe(false)
    expect(parse({ cursor: "2026-10-19T10:00:00.000Z_2147483648" })).toBe(false)
    for (const limit of [0, 101]) expect(parse({ limit })).toBe(false)
  })

  test("is a procedure of the contract", () => {
    expect(root.contract.workspaces.activity.list).toBeDefined()
  })
})
