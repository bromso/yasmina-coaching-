import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import {
  GENERIC_FAILURE,
  JOINED,
  joinWaitlistCore,
  resolveWaitlistLocale,
  TOO_MANY_REQUESTS,
} from "./actions"

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
    ).toEqual({ ok: true, message: JOINED })
  })

  test("the limiter's refusal is the page's own English constant; anything else is generic", async () => {
    // The api answers in the x-locale it was sent: its Swedish text must not reach an English page.
    const limited = new ORPCError("TOO_MANY_REQUESTS", {
      defined: true,
      message: "För många förfrågningar, försök igen om några minuter",
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
    ).toEqual({ ok: false, message: TOO_MANY_REQUESTS, values: { email: "a@example.com" } })
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
    ).toEqual({ ok: false, message: GENERIC_FAILURE, values: { email: "a@example.com" } })
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
    ).toEqual({ ok: false, message: GENERIC_FAILURE, values: { email: "a@example.com" } })
  })
})

describe("resolveWaitlistLocale", () => {
  test("Cookie: locale=sv sends x-locale: sv", () => {
    expect(resolveWaitlistLocale({ cookie: "sv" })).toBe("sv")
  })

  test("Accept-Language: de sends no x-locale (unsupported, falls to the English default)", () => {
    expect(resolveWaitlistLocale({ acceptLanguage: "de" })).toBeUndefined()
  })

  test("Accept-Language: sv-SE sends x-locale: sv", () => {
    expect(resolveWaitlistLocale({ acceptLanguage: "sv-SE" })).toBe("sv")
  })

  test("the cookie wins over Accept-Language", () => {
    expect(resolveWaitlistLocale({ cookie: "en", acceptLanguage: "sv" })).toBe("en")
  })

  test("nothing at all: no x-locale", () => {
    expect(resolveWaitlistLocale({})).toBeUndefined()
  })
})
