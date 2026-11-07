import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  cancelEmailChangeCore,
  type EmailChangeApi,
  type EmailChangeDeps,
  revertEmailChangeCore,
} from "./email-change"

const good = "a".repeat(43)
const INVALID = "This link is invalid, expired or already used."
const UNAVAILABLE = "The sign-in service is unavailable right now. Try again in a moment."
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

/** A plain deps object; `clearSession` is a no-op unless a test needs to count its calls. */
function deps(api: Partial<EmailChangeApi>): EmailChangeDeps {
  return { api: api as EmailChangeApi, clearSession: async () => {} }
}

/** Like `deps()`, but with a `clearSession` whose calls the test can observe. */
function depsWithCounter(api: Partial<EmailChangeApi>) {
  const calls = { cleared: 0 }
  const d: EmailChangeDeps = {
    api: api as EmailChangeApi,
    clearSession: async () => {
      calls.cleared++
    },
  }
  return { d, calls }
}

describe("cancelEmailChangeCore", () => {
  test("an implausible token never reaches the api", async () => {
    let calls = 0
    const d = deps({
      cancel: async () => {
        calls++
      },
    })
    expect(await cancelEmailChangeCore(d, form({ token: "short" }))).toEqual({
      ok: false,
      message: INVALID,
    })
    expect(calls).toBe(0)
  })

  test("BAD_REQUEST shows the same invalid-link message", async () => {
    const d = deps({
      cancel: async () => {
        throw defined("BAD_REQUEST", "x")
      },
    })
    expect(await cancelEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: INVALID,
    })
  })

  test("an unreachable api is unavailable, not the invalid-link message", async () => {
    const d = deps({
      cancel: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect(await cancelEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })

  test("success clears this browser's session cookie and reports it", async () => {
    const { d, calls } = depsWithCounter({ cancel: async () => {} })
    expect(await cancelEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: true,
      message: "The change was cancelled and every session was signed out.",
    })
    expect(calls.cleared).toBe(1)
  })

  test("a failed cookie clear is logged, never a reason to show a failure", async () => {
    const d: EmailChangeDeps = {
      api: { cancel: async () => {}, revert: async () => ({ passwordReset: false }) },
      clearSession: async () => {
        throw new Error("no cookies() in this context")
      },
    }
    expect(await cancelEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: true,
      message: "The change was cancelled and every session was signed out.",
    })
  })
})

describe("revertEmailChangeCore", () => {
  test("an implausible token never reaches the api", async () => {
    let calls = 0
    const d = deps({
      revert: async () => {
        calls++
        return { passwordReset: false }
      },
    })
    expect(await revertEmailChangeCore(d, form({ token: "short" }))).toEqual({
      ok: false,
      message: INVALID,
    })
    expect(calls).toBe(0)
  })

  test("BAD_REQUEST shows the same invalid-link message", async () => {
    const d = deps({
      revert: async () => {
        throw defined("BAD_REQUEST", "x")
      },
    })
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: INVALID,
    })
  })

  test("CONFLICT (the old address is taken) passes the api's own message through", async () => {
    const d = deps({
      revert: async () => {
        throw defined("CONFLICT", "That address is now used by another account.")
      },
    })
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: "That address is now used by another account.",
    })
  })

  test("an unreachable api is unavailable, not the invalid-link message", async () => {
    const d = deps({
      revert: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })

  test("success clears this browser's session cookie and reports passwordReset", async () => {
    const { d, calls } = depsWithCounter({ revert: async () => ({ passwordReset: true }) })
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: true,
      passwordReset: true,
    })
    expect(calls.cleared).toBe(1)
  })

  test("a passwordless account answers passwordReset: false", async () => {
    const d = deps({ revert: async () => ({ passwordReset: false }) })
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: true,
      passwordReset: false,
    })
  })

  test("a failed cookie clear is logged, never a reason to show a failure", async () => {
    const d: EmailChangeDeps = {
      api: { cancel: async () => {}, revert: async () => ({ passwordReset: false }) },
      clearSession: async () => {
        throw new Error("no cookies() in this context")
      },
    }
    expect(await revertEmailChangeCore(d, form({ token: good }))).toEqual({
      ok: true,
      passwordReset: false,
    })
  })
})
