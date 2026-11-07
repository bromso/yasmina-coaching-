import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { contactHeaders } from "./api"
import {
  type ContactApi,
  contactSentMessage,
  HONEYPOT_MESSAGE,
  resolveContactLocale,
  submitContactCore,
  TOO_MANY_REQUESTS,
  UNAVAILABLE,
} from "./contact"

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [key, value] of Object.entries(fields)) f.set(key, value)
  return f
}

const valid = {
  email: "ada@example.com",
  name: "Ada",
  topic: "billing",
  message: "My invoice looks wrong this month.",
}

describe("submitContactCore", () => {
  test("success: the reference and the email come back in the message", async () => {
    const api: ContactApi = { create: async () => ({ reference: "HELP-1" }) }
    const out = await submitContactCore({ api: async () => api }, fd(valid))
    expect(out).toEqual({
      ok: true,
      message: contactSentMessage("HELP-1", "ada@example.com"),
      reference: "HELP-1",
    })
  })

  test("a filled honeypot answers success with no api call, and no fake reference", async () => {
    let calls = 0
    const api: ContactApi = {
      create: async () => {
        calls++
        return { reference: "HELP-2" }
      },
    }
    const out = await submitContactCore(
      { api: async () => api },
      fd({ ...valid, hp_field: "http://spam.example" })
    )
    expect(out).toEqual({ ok: true, message: HONEYPOT_MESSAGE })
    expect(calls).toBe(0)
  })

  test("invalid email is a field error without calling the api", async () => {
    let calls = 0
    const api: ContactApi = {
      create: async () => {
        calls++
        return { reference: "HELP-3" }
      },
    }
    const out = await submitContactCore({ api: async () => api }, fd({ ...valid, email: "nope" }))
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
    expect(calls).toBe(0)
  })

  test("a too-short message is a field error without calling the api", async () => {
    let calls = 0
    const api: ContactApi = {
      create: async () => {
        calls++
        return { reference: "HELP-4" }
      },
    }
    const out = await submitContactCore(
      { api: async () => api },
      fd({ ...valid, message: "short" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { message: expect.any(String) } })
    expect(calls).toBe(0)
  })

  test("an unparseable topic is a field error", async () => {
    const api: ContactApi = { create: async () => ({ reference: "HELP-5" }) }
    const out = await submitContactCore(
      { api: async () => api },
      fd({ ...valid, topic: "not-a-topic" })
    )
    expect(out).toMatchObject({ ok: false, fieldErrors: { topic: expect.any(String) } })
  })

  test("a bad page is dropped (SupportCreateSchema's own .catch), not a reason to refuse", async () => {
    let sentPage: string | null | undefined
    const api: ContactApi = {
      create: async (input) => {
        sentPage = input.page
        return { reference: "HELP-6" }
      },
    }
    const out = await submitContactCore(
      { api: async () => api },
      fd({ ...valid, page: "https://evil.example/not-root-relative" })
    )
    expect(out.ok).toBe(true)
    expect(sentPage).toBeUndefined()
  })

  test("a valid root-relative page reaches the api untouched", async () => {
    let sentPage: string | null | undefined
    const api: ContactApi = {
      create: async (input) => {
        sentPage = input.page
        return { reference: "HELP-7" }
      },
    }
    await submitContactCore({ api: async () => api }, fd({ ...valid, page: "/billing/plans" }))
    expect(sentPage).toBe("/billing/plans")
  })

  test("the api client factory receives the forwarded session token (and ip, and locale)", async () => {
    const api: ContactApi = { create: async () => ({ reference: "HELP-8" }) }
    let received: [string | undefined, string | undefined, string | null | undefined] | undefined
    await submitContactCore(
      {
        api: async (ip, locale, sessionToken) => {
          received = [ip, locale, sessionToken]
          return api
        },
        ip: "203.0.113.9",
        locale: "sv",
        sessionToken: "tok_abc123",
      },
      fd(valid)
    )
    expect(received).toEqual(["203.0.113.9", "sv", "tok_abc123"])
  })

  test("the api client failing to build (e.g. no env configured) answers unavailable", async () => {
    const out = await submitContactCore(
      {
        api: async () => {
          throw new Error("API_URL is not set")
        },
      },
      fd(valid)
    )
    expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
  })

  test("TOO_MANY_REQUESTS maps to the page's own English constant, not the live error message", async () => {
    // The api may answer in whatever locale was sent; this page never translates, so it must
    // show its own text rather than trust the error's.
    const limited = new ORPCError("TOO_MANY_REQUESTS", {
      defined: true,
      message: "För många förfrågningar, försök igen senare",
    })
    const api: ContactApi = {
      create: async () => {
        throw limited
      },
    }
    const out = await submitContactCore({ api: async () => api }, fd(valid))
    expect(out).toMatchObject({ ok: false, message: TOO_MANY_REQUESTS })
  })

  test("any other failure is the generic unavailable message", async () => {
    const api: ContactApi = {
      create: async () => {
        throw new Error("down")
      },
    }
    const out = await submitContactCore({ api: async () => api }, fd(valid))
    expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
  })

  test("a defined ORPCError with a different code also maps to the generic failure", async () => {
    const badRequest = new ORPCError("BAD_REQUEST", { defined: true, message: "malformed" })
    const api: ContactApi = {
      create: async () => {
        throw badRequest
      },
    }
    const out = await submitContactCore({ api: async () => api }, fd(valid))
    expect(out).toMatchObject({ ok: false, message: UNAVAILABLE })
  })
})

describe("resolveContactLocale", () => {
  test("cookie wins when set", () => {
    expect(resolveContactLocale({ cookie: "sv" })).toBe("sv")
  })

  test("falls back to Accept-Language", () => {
    expect(resolveContactLocale({ acceptLanguage: "sv-SE" })).toBe("sv")
  })

  test("nothing at all: no x-locale", () => {
    expect(resolveContactLocale({})).toBeUndefined()
  })

  test("an unsupported Accept-Language: no x-locale (falls to the English default)", () => {
    expect(resolveContactLocale({ acceptLanguage: "de" })).toBeUndefined()
  })
})

describe("contactHeaders", () => {
  test("the client id is always anon:<hash> — never session-based, even with a session token", () => {
    const withoutSession = contactHeaders({ serviceToken: "svc", clientId: "anon:abcd" })
    const withSession = contactHeaders({
      serviceToken: "svc",
      clientId: "anon:abcd",
      sessionToken: "tok_live",
    })
    expect(withoutSession["x-api-client-id"]).toBe("anon:abcd")
    expect(withSession["x-api-client-id"]).toBe("anon:abcd")
    expect(withSession["x-session-token"]).toBe("tok_live")
    expect(withoutSession["x-session-token"]).toBeUndefined()
  })

  test("locale is sent as x-locale only when given", () => {
    expect(contactHeaders({ serviceToken: "svc" })["x-locale"]).toBeUndefined()
    expect(contactHeaders({ serviceToken: "svc", locale: "sv" })["x-locale"]).toBe("sv")
  })

  test("x-request-id is sent only when a well-formed id is given", () => {
    expect(contactHeaders({ serviceToken: "svc" })["x-request-id"]).toBeUndefined()
    expect(
      contactHeaders({ serviceToken: "svc", requestId: "bad id" })["x-request-id"]
    ).toBeUndefined()
    expect(
      contactHeaders({ serviceToken: "svc", requestId: "req-help-0001" })["x-request-id"]
    ).toBe("req-help-0001")
  })

  test("the service token is always sent as a bearer", () => {
    expect(contactHeaders({ serviceToken: "svc" }).authorization).toBe("Bearer svc")
  })
})
