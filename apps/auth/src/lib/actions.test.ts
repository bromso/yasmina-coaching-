import { describe, expect, mock, spyOn, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  type ActionDeps,
  consumeMagicLinkCore,
  forgotPasswordCore,
  MAGIC_INVALID,
  MAGIC_SENT,
  PASSKEY_FAILED,
  passkeyOptionsCore,
  passkeySignInCore,
  requestMagicLinkCore,
  resetPasswordCore,
  signInCore,
  signUpCore,
  UNAVAILABLE,
} from "./actions"

const user = {
  id: 1,
  email: "ada@example.com",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
  emailVerified: false,
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

function deps(api: Partial<ActionDeps["api"]>) {
  const set: Array<{ token: string }> = []
  const d: ActionDeps & { set: typeof set } = {
    api: api as ActionDeps["api"],
    setSession: async (s) => {
      set.push(s)
    },
    safeNextUrl: (c) =>
      c?.startsWith("http://app.brand.localhost:3001") ? c : "http://app.brand.localhost:3001",
    client: { userAgent: "UA", ip: "203.0.113.9" },
    set,
  }
  return d
}

describe("signInCore", () => {
  test("valid credentials set the session and redirect to the safe next url", async () => {
    let seen: unknown
    const d = deps({
      signIn: async (input) => {
        seen = input
        return { user, session }
      },
    })
    const out = await signInCore(
      d,
      form({
        email: " Ada@Example.com ",
        password: "correct horse",
        next: "http://app.brand.localhost:3001/notes",
      })
    )
    expect(out).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(d.set).toEqual([session])
    expect(seen).toMatchObject({
      email: "ada@example.com",
      password: "correct horse",
      client: { userAgent: "UA", ip: "203.0.113.9" },
    })
  })

  test("an off-site next falls back to the app", async () => {
    const d = deps({ signIn: async () => ({ user, session }) })
    for (const next of ["https://evil.com", "//evil.com", "http://app.brand.localhost.evil.com/"]) {
      expect(await signInCore(d, form({ email: "a@b.co", password: "12345678", next }))).toEqual({
        redirectTo: "http://app.brand.localhost:3001",
      })
    }
  })

  test("wrong credentials and throttling surface the api's exact messages; values are kept, password is not", async () => {
    const wrong = deps({
      signIn: async () => {
        throw defined("UNAUTHORIZED", "Invalid email or password")
      },
    })
    expect(await signInCore(wrong, form({ email: "a@b.co", password: "nope-nope" }))).toEqual({
      ok: false,
      message: "Invalid email or password",
      values: { email: "a@b.co" },
    })
    const limited = deps({
      signIn: async () => {
        throw defined("TOO_MANY_REQUESTS", "Too many attempts, try again later")
      },
    })
    expect(
      await signInCore(limited, form({ email: "a@b.co", password: "nope-nope" }))
    ).toMatchObject({
      ok: false,
      message: "Too many attempts, try again later",
    })
  })

  test("a suspended account, once the password is right, shows the api's message", async () => {
    const d = deps({
      signIn: async () => {
        throw defined("FORBIDDEN", "This account is suspended. Contact support.")
      },
    })
    expect(await signInCore(d, form({ email: "a@b.co", password: "correct horse" }))).toMatchObject(
      {
        ok: false,
        message: "This account is suspended. Contact support.",
      }
    )
    expect(d.set).toEqual([])
  })

  test("invalid input never reaches the api", async () => {
    let called = false
    const d = deps({
      signIn: async () => {
        called = true
        return { user, session }
      },
    })
    const out = await signInCore(d, form({ email: "not-an-email", password: "" }))
    expect(out).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String), password: expect.any(String) },
    })
    expect(called).toBe(false)
  })

  test("an unreachable api is a calm message", async () => {
    const d = deps({
      signIn: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect(await signInCore(d, form({ email: "a@b.co", password: "12345678" }))).toMatchObject({
      ok: false,
      message: "The sign-in service is unavailable right now. Try again in a moment.",
    })
  })

  test("an undeclared 401 (the service guard) is unavailable, not a credentials message", async () => {
    const d = deps({
      signIn: async () => {
        throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" })
      },
    })
    expect(await signInCore(d, form({ email: "a@b.co", password: "12345678" }))).toMatchObject({
      ok: false,
      message: "The sign-in service is unavailable right now. Try again in a moment.",
    })
  })

  test("a two-factor account gets a challenge instead of a session", async () => {
    const d = deps({
      signIn: async () => ({
        twoFactor: { challenge: "chal123", expiresAt: "2026-01-01T00:05:00.000Z" },
      }),
    })
    const out = await signInCore(
      d,
      form({
        email: "a@b.co",
        password: "12345678",
        next: "http://app.brand.localhost:3001/notes",
      })
    )
    expect(out).toEqual({ challenge: "chal123", next: "http://app.brand.localhost:3001/notes" })
    expect(d.set).toEqual([])
  })
})

describe("signUpCore", () => {
  test("a rate-limited sign-up shows the api's message and keeps the values", async () => {
    const d = deps({
      signUp: async () => {
        throw defined(
          "TOO_MANY_REQUESTS",
          "Too many sign-ups right now, try again in a few minutes"
        )
      },
    })
    const out = await signUpCore(
      d,
      form({ name: "Ada", email: "ada@example.com", password: "correct horse battery" })
    )
    expect(out).toEqual({
      ok: false,
      message: "Too many sign-ups right now, try again in a few minutes",
      values: { name: "Ada", email: "ada@example.com" },
    })
    expect(d.set).toEqual([])
  })

  test("creates the account, sets the session, redirects", async () => {
    const d = deps({ signUp: async () => ({ user, session }) })
    expect(
      await signUpCore(d, form({ name: " Ada ", email: "a@b.co", password: "12345678" }))
    ).toEqual({
      redirectTo: "http://app.brand.localhost:3001",
    })
    expect(d.set).toHaveLength(1)
  })
  test("a taken email is a field error with the api's message", async () => {
    const d = deps({
      signUp: async () => {
        throw defined("CONFLICT", "An account with this email already exists")
      },
    })
    expect(await signUpCore(d, form({ email: "a@b.co", password: "12345678" }))).toEqual({
      ok: false,
      fieldErrors: { email: "An account with this email already exists" },
      values: { name: "", email: "a@b.co" },
    })
  })
  test("a short password is rejected before the api", async () => {
    const d = deps({
      signUp: async () => {
        throw new Error("must not be called")
      },
    })
    expect(await signUpCore(d, form({ email: "a@b.co", password: "short" }))).toMatchObject({
      ok: false,
      fieldErrors: { password: expect.any(String) },
    })
  })
})

describe("forgotPasswordCore", () => {
  const sent = "If an account exists for that email, a reset link is on its way."
  test("known and unknown emails produce the identical state", async () => {
    const known = await forgotPasswordCore(
      deps({ requestPasswordReset: async () => undefined }),
      form({ email: "a@b.co" })
    )
    const failing = await forgotPasswordCore(
      deps({
        requestPasswordReset: async () => {
          throw new TypeError("fetch failed")
        },
      }),
      form({ email: "a@b.co" })
    )
    expect(known).toEqual({ ok: true, message: sent })
    expect(failing).toEqual(known)
  })
  test("an invalid email is a field error", async () => {
    expect(await forgotPasswordCore(deps({}), form({ email: "nope" }))).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String) },
    })
  })
})

describe("resetPasswordCore", () => {
  test("a good token sets the password and redirects to login with a notice", async () => {
    const d = deps({ resetPassword: async () => undefined })
    expect(
      await resetPasswordCore(
        d,
        form({ token: "abc", password: "new password 1", confirm: "new password 1" })
      )
    ).toEqual({
      redirectTo: "/login?reset=1",
    })
  })
  test("mismatched confirmation and a bad token are reported", async () => {
    expect(
      await resetPasswordCore(
        deps({}),
        form({ token: "abc", password: "new password 1", confirm: "other" })
      )
    ).toMatchObject({
      ok: false,
      fieldErrors: { confirm: "Passwords do not match" },
    })
    const bad = deps({
      resetPassword: async () => {
        throw defined("BAD_REQUEST", "This reset link is invalid or has expired")
      },
    })
    expect(
      await resetPasswordCore(
        bad,
        form({ token: "abc", password: "new password 1", confirm: "new password 1" })
      )
    ).toMatchObject({
      ok: false,
      message: "This reset link is invalid or has expired",
    })
  })
})

describe("requestMagicLinkCore", () => {
  test("invalid email is a field error", async () => {
    const out = await requestMagicLinkCore(deps({}), form({ email: "nope" }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
  })
  test("valid email always reports sent, even when the api is down", async () => {
    const d = deps({
      magicLink: {
        request: async () => {
          throw new Error("down")
        },
        consume: async () => ({ user, session }),
      },
    })
    expect(await requestMagicLinkCore(d, form({ email: "a@example.com" }))).toEqual({
      ok: true,
      message: MAGIC_SENT,
    })
  })
})

describe("consumeMagicLinkCore", () => {
  const good = "a".repeat(43)

  test("an implausible token never reaches the api", async () => {
    let calls = 0
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => {
          calls++
          throw new Error("x")
        },
      },
    })
    expect(await consumeMagicLinkCore(d, form({ token: "short" }))).toEqual({
      ok: false,
      message: MAGIC_INVALID,
    })
    expect(calls).toBe(0)
  })

  test("BAD_REQUEST shows the same message", async () => {
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => {
          throw defined("BAD_REQUEST", "x")
        },
      },
    })
    expect(await consumeMagicLinkCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: MAGIC_INVALID,
    })
  })

  test("an unreachable api is unavailable, not the invalid-link message", async () => {
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => {
          throw new TypeError("fetch failed")
        },
      },
    })
    expect(await consumeMagicLinkCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })

  test("a suspended account shows the api's message, not the invalid-link message", async () => {
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => {
          throw defined("FORBIDDEN", "This account is suspended. Contact support.")
        },
      },
    })
    expect(await consumeMagicLinkCore(d, form({ token: good }))).toEqual({
      ok: false,
      message: "This account is suspended. Contact support.",
    })
  })

  test("success ends the old session, stores the new one and redirects to the safe next", async () => {
    const calls: string[] = []
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => ({ user, session }),
      },
    })
    d.endCurrentSession = async () => {
      calls.push("end")
    }
    d.setSession = async () => {
      calls.push("set")
    }
    expect(
      await consumeMagicLinkCore(
        d,
        form({ token: good, next: "http://app.brand.localhost:3001/notes" })
      )
    ).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(calls).toEqual(["end", "set"])
  })

  test("a two-factor account gets a challenge instead of a session", async () => {
    const d = deps({
      magicLink: {
        request: async () => {},
        consume: async () => ({
          twoFactor: { challenge: "chal123", expiresAt: "2026-01-01T00:05:00.000Z" },
        }),
      },
    })
    const out = await consumeMagicLinkCore(
      d,
      form({ token: good, next: "http://app.brand.localhost:3001/notes" })
    )
    expect(out).toEqual({ challenge: "chal123", next: "http://app.brand.localhost:3001/notes" })
    expect(d.set).toEqual([])
  })
})

describe("passkeyOptionsCore", () => {
  test("returns the api's options and challenge id", async () => {
    const d = deps({
      passkey: {
        options: async () => ({ options: { challenge: "c" }, challengeId: "chal123" }),
        verify: async () => {
          throw new Error("unreachable")
        },
      },
    })
    const out = await passkeyOptionsCore(d)
    expect(out).toEqual({ ok: true, options: { challenge: "c" }, challengeId: "chal123" })
  })

  test("an unreachable api is a calm message, logged", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({
        passkey: {
          options: async () => {
            throw new TypeError("fetch failed")
          },
          verify: async () => {
            throw new Error("unreachable")
          },
        },
      })
      const out = await passkeyOptionsCore(d)
      expect(out).toEqual({ ok: false, message: UNAVAILABLE })
      expect(logged).toHaveBeenCalledTimes(1)
    } finally {
      logged.mockRestore()
    }
  })
})

describe("passkeySignInCore", () => {
  const response = {
    id: "cred-id",
    rawId: "cred-id",
    type: "public-key",
    clientExtensionResults: {},
    response: { clientDataJSON: "x", authenticatorData: "y", signature: "z" },
  }
  const passkeyForm = (over: Record<string, string> = {}) =>
    form({ challengeId: "chal123", response: JSON.stringify(response), ...over })

  test("a verified assertion sets the session and redirects to the safe next", async () => {
    let seen: unknown
    const d = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async (input) => {
          seen = input
          return { user, session }
        },
      },
    })
    const out = await passkeySignInCore(
      d,
      passkeyForm({ next: "http://app.brand.localhost:3001/notes" })
    )
    expect(out).toEqual({ redirectTo: "http://app.brand.localhost:3001/notes" })
    expect(d.set).toEqual([session])
    expect(seen).toEqual({
      challengeId: "chal123",
      response,
      client: { userAgent: "UA", ip: "203.0.113.9" },
    })
  })

  test("an off-site next falls back to the app", async () => {
    const d = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => ({ user, session }),
      },
    })
    for (const next of ["https://evil.com", "//evil.com", "http://app.brand.localhost.evil.com/"]) {
      expect(await passkeySignInCore(d, passkeyForm({ next }))).toEqual({
        redirectTo: "http://app.brand.localhost:3001",
      })
    }
  })

  test("a malformed response never reaches the api", async () => {
    let called = false
    const d = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          called = true
          throw new Error("unreachable")
        },
      },
    })
    const out = await passkeySignInCore(d, form({ challengeId: "chal123", response: "{not json" }))
    expect(out).toMatchObject({ ok: false, message: PASSKEY_FAILED })
    expect(called).toBe(false)
  })

  test("the api's failure and rate limit are shown verbatim", async () => {
    const failed = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          throw defined(
            "UNAUTHORIZED",
            "That passkey didn't work. Try again or use another way to sign in."
          )
        },
      },
    })
    expect(await passkeySignInCore(failed, passkeyForm())).toMatchObject({
      ok: false,
      message: "That passkey didn't work. Try again or use another way to sign in.",
    })

    const limited = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          throw defined("TOO_MANY_REQUESTS", "Too many passkey attempts, try again later.")
        },
      },
    })
    expect(await passkeySignInCore(limited, passkeyForm())).toMatchObject({
      ok: false,
      message: "Too many passkey attempts, try again later.",
    })
  })

  test("a suspended account, once the passkey verifies, shows the api's message", async () => {
    const d = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          throw defined("FORBIDDEN", "This account is suspended. Contact support.")
        },
      },
    })
    expect(await passkeySignInCore(d, passkeyForm())).toMatchObject({
      ok: false,
      message: "This account is suspended. Contact support.",
    })
    expect(d.set).toEqual([])
  })

  test("an unreachable api is a calm message", async () => {
    const d = deps({
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          throw new TypeError("fetch failed")
        },
      },
    })
    expect(await passkeySignInCore(d, passkeyForm())).toMatchObject({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})

describe("a prior session", () => {
  function ordered() {
    const calls: string[] = []
    const d = deps({
      signIn: async () => {
        calls.push("signIn")
        return { user, session }
      },
      signUp: async () => {
        calls.push("signUp")
        return { user, session }
      },
      passkey: {
        options: async () => {
          throw new Error("unreachable")
        },
        verify: async () => {
          calls.push("passkeyVerify")
          return { user, session }
        },
      },
    })
    d.endCurrentSession = async () => {
      calls.push("endCurrentSession")
    }
    d.setSession = async () => {
      calls.push("setSession")
    }
    return { d, calls }
  }

  test("an existing session is ended after a new sign-in succeeds, before its cookie is written", async () => {
    const { d, calls } = ordered()
    expect(await signInCore(d, form({ email: "a@b.co", password: "12345678" }))).toEqual({
      redirectTo: "http://app.brand.localhost:3001",
    })
    expect(calls).toEqual(["signIn", "endCurrentSession", "setSession"])
  })

  test("an existing session is ended after a new sign-up succeeds, before its cookie is written", async () => {
    const { d, calls } = ordered()
    expect(await signUpCore(d, form({ email: "a@b.co", password: "12345678" }))).toEqual({
      redirectTo: "http://app.brand.localhost:3001",
    })
    expect(calls).toEqual(["signUp", "endCurrentSession", "setSession"])
  })

  test("an existing session is ended after a passkey sign-in succeeds, before its cookie is written", async () => {
    const { d, calls } = ordered()
    const response = {
      id: "cred-id",
      rawId: "cred-id",
      type: "public-key",
      clientExtensionResults: {},
      response: { clientDataJSON: "x", authenticatorData: "y", signature: "z" },
    }
    expect(
      await passkeySignInCore(
        d,
        form({ challengeId: "chal123", response: JSON.stringify(response) })
      )
    ).toEqual({ redirectTo: "http://app.brand.localhost:3001" })
    expect(calls).toEqual(["passkeyVerify", "endCurrentSession", "setSession"])
  })

  test("a wrong password does not end the existing session", async () => {
    const d = deps({
      signIn: async () => {
        throw defined("UNAUTHORIZED", "Invalid email or password")
      },
    })
    const ended = mock(async () => {})
    d.endCurrentSession = ended
    expect(await signInCore(d, form({ email: "a@b.co", password: "nope-nope" }))).toMatchObject({
      ok: false,
      message: "Invalid email or password",
    })
    expect(ended).not.toHaveBeenCalled()
    expect(d.set).toEqual([])
  })

  test("a session that cannot be ended is logged and the new sign-in still completes", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({ signIn: async () => ({ user, session }) })
      d.endCurrentSession = async () => {
        throw new TypeError("fetch failed")
      }
      expect(await signInCore(d, form({ email: "a@b.co", password: "12345678" }))).toEqual({
        redirectTo: "http://app.brand.localhost:3001",
      })
      expect(d.set).toEqual([session])
      expect(logged).toHaveBeenCalledWith(
        expect.stringContaining("[auth] ending the current session failed")
      )
    } finally {
      logged.mockRestore()
    }
  })

  test("a cookie write failure after the api issued a session is reported, not swallowed as unavailable", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const d = deps({ signIn: async () => ({ user, session }) })
      d.setSession = async () => {
        throw new Error("cookies() called outside a request")
      }
      expect(await signInCore(d, form({ email: "a@b.co", password: "12345678" }))).toEqual({
        ok: false,
        message: UNAVAILABLE,
        values: { email: "a@b.co" },
      })
      expect(logged).toHaveBeenCalledWith(expect.stringContaining("[auth] setSession failed"))
    } finally {
      logged.mockRestore()
    }
  })
})
