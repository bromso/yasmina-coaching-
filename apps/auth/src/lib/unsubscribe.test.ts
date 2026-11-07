import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { NOTIFICATION_EMAIL, NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH } from "@repo/api-contract"
import { messagesFor } from "@repo/i18n/messages"
import {
  isPlausibleUnsubscribeToken,
  oneClickRedirect,
  oneClickResponse,
  peekUnsubscribe,
  type UnsubscribeApi,
  unsubscribeCore,
} from "./unsubscribe"
import { UNSUBSCRIBE_TYPE_KEYS } from "./unsubscribe-types"

const good = `${"a".repeat(30)}.${"b".repeat(43)}`
const INVALID = "This link isn't valid any more."
const SUCCESS =
  "You won't get these emails any more. You can change this any time in your notification settings."
const UNAVAILABLE = "The sign-in service is unavailable right now. Try again in a moment."
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })

/** An api double that records every call, so a test can prove which ones never happened. */
function fakeApi(overrides: Partial<UnsubscribeApi> = {}) {
  const calls = { unsubscribe: [] as string[], peek: [] as string[] }
  const api = {
    unsubscribe: async ({ token }: { token: string }) => {
      calls.unsubscribe.push(token)
      return { ok: true as const }
    },
    peek: async ({ token }: { token: string }) => {
      calls.peek.push(token)
      return { type: "member.role_changed" as const }
    },
    ...overrides,
  } as UnsubscribeApi
  return { getApi: async () => api, calls }
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe("isPlausibleUnsubscribeToken", () => {
  test("the api's alphabet within its length limit", () => {
    expect(isPlausibleUnsubscribeToken(good)).toBe(true)
    expect(isPlausibleUnsubscribeToken("a".repeat(NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH))).toBe(true)
    for (const bad of [
      "",
      null,
      undefined,
      "a".repeat(NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH + 1),
      "a b",
      "a+b/c=",
      "a\r\nb",
      "<a>",
    ])
      expect(isPlausibleUnsubscribeToken(bad)).toBe(false)
  })
})

describe("oneClickResponse (POST)", () => {
  test("a good token: the api is asked once, the answer an empty 200, never cached", async () => {
    const { getApi, calls } = fakeApi()
    const res = await oneClickResponse(getApi, good)
    expect(calls.unsubscribe).toEqual([good])
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("location")).toBeNull()
    expect(await res.text()).toBe("")
  })

  test("the api's 400 for a malformed token answers exactly like a good token", async () => {
    const { getApi } = fakeApi({
      unsubscribe: async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Input validation failed" })
      },
    })
    const bad = await oneClickResponse(getApi, good)
    const ok = await oneClickResponse(fakeApi().getApi, good)
    expect(bad.status).toBe(ok.status)
    expect([...bad.headers]).toEqual([...ok.headers])
    expect(await bad.text()).toBe(await ok.text())
  })

  test("no token, or an implausible one: the same 200, and the api is never asked", async () => {
    const { getApi, calls } = fakeApi()
    for (const token of [null, "", "a b", "x".repeat(NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH + 1)]) {
      const res = await oneClickResponse(getApi, token)
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBe("no-store")
    }
    expect(calls.unsubscribe).toEqual([])
  })

  test("rate-limited by the api: 429", async () => {
    const { getApi } = fakeApi({
      unsubscribe: async () => {
        throw defined("TOO_MANY_REQUESTS", "Too many requests, try again in a few minutes")
      },
    })
    const res = await oneClickResponse(getApi, good)
    expect(res.status).toBe(429)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  test("the api unreachable, or the client cannot even be built: 503", async () => {
    const down = fakeApi({
      unsubscribe: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect((await oneClickResponse(down.getApi, good)).status).toBe(503)
    const noEnv = async (): Promise<UnsubscribeApi> => {
      throw new Error("API_URL is not set")
    }
    const res = await oneClickResponse(noEnv, good)
    expect(res.status).toBe(503)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })
})

describe("oneClickRedirect (GET)", () => {
  test("303 to the confirm page with the same token, and no api is involved at all", () => {
    const res = oneClickRedirect(good)
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`/email/unsubscribe?token=${good}`)
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  test("no token, or an implausible one, goes to the page without it", () => {
    expect(oneClickRedirect(null).headers.get("location")).toBe("/email/unsubscribe")
    expect(oneClickRedirect("a\r\nb").headers.get("location")).toBe("/email/unsubscribe")
  })
})

describe("peekUnsubscribe (the page's load)", () => {
  const INVALID_LINK = { status: "invalid" } as const
  const UNAVAILABLE_LINK = { status: "unavailable" } as const

  test("valid: names the type, and only ever peeks — loading the page never unsubscribes", async () => {
    const { getApi, calls } = fakeApi()
    expect(await peekUnsubscribe(getApi, good)).toEqual({
      status: "valid",
      type: "member.role_changed",
    })
    expect(calls.peek).toEqual([good])
    expect(calls.unsubscribe).toEqual([])
  })

  test("invalid: a token the api does not recognise", async () => {
    const { getApi } = fakeApi({ peek: async () => null })
    expect(await peekUnsubscribe(getApi, good)).toEqual(INVALID_LINK)
  })

  test("invalid: the api's 400 for a malformed token", async () => {
    const { getApi } = fakeApi({
      peek: async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Input validation failed" })
      },
    })
    expect(await peekUnsubscribe(getApi, good)).toEqual(INVALID_LINK)
  })

  test("invalid: an implausible token, without asking", async () => {
    const { getApi, calls } = fakeApi()
    expect(await peekUnsubscribe(getApi, undefined)).toEqual(INVALID_LINK)
    expect(await peekUnsubscribe(getApi, "a b")).toEqual(INVALID_LINK)
    expect(calls.peek).toEqual([])
  })

  test("unavailable, never invalid: a 429, the api down, or no env to build it", async () => {
    for (const error of [defined("TOO_MANY_REQUESTS", "x"), new TypeError("fetch failed")]) {
      const { getApi, calls } = fakeApi({
        peek: async () => {
          throw error
        },
      })
      expect(await peekUnsubscribe(getApi, good)).toEqual(UNAVAILABLE_LINK)
      expect(calls.unsubscribe).toEqual([])
    }
    const noEnv = async (): Promise<UnsubscribeApi> => {
      throw new Error("API_URL is not set")
    }
    expect(await peekUnsubscribe(noEnv, good)).toEqual(UNAVAILABLE_LINK)
  })

  test("the getter is handed the token it is about to send", async () => {
    const seen: string[] = []
    const { getApi } = fakeApi()
    await peekUnsubscribe(async (token) => {
      seen.push(token)
      return getApi()
    }, good)
    expect(seen).toEqual([good])
  })
})

describe("unsubscribeCore (Turn off these emails)", () => {
  test("calls unsubscribe once with the form's token and reports success", async () => {
    const { getApi, calls } = fakeApi()
    expect(await unsubscribeCore({ getApi }, form({ token: good }))).toEqual({
      ok: true,
      message: SUCCESS,
    })
    expect(calls.unsubscribe).toEqual([good])
  })

  test("in Swedish", async () => {
    const { getApi } = fakeApi()
    const sv = messagesFor("sv", ["auth"]).auth as { emailUnsubscribe: { success: string } }
    expect(await unsubscribeCore({ getApi, locale: "sv" }, form({ token: good }))).toEqual({
      ok: true,
      message: sv.emailUnsubscribe.success,
    })
  })

  test("an implausible token never reaches the api", async () => {
    const { getApi, calls } = fakeApi()
    expect(await unsubscribeCore({ getApi }, form({ token: "a b" }))).toEqual({
      ok: false,
      message: INVALID,
    })
    expect(await unsubscribeCore({ getApi }, new FormData())).toEqual({
      ok: false,
      message: INVALID,
    })
    expect(calls.unsubscribe).toEqual([])
  })

  test("the api's 400 is the neutral invalid-link message", async () => {
    const { getApi } = fakeApi({
      unsubscribe: async () => {
        throw new ORPCError("BAD_REQUEST", { message: "Input validation failed" })
      },
    })
    expect(await unsubscribeCore({ getApi }, form({ token: good }))).toEqual({
      ok: false,
      message: INVALID,
    })
  })

  test("rate-limited: the api's own message, already in the caller's language", async () => {
    const { getApi } = fakeApi({
      unsubscribe: async () => {
        throw defined("TOO_MANY_REQUESTS", "För många förfrågningar")
      },
    })
    expect(await unsubscribeCore({ getApi }, form({ token: good }))).toEqual({
      ok: false,
      message: "För många förfrågningar",
    })
  })

  test("the api unreachable: unavailable", async () => {
    const { getApi } = fakeApi({
      unsubscribe: async () => {
        throw new TypeError("fetch failed")
      },
    })
    expect(await unsubscribeCore({ getApi }, form({ token: good }))).toEqual({
      ok: false,
      message: UNAVAILABLE,
    })
  })
})

describe("UNSUBSCRIBE_TYPE_KEYS", () => {
  test("names every optional type, in both languages, and no locked one", () => {
    expect(Object.keys(UNSUBSCRIBE_TYPE_KEYS).sort()).toEqual(
      [...NOTIFICATION_EMAIL.optional].sort()
    )
    for (const locale of ["en", "sv"] as const) {
      const auth = messagesFor(locale, ["auth"]).auth as {
        emailUnsubscribe: { types: Record<string, string> }
      }
      for (const key of Object.values(UNSUBSCRIBE_TYPE_KEYS))
        expect(auth.emailUnsubscribe.types[key]).toBeTruthy()
    }
    for (const locked of NOTIFICATION_EMAIL.locked)
      expect(locked in UNSUBSCRIBE_TYPE_KEYS).toBe(false)
  })
})
