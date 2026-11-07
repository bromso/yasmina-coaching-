import { describe, expect, test } from "bun:test"
import { createUserEventsRoute } from "./events"

const USER = { id: 1, name: "Ada", email: "ada@example.com" }
const ENV = () => ({ API_URL: "http://api.test", API_SERVICE_TOKEN: "service-token" })

const emptyStream = () => new ReadableStream()

type FakeFetch = typeof fetch & { calls: Array<{ url: string; init: RequestInit }> }

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init: init ?? {} })
    return respond(url, init ?? {})
  }) as FakeFetch
  f.calls = calls
  return f
}

const routeOf = (
  overrides: Partial<Parameters<typeof createUserEventsRoute>[0]> & { fetch: FakeFetch }
) =>
  createUserEventsRoute({
    getUser: async () => USER as never,
    readSessionToken: () => "session-token-123",
    env: ENV,
    ...overrides,
  })

const request = (init?: RequestInit) => new Request("http://app.test/api/events/me", init)

describe("createUserEventsRoute", () => {
  test("401 without a user, and the upstream is never called", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const res = await routeOf({ fetch, getUser: async () => null })(request())
    expect(res.status).toBe(401)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(fetch.calls).toHaveLength(0)
  })

  test("calls /events/me with the bearer, session token, an events: client id and request id", async () => {
    const fetch = fakeFetch(() => new Response(emptyStream(), { status: 200 }))
    await routeOf({ fetch })(
      request({ headers: { "x-real-ip": "203.0.113.9", "x-request-id": "req-me-0001" } })
    )
    expect(fetch.calls).toHaveLength(1)
    const call = fetch.calls[0]
    if (!call) throw new Error("fetch was not called")
    expect(call.url).toBe("http://api.test/events/me")
    const headers = call.init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer service-token")
    expect(headers["x-session-token"]).toBe("session-token-123")
    expect(headers["x-api-client-id"]).toMatch(/^events:[0-9a-f]{32}$/)
    expect(headers["x-request-id"]).toBe("req-me-0001")
    expect(call.init.cache).toBe("no-store")
  })

  test("the query string never picks anything: no workspace is involved", async () => {
    const fetch = fakeFetch(() => new Response(emptyStream(), { status: 200 }))
    await routeOf({ fetch })(new Request("http://app.test/api/events/me?workspace=42&user=2"))
    expect(fetch.calls.map((c) => c.url)).toEqual(["http://api.test/events/me"])
  })

  test("success streams the upstream body through with the three headers", async () => {
    const body = emptyStream()
    const fetch = fakeFetch(
      () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
    )
    const res = await routeOf({ fetch })(request())
    expect(res.status).toBe(200)
    expect(res.body).toBe(body)
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-accel-buffering")).toBe("no")
  })

  test("aborting the incoming request aborts the upstream signal", async () => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    const fetch = fakeFetch((_url, init) => {
      seenSignal = init.signal as AbortSignal
      return new Response(emptyStream(), { status: 200 })
    })
    controller.abort()
    await routeOf({ fetch })(request({ signal: controller.signal }))
    expect(seenSignal).toBe(controller.signal)
    expect(seenSignal?.aborted).toBe(true)
  })

  test("upstream 401, 403, 404, 429 and 503 are relayed as-is, body unread", async () => {
    for (const status of [401, 403, 404, 429, 503]) {
      let cancelled = false
      const fetch = fakeFetch(
        () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true
              },
            }),
            { status }
          )
      )
      const res = await routeOf({ fetch })(request())
      expect(res.status).toBe(status)
      expect(res.headers.get("cache-control")).toBe("no-store")
      expect(cancelled).toBe(true)
    }
  })

  test("any other upstream status becomes 502", async () => {
    for (const status of [400, 409, 500, 502]) {
      const fetch = fakeFetch(() => new Response(null, { status }))
      const res = await routeOf({ fetch })(request())
      expect(res.status).toBe(502)
    }
  })

  test("a network error becomes 502", async () => {
    const fetch = fakeFetch(() => {
      throw new TypeError("fetch failed")
    })
    const originalError = console.error
    console.error = () => {}
    try {
      expect((await routeOf({ fetch })(request())).status).toBe(502)
    } finally {
      console.error = originalError
    }
  })

  test("the browser disconnecting while the upstream fetch awaits headers is a quiet 499", async () => {
    const controller = new AbortController()
    const fetch = fakeFetch(() => {
      controller.abort()
      throw new DOMException("The operation was aborted.", "AbortError")
    })
    const originalError = console.error
    const logged: unknown[][] = []
    console.error = (...args: unknown[]) => logged.push(args)
    try {
      const res = await routeOf({ fetch })(request({ signal: controller.signal }))
      expect(res.status).toBe(499)
      expect(logged).toHaveLength(0)
    } finally {
      console.error = originalError
    }
  })
})
