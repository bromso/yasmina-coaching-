import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { ORPCError, os } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import {
  anonymousClientId,
  createApiClient,
  getMeFromToken,
  getUserFromToken,
  sessionClientId,
  unsubscribeClientId,
  unsubscribeTokenClientId,
} from "./client"

const seen: Array<Record<string, string | null>> = []
// Only auth.me; RPCHandler routes by path, so the shape is all that matters.
const stub = {
  auth: {
    me: os.handler(() => {
      if (seen.at(-1)?.["x-session-token"] !== "good") {
        throw new ORPCError("UNAUTHORIZED", { message: "Sign in required" })
      }
      return {
        user: {
          id: 1,
          email: "ada@example.com",
          name: "Ada",
          createdAt: "2026-01-01T00:00:00.000Z",
          emailVerified: false,
          hasPassword: true,
          superadmin: false,
        },
        session: { id: 7, expiresAt: "2027-01-01T00:00:00.000Z" },
        impersonation: null,
        localeChosen: false,
      }
    }),
  },
}

let server: ReturnType<typeof Bun.serve>
// Accepts the request and never answers.
let silent: ReturnType<typeof Bun.serve>
beforeAll(() => {
  silent = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) })
  const handler = new RPCHandler(stub)
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      seen.push({
        authorization: req.headers.get("authorization"),
        "x-session-token": req.headers.get("x-session-token"),
        "x-api-client-id": req.headers.get("x-api-client-id"),
        "x-locale": req.headers.get("x-locale"),
        "x-request-id": req.headers.get("x-request-id"),
      })
      const { response } = await handler.handle(req, { prefix: "/rpc", context: {} })
      return response ?? new Response("nope", { status: 404 })
    },
  })
})
afterAll(() => {
  server.stop(true)
  silent.stop(true)
})

describe("api client", () => {
  test("sends the service bearer and the session token", async () => {
    const client = createApiClient({
      apiUrl: server.url.origin,
      serviceToken: "svc",
      sessionToken: "good",
    })
    const me = await client.auth.me()
    expect(me.user.email).toBe("ada@example.com")
    expect(seen.at(-1)).toEqual({
      authorization: "Bearer svc",
      "x-session-token": "good",
      "x-api-client-id": await sessionClientId("good"),
      "x-locale": null,
      "x-request-id": null,
    })
  })

  test("x-request-id is sent only when a well-formed request id is given", async () => {
    const base = { apiUrl: server.url.origin, serviceToken: "svc" }
    await safe(createApiClient({ ...base, requestId: "req-abcdef12" }).auth.me())
    expect(seen.at(-1)?.["x-request-id"]).toBe("req-abcdef12")
    await safe(createApiClient({ ...base, requestId: "bad id" }).auth.me())
    expect(seen.at(-1)?.["x-request-id"]).toBeNull()
    await safe(createApiClient(base).auth.me())
    expect(seen.at(-1)?.["x-request-id"]).toBeNull()
  })

  test("createApiClient sends x-request-id through an injected fetch", async () => {
    const sent: Array<string | null> = []
    const fetchSpy = (async (input: Request | string | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      sent.push(request.headers.get("x-request-id"))
      return fetch(request)
    }) as typeof fetch
    await safe(
      createApiClient({
        apiUrl: server.url.origin,
        serviceToken: "svc",
        requestId: "injected-request-1",
        fetch: fetchSpy,
      }).auth.me()
    )
    expect(sent).toEqual(["injected-request-1"])
  })

  test("x-locale is sent only when a locale is given", async () => {
    const base = { apiUrl: server.url.origin, serviceToken: "svc" }
    await safe(createApiClient({ ...base, locale: "sv" }).auth.me())
    expect(seen.at(-1)?.["x-locale"]).toBe("sv")
    await safe(createApiClient({ ...base, sessionToken: "good", locale: "en" }).auth.me())
    expect(seen.at(-1)?.["x-locale"]).toBe("en")
    await safe(createApiClient(base).auth.me())
    expect(seen.at(-1)?.["x-locale"]).toBeNull()
  })

  test("x-api-client-id is per session: stable per token, distinct across tokens, absent without", async () => {
    const idFor = async (sessionToken?: string) => {
      const client = createApiClient({
        apiUrl: server.url.origin,
        serviceToken: "svc",
        sessionToken,
      })
      await client.auth.me().catch(() => {})
      return seen.at(-1)?.["x-api-client-id"]
    }
    const a1 = await idFor("token-a")
    expect(a1).toMatch(/^session:[0-9a-f]{32}$/)
    expect(a1).not.toContain("token-a")
    expect(await idFor("token-a")).toBe(a1 as string)
    expect(await idFor("token-b")).not.toBe(a1 as string)
    expect(await idFor()).toBeNull()
  })

  test("a call to an api that never answers gives up after timeoutMs", async () => {
    const started = performance.now()
    const user = await getUserFromToken(
      { apiUrl: silent.url.origin, serviceToken: "svc", timeoutMs: 200 },
      "good"
    )
    expect(user).toBeNull()
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  test("getUserFromToken maps UNAUTHORIZED and network failure to null", async () => {
    const base = { apiUrl: server.url.origin, serviceToken: "svc" }
    expect(await getUserFromToken(base, "bad")).toBeNull()
    expect(await getUserFromToken(base, null)).toBeNull()
    expect(await getUserFromToken({ ...base, apiUrl: "http://127.0.0.1:1" }, "good")).toBeNull()
    expect((await getUserFromToken(base, "good"))?.id).toBe(1)
  })

  test("getMeFromToken returns the whole Me, getUserFromToken its user", async () => {
    const base = { apiUrl: server.url.origin, serviceToken: "svc" }
    const me = await getMeFromToken(base, "good")
    expect(me).toMatchObject({ user: { id: 1 }, impersonation: null })
    expect(await getUserFromToken(base, "good")).toEqual(me?.user ?? null)
  })

  test("an anonymous call carries the ip-derived client id; a session id wins over it", async () => {
    const base = { apiUrl: server.url.origin, serviceToken: "svc" }
    const anon = await anonymousClientId("203.0.113.9")
    expect(anon).toMatch(/^anon:[0-9a-f]{32}$/)
    expect(await anonymousClientId("203.0.113.9")).toBe(anon)
    expect(await anonymousClientId(undefined)).toBeUndefined()
    await safe(createApiClient({ ...base, clientId: anon }).auth.me())
    expect(seen.at(-1)?.["x-api-client-id"]).toBe(anon)
    await safe(createApiClient({ ...base, clientId: anon, sessionToken: "good" }).auth.me())
    expect(seen.at(-1)?.["x-api-client-id"]).toMatch(/^session:/)
  })

  test("the unsubscribe client id is its own ip-derived bucket, never the sign-in one", async () => {
    const unsub = await unsubscribeClientId("203.0.113.9")
    expect(unsub).toMatch(/^unsub:[0-9a-f]{32}$/)
    expect(await unsubscribeClientId("203.0.113.9")).toBe(unsub)
    expect(unsub?.slice("unsub:".length)).toBe(
      (await anonymousClientId("203.0.113.9"))?.slice("anon:".length)
    )
    expect(await unsubscribeClientId(undefined)).toBeUndefined()
  })
  test("the one-click bucket is keyed by the token, never by the poster's ip", async () => {
    const a = await unsubscribeTokenClientId("token-a.mac")
    expect(a).toMatch(/^unsub:[0-9a-f]{32}$/)
    expect(await unsubscribeTokenClientId("token-a.mac")).toBe(a)
    expect(await unsubscribeTokenClientId("token-b.mac")).not.toBe(a)
    expect(a).not.toContain("token-a")
    const digest = new Bun.CryptoHasher("sha256").update("token-a.mac").digest("hex")
    expect(a).toBe(`unsub:${digest.slice(0, 32)}`)
  })
})
