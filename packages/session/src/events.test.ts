import { describe, expect, test } from "bun:test"
import { createEventsRoute } from "./events"

const USER = { id: 1, name: "Ada", email: "ada@example.com" }
const WORKSPACE = { id: 7 }
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
  overrides: Partial<Parameters<typeof createEventsRoute>[0]> & { fetch: FakeFetch }
) =>
  createEventsRoute({
    getUser: async () => USER as never,
    getWorkspace: async () => ({ workspace: WORKSPACE }),
    readSessionToken: () => "session-token-123",
    env: ENV,
    ...overrides,
  })

describe("createEventsRoute", () => {
  test("forwards the request's own x-request-id upstream, and only a well-formed one", async () => {
    const fetch = fakeFetch(() => new Response("data: x\n\n", { status: 200 }))
    const route = routeOf({ fetch })
    await route(
      new Request("http://app.test/api/events", { headers: { "x-request-id": "req-events-01" } })
    )
    await route(new Request("http://app.test/api/events", { headers: { "x-request-id": "no!" } }))
    const sent = fetch.calls.map((c) => new Headers(c.init.headers).get("x-request-id"))
    expect(sent).toEqual(["req-events-01", null])
  })

  test("401 without a user, and the upstream is never called", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const route = routeOf({ fetch, getUser: async () => null })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(401)
    expect(fetch.calls).toHaveLength(0)
  })

  test("404 without a workspace, and the upstream is never called", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const route = routeOf({ fetch, getWorkspace: async () => ({ workspace: null }) })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(404)
    expect(fetch.calls).toHaveLength(0)
  })

  test("503 when the workspace lookup could not reach the api, and the upstream is never called", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const route = routeOf({
      fetch,
      getWorkspace: async () => ({ workspace: null, error: new Error("api unreachable") }),
    })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(503)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(fetch.calls).toHaveLength(0)
  })

  test("?workspace=<id> picks the workspace without the cookie lookup", async () => {
    const fetch = fakeFetch(
      () => new Response(emptyStream(), { headers: { "content-type": "text/event-stream" } })
    )
    let looked = 0
    const route = routeOf({
      fetch,
      getWorkspace: async () => {
        looked += 1
        return { workspace: WORKSPACE }
      },
    })
    const res = await route(new Request("http://app.test/api/events?workspace=42"))
    expect(res.status).toBe(200)
    expect(fetch.calls.map((c) => c.url)).toEqual(["http://api.test/events/workspaces/42"])
    expect(looked).toBe(0)
  })

  test("without ?workspace the cookie's workspace is used", async () => {
    const fetch = fakeFetch(
      () => new Response(emptyStream(), { headers: { "content-type": "text/event-stream" } })
    )
    const route = routeOf({ fetch })
    await route(new Request("http://app.test/api/events"))
    expect(fetch.calls.map((c) => c.url)).toEqual(["http://api.test/events/workspaces/7"])
  })

  test("a ?workspace that is not a positive integer is 404 without an upstream call", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const route = routeOf({ fetch })
    for (const value of ["abc", "0", "-1", "1.5", "", "1e3", "9".repeat(16)]) {
      const res = await route(new Request(`http://app.test/api/events?workspace=${value}`))
      expect(res.status).toBe(404)
    }
    expect(fetch.calls).toHaveLength(0)
  })

  test("?workspace still needs a user", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 200 }))
    const route = routeOf({ fetch, getUser: async () => null })
    const res = await route(new Request("http://app.test/api/events?workspace=7"))
    expect(res.status).toBe(401)
    expect(fetch.calls).toHaveLength(0)
  })

  test("an upstream 404 for a ?workspace the user is not a member of is relayed", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 404 }))
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events?workspace=99"))
    expect(res.status).toBe(404)
  })

  test("success streams the upstream body through with the three headers", async () => {
    const body = emptyStream()
    const fetch = fakeFetch(
      () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        })
    )
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(200)
    expect(res.body).toBe(body)
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-accel-buffering")).toBe("no")
  })

  test("the request carries the bearer, session token and an events: client id from x-real-ip", async () => {
    const fetch = fakeFetch(() => new Response(emptyStream(), { status: 200 }))
    const route = routeOf({ fetch })
    await route(
      new Request("http://app.test/api/events", { headers: { "x-real-ip": "203.0.113.9" } })
    )
    expect(fetch.calls).toHaveLength(1)
    const call = fetch.calls[0]
    if (!call) throw new Error("fetch was not called")
    const { url, init } = call
    expect(url).toBe("http://api.test/events/workspaces/7")
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer service-token")
    expect(headers["x-session-token"]).toBe("session-token-123")
    expect(headers["x-api-client-id"]).toMatch(/^events:[0-9a-f]{32}$/)
    expect(init.cache).toBe("no-store")
  })

  test("aborting the incoming request aborts the upstream signal", async () => {
    const controller = new AbortController()
    let seenSignal: AbortSignal | undefined
    const fetch = fakeFetch((_url, init) => {
      seenSignal = init.signal as AbortSignal
      return new Response(emptyStream(), { status: 200 })
    })
    const route = routeOf({ fetch })
    controller.abort()
    await route(new Request("http://app.test/api/events", { signal: controller.signal }))
    expect(seenSignal).toBe(controller.signal)
    expect(seenSignal?.aborted).toBe(true)
  })

  test("upstream 429 is relayed as 429", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 429 }))
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(429)
  })

  test("upstream 404 and 401 and 503 are relayed as-is", async () => {
    for (const status of [401, 404, 503]) {
      const fetch = fakeFetch(() => new Response(null, { status }))
      const route = routeOf({ fetch })
      const res = await route(new Request("http://app.test/api/events"))
      expect(res.status).toBe(status)
    }
  })

  test("upstream 403 (two-step verification required) is relayed as 403, body unread", async () => {
    let cancelled = false
    const fetch = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("two_factor_required"))
            },
            cancel() {
              cancelled = true
            },
          }),
          { status: 403 }
        )
    )
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(403)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(cancelled).toBe(true)
  })

  test("upstream 500 becomes 502", async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 500 }))
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(502)
  })

  test("a network error becomes 502", async () => {
    const fetch = fakeFetch(() => {
      throw new TypeError("fetch failed")
    })
    const route = routeOf({ fetch })
    const res = await route(new Request("http://app.test/api/events"))
    expect(res.status).toBe(502)
  })

  test("the browser disconnecting while the upstream fetch awaits headers is a quiet 499", async () => {
    const controller = new AbortController()
    const fetch = fakeFetch(() => {
      // The real failure mode: the signal is already aborted by the time `fetch` rejects (an
      // `EventSource` closing, or a navigation away, while still waiting for upstream headers).
      controller.abort()
      throw new DOMException("The operation was aborted.", "AbortError")
    })
    const originalError = console.error
    const logged: unknown[][] = []
    console.error = (...args: unknown[]) => logged.push(args)
    try {
      const route = routeOf({ fetch })
      const res = await route(
        new Request("http://app.test/api/events", { signal: controller.signal })
      )
      expect(res.status).toBe(499)
      expect(logged).toHaveLength(0)
    } finally {
      console.error = originalError
    }
  })
})
