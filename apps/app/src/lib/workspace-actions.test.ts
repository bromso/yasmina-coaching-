import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { entitlementsFor } from "@repo/api-contract"
import {
  acceptInvitationCore,
  createWorkspaceCore,
  type Deps,
  leaveWorkspaceCore,
  resendVerificationCore,
  UNAVAILABLE,
  type WorkspaceApi,
} from "./workspace-actions"

const summary = {
  id: 7,
  name: "Acme",
  slug: "acme",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "owner" as const,
  memberCount: 1,
  entitlements: entitlementsFor({ subscription: null, memberCount: 1, portalAvailable: false }),
  logoUrl: null,
  requireTwoFactor: false,
}
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const fail = (error: unknown) => async () => {
  throw error
}
const fakeApi: WorkspaceApi = {
  workspaces: { create: async () => summary },
  invitations: {
    accept: async () => ({ workspace: { ...summary, role: "member" } }),
    acceptById: async () => ({ workspace: { ...summary, role: "member" } }),
  },
}
const deps = (api: {
  workspaces?: Partial<WorkspaceApi["workspaces"]>
  invitations?: Partial<WorkspaceApi["invitations"]>
}): Deps => ({
  api: {
    workspaces: { ...fakeApi.workspaces, ...api.workspaces },
    invitations: { ...fakeApi.invitations, ...api.invitations },
  },
})

describe("createWorkspaceCore", () => {
  test("a valid name creates the workspace and returns its id", async () => {
    let seen: unknown
    const d = deps({
      workspaces: {
        create: async (input) => {
          seen = input
          return summary
        },
      },
    })
    expect(await createWorkspaceCore(d, form({ name: "  Acme " }))).toEqual({
      ok: true,
      workspaceId: 7,
    })
    expect(seen).toEqual({ name: "Acme" })
  })

  test("an empty name is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      workspaces: {
        create: async () => {
          called = true
          return summary
        },
      },
    })
    expect(await createWorkspaceCore(d, form({ name: "   " }))).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
      values: { name: "   " },
    })
    expect(called).toBe(false)
  })

  test("an unverified email gets the api's exact message", async () => {
    const d = deps({
      workspaces: { create: fail(defined("FORBIDDEN", "Verify your email to create a workspace")) },
    })
    expect(await createWorkspaceCore(d, form({ name: "Acme" }))).toEqual({
      ok: false,
      message: "Verify your email to create a workspace",
      values: { name: "Acme" },
    })
  })

  test("an undeclared failure is logged and reads as unavailable", async () => {
    const original = console.error
    const logged: unknown[] = []
    console.error = (...args: unknown[]) => logged.push(args)
    try {
      const d = deps({ workspaces: { create: fail(new TypeError("fetch failed")) } })
      expect(await createWorkspaceCore(d, form({ name: "Acme" }))).toMatchObject({
        ok: false,
        message: UNAVAILABLE,
      })
      expect(logged).toHaveLength(1)
    } finally {
      console.error = original
    }
  })
})

describe("acceptInvitationCore", () => {
  test("by token: accepts and returns the workspace id", async () => {
    let seen: unknown
    const d = deps({
      invitations: {
        accept: async (input) => {
          seen = input
          return { workspace: { ...summary, id: 9 } }
        },
      },
    })
    expect(await acceptInvitationCore(d, form({ token: "tok_abc" }))).toEqual({
      ok: true,
      workspaceId: 9,
    })
    expect(seen).toEqual({ token: "tok_abc" })
  })

  test("by token: NOT_FOUND passes its message through", async () => {
    const d = deps({
      invitations: { accept: fail(defined("NOT_FOUND", "This invitation is no longer valid.")) },
    })
    expect(await acceptInvitationCore(d, form({ token: "gone" }))).toEqual({
      ok: false,
      message: "This invitation is no longer valid.",
    })
  })

  test("by token: the address-mismatch FORBIDDEN passes through verbatim", async () => {
    const message =
      "This invitation was sent to a***@example.com. Sign in with that address to accept it."
    const d = deps({ invitations: { accept: fail(defined("FORBIDDEN", message)) } })
    expect(await acceptInvitationCore(d, form({ token: "tok" }))).toEqual({ ok: false, message })
  })

  test("by token: a network error is logged and reads as unavailable", async () => {
    const original = console.error
    const logged: unknown[] = []
    console.error = (...args: unknown[]) => logged.push(args)
    try {
      const d = deps({ invitations: { accept: fail(new TypeError("fetch failed")) } })
      expect(await acceptInvitationCore(d, form({ token: "tok" }))).toEqual({
        ok: false,
        message: UNAVAILABLE,
      })
      expect(logged).toHaveLength(1)
    } finally {
      console.error = original
    }
  })

  test("by id: accepts the pending invitation", async () => {
    let seen: unknown
    const d = deps({
      invitations: {
        acceptById: async (input) => {
          seen = input
          return { workspace: { ...summary, id: 11 } }
        },
      },
    })
    expect(await acceptInvitationCore(d, form({ id: "3" }))).toEqual({
      ok: true,
      workspaceId: 11,
    })
    expect(seen).toEqual({ id: 3 })
  })

  test("by id: someone else's row is NOT_FOUND", async () => {
    const d = deps({
      invitations: {
        acceptById: fail(defined("NOT_FOUND", "This invitation is no longer valid.")),
      },
    })
    expect(await acceptInvitationCore(d, form({ id: "4" }))).toEqual({
      ok: false,
      message: "This invitation is no longer valid.",
    })
  })

  test("neither a token nor a valid id never reaches the api", async () => {
    const d = deps({
      invitations: { accept: fail(new Error("called")), acceptById: fail(new Error("called")) },
    })
    expect(await acceptInvitationCore(d, form({ id: "abc" }))).toEqual({
      ok: false,
      message: "This invitation is no longer valid.",
    })
  })
})

describe("resendVerificationCore", () => {
  test("reports sent", async () => {
    const out = await resendVerificationCore({
      api: { resendVerification: async () => ({ sent: true }) },
    })
    expect(out).toEqual({ ok: true, message: "Sent — check your inbox." })
  })
  test("already verified", async () => {
    const out = await resendVerificationCore({
      api: { resendVerification: async () => ({ sent: false }) },
    })
    expect(out).toEqual({ ok: true, message: "Your email is already verified." })
  })
  test("the limiter's message is shown", async () => {
    const message = "Too many verification emails. Try again later."
    const out = await resendVerificationCore({
      api: { resendVerification: fail(defined("TOO_MANY_REQUESTS", message)) },
    })
    expect(out).toEqual({ ok: false, message })
  })
})

describe("leaveWorkspaceCore", () => {
  test("leaves the given workspace", async () => {
    const seen: number[] = []
    const api = {
      leave: async ({ workspaceId }: { workspaceId: unknown }) => {
        seen.push(Number(workspaceId))
      },
    }
    expect(await leaveWorkspaceCore({ api }, 7)).toEqual({ ok: true })
    expect(seen).toEqual([7])
  })

  test("the last owner's refusal and the other declared errors are shown as is", async () => {
    for (const code of ["CONFLICT", "NOT_FOUND", "FORBIDDEN"]) {
      const api = { leave: fail(defined(code, `the api's ${code}`)) }
      expect(await leaveWorkspaceCore({ api }, 7)).toEqual({
        ok: false,
        message: `the api's ${code}`,
      })
    }
  })

  test("anything undeclared reads as unavailable, in the request's language", async () => {
    const api = { leave: fail(new Error("boom")) }
    expect(await leaveWorkspaceCore({ api }, 7)).toEqual({ ok: false, message: UNAVAILABLE })
    const sv = await leaveWorkspaceCore({ api, locale: "sv" }, 7)
    expect(sv.ok).toBe(false)
    expect(sv.message).not.toBe(UNAVAILABLE)
  })
})

describe("in Swedish (deps.locale)", () => {
  const sv = (api: Parameters<typeof deps>[0]): Deps => ({ ...deps(api), locale: "sv" })
  const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
    const original = console.error
    console.error = () => {}
    try {
      return await run()
    } finally {
      console.error = original
    }
  }

  test("an empty workspace name is a Swedish field error", async () => {
    expect(await createWorkspaceCore(sv({}), form({ name: "   " }))).toMatchObject({
      ok: false,
      fieldErrors: { name: "Namnet måste fyllas i" },
    })
  })

  test("in English the empty name is named too", async () => {
    expect(await createWorkspaceCore(deps({}), form({ name: "" }))).toMatchObject({
      fieldErrors: { name: "Name is required" },
    })
  })

  test("an undeclared failure reads as unavailable, in Swedish", async () => {
    const d = sv({ workspaces: { create: fail(new TypeError("fetch failed")) } })
    expect(await quiet(() => createWorkspaceCore(d, form({ name: "Acme" })))).toMatchObject({
      ok: false,
      message: "Arbetsytetjänsten är inte tillgänglig just nu. Försök igen om en stund.",
    })
  })

  test("the api's (already Swedish) message passes through untouched", async () => {
    const d = sv({ invitations: { accept: fail(defined("NOT_FOUND", "Inbjudan finns inte")) } })
    expect(await acceptInvitationCore(d, form({ token: "gone" }))).toEqual({
      ok: false,
      message: "Inbjudan finns inte",
    })
  })

  test("neither a token nor a valid id is INVALID, in Swedish", async () => {
    expect(await acceptInvitationCore(sv({}), form({ id: "abc" }))).toEqual({
      ok: false,
      message: "Inbjudan är inte längre giltig.",
    })
  })

  test("resend reports sent and already verified in Swedish", async () => {
    const sent = await resendVerificationCore({
      api: { resendVerification: async () => ({ sent: true }) },
      locale: "sv",
    })
    expect(sent).toEqual({ ok: true, message: "Skickat – kolla din inkorg." })
    const verified = await resendVerificationCore({
      api: { resendVerification: async () => ({ sent: false }) },
      locale: "sv",
    })
    expect(verified).toEqual({ ok: true, message: "Din e-postadress är redan verifierad." })
  })
})
