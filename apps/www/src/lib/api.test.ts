import { afterAll, beforeAll, expect, mock, test } from "bun:test"

// `@repo/session`'s root entry imports `server-only`, which throws outside a react-server bundle.
mock.module("server-only", () => ({}))

const seen: Array<string | null> = []
let server: ReturnType<typeof Bun.serve>
const previous = { url: process.env.API_URL, token: process.env.API_SERVICE_TOKEN }

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      seen.push(req.headers.get("x-request-id"))
      return Response.json({ json: { ok: true } })
    },
  })
  process.env.API_URL = server.url.origin
  process.env.API_SERVICE_TOKEN = "svc"
})
afterAll(() => {
  server.stop(true)
  for (const [key, value] of [
    ["API_URL", previous.url],
    ["API_SERVICE_TOKEN", previous.token],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test("anonymousApi forwards a well-formed request id as x-request-id, and only that", async () => {
  const { anonymousApi } = await import("./api")
  await (await anonymousApi("203.0.113.9", undefined, "req-www-00001")).waitlist
    .join({ email: "ada@example.com", source: "www" })
    .catch(() => {})
  await (await anonymousApi("203.0.113.9", undefined, "bad id")).waitlist
    .join({ email: "ada@example.com", source: "www" })
    .catch(() => {})
  expect(seen).toEqual(["req-www-00001", null])
})
