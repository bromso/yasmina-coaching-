import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { entitlementsFor, type WorkspaceSummary } from "@repo/api-contract"
import type { ChatProxyDeps, ChatUser } from "./chat-proxy"
import { MissingEnvError } from "./env"

// The gate reads the request's locale through @repo/session, whose `server-only` import throws
// outside a react-server bundle: stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { chatEntitlementGate, createChatProxy } = await import("./chat-proxy")

type Seen = { headers: Headers; body: string }
const servers: Array<{ stop: (force?: boolean) => unknown }> = []
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})

/** A stand-in for apps/ai: records what it receives and answers with `respond`. */
function fakeAi(respond: (req: Request) => Response | Promise<Response>) {
  const seen: Seen[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      seen.push({ headers: req.headers, body: await req.clone().text() })
      return respond(req)
    },
  })
  servers.push(server)
  return { url: server.url.origin, seen }
}

const logs: Array<{ message: string; error: unknown }> = []
beforeEach(() => {
  logs.length = 0
})

function proxy(url: string, overrides: Partial<ChatProxyDeps> = {}) {
  return createChatProxy({
    requireUser: async () => ({ id: "user-1" }),
    env: () => ({ AI_SERVICE_URL: url, AI_SERVICE_TOKEN: "secret-token" }),
    log: (message, error) => logs.push({ message, error }),
    ...overrides,
  })
}

const BODY = JSON.stringify({ messages: [{ id: "1", role: "user", parts: [] }] })
const chatRequest = (signal?: AbortSignal, contentType = "application/json") =>
  new Request("http://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": contentType },
    body: BODY,
    signal,
  })

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(10)
  }
}

test("forwards the request's own x-request-id to apps/ai, and only a well-formed one", async () => {
  const ai = fakeAi(() => new Response("data: [DONE]\n\n"))
  const withId = (id: string) =>
    new Request("http://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": id },
      body: BODY,
    })
  await (await proxy(ai.url)(withId("req-chat-00001"))).text()
  await (await proxy(ai.url)(withId("bad id"))).text()
  expect(ai.seen.map((s) => s.headers.get("x-request-id"))).toEqual(["req-chat-00001", null])
})

test("forwards the token, the user id and the body, and streams the reply back", async () => {
  const sse = 'data: {"type":"start"}\n\ndata: [DONE]\n\n'
  const ai = fakeAi(
    () =>
      new Response(sse, {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      })
  )
  const res = await proxy(ai.url)(chatRequest())

  expect(ai.seen[0]?.headers.get("authorization")).toBe("Bearer secret-token")
  expect(ai.seen[0]?.headers.get("x-ai-client-id")).toBe("user-1")
  expect(ai.seen[0]?.body).toBe(BODY)
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toBe("text/event-stream")
  expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1")
  expect(await res.text()).toBe(sse)
})

test("forwards only allowlisted headers from the AI service", async () => {
  const ai = fakeAi(
    () =>
      new Response("ok", {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "content-encoding": "identity",
          "content-length": "2",
          "x-internal": "pod-7",
          "set-cookie": "upstream=1",
        },
      })
  )
  const res = await proxy(ai.url)(chatRequest())
  expect(res.headers.get("content-type")).toBe("text/event-stream")
  expect(res.headers.get("cache-control")).toBe("no-cache")
  expect(res.headers.get("content-encoding")).toBeNull()
  expect(res.headers.get("content-length")).toBeNull()
  expect(res.headers.get("x-internal")).toBeNull()
  expect(res.headers.get("set-cookie")).toBeNull()
  expect(await res.text()).toBe("ok")
})

test("a non-JSON POST is 415 and never reaches the auth check or the AI service", async () => {
  const ai = fakeAi(() => new Response("unreachable"))
  let authChecked = false
  const res = await proxy(ai.url, {
    requireUser: async () => {
      authChecked = true
      return { id: "user-1" }
    },
  })(chatRequest(undefined, "text/plain"))
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ message: "Expected application/json" })
  expect(authChecked).toBe(false)
  expect(ai.seen).toHaveLength(0)
})

test("the JSON content-type check is case-insensitive and allows parameters", async () => {
  const ai = fakeAi(() => new Response("ok"))
  const res = await proxy(ai.url)(chatRequest(undefined, "Application/JSON; charset=utf-8"))
  expect(res.status).toBe(200)
  expect(ai.seen).toHaveLength(1)
})

test("no user is 401 and the AI service is never called", async () => {
  const ai = fakeAi(() => new Response("unreachable"))
  const res = await proxy(ai.url, { requireUser: async () => null })(chatRequest())
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ message: "Sign in required" })
  expect(ai.seen).toHaveLength(0)
})

test("a cross-site request is refused before the auth check or the AI service", async () => {
  const ai = fakeAi(() => new Response("unreachable"))
  let authChecked = false
  const res = await proxy(ai.url, {
    csrf: (req) =>
      req.headers.get("sec-fetch-site") === "cross-site"
        ? new Response(null, { status: 403 })
        : null,
    requireUser: async () => {
      authChecked = true
      return { id: 1 }
    },
  })(
    new Request("http://app.brand.localhost:3001/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: BODY,
    })
  )
  expect(res.status).toBe(403)
  expect(authChecked).toBe(false)
  expect(ai.seen).toHaveLength(0)
})

test("the user's numeric id becomes the AI client id", async () => {
  const ai = fakeAi(() => new Response("ok"))
  const res = await proxy(ai.url, { requireUser: async () => ({ id: 42 }) })(chatRequest())
  expect(res.status).toBe(200)
  expect(ai.seen[0]?.headers.get("x-ai-client-id")).toBe("42")
})

test("an upstream 429 keeps its status and Retry-After, with the proxy's own message", async () => {
  const ai = fakeAi(() =>
    Response.json(
      { message: "Too many requests" },
      { status: 429, headers: { "retry-after": "7" } }
    )
  )
  const res = await proxy(ai.url)(chatRequest())
  expect(res.status).toBe(429)
  expect(res.headers.get("retry-after")).toBe("7")
  expect(await res.json()).toEqual({ message: "Too many messages. Wait a moment and try again." })
  expect(logs).toHaveLength(0)
})

for (const status of [401, 403]) {
  test(`an upstream ${status} is the app's credentials, so it is a logged generic 502`, async () => {
    const ai = fakeAi(() => Response.json({ message: "Invalid token" }, { status }))
    const res = await proxy(ai.url)(chatRequest())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ message: "AI service unavailable" })
    expect(logs).toHaveLength(1)
    expect(logs[0]?.message).toBe("AI service rejected the app's credentials")
    expect(String(logs[0]?.error)).toContain(String(status))
  })
}

for (const status of [400, 413, 500, 503]) {
  test(`an upstream ${status} is a logged generic 502; apps/ai's text never reaches the browser`, async () => {
    const ai = fakeAi(() => Response.json({ message: "Internal detail" }, { status }))
    const res = await proxy(ai.url)(chatRequest())
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(JSON.parse(text)).toEqual({ message: "AI service unavailable" })
    expect(text).not.toContain("Internal detail")
    expect(logs).toHaveLength(1)
    expect(String(logs[0]?.error)).toContain(String(status))
  })
}

test("an unreachable AI service is a generic 502; the details stay in the log", async () => {
  const gone = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const url = gone.url.origin
  gone.stop(true)

  const res = await proxy(url)(chatRequest())
  expect(res.status).toBe(502)
  const text = await res.text()
  expect(JSON.parse(text)).toEqual({ message: "AI service unavailable" })
  expect(text).not.toContain("127.0.0.1")
  expect(logs).toHaveLength(1)
})

describe("the proxy's own refusals are in the request's language", () => {
  const swedish = () =>
    new Request("http://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "locale=sv" },
      body: BODY,
    })

  test("no user: 401 in Swedish", async () => {
    const ai = fakeAi(() => new Response("unreachable"))
    const res = await proxy(ai.url, { requireUser: async () => null })(swedish())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: "Logga in för att chatta" })
  })

  test("an unreachable AI service: 502 in Swedish", async () => {
    const gone = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
    const url = gone.url.origin
    gone.stop(true)
    const res = await proxy(url)(swedish())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ message: "AI-tjänsten är inte tillgänglig" })
  })

  test("the app's rejected credentials: 502 in Swedish", async () => {
    const ai = fakeAi(() => new Response(null, { status: 401 }))
    const res = await proxy(ai.url)(swedish())
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ message: "AI-tjänsten är inte tillgänglig" })
  })

  test("an upstream 429: the proxy's own message, in Swedish", async () => {
    const ai = fakeAi(() => Response.json({ message: "Too many requests" }, { status: 429 }))
    const res = await proxy(ai.url)(swedish())
    expect(res.status).toBe(429)
    expect(res.headers.get("retry-after")).toBeNull()
    expect(await res.json()).toEqual({
      message: "För många meddelanden. Vänta en stund och försök igen.",
    })
  })

  test("missing configuration: 503 in Swedish", async () => {
    const res = await proxy("http://unused", {
      env: () => {
        throw new MissingEnvError("AI_SERVICE_TOKEN")
      },
    })(swedish())
    expect(await res.json()).toEqual({ message: "Chatten är inte konfigurerad" })
  })
})

describe("a signed-in user's saved locale outranks the request's", () => {
  const english = () =>
    new Request("http://app.test/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "locale=en",
        "accept-language": "en-US",
      },
      body: BODY,
    })
  const swede = async () => ({ id: "user-1", locale: "sv" as const })

  test("the proxy's own refusals use it", async () => {
    const res = await proxy("http://unused", {
      requireUser: swede,
      env: () => {
        throw new MissingEnvError("AI_SERVICE_TOKEN")
      },
    })(english())
    expect(await res.json()).toEqual({ message: "Chatten är inte konfigurerad" })
    const ai = fakeAi(() => Response.json({ message: "Too many requests" }, { status: 429 }))
    const limited = await proxy(ai.url, { requireUser: swede })(english())
    expect(await limited.json()).toEqual({
      message: "För många meddelanden. Vänta en stund och försök igen.",
    })
  })

  test("the plan gate uses it", async () => {
    const gate = chatEntitlementGate(async () => ({ workspace: null }))
    const res = await gate(english(), { id: "user-1", locale: "sv" })
    expect(await res?.json()).toEqual({ message: "Uppgradera för att använda chatten" })
  })

  test("no saved choice: the request's language still applies", async () => {
    const gate = chatEntitlementGate(async () => ({ workspace: null }))
    const res = await gate(english(), { id: "user-1" })
    expect(await res?.json()).toEqual({ message: "Upgrade to use chat" })
  })
})

test("missing configuration is 503", async () => {
  const res = await proxy("http://unused", {
    env: () => {
      throw new MissingEnvError("AI_SERVICE_TOKEN")
    },
  })(chatRequest())
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ message: "Chat is not configured" })
  expect(logs).toHaveLength(1)
})

test("a browser that leaves before the AI service answers is 499, not an error", async () => {
  const ai = fakeAi(() => new Promise<Response>(() => {}))
  const controller = new AbortController()
  const pending = proxy(ai.url)(chatRequest(controller.signal))
  await waitFor(() => ai.seen.length === 1)
  controller.abort()
  const res = await pending
  expect(res.status).toBe(499)
  expect(logs).toHaveLength(0)
})

test("a browser that leaves mid-body is 499, not an error", async () => {
  const ai = fakeAi(() => new Response("unreachable"))
  const controller = new AbortController()
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(new TextEncoder().encode('{"messages":'))
      controller.signal.addEventListener("abort", () =>
        stream.error(new DOMException("The client went away", "AbortError"))
      )
    },
  })
  const req = new Request("http://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: controller.signal,
  })
  const pending = proxy(ai.url)(req)
  await Bun.sleep(20)
  controller.abort()
  const res = await pending
  expect(res.status).toBe(499)
  expect(ai.seen).toHaveLength(0)
  expect(logs).toHaveLength(0)
})

test("a browser disconnect cancels the call to the AI service", async () => {
  let upstreamAborted = false
  const ai = fakeAi((req) => {
    req.signal.addEventListener("abort", () => {
      upstreamAborted = true
    })
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: thinking\n\n"))
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    )
  })
  const controller = new AbortController()
  const res = await proxy(ai.url)(chatRequest(controller.signal))
  await res.body?.getReader().read()
  controller.abort()
  await waitFor(() => upstreamAborted)
})

test("an authorize refusal short-circuits after the user check, before any upstream call", async () => {
  const ai = fakeAi(() => new Response("ok"))
  const seenUsers: unknown[] = []
  const res = await proxy(ai.url, {
    authorize: async (_req, user) => {
      seenUsers.push(user)
      return Response.json({ message: "Upgrade to use chat" }, { status: 403 })
    },
    env: () => {
      throw new Error("env must not be read after a refusal")
    },
  })(chatRequest())
  expect(res.status).toBe(403)
  expect(await res.json()).toEqual({ message: "Upgrade to use chat" })
  expect(seenUsers).toEqual([{ id: "user-1" }])
  expect(ai.seen).toEqual([])
})

test("authorize is not consulted without a user, and null lets the request through", async () => {
  const ai = fakeAi(() => new Response("ok"))
  let calls = 0
  const authorize = async () => {
    calls++
    return null
  }
  const anonymous = await proxy(ai.url, { requireUser: async () => null, authorize })(chatRequest())
  expect(anonymous.status).toBe(401)
  expect(calls).toBe(0)
  const allowed = await proxy(ai.url, { authorize })(chatRequest())
  expect(allowed.status).toBe(200)
  expect(calls).toBe(1)
  expect(ai.seen.length).toBe(1)
})

describe("chatEntitlementGate", () => {
  const workspace = (plan: "pro" | null, requireTwoFactor = false): WorkspaceSummary => ({
    id: 1,
    name: "W",
    slug: "w",
    createdAt: "2026-01-01T00:00:00.000Z",
    role: "owner",
    memberCount: 1,
    entitlements: entitlementsFor({
      subscription: plan
        ? {
            plan,
            interval: "month",
            status: "active",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          }
        : null,
      memberCount: 1,
      portalAvailable: false,
    }),
    logoUrl: null,
    requireTwoFactor,
  })
  const gate = (
    result: { workspace: WorkspaceSummary | null; error?: unknown },
    headers: Record<string, string> = {},
    user: ChatUser = { id: "user-1" }
  ) => {
    const req = new Request("http://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: BODY,
    })
    return chatEntitlementGate(async () => result)(req, user)
  }

  test("a workspace requiring two-step refuses a member without it, before the plan", async () => {
    const refused: ChatUser[] = [
      { id: "user-1", twoFactorSatisfied: false },
      // A caller that does not say is refused too: the gate fails closed.
      { id: "user-1" },
    ]
    for (const plan of ["pro", null] as const) {
      for (const user of refused) {
        const res = await gate({ workspace: workspace(plan, true) }, {}, user)
        expect(res?.status).toBe(403)
        expect(await res?.json()).toEqual({
          message: "Turn on two-step verification to use chat in this workspace",
        })
      }
    }
    const sv = await gate({ workspace: workspace("pro", true) }, { cookie: "locale=sv" })
    expect(await sv?.json()).toEqual({
      message: "Slå på tvåstegsverifiering för att använda chatten i den här arbetsytan",
    })
  })

  test("a member with two-step passes a workspace requiring it; none is needed elsewhere", async () => {
    const satisfied = { id: "user-1", twoFactorSatisfied: true }
    expect(await gate({ workspace: workspace("pro", true) }, {}, satisfied)).toBeNull()
    const free = await gate({ workspace: workspace(null, true) }, {}, satisfied)
    expect(await free?.json()).toEqual({ message: "Upgrade to use chat" })
    const notRequired = { id: "user-1", twoFactorSatisfied: false }
    expect(await gate({ workspace: workspace("pro") }, {}, notRequired)).toBeNull()
  })

  test("a Pro workspace passes", async () => {
    expect(await gate({ workspace: workspace("pro") })).toBeNull()
  })

  test("a Free workspace or none is 403 with the feature message", async () => {
    for (const result of [{ workspace: workspace(null) }, { workspace: null }]) {
      const res = await gate(result)
      expect(res?.status).toBe(403)
      expect(await res?.json()).toEqual({ message: "Upgrade to use chat" })
    }
  })

  test("a workspace that could not be resolved is 503, not an upsell", async () => {
    const res = await gate({ workspace: null, error: new Error("api down") })
    expect(res?.status).toBe(503)
    expect(await res?.json()).toEqual({ message: "Chat is temporarily unavailable" })
  })

  test("the refusal is in the request's language: the locale cookie, then Accept-Language", async () => {
    const swedish: Record<string, string>[] = [
      { cookie: "locale=sv" },
      { "accept-language": "sv-SE,sv;q=0.9" },
    ]
    for (const headers of swedish) {
      const res = await gate({ workspace: workspace(null) }, headers)
      expect(res?.status).toBe(403)
      expect(await res?.json()).toEqual({ message: "Uppgradera för att använda chatten" })
    }
    const down = await gate(
      { workspace: null, error: new Error("api down") },
      { cookie: "locale=sv" }
    )
    expect(await down?.json()).toEqual({ message: "Chatten är tillfälligt otillgänglig" })
  })

  test("a cookie naming English wins over a Swedish browser", async () => {
    const res = await gate(
      { workspace: null },
      { cookie: "locale=en", "accept-language": "sv-SE,sv;q=0.9" }
    )
    expect(await res?.json()).toEqual({ message: "Upgrade to use chat" })
  })
})
