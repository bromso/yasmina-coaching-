import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { GENERIC_FAILURE, JOINED, joinWaitlistCore, TOO_MANY_REQUESTS } from "./actions"
import { localeFromCookie } from "./site-locale"

const fd = (email: string) => {
  const f = new FormData()
  f.set("email", email)
  return f
}

describe("joinWaitlistCore", () => {
  test("invalid email is a field error without calling the api", async () => {
    let calls = 0
    const out = await joinWaitlistCore(
      {
        api: {
          join: async () => {
            calls++
            return { joined: true as const }
          },
        },
      },
      fd("nope")
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
    expect(calls).toBe(0)
  })

  test("success message", async () => {
    expect(
      await joinWaitlistCore(
        { api: { join: async () => ({ joined: true as const }) } },
        fd("ada@example.com")
      )
    ).toEqual({ ok: true, message: JOINED.sv })
  })

  test("the limiter's refusal is the page's own constant (Swedish by default); anything else is generic", async () => {
    // Never the api's own text: the page keeps its own wording, whatever the api says.
    const limited = new ORPCError("TOO_MANY_REQUESTS", {
      defined: true,
      message: "Too many requests, try again in a few minutes.",
    })
    expect(
      await joinWaitlistCore(
        {
          api: {
            join: async () => {
              throw limited
            },
          },
        },
        fd("a@example.com")
      )
    ).toEqual({ ok: false, message: TOO_MANY_REQUESTS.sv, values: { email: "a@example.com" } })
    expect(
      await joinWaitlistCore(
        {
          api: {
            join: async () => {
              throw new Error("down")
            },
          },
        },
        fd("a@example.com")
      )
    ).toEqual({ ok: false, message: GENERIC_FAILURE.sv, values: { email: "a@example.com" } })
  })

  test("a defined ORPCError with a different code maps to the generic failure", async () => {
    const badRequest = new ORPCError("BAD_REQUEST", {
      defined: true,
      message: "The api says this request is malformed",
    })
    expect(
      await joinWaitlistCore(
        {
          api: {
            join: async () => {
              throw badRequest
            },
          },
        },
        fd("a@example.com")
      )
    ).toEqual({ ok: false, message: GENERIC_FAILURE.sv, values: { email: "a@example.com" } })
  })
})

describe("joinWaitlistCore in English", () => {
  test("success, the limiter and a crash all answer in the page's language", async () => {
    expect(
      await joinWaitlistCore(
        { locale: "en", api: { join: async () => ({ joined: true as const }) } },
        fd("ada@example.com")
      )
    ).toEqual({ ok: true, message: JOINED.en })
    const limited = new ORPCError("TOO_MANY_REQUESTS", { defined: true, message: "x" })
    expect(
      await joinWaitlistCore(
        {
          locale: "en",
          api: {
            join: async () => {
              throw limited
            },
          },
        },
        fd("a@example.com")
      )
    ).toMatchObject({ ok: false, message: TOO_MANY_REQUESTS.en })
    expect(
      await joinWaitlistCore(
        {
          locale: "en",
          api: {
            join: async () => {
              throw new Error("down")
            },
          },
        },
        fd("a@example.com")
      )
    ).toMatchObject({ ok: false, message: GENERIC_FAILURE.en })
  })

  test("every message exists in both languages, without an exclamation mark", () => {
    for (const messages of [JOINED, GENERIC_FAILURE, TOO_MANY_REQUESTS]) {
      for (const text of [messages.sv, messages.en]) {
        expect(text.length).toBeGreaterThan(0)
        expect(text).not.toContain("!")
      }
      expect(messages.en).not.toBe(messages.sv)
    }
  })
})

describe("localeFromCookie", () => {
  test("English only when the cookie says so; anything else is Swedish", () => {
    expect(localeFromCookie("en")).toBe("en")
    expect(localeFromCookie("sv")).toBe("sv")
    expect(localeFromCookie(undefined)).toBe("sv")
    expect(localeFromCookie("de")).toBe("sv")
    expect(localeFromCookie("en-US")).toBe("sv")
  })
})
