import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"

// `@repo/session`'s root entry imports `server-only`, which throws outside a react-server bundle.
mock.module("server-only", () => ({}))

/** A stand-in api: records every RPC path and what it was asked. */
const seen: Array<{ path: string; body: unknown; clientId: string | null }> = []
let server: ReturnType<typeof Bun.serve>
const previous = { url: process.env.API_URL, token: process.env.API_SERVICE_TOKEN }

const answer = {
  timezone: "Europe/Stockholm",
  durationMinutes: 60,
  days: [
    {
      date: "2026-03-02",
      slots: [{ startsAt: "2026-03-02T08:00:00.000Z", endsAt: "2026-03-02T09:00:00.000Z" }],
    },
  ],
}

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      seen.push({
        path: new URL(req.url).pathname,
        body: await req.json().catch(() => null),
        clientId: req.headers.get("x-api-client-id"),
      })
      return Response.json({ json: answer })
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

const { GET } = await import("./route")
const { GET: GROUP } = await import("../group-events/route")
const base = "http://www.brand.localhost:3000/api/booking/availability"

describe("GET /api/booking/availability", () => {
  test("a malformed query is a 400 with per-field messages and no api call", async () => {
    const before = seen.length
    for (const query of [
      "",
      "offering=workshop&from=2026-03-01&to=2026-03-31",
      "offering=session&from=March&to=2026-03-31",
      "offering=session&from=2026-04-01&to=2026-03-31",
    ]) {
      const res = await GET(new Request(`${base}?${query}`))
      expect(res.status).toBe(400)
      expect(res.headers.get("cache-control")).toBe("private, no-store")
      const body = (await res.json()) as { error: { fieldErrors: Record<string, string> } }
      expect(Object.keys(body.error.fieldErrors).length).toBeGreaterThan(0)
    }
    await Bun.sleep(20)
    expect(seen.length).toBe(before)
  })

  test("a good query is forwarded with the service token, keyed per ip, and answered uncached", async () => {
    const res = await GET(
      new Request(`${base}?offering=session&from=2026-03-01&to=2026-03-31`, {
        headers: { "x-real-ip": "203.0.113.9" },
      })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(await res.json()).toEqual(answer)
    const call = seen.at(-1)
    expect(call?.path).toContain("/booking/availability")
    expect(call?.body).toMatchObject({
      json: { offering: "session", from: "2026-03-01", to: "2026-03-31" },
    })
    expect(call?.clientId).toMatch(/^anon:/)
  })
})

describe("GET /api/booking/group-events", () => {
  test("relays the api's answer uncached", async () => {
    const res = await GROUP(new Request("http://www.brand.localhost:3000/api/booking/group-events"))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(seen.at(-1)?.path).toContain("/booking/groupEvents")
    expect(seen.at(-1)?.body).toMatchObject({ json: { offering: "group" } })
  })

  test("forwards a group offering from the query", async () => {
    const res = await GROUP(
      new Request("http://www.brand.localhost:3000/api/booking/group-events?offering=inner_group")
    )
    expect(res.status).toBe(200)
    expect(seen.at(-1)?.path).toContain("/booking/groupEvents")
    expect(seen.at(-1)?.body).toMatchObject({ json: { offering: "inner_group" } })
  })

  test("an offering that is not a group kind is a 400 and no api call", async () => {
    const before = seen.length
    for (const offering of ["session", "inner_session", "nope"]) {
      const res = await GROUP(
        new Request(`http://www.brand.localhost:3000/api/booking/group-events?offering=${offering}`)
      )
      expect(res.status).toBe(400)
      expect(res.headers.get("cache-control")).toBe("private, no-store")
    }
    await Bun.sleep(20)
    expect(seen.length).toBe(before)
  })
})
