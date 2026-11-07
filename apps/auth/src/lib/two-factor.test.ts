import { describe, expect, spyOn, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  TWO_FACTOR_INVALID_CODE_MESSAGE,
  type TwoFactorApi,
  type VerifyDeps,
  verifyTwoFactorCore,
} from "./two-factor"

const user = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: true,
  hasPassword: true,
  superadmin: false,
  avatarUrl: null,
  locale: "en" as const,
  deletionScheduledAt: null,
  passkeys: 0,
  twoFactorSatisfied: false,
}
const session = { token: "t".repeat(43), expiresAt: "2027-01-01T00:00:00.000Z" }
const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })

function deps(api: Partial<TwoFactorApi>, extra: Partial<VerifyDeps> = {}) {
  const set: Array<{ token: string }> = []
  const d: VerifyDeps & { set: typeof set } = {
    api: api as TwoFactorApi,
    setSession: async (s) => {
      set.push(s)
    },
    safeNextUrl: (c) =>
      c?.startsWith("http://app.brand.localhost:3001") ? c : "http://app.brand.localhost:3001",
    client: { userAgent: "UA", ip: "203.0.113.9" },
    challenge: "c".repeat(43),
    set,
    ...extra,
  }
  return d
}

describe("verifyTwoFactorCore", () => {
  test("a correct code sets the session and redirects to the safe next url", async () => {
    let seen: unknown
    const d = deps({
      verify: async (input) => {
        seen = input
        return { user, session }
      },
    })
    const out = await verifyTwoFactorCore(
      d,
      form({ code: "123456", next: "http://app.brand.localhost:3001/notes" })
    )
    expect(out).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(d.set).toEqual([session])
    expect(seen).toMatchObject({
      challenge: d.challenge,
      code: "123456",
      client: { userAgent: "UA", ip: "203.0.113.9" },
    })
  })

  test("a recovery code's shape passes local validation through to the api unchanged", async () => {
    let seenCode: string | undefined
    const d = deps({
      verify: async (input) => {
        seenCode = input.code
        return { user, session }
      },
    })
    const recovery = "abcde-fghij"
    expect(await verifyTwoFactorCore(d, form({ code: recovery }))).toMatchObject({
      redirectTo: expect.any(String),
    })
    expect(seenCode).toBe(recovery)
  })

  test("a wrong code is a field error on code and the session is never set", async () => {
    const d = deps({
      verify: async () => {
        throw defined(
          "UNAUTHORIZED",
          "That code didn't work. Check your authenticator app and try again."
        )
      },
    })
    expect(await verifyTwoFactorCore(d, form({ code: "000000" }))).toEqual({
      ok: false,
      fieldErrors: { code: "That code didn't work. Check your authenticator app and try again." },
    })
    expect(d.set).toEqual([])
  })

  test("an expired, unknown or already-burnt challenge redirects to login with the timed-out error", async () => {
    const d = deps({
      verify: async () => {
        throw defined("BAD_REQUEST", "Your sign-in timed out. Sign in again.")
      },
    })
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      redirectTo: "/login?error=two_factor_expired",
    })
  })

  test("the timed-out redirect keeps a non-default next, but omits the default one", async () => {
    const d = deps({
      verify: async () => {
        throw defined("BAD_REQUEST", "Your sign-in timed out. Sign in again.")
      },
    })
    expect(
      await verifyTwoFactorCore(
        d,
        form({ code: "123456", next: "http://app.brand.localhost:3001/notes" })
      )
    ).toEqual({
      redirectTo: `/login?error=two_factor_expired&next=${encodeURIComponent(
        "http://app.brand.localhost:3001/notes"
      )}`,
    })
    // The default next (what an absent/invalid one resolves to) is not worth echoing back.
    expect(await verifyTwoFactorCore(d, form({ code: "123456", next: "" }))).toEqual({
      redirectTo: "/login?error=two_factor_expired",
    })
  })

  test("an undeclared BAD_REQUEST from verify is a field error on code, not unavailable or timed out", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({
        verify: async () => {
          throw new ORPCError("BAD_REQUEST", { message: "Bad Request" })
        },
      })
      expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
        ok: false,
        fieldErrors: { code: TWO_FACTOR_INVALID_CODE_MESSAGE },
      })
    } finally {
      logged.mockRestore()
    }
  })

  test("a tampered (too-long) challenge is treated like a missing one: redirect to login", async () => {
    let called = false
    const d = deps(
      {
        verify: async () => {
          called = true
          throw new Error("must not be called")
        },
      },
      { challenge: "x".repeat(200) }
    )
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      redirectTo: "/login",
    })
    expect(called).toBe(false)
  })

  test("a malformed client (not the user's to fix) is a top-level message, not a field error", async () => {
    let called = false
    const d = deps(
      {
        verify: async () => {
          called = true
          throw new Error("must not be called")
        },
      },
      { client: { ip: "x".repeat(1000) } }
    )
    const out = await verifyTwoFactorCore(d, form({ code: "123456" }))
    expect(out).toEqual({
      ok: false,
      message: "The sign-in service is unavailable right now. Try again in a moment.",
    })
    expect(called).toBe(false)
  })

  test("throttling surfaces the api's exact message, not a field error", async () => {
    const d = deps({
      verify: async () => {
        throw defined("TOO_MANY_REQUESTS", "Too many attempts, try again later")
      },
    })
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "Too many attempts, try again later",
    })
  })

  test("a suspended account, once the code is right, shows the api's message as a top-level message", async () => {
    const d = deps({
      verify: async () => {
        throw defined("FORBIDDEN", "This account is suspended. Contact support.")
      },
    })
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      ok: false,
      message: "This account is suspended. Contact support.",
    })
    expect(d.set).toEqual([])
  })

  test("a code shorter than the api accepts never reaches it", async () => {
    let called = false
    const d = deps({
      verify: async () => {
        called = true
        throw new Error("must not be called")
      },
    })
    const out = await verifyTwoFactorCore(d, form({ code: "123" }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { code: expect.any(String) } })
    expect(called).toBe(false)
  })

  test("no pending challenge (missing cookie) redirects to login, without calling the api", async () => {
    let called = false
    const d = deps(
      {
        verify: async () => {
          called = true
          throw new Error("must not be called")
        },
      },
      { challenge: null }
    )
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      redirectTo: "/login",
    })
    expect(called).toBe(false)
  })

  test("an unreachable api is a calm message, and the failure is logged", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({
        verify: async () => {
          throw new TypeError("fetch failed")
        },
      })
      expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
        ok: false,
        message: "The sign-in service is unavailable right now. Try again in a moment.",
      })
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("[auth] twoFactor verify failed"))
    } finally {
      logged.mockRestore()
    }
  })

  test("an existing session is ended after verification succeeds, before the new cookie is written", async () => {
    const calls: string[] = []
    const d = deps({ verify: async () => ({ user, session }) })
    d.endCurrentSession = async () => {
      calls.push("end")
    }
    d.setSession = async () => {
      calls.push("set")
    }
    expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
      redirectTo: "http://app.brand.localhost:3001",
    })
    expect(calls).toEqual(["end", "set"])
  })

  test("a cookie write failure after verification is reported, not swallowed as unavailable-silently", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({ verify: async () => ({ user, session }) })
      d.setSession = async () => {
        throw new Error("cookies() called outside a request")
      }
      expect(await verifyTwoFactorCore(d, form({ code: "123456" }))).toEqual({
        ok: false,
        message: "The sign-in service is unavailable right now. Try again in a moment.",
      })
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("[auth] setSession failed"))
    } finally {
      logged.mockRestore()
    }
  })
})
