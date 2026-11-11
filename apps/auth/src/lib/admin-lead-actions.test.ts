import { afterEach, beforeEach, describe, expect, type Mock, spyOn, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { UNAVAILABLE } from "./admin-actions"
import {
  DELETE_CONFIRM_REQUIRED,
  deleteLeadCore,
  type LeadActionDeps,
  updateLeadCore,
} from "./admin-lead-actions"

let logged: Mock<typeof console.error>
beforeEach(() => {
  logged = spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => logged.mockRestore())

const fd = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function deps(update: LeadActionDeps["api"]["leads"]["update"] = async () => ({ ok: true })) {
  const calls: unknown[] = []
  return {
    calls,
    deps: {
      api: {
        leads: {
          update: (async (input: unknown) => {
            calls.push(input)
            return update(input as never)
          }) as LeadActionDeps["api"]["leads"]["update"],
        },
      },
    } satisfies LeadActionDeps,
  }
}

describe("updateLeadCore", () => {
  test("saves a changed status and the notes together", async () => {
    const { deps: d, calls } = deps()
    const out = await updateLeadCore(
      d,
      fd({ id: "4", status: "contacted", currentStatus: "new", notes: "Ringde tisdag" })
    )
    expect(out).toEqual({ ok: true, message: "Saved." })
    expect(calls).toEqual([{ id: 4, status: "contacted", notes: "Ringde tisdag" }])
  })

  test("an unchanged select sends the notes alone, so a stale tab never resets the status", async () => {
    const { deps: d, calls } = deps()
    await updateLeadCore(d, fd({ id: "4", status: "new", currentStatus: "new", notes: "Later" }))
    expect(calls).toEqual([{ id: 4, notes: "Later" }])
  })

  test("a bad id or status never reaches the api", async () => {
    const { deps: d, calls } = deps()
    expect(await updateLeadCore(d, fd({ id: "x", status: "won" }))).toMatchObject({ ok: false })
    expect(await updateLeadCore(d, fd({ id: "4", status: "maybe" }))).toMatchObject({
      ok: false,
      message: "Not a valid status",
    })
    expect(calls).toHaveLength(0)
  })

  test("notes past the limit are a field error and keep what was typed", async () => {
    const { deps: d, calls } = deps()
    const notes = "x".repeat(5001)
    expect(await updateLeadCore(d, fd({ id: "4", status: "won", notes }))).toMatchObject({
      ok: false,
      fieldErrors: { notes: expect.any(String) },
      values: { notes },
    })
    expect(calls).toHaveLength(0)
  })

  test("the api's NOT_FOUND is shown; anything else is logged and unavailable", async () => {
    const gone = deps(async () => {
      throw new ORPCError("NOT_FOUND", { message: "Not found" })
    })
    expect(await updateLeadCore(gone.deps, fd({ id: "4", status: "won" }))).toMatchObject({
      ok: false,
      message: "Not found",
    })
    const down = deps(async () => {
      throw new Error("down")
    })
    expect(await updateLeadCore(down.deps, fd({ id: "4", status: "won" }))).toMatchObject({
      ok: false,
      message: UNAVAILABLE,
    })
    expect(logged).toHaveBeenCalled()
  })
})

describe("deleteLeadCore", () => {
  test("nothing is sent until the confirm box is ticked", async () => {
    const calls: unknown[] = []
    const api = {
      leads: {
        delete: async (input: unknown) => {
          calls.push(input)
          return { ok: true as const }
        },
      },
    }
    expect(await deleteLeadCore({ api } as never, fd({ id: "4" }))).toEqual({
      ok: false,
      fieldErrors: { confirm: DELETE_CONFIRM_REQUIRED },
    })
    expect(calls).toHaveLength(0)
    expect(await deleteLeadCore({ api } as never, fd({ id: "4", confirm: "yes" }))).toEqual({
      ok: true,
      message: "Lead deleted.",
    })
    expect(calls).toEqual([{ id: 4 }])
  })

  test("a gone lead shows the api's NOT_FOUND; a crash is unavailable", async () => {
    const gone = {
      leads: {
        delete: async () => {
          throw new ORPCError("NOT_FOUND", { message: "Not found" })
        },
      },
    }
    expect(await deleteLeadCore({ api: gone } as never, fd({ id: "4", confirm: "yes" }))).toEqual({
      ok: false,
      message: "Not found",
    })
    const down = {
      leads: {
        delete: async () => {
          throw new Error("down")
        },
      },
    }
    expect(await deleteLeadCore({ api: down } as never, fd({ id: "4", confirm: "yes" }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})
