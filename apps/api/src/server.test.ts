import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient, Note } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { createEventsHandler, isEventStream } from "./server"
import { auth, signUpWithWorkspace, start } from "./test-server"

// A real Bun.serve on an ephemeral port with a private database: every test goes over HTTP.
let app: Awaited<ReturnType<typeof start>>
let client: ApiClient
/** The session token of the account `client` is signed in as, for raw REST calls. */
let token: string
/** The workspace `client` owns, where its notes go. */
let workspaceId: number

beforeAll(async () => {
  app = await start()
  ;({ client, token, workspaceId } = await signUpWithWorkspace(app))
})

afterAll(() => app.stop())

const url = (path: string) => new URL(path, app.server.url)

describe("native routes", () => {
  test("GET /health answers OK", async () => {
    const res = await fetch(url("/health"))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("OK")
  })

  test("unknown paths are JSON 404s", async () => {
    const res = await fetch(url("/nope"))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      defined: false,
      code: "NOT_FOUND",
      status: 404,
      message: "Not found",
    })
  })
})

describe("createEventsHandler", () => {
  /** A fake Bun `server`: just enough to satisfy `requestIP` (the rate limiter's key) and record
   * every `timeout` call, in order. */
  function fakeServer() {
    const calls: number[] = []
    return {
      calls,
      server: {
        requestIP: () => null,
        timeout: (_req: Request, seconds: number) => {
          calls.push(seconds)
        },
      },
    }
  }
  const noopProtect =
    (handler: (req: Request) => Response | Promise<Response>) => async (req: Request) =>
      handler(req)
  const req = () => new Request("http://events.test/events/workspaces/1")

  test("turns the idle timeout off before the handler runs, and back on after a non-stream answer", async () => {
    const order: string[] = []
    const { calls, server } = fakeServer()
    const route = createEventsHandler(
      noopProtect,
      async () => {
        order.push("handler")
        return new Response("no")
      },
      10
    )
    const res = await route(req(), server)
    order.push(`result:${res.status}`)
    expect(calls).toEqual([0, 10])
    // The idle timeout is off before the handler is even awaited, not switched off and on around it.
    expect(order).toEqual(["handler", "result:200"])
  })

  test("leaves the idle timeout off once the answer is an event stream", async () => {
    const { calls, server } = fakeServer()
    const route = createEventsHandler(
      noopProtect,
      async () => new Response("", { headers: { "content-type": "text/event-stream" } }),
      10
    )
    const res = await route(req(), server)
    expect(isEventStream(res)).toBe(true)
    expect(calls).toEqual([0])
  })

  test("restores a custom idle timeout, not a hard-coded one", async () => {
    const { calls, server } = fakeServer()
    const route = createEventsHandler(noopProtect, async () => new Response("no"), 42)
    await route(req(), server)
    expect(calls).toEqual([0, 42])
  })

  test("restores the idle timeout and rethrows when the handler throws", async () => {
    const { calls, server } = fakeServer()
    const route = createEventsHandler(
      noopProtect,
      async () => {
        throw new Error("database error on connect")
      },
      10
    )
    await expect(route(req(), server)).rejects.toThrow("database error on connect")
    expect(calls).toEqual([0, 10])
  })
})

describe("typed RPC client", () => {
  test("creates, finds and lists notes", async () => {
    const created = await client.notes.create({ workspaceId, title: "First note" })
    expect(created).toMatchObject({
      id: 1,
      title: "First note",
      body: "",
      authorId: expect.any(Number),
    })
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false)

    expect(await client.notes.find({ workspaceId, id: created.id })).toEqual(created)
    expect((await client.notes.list({ workspaceId })).items).toContainEqual(created)
  })

  test("a missing note is the contract's NOT_FOUND error", async () => {
    const { error, isDefined } = await safe(client.notes.find({ workspaceId, id: 9_999 }))
    expect(isDefined).toBe(true)
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 })
  })

  test("invalid input is rejected before the handler runs", async () => {
    const { error } = await safe(client.notes.create({ workspaceId, title: "" }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", status: 400 })
  })
})

describe("REST / OpenAPI transport", () => {
  test("POST /openapi/notes returns 201 and GET reads it back", async () => {
    const res = await fetch(url("/openapi/notes"), {
      method: "POST",
      headers: { ...auth, "x-session-token": token, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, title: "Via REST", body: "hello" }),
    })
    expect(res.status).toBe(201)
    const note = (await res.json()) as Note

    const read = await fetch(url(`/openapi/notes/${note.id}?workspaceId=${workspaceId}`), {
      headers: { ...auth, "x-session-token": token },
    })
    expect(await read.json()).toEqual(note)
  })

  test("serves a generated OpenAPI spec", async () => {
    const res = await fetch(url("/openapi/spec.json"))
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(spec.openapi).toStartWith("3.")
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(["/notes", "/notes/{id}"]))
  })
})

describe("protection", () => {
  test("RPC without the token is UNAUTHORIZED, surfaced by the typed client", async () => {
    const anonymous: ApiClient = createORPCClient(
      new RPCLink({ url: new URL("/rpc", app.server.url).href })
    )
    const { error } = await safe(anonymous.notes.find({ workspaceId: 1, id: 1 }))
    // The guard's message, not the session middleware's: the request never reached oRPC.
    expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401, message: "Unauthorized" })
  })

  test("REST with a wrong token is 401 in the shared shape", async () => {
    const res = await fetch(url("/openapi/notes"), { headers: { authorization: "Bearer nope" } })
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toBe("Bearer")
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" })
  })

  test("a foreign Origin is FORBIDDEN", async () => {
    const res = await fetch(url("/openapi/notes"), {
      headers: { ...auth, origin: "https://evil.example" },
    })
    expect(res.status).toBe(403)
  })

  test("docs and spec stay open", async () => {
    expect((await fetch(url("/openapi"))).status).toBe(200)
    expect((await fetch(url("/openapi/spec.json"))).status).toBe(200)
  })

  test("over the limit is 429 with Retry-After", async () => {
    const limited = await start({
      rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      const get = () => fetch(new URL("/openapi/notes/1", limited.server.url), { headers: auth })
      await (await get()).text()
      const res = await get()
      expect(res.status).toBe(429)
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0)
      expect(await res.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("a body over the cap is refused before any handler runs", async () => {
    const small = await start({ maxBodyBytes: 1_024 })
    try {
      const res = await fetch(new URL("/openapi/notes", small.server.url), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ title: "big", body: "x".repeat(5_000) }),
      })
      expect(res.status).toBe(413)
    } finally {
      await small.stop()
    }
  })

  test("a 1 MB body to a non-upload procedure is 413", async () => {
    const res = await fetch(url("/rpc/notes/create"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, title: "x", body: "y".repeat(1_000_000) }),
    })
    expect(res.status).toBe(413)
  })

  test("a 1.5 MB avatar upload is not refused by size: it reaches the handler", async () => {
    const bigJunk = new File([new Uint8Array(1.5 * 1024 * 1024)], "x.png", { type: "image/png" })
    const [error] = await safe(client.account.avatar.set({ file: bigJunk }))
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a 4 MB body is 413 even on an upload path", async () => {
    const res = await fetch(url("/rpc/account/avatar/set"), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: "x".repeat(4 * 1024 * 1024),
    })
    expect(res.status).toBe(413)
  })

  test("a 1 MB POST to a non-upload /openapi path is 413", async () => {
    const res = await fetch(url("/openapi/notes"), {
      method: "POST",
      headers: { ...auth, "x-session-token": token, "content-type": "application/json" },
      body: JSON.stringify({ workspaceId, title: "x", body: "y".repeat(1_000_000) }),
    })
    expect(res.status).toBe(413)
  })

  // Same REST path as the upload, but DELETE carries no body: it must not ride the bigger cap.
  test("a DELETE to /openapi/account/avatar over the body cap is still 413", async () => {
    const res = await fetch(url("/openapi/account/avatar"), {
      method: "DELETE",
      headers: { ...auth, "x-session-token": token, "content-type": "application/json" },
      body: "x".repeat(1_000_000),
    })
    expect(res.status).toBe(413)
  })

  // Outside `protect` (Stripe sends no token), but not outside the body cap: the 6 MB server-wide
  // ceiling exists for uploads only.
  test("a webhook POST over the body cap is 413", async () => {
    const res = await fetch(url("/billing/webhook"), {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=x" },
      body: "x".repeat(1_000_000),
    })
    expect(res.status).toBe(413)
  })

  test("x-api-client-id keys the rate limit per client", async () => {
    const keys: string[] = []
    const keyed = await start({
      rateLimiter: {
        hit: (k) => {
          keys.push(k)
          return { allowed: true }
        },
      },
    })
    try {
      await (
        await fetch(new URL("/openapi/notes/1", keyed.server.url), {
          headers: { ...auth, "x-api-client-id": "user-7" },
        })
      ).text()
      expect(keys).toEqual(["client:user-7"])
    } finally {
      await keyed.stop()
    }
  })
})

describe("pagination", () => {
  test("pages newest first with a cursor until nextCursor is null", async () => {
    const paged = await start()
    try {
      const { client: c, workspaceId: w } = await signUpWithWorkspace(paged)
      for (let i = 1; i <= 5; i++) await c.notes.create({ workspaceId: w, title: `n${i}` })

      const first = await c.notes.list({ workspaceId: w, limit: 2 })
      expect(first.items.map((n) => n.title)).toEqual(["n5", "n4"])
      expect(first.nextCursor).toBe(first.items[1]?.id ?? null)

      const second = await c.notes.list({
        workspaceId: w,
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      })
      expect(second.items.map((n) => n.title)).toEqual(["n3", "n2"])

      const last = await c.notes.list({
        workspaceId: w,
        limit: 2,
        cursor: second.nextCursor ?? undefined,
      })
      expect(last.items.map((n) => n.title)).toEqual(["n1"])
      expect(last.nextCursor).toBeNull()

      const beyond = await c.notes.list({ workspaceId: w, cursor: 1 })
      expect(beyond).toEqual({ items: [], nextCursor: null })

      expect((await c.notes.list({ workspaceId: w })).items).toHaveLength(5)
    } finally {
      await paged.stop()
    }
  })

  test("REST query bounds are a 400 in the shared shape", async () => {
    for (const query of ["limit=0", "limit=101", "cursor=0", "cursor=abc", "limit=2.5"]) {
      const res = await fetch(url(`/openapi/notes?workspaceId=${workspaceId}&${query}`), {
        headers: { ...auth, "x-session-token": token },
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "BAD_REQUEST" })
    }
    const ok = await fetch(url(`/openapi/notes?workspaceId=${workspaceId}&limit=1`), {
      headers: { ...auth, "x-session-token": token },
    })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ items: expect.any(Array) })
  })
})

describe("lifecycle", () => {
  test("/ready answers OK, then 503 once shutdown starts", async () => {
    const own = await start({ graceMs: 300 })
    const ready = () => fetch(new URL("/ready", own.server.url))
    expect(await (await ready()).text()).toBe("OK")
    own.lifecycle.shutdown(own.server)
    const during = await ready()
    expect(during.status).toBe(503)
    expect(await during.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    // own.stop() awaits the same shutdown (createLifecycle.shutdown is idempotent) and then runs
    // the database cleanup, so the throwaway database this test created gets dropped too.
    await own.stop()
  })

  test("/ready answers 503 once the database ping outlasts readyTimeoutMs", async () => {
    const own = await start({ queryDelayMs: 400, readyTimeoutMs: 100 })
    try {
      const started = performance.now()
      const res = await fetch(new URL("/ready", own.server.url))
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "Not ready (timed out)",
      })
      expect(performance.now() - started).toBeLessThan(400)
    } finally {
      await own.stop()
    }
  })
})

describe("request deadline", () => {
  test("a request still waiting on the database at requestTimeoutMs answers 503", async () => {
    // Every statement waits 600 ms; the deadline is 200 ms.
    const own = await start({ queryDelayMs: 600, requestTimeoutMs: 200 })
    try {
      const started = performance.now()
      const res = await fetch(new URL("/rpc/notes/list", own.server.url), {
        method: "POST",
        headers: {
          ...auth,
          "x-session-token": "not-a-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({ json: { workspaceId: 1 } }),
      })
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "The request took too long. It may still complete — check before retrying.",
      })
      expect(res.headers.get("x-request-id")).toBeTruthy()
      expect(performance.now() - started).toBeLessThan(600)

      // An event stream is exempt: it answers its own 401 once the session lookup finishes.
      const stream = await fetch(new URL("/events/workspaces/1", own.server.url), {
        headers: { ...auth, "x-session-token": "not-a-session" },
      })
      expect(stream.status).toBe(401)
      await Bun.sleep(700) // let the discarded handlers finish before the database closes
    } finally {
      await own.stop()
    }
  })
})

test("once shutdown begins, the in-process job worker claims nothing more", async () => {
  const own = await start({ jobsWorker: true, jobsPollMs: 100, graceMs: 400 })
  const realClaim = own.db.jobs.claim
  let claims = 0
  own.db.jobs.claim = (...args) => {
    claims++
    return realClaim(...args)
  }
  await Bun.sleep(250)
  expect(claims).toBeGreaterThan(0) // polling while up
  const stopping = own.stop()
  const atShutdown = claims
  // Due work arriving during the grace period stays unclaimed.
  await own.db.jobs.insert({
    name: "test.any",
    payload: "{}",
    maxAttempts: 1,
    runAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  })
  await Bun.sleep(300)
  expect(claims).toBe(atShutdown)
  await stopping
})
