import { expect, test } from "bun:test"
import { createLogger } from "@repo/log"
import { currentRequestId } from "@repo/log/context"
import { DEFAULT_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MESSAGE, withRequest } from "./request-context"

type Line = Record<string, unknown>

function harness(timeoutMs?: number, onError?: (error: unknown) => Response) {
  const out: string[] = []
  const records: { route: string; status: number }[] = []
  const lines = () => out.map((line) => JSON.parse(line) as Line)
  const wrap = (handler: (req: Request) => Response | Promise<Response>) =>
    withRequest<undefined>(handler, {
      trusted: () => false,
      logger: createLogger({ service: "t", format: "json", write: (line) => out.push(line) }),
      routeOf: () => "/rpc/notes/list",
      record: (route, _method, status) => records.push({ route, status }),
      onError,
      timeoutMs,
    })
  return { wrap, lines, records }
}

const req = () => new Request("http://x.test/rpc/notes/list", { method: "POST" })

test("a handler past timeoutMs answers 503 in the standard error shape, logged and recorded", async () => {
  const { wrap, lines, records } = harness(50)
  let lateRan = false
  const handler = wrap(async () => {
    await Bun.sleep(200)
    lateRan = true
    return new Response("late")
  })
  const started = performance.now()
  const res = await handler(req(), undefined)
  expect(performance.now() - started).toBeLessThan(180)
  expect(res.status).toBe(503)
  expect(await res.json()).toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: REQUEST_TIMEOUT_MESSAGE,
  })
  const id = res.headers.get("x-request-id")
  expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
  const timedOut = lines().find((line) => line.message === "request timed out")
  expect(timedOut).toMatchObject({ level: "warn", requestId: id, timeoutMs: 50 })
  expect(lines().filter((line) => line.message === "request")).toEqual([
    expect.objectContaining({ status: 503, requestId: id }),
  ])
  expect(records).toEqual([{ route: "/rpc/notes/list", status: 503 }])
  // The handler keeps running and its late answer changes nothing.
  await Bun.sleep(250)
  expect(lateRan).toBe(true)
  expect(records).toHaveLength(1)
  expect(lines().filter((line) => line.message === "request")).toHaveLength(1)
})

test("timeoutResponse replaces the 503 body for a route with its own error shape", async () => {
  const out: string[] = []
  const handler = withRequest<undefined>(
    async () => {
      await Bun.sleep(200)
      return new Response("late")
    },
    {
      trusted: () => false,
      logger: createLogger({ service: "t", format: "json", write: (line) => out.push(line) }),
      routeOf: () => "v1:notes",
      timeoutMs: 50,
      timeoutResponse: () => Response.json({ error: { code: "internal" } }, { status: 503 }),
    }
  )
  const res = await handler(req(), undefined)
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ error: { code: "internal" } })
  expect(res.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9_-]{22}$/)
  const lines = out.map((line) => JSON.parse(line) as Line)
  expect(lines.find((line) => line.message === "request timed out")).toBeDefined()
  expect(lines.find((line) => line.message === "request")).toMatchObject({ status: 503 })
})

test("a handler answering in time is untouched", async () => {
  const { wrap, records } = harness(500)
  const res = await wrap(async () => {
    await Bun.sleep(10)
    return new Response("ok", { status: 201 })
  })(req(), undefined)
  expect(res.status).toBe(201)
  expect(await res.text()).toBe("ok")
  expect(records).toEqual([{ route: "/rpc/notes/list", status: 201 }])
})

test("the handler keeps the request id after its deadline", async () => {
  const { wrap } = harness(20)
  let lateId: string | undefined
  const res = await wrap(async () => {
    await Bun.sleep(60)
    lateId = currentRequestId()
    return new Response("late")
  })(req(), undefined)
  await Bun.sleep(100)
  expect(lateId).toBe(res.headers.get("x-request-id") ?? "missing")
})

test("a handler that throws after its deadline is logged once, never answered twice", async () => {
  const { wrap, lines, records } = harness(20)
  const res = await wrap(async () => {
    await Bun.sleep(60)
    throw new Error("late failure")
  })(req(), undefined)
  expect(res.status).toBe(503)
  await Bun.sleep(100)
  expect(records).toEqual([{ route: "/rpc/notes/list", status: 503 }])
  expect(lines().find((line) => line.message === "request failed after its timeout")).toMatchObject(
    { level: "error" }
  )
})

test("with onError, a late throw goes through onError and is still discarded", async () => {
  let handled = 0
  const { wrap, records } = harness(20, () => {
    handled++
    return new Response("handled", { status: 500 })
  })
  const res = await wrap(async () => {
    await Bun.sleep(60)
    throw new Error("late")
  })(req(), undefined)
  expect(res.status).toBe(503)
  await Bun.sleep(100)
  expect(handled).toBe(1)
  expect(records).toEqual([{ route: "/rpc/notes/list", status: 503 }])
})

test("a late streamed body is cancelled", async () => {
  const { wrap } = harness(20)
  let cancelled = false
  await wrap(async () => {
    await Bun.sleep(60)
    return new Response(
      new ReadableStream({
        cancel() {
          cancelled = true
        },
      })
    )
  })(req(), undefined)
  await Bun.sleep(100)
  expect(cancelled).toBe(true)
})

test("no timeoutMs means no deadline; the default is 30 s", async () => {
  const { wrap } = harness()
  const res = await wrap(async () => {
    await Bun.sleep(80)
    return new Response("slow but fine")
  })(req(), undefined)
  expect(res.status).toBe(200)
  expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000)
})
