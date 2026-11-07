import { describe, expect, spyOn, test } from "bun:test"
import {
  anonymousClientId,
  clientIp,
  createAnalyticsRoute,
  createTelemetryClient,
  createTelemetryRoute,
  throttledLogger,
} from "./server"

const batch = { errors: [{ kind: "boundary" as const, message: "boom" }], vitals: [] }
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://app.brand.localhost:3001/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

describe("createTelemetryRoute", () => {
  test("forwards a valid batch with the app stamped and a per-browser client id", async () => {
    const seen: unknown[] = []
    const route = createTelemetryRoute({
      app: "app",
      forward: async (b, clientId) => {
        seen.push({ b, clientId })
      },
    })
    const res = await route(
      post({ ...batch, app: "www" }, { "x-forwarded-for": "203.0.113.9, 10.0.0.1" })
    )
    expect(res.status).toBe(204)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ b: { app: "app", errors: batch.errors } })
    expect((seen[0] as { clientId: string }).clientId).toMatch(/^telemetry:[0-9a-f]{32}$/)
  })

  test("forwards the request's own x-request-id, and only a well-formed one", async () => {
    const seen: Array<string | undefined> = []
    const route = createTelemetryRoute({
      app: "app",
      forward: async (_b, _clientId, requestId) => {
        seen.push(requestId)
      },
    })
    await route(post(batch, { "x-request-id": "req-telemetry-1" }))
    await route(post(batch, { "x-request-id": "bad id" }))
    await route(post(batch))
    expect(seen).toEqual(["req-telemetry-1", undefined, undefined])
  })

  test("the default forward sends x-request-id to telemetry.ingest", async () => {
    const requests: Request[] = []
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      requests.push(new Request(input, init))
      return new Response(JSON.stringify({ json: null }), { status: 200 })
    }) as typeof fetch)
    try {
      const route = createTelemetryRoute({
        app: "docs",
        env: { NODE_ENV: "development" },
        log: () => {},
      })
      await route(post(batch, { "x-request-id": "req-telemetry-2" }))
      await Bun.sleep(20)
      expect(requests[0]?.headers.get("x-request-id")).toBe("req-telemetry-2")
    } finally {
      spy.mockRestore()
    }
  })

  test("answers 204 and forwards nothing for garbage, an oversize body or a schema miss", async () => {
    let calls = 0
    const route = createTelemetryRoute({
      app: "app",
      forward: async () => {
        calls++
      },
    })
    expect((await route(post("{not json"))).status).toBe(204)
    // Schema-valid in every field (each `stack` is under the 4000-char cap) but the total body,
    // 20 errors deep, is well over TELEMETRY_LIMITS.bodyBytes — so this exercises the body-size
    // check specifically, not Zod rejecting an out-of-range field.
    const oversizeButValid = {
      errors: Array.from({ length: 20 }, () => ({
        kind: "boundary" as const,
        message: "x",
        stack: "s".repeat(3999),
      })),
      vitals: [],
    }
    expect((await route(post(oversizeButValid))).status).toBe(204)
    expect(
      (await route(post({ errors: [{ kind: "nope", message: "x" }], vitals: [] }))).status
    ).toBe(204)
    expect(calls).toBe(0)
  })

  test("a content-length above the cap is rejected without reading the body", async () => {
    let calls = 0
    const route = createTelemetryRoute({
      app: "app",
      forward: async () => {
        calls++
      },
    })
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(batch)))
        controller.close()
      },
    })
    const req = new Request("http://app.brand.localhost:3001/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "999999" },
      body: stream,
    })
    const res = await route(req)
    expect(res.status).toBe(204)
    expect(calls).toBe(0)
    // Bun's own networking layer eagerly drains a streamed Request body into its internal
    // representation shortly after construction regardless of whether application code ever
    // touches it, so the stream's `pull` firing is not a reliable "did our code read it" signal
    // here. `bodyUsed` is: it only flips once something consumes the body through the standard
    // Body interface (text/json/getReader + read), which is the guarantee this fix makes — a
    // declared-oversize body is never handed to our reader, JSON.parse, or Zod.
    expect(req.bodyUsed).toBe(false)
  })

  test("a real body over the cap with no content-length (chunked) is dropped mid-stream", async () => {
    let calls = 0
    const route = createTelemetryRoute({
      app: "app",
      forward: async () => {
        calls++
      },
    })
    const bigJson = JSON.stringify({
      errors: [{ kind: "boundary", message: "a".repeat(9000) }],
      vitals: [],
    })
    let served = false
    const stream = new ReadableStream({
      pull(controller) {
        if (served) {
          controller.close()
          return
        }
        served = true
        controller.enqueue(new TextEncoder().encode(bigJson))
      },
    })
    const req = new Request("http://app.brand.localhost:3001/api/telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
    })
    expect(req.headers.get("content-length")).toBeNull()
    const res = await route(req)
    expect(res.status).toBe(204)
    expect(calls).toBe(0)
  })

  test("a non-JSON content type or a cross-site fetch forwards nothing", async () => {
    let calls = 0
    const route = createTelemetryRoute({
      app: "app",
      forward: async () => {
        calls++
      },
    })
    expect((await route(post(batch, { "content-type": "text/plain" }))).status).toBe(204)
    expect((await route(post(batch, { "sec-fetch-site": "cross-site" }))).status).toBe(204)
    expect((await route(post(batch, { "sec-fetch-site": "same-site" }))).status).toBe(204)
    expect(calls).toBe(0)
    await route(post(batch, { "sec-fetch-site": "same-origin" }))
    await route(post(batch, { "sec-fetch-site": "none" }))
    await route(post(batch, { "content-type": "application/json;charset=UTF-8" }))
    expect(calls).toBe(3)
  })

  test("answers 204 when the forward throws, and drops when unconfigured", async () => {
    const logs: string[] = []
    const throwing = createTelemetryRoute({
      app: "app",
      forward: async () => {
        throw new Error("api down")
      },
      log: (m, e) => logs.push(`${m} ${e instanceof Error ? e.message : ""}`),
    })
    expect((await throwing(post(batch))).status).toBe(204)
    expect(logs.join(" ")).toContain("api down")
    const unconfigured = createTelemetryRoute({
      app: "docs",
      env: { NODE_ENV: "production" },
      log: (m, e) => logs.push(`${m} ${e instanceof Error ? e.message : ""}`),
    })
    expect((await unconfigured(post(batch))).status).toBe(204)
  })
})

describe("createTelemetryRoute env fallback", () => {
  test("outside production, unset API_URL / API_SERVICE_TOKEN fall back to the dev api", async () => {
    const requests: Request[] = []
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      requests.push(new Request(input, init))
      return new Response(JSON.stringify({ json: null }), { status: 200 })
    }) as typeof fetch)
    try {
      const route = createTelemetryRoute({
        app: "docs",
        env: { NODE_ENV: "development" },
        log: () => {},
      })
      expect((await route(post(batch))).status).toBe(204)
      await Bun.sleep(20)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toStartWith("http://api.brand.localhost:3007/rpc")
      expect(requests[0]?.headers.get("authorization")).toBe("Bearer dev-only-insecure-api-token")
    } finally {
      spy.mockRestore()
    }
  })

  test("in production, unset vars drop every batch with the one log line", async () => {
    const logs: string[] = []
    const spy = spyOn(globalThis, "fetch")
    try {
      const route = createTelemetryRoute({
        app: "docs",
        env: { NODE_ENV: "production" },
        log: (m) => logs.push(m),
      })
      expect((await route(post(batch))).status).toBe(204)
      await Bun.sleep(20)
      expect(spy).not.toHaveBeenCalled()
      expect(logs).toEqual(["API_URL / API_SERVICE_TOKEN not set — dropping telemetry"])
    } finally {
      spy.mockRestore()
    }
  })
})

test("throttledLogger passes the message alone when there is no error", () => {
  const calls: unknown[][] = []
  const log = throttledLogger(60_000, (...args: unknown[]) => {
    calls.push(args)
  })
  log("dropped")
  const boom = new Error("boom")
  log("failed", boom)
  expect(calls.map((args) => args.length)).toEqual([1, 2])
  expect(calls).toEqual([["dropped"], ["failed", boom]])
})

describe("createTelemetryClient", () => {
  test("posts telemetry.ingest with the service bearer and a client id; never throws", async () => {
    const requests: Request[] = []
    const client = createTelemetryClient({
      apiUrl: "http://api.example",
      serviceToken: "svc",
      app: "ai",
      fetch: async (input, init) => {
        requests.push(new Request(input, init))
        return new Response(JSON.stringify({ json: null }), { status: 200 })
      },
    })
    client.report(batch)
    await Bun.sleep(20)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer svc")
    expect(requests[0]?.headers.get("x-api-client-id")).toBe("telemetry:ai")
    const down = createTelemetryClient({
      apiUrl: "http://127.0.0.1:1",
      serviceToken: "svc",
      app: "ai",
      log: () => {},
    })
    expect(() => down.report(batch)).not.toThrow()
  })
})

describe("createAnalyticsRoute", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://app.brand.localhost:3001/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })

  const capture = (status = 200) => {
    const requests: { url: string; body: string; headers: Headers }[] = []
    const fetchMock = (async (input: unknown, init?: RequestInit) => {
      const req = new Request(input as string | URL | Request, init)
      requests.push({ url: req.url, body: await req.clone().text(), headers: req.headers })
      return new Response(JSON.stringify({ json: null }), {
        status,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof fetch
    return { requests, fetchMock }
  }

  const sentOf = (requests: { body: string }[]) => JSON.parse(requests[0]?.body ?? "{}").json
  const env = () => ({ API_URL: "http://api.example", API_SERVICE_TOKEN: "svc" })

  test("forwards a pageview with the browser's ip and user agent, no ids without consent", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    const res = await route(
      post(
        // The browser already reduced the referrer to a host (see analytics.ts's sendPageview);
        // here it happens to be this app's own host.
        { kind: "pageview", path: "/notes", referrerHost: "app.brand.localhost:3001" },
        { "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0" }
      )
    )
    expect(res.status).toBe(204)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe("http://api.example/rpc/analytics/ingest")
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer svc")
    expect(requests[0]?.headers.get("x-api-client-id")).toMatch(/^analytics:[0-9a-f]{32}$/)
    const sent = sentOf(requests)
    expect(sent).toMatchObject({
      app: "app",
      kind: "pageview",
      path: "/notes",
      ip: "203.0.113.9",
      userAgent: "Mozilla/5.0",
    })
    // Same-origin referrer host: dropped.
    expect(sent.referrerHost).toBeUndefined()
    expect(sent.userId).toBeUndefined()
    expect(sent.workspaceId).toBeUndefined()
  })

  test("cuts an over-long user agent to the ingest schema's 500 characters instead of losing the pageview", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    const longAgent = `Mozilla/5.0 ${"x".repeat(700)}`
    await route(post({ kind: "pageview", path: "/notes" }, { "user-agent": longAgent }))
    expect(requests).toHaveLength(1)
    expect(sentOf(requests).userAgent).toBe(longAgent.slice(0, 500))
  })

  test("forwards a cross-site referrer's host unchanged", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    await route(post({ kind: "pageview", path: "/", referrerHost: "google.com" }))
    const sent = sentOf(requests)
    expect(sent.referrerHost).toBe("google.com")
  })

  test("forwards the request's own x-request-id to analytics.ingest", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    await route(post({ kind: "pageview", path: "/" }, { "x-request-id": "req-analytics-1" }))
    await route(post({ kind: "pageview", path: "/" }, { "x-request-id": "bad id" }))
    expect(requests.map((r) => r.headers.get("x-request-id"))).toEqual(["req-analytics-1", null])
  })

  test("sends no x-api-client-id header when there is no ip", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    await route(post({ kind: "pageview", path: "/" }))
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.has("x-api-client-id")).toBe(false)
    const sent = sentOf(requests)
    expect(sent.ip).toBeUndefined()
  })

  test("forwards a client event with its name and props", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "www", env, fetch: fetchMock })
    await route(post({ kind: "event", name: "pricing_viewed", props: { plan: "pro" } }))
    const sent = sentOf(requests)
    expect(sent).toMatchObject({
      app: "www",
      kind: "event",
      name: "pricing_viewed",
      props: { plan: "pro" },
    })
  })

  test("with consent necessary, identity is never called and no ids are forwarded", async () => {
    const { requests, fetchMock } = capture()
    let calls = 0
    const identity = async () => {
      calls++
      return { userId: 1, workspaceId: 2 }
    }
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock, identity })
    await route(post({ kind: "pageview", path: "/notes" }, { cookie: "consent=necessary" }))
    expect(calls).toBe(0)
    const sent = sentOf(requests)
    expect(sent.userId).toBeUndefined()
    expect(sent.workspaceId).toBeUndefined()
  })

  test("with consent all, identity's ids are forwarded", async () => {
    const { requests, fetchMock } = capture()
    const identity = async () => ({ userId: 7, workspaceId: 9 })
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock, identity })
    await route(post({ kind: "pageview", path: "/notes" }, { cookie: "consent=all" }))
    const sent = sentOf(requests)
    expect(sent.userId).toBe(7)
    expect(sent.workspaceId).toBe(9)
  })

  test("with consent all but no workspace, workspaceId is omitted rather than sent as null", async () => {
    const { requests, fetchMock } = capture()
    const identity = async () => ({ userId: 7, workspaceId: null })
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock, identity })
    await route(post({ kind: "pageview", path: "/notes" }, { cookie: "consent=all" }))
    const sent = sentOf(requests)
    expect(sent.userId).toBe(7)
    expect(sent.workspaceId).toBeUndefined()
  })

  test("a throwing identity never reaches the caller and sends no ids", async () => {
    const { requests, fetchMock } = capture()
    const identity = async () => {
      throw new Error("api down")
    }
    const route = createAnalyticsRoute({
      app: "app",
      env,
      fetch: fetchMock,
      identity,
      log: () => {},
    })
    const res = await route(post({ kind: "pageview", path: "/" }, { cookie: "consent=all" }))
    expect(res.status).toBe(204)
    const sent = sentOf(requests)
    expect(sent.userId).toBeUndefined()
  })

  test("answers 204 even when the upstream throws", async () => {
    const fetchMock = (async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock, log: () => {} })
    const res = await route(post({ kind: "pageview", path: "/" }))
    expect(res.status).toBe(204)
  })

  test("refuses a non-JSON content type or a cross-site fetch without forwarding", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    expect(
      (await route(post({ kind: "pageview", path: "/" }, { "content-type": "text/plain" }))).status
    ).toBe(204)
    expect(
      (await route(post({ kind: "pageview", path: "/" }, { "sec-fetch-site": "cross-site" })))
        .status
    ).toBe(204)
    expect(
      (await route(post({ kind: "pageview", path: "/" }, { "sec-fetch-site": "same-site" }))).status
    ).toBe(204)
    expect(requests).toHaveLength(0)
    await route(post({ kind: "pageview", path: "/" }, { "sec-fetch-site": "same-origin" }))
    await route(post({ kind: "pageview", path: "/" }, { "sec-fetch-site": "none" }))
    expect(requests).toHaveLength(2)
  })

  test("drops a bot user agent", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock })
    await route(post({ kind: "pageview", path: "/" }, { "user-agent": "Googlebot/2.1" }))
    await route(post({ kind: "pageview", path: "/" }, { "user-agent": "Mozilla/5.0 Headless" }))
    expect(requests).toHaveLength(0)
  })

  test("a garbage body, an unknown kind or an oversize body forwards nothing", async () => {
    const { requests, fetchMock } = capture()
    const route = createAnalyticsRoute({ app: "app", env, fetch: fetchMock, log: () => {} })
    expect((await route(post("{not json"))).status).toBe(204)
    expect((await route(post({ kind: "nope" }))).status).toBe(204)
    const oversize = { kind: "event", name: "x", props: { blob: "y".repeat(9000) } }
    expect((await route(post(oversize))).status).toBe(204)
    expect(requests).toHaveLength(0)
  })

  test("outside production without an env override, falls back to the dev api", async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalUrl = process.env.API_URL
    const originalToken = process.env.API_SERVICE_TOKEN
    process.env.NODE_ENV = "development"
    delete process.env.API_URL
    delete process.env.API_SERVICE_TOKEN
    const requests: Request[] = []
    const spy = spyOn(globalThis, "fetch").mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit
    ) => {
      requests.push(new Request(input, init))
      return new Response(JSON.stringify({ json: null }), { status: 200 })
    }) as typeof fetch)
    try {
      const route = createAnalyticsRoute({ app: "docs" })
      expect((await route(post({ kind: "pageview", path: "/" }))).status).toBe(204)
      await Bun.sleep(20)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toStartWith("http://api.brand.localhost:3007/rpc")
      expect(requests[0]?.headers.get("authorization")).toBe("Bearer dev-only-insecure-api-token")
    } finally {
      spy.mockRestore()
      process.env.NODE_ENV = originalNodeEnv
      if (originalUrl !== undefined) process.env.API_URL = originalUrl
      if (originalToken !== undefined) process.env.API_SERVICE_TOKEN = originalToken
    }
  })

  test("an env override returning null drops every beacon without calling fetch", async () => {
    const spy = spyOn(globalThis, "fetch")
    try {
      const route = createAnalyticsRoute({ app: "docs", env: () => null, log: () => {} })
      expect((await route(post({ kind: "pageview", path: "/" }))).status).toBe(204)
      await Bun.sleep(20)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

test("clientIp prefers x-real-ip, then the first x-forwarded-for hop", () => {
  expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe(
    "1.1.1.1"
  )
  expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2")
  expect(clientIp(new Headers())).toBeUndefined()
})

test("anonymousClientId hashes the ip and is undefined without one", async () => {
  expect(await anonymousClientId("203.0.113.9")).toMatch(/^telemetry:[0-9a-f]{32}$/)
  expect(await anonymousClientId(undefined)).toBeUndefined()
})
