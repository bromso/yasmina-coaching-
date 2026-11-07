import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { createLogger } from "@repo/log"
import { currentRequestId } from "@repo/log/context"
import { apiRouteOf, legacyLog, withRequest } from "./request-context"
import { auth, start } from "./test-server"

type Line = Record<string, unknown>

let app: Awaited<ReturnType<typeof start>>
const lines: string[] = []
const json = (): Line[] => lines.map((line) => JSON.parse(line) as Line)
const accessLines = () => json().filter((line) => line.message === "request")

beforeAll(async () => {
  app = await start({
    logger: createLogger({ service: "api", format: "json", write: (line) => lines.push(line) }),
  })
})

afterAll(() => app.stop())

beforeEach(() => {
  lines.length = 0
})

const url = (path: string) => new URL(path, app.server.url)

/** `auth.providers` over RPC: a protected call with no session needed. */
const providers = (headers: Record<string, string> = {}, path = "/rpc/auth/providers") =>
  fetch(url(path), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  })

describe("request ids", () => {
  test("a protected call without x-request-id gets a generated id echoed back", async () => {
    const res = await providers(auth)
    expect(res.status).toBe(200)
    const id = res.headers.get("x-request-id")
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  test("with the bearer, a valid x-request-id is kept", async () => {
    const res = await providers({ ...auth, "x-request-id": "test-req-0001" })
    expect(res.headers.get("x-request-id")).toBe("test-req-0001")
    expect(accessLines()[0]?.requestId).toBe("test-req-0001")
  })

  test("with the bearer, a malformed x-request-id is replaced", async () => {
    const res = await providers({ ...auth, "x-request-id": "x" })
    const id = res.headers.get("x-request-id")
    expect(id).not.toBe("x")
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  test("without the bearer (401) a supplied id is never echoed; a new one is", async () => {
    const res = await providers({ "x-request-id": "test-req-0001" })
    expect(res.status).toBe(401)
    const id = res.headers.get("x-request-id")
    expect(id).not.toBe("test-req-0001")
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const [line] = accessLines()
    expect(line).toMatchObject({ status: 401, requestId: id })
    expect(line).not.toHaveProperty("clientId")
  })
})

describe("access log", () => {
  test("one line per request: method, route, status, ms, id and client id", async () => {
    const res = await providers({ ...auth, "x-api-client-id": "client-1" })
    const access = accessLines()
    expect(access).toHaveLength(1)
    expect(access[0]).toMatchObject({
      level: "info",
      service: "api",
      method: "POST",
      route: "/rpc/auth/providers",
      status: 200,
      clientId: "client-1",
      requestId: res.headers.get("x-request-id"),
    })
    expect(typeof access[0]?.ms).toBe("number")
  })

  test("no line for /health", async () => {
    await fetch(url("/health"))
    expect(accessLines()).toHaveLength(0)
  })

  test("the line never carries the query string or a raw id", async () => {
    await fetch(url("/openapi/admin/users/123?secret=abc"), { headers: auth })
    const text = lines.join("\n")
    expect(text).not.toContain("secret=abc")
    expect(text).not.toContain("123")
    expect(accessLines()[0]).toMatchObject({ route: "openapi:admin" })
  })

  test("an unknown procedure path is labelled other", async () => {
    await providers(auth, "/rpc/made/up/12345")
    expect(accessLines()[0]).toMatchObject({ route: "other", status: 404 })
  })
})

describe("apiRouteOf", () => {
  const route = (path: string) => apiRouteOf(new Request(`http://x${path}`))
  test("maps paths to bounded labels", () => {
    expect(route("/rpc/notes/create")).toBe("/rpc/notes/create")
    expect(route("/rpc/notes/nope")).toBe("other")
    expect(route("/openapi/workspaces/12/logo")).toBe("openapi:workspaces")
    expect(route("/openapi/zzz/1")).toBe("other")
    expect(route("/events/workspaces/42")).toBe("events")
    expect(route("/events/me")).toBe("events.me")
    expect(route("/billing/webhook")).toBe("billing.webhook")
    expect(route("/v1/notes/12")).toBe("v1:notes")
    expect(route("/v1/workspace")).toBe("v1:workspace")
    expect(route("/v1/members?cursor=3")).toBe("v1:members")
    expect(route("/v1/secret-thing")).toBe("other")
    expect(route("/whatever")).toBe("other")
  })
})

describe("withRequest", () => {
  const capture = () => {
    const out: string[] = []
    const logger = createLogger({ service: "t", format: "json", write: (l) => out.push(l) })
    return { logger, out: () => out.map((l) => JSON.parse(l) as Line) }
  }

  test("runs the handler in the request context and calls record", async () => {
    const { logger } = capture()
    const records: unknown[][] = []
    let seen: string | undefined
    const wrapped = withRequest(
      async () => {
        await Bun.sleep(1)
        seen = currentRequestId()
        return new Response("ok")
      },
      {
        trusted: () => true,
        logger,
        routeOf: () => "r",
        record: (...args) => records.push(args),
      }
    )
    const req = new Request("http://x/", { headers: { "x-request-id": "abcdefgh" } })
    const res = await wrapped(req, null)
    expect(seen).toBe("abcdefgh")
    expect(res.headers.get("x-request-id")).toBe("abcdefgh")
    expect(records).toHaveLength(1)
    expect(records[0]?.slice(0, 3)).toEqual(["r", "GET", 200])
  })

  test("clones a response whose headers are immutable", async () => {
    const { logger } = capture()
    const immutable = Response.redirect("http://x/next", 302)
    const wrapped = withRequest(() => immutable, {
      trusted: () => false,
      logger,
      routeOf: () => "r",
    })
    const res = await wrapped(new Request("http://x/"), null)
    expect(res.status).toBe(302)
    expect(res.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  test("onError answers a throw inside the context", async () => {
    const { logger, out } = capture()
    const wrapped = withRequest(
      () => {
        throw new Error("boom")
      },
      {
        trusted: () => false,
        logger,
        routeOf: () => "r",
        onError: (error) => {
          logger.error("unhandled", { error })
          return new Response("no", { status: 500 })
        },
      }
    )
    const res = await wrapped(new Request("http://x/"), null)
    expect(res.status).toBe(500)
    const id = res.headers.get("x-request-id")
    const [errorLine, access] = out()
    expect(errorLine).toMatchObject({ level: "error", message: "unhandled", requestId: id })
    expect(access).toMatchObject({ message: "request", status: 500, requestId: id })
  })

  test("without onError a throw still gets an access line and a record before it propagates", async () => {
    const { logger, out } = capture()
    const records: unknown[][] = []
    const wrapped = withRequest(
      () => {
        throw new Error("boom")
      },
      { trusted: () => false, logger, routeOf: () => "r", record: (...args) => records.push(args) }
    )
    await expect(wrapped(new Request("http://x/"), null)).rejects.toThrow("boom")
    expect(out()[0]).toMatchObject({ message: "request", status: 500, route: "r" })
    expect(typeof out()[0]?.requestId).toBe("string")
    expect(records[0]?.slice(0, 3)).toEqual(["r", "GET", 500])
  })

  test("trusted is checked once and handed to clientIdOf", async () => {
    const { logger, out } = capture()
    let checks = 0
    const seen: boolean[] = []
    const wrapped = withRequest(() => new Response("ok"), {
      trusted: () => {
        checks++
        return true
      },
      logger,
      routeOf: () => "r",
      clientIdOf: (_req, trusted) => {
        seen.push(trusted)
        return "anon:abc"
      },
    })
    await wrapped(new Request("http://x/"), null)
    expect(checks).toBe(1)
    expect(seen).toEqual([true])
    expect(out()[0]).toMatchObject({ clientId: "anon:abc" })
  })
})

describe("legacyLog", () => {
  test("info without an error, error with one", () => {
    const out: string[] = []
    const log = legacyLog(createLogger({ service: "t", format: "json", write: (l) => out.push(l) }))
    log("fine", null)
    log("broke", new Error("x"))
    const [a, b] = out.map((l) => JSON.parse(l) as Line)
    expect(a).toMatchObject({ level: "info", message: "fine" })
    expect(b).toMatchObject({ level: "error", message: "broke", error: { message: "x" } })
  })
})
