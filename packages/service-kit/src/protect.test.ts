import { expect, test } from "bun:test"
import { clientKey, createProtect } from "./protect"
import type { RateLimiter } from "./rate-limit"

const server = { requestIP: () => ({ address: "10.0.0.1" }) }
const req = (headers: Record<string, string> = {}) =>
  new Request("http://svc.test/rpc/x", { method: "POST", headers })
const ok = () => new Response("handled")

test("clientKey prefers the named header, trimmed and capped, else the IP", () => {
  const key = clientKey("x-api-client-id")
  expect(key(req({ "x-api-client-id": " user-1 " }), server)).toBe("client:user-1")
  expect(key(req({ "x-api-client-id": "   " }), server)).toBe("ip:10.0.0.1")
  expect(key(req({ "x-api-client-id": "x".repeat(500) }), server)).toBe(`client:${"x".repeat(128)}`)
  expect(key(req(), { requestIP: () => null })).toBe("ip:unknown")
})

test("a denied request never reaches the limiter or the handler", async () => {
  const seen: string[] = []
  const limiter: RateLimiter = {
    hit: (k) => {
      seen.push(k)
      return { allowed: true }
    },
  }
  const protect = createProtect({
    guard: () => new Response("denied", { status: 401 }),
    rateLimiter: limiter,
    keyFor: () => "k",
  })
  const res = await protect(() => {
    throw new Error("handler must not run")
  })(req(), server)
  expect(res.status).toBe(401)
  expect(seen).toEqual([])
})

test("over the limit is TOO_MANY_REQUESTS with Retry-After, and the handler does not run", async () => {
  const protect = createProtect({
    guard: () => null,
    rateLimiter: { hit: () => ({ allowed: false, retryAfterSeconds: 7 }) },
    keyFor: () => "k",
  })
  const res = await protect(() => {
    throw new Error("handler must not run")
  })(req(), server)
  expect(res.status).toBe(429)
  expect(res.headers.get("retry-after")).toBe("7")
  expect(await res.json()).toMatchObject({
    code: "TOO_MANY_REQUESTS",
    message: "Too many requests",
  })
})

test("allowed requests reach the handler, keyed by keyFor", async () => {
  const seen: string[] = []
  const protect = createProtect({
    guard: () => null,
    rateLimiter: {
      hit: async (k) => {
        seen.push(k)
        return { allowed: true }
      },
    },
    keyFor: clientKey("x-api-client-id"),
  })
  const res = await protect(ok)(req({ "x-api-client-id": "u1" }), server)
  expect(await res.text()).toBe("handled")
  expect(seen).toEqual(["client:u1"])
})
