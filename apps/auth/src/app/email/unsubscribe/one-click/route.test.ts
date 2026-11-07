import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { unsubscribeClientId, unsubscribeTokenClientId } from "@repo/session/client"

// The route reaches `@repo/session`'s root (`server-only`) for `requestInfo`.
mock.module("server-only", () => ({}))

/** A stand-in api: records every RPC path and the headers it came with. */
const seen: Array<{ path: string; clientId: string | null; authorization: string | null }> = []
let server: ReturnType<typeof Bun.serve>
let previousApiUrl: string | undefined

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      seen.push({
        path: new URL(req.url).pathname,
        clientId: req.headers.get("x-api-client-id"),
        authorization: req.headers.get("authorization"),
      })
      return Response.json({ json: { ok: true } })
    },
  })
  previousApiUrl = process.env.API_URL
  process.env.API_URL = server.url.origin
})

afterAll(() => {
  server.stop(true)
  if (previousApiUrl === undefined) delete process.env.API_URL
  else process.env.API_URL = previousApiUrl
})

const { GET, POST } = await import("./route")
const token = `${"a".repeat(30)}.${"b".repeat(43)}`
const url = `http://auth.brand.localhost:3002/email/unsubscribe/one-click?token=${token}`

describe("/email/unsubscribe/one-click", () => {
  test("GET only redirects to the confirm page: no api call, nothing unsubscribed", async () => {
    const before = seen.length
    const res = GET(new Request(url))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`/email/unsubscribe?token=${token}`)
    // Give any stray request a moment to land before checking none did.
    await Bun.sleep(20)
    expect(seen.length).toBe(before)
  })

  test("POST (RFC 8058, form-encoded, cross-site) unsubscribes keyed by the token, not the ip", async () => {
    const res = await POST(
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://mail.example.com",
          "x-real-ip": "203.0.113.9",
        },
        body: "List-Unsubscribe=One-Click",
      })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("location")).toBeNull()
    expect(await res.text()).toBe("")
    const call = seen.at(-1)
    expect(call?.path).toBe("/rpc/auth/notificationEmail/unsubscribe")
    expect(call?.clientId).toBe(await unsubscribeTokenClientId(token))
    expect(call?.clientId).not.toBe(await unsubscribeClientId("203.0.113.9"))
    expect(call?.authorization).toMatch(/^Bearer /)
  })

  test("POST with any other body, or none, works the same", async () => {
    for (const body of [undefined, "", "anything=else"]) {
      const res = await POST(new Request(url, { method: "POST", body }))
      expect(res.status).toBe(200)
    }
  })
  test("POST from one shared mail-provider address: each link gets its own bucket", async () => {
    const other = `${"c".repeat(30)}.${"d".repeat(43)}`
    const ids: Array<string | null | undefined> = []
    for (const t of [token, other]) {
      await POST(
        new Request(`http://auth.brand.localhost:3002/email/unsubscribe/one-click?token=${t}`, {
          method: "POST",
          headers: { "x-real-ip": "198.51.100.1" },
        })
      )
      ids.push(seen.at(-1)?.clientId)
    }
    expect(ids[0]).not.toBe(ids[1])
  })
})
