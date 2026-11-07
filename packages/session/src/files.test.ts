import { describe, expect, spyOn, test } from "bun:test"
import { createFileRoute } from "./files"

const ctx = (key: string[]) => ({ params: Promise.resolve({ key }) })
const ok = {
  files: { get: async () => new File([new Uint8Array([1, 2])], "f", { type: "image/png" }) },
}

describe("createFileRoute", () => {
  test("streams the file with the cache and safety headers", async () => {
    const res = await createFileRoute({ client: () => ok as never })(
      new Request("http://x"),
      ctx(["avatars", "1", "AAAAAAAAAAAAAAAAAAAAAA.png"])
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("content-disposition")).toBe("inline")
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'")
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2])
  })
  test("404 for a malformed key without calling the api", async () => {
    let called = false
    const client = {
      files: {
        get: async () => {
          called = true
          throw new Error()
        },
      },
    }
    const res = await createFileRoute({ client: () => client as never })(
      new Request("http://x"),
      ctx(["..", "etc", "passwd"])
    )
    expect(res.status).toBe(404)
    expect(called).toBe(false)
  })
  test("404 when the api says NOT_FOUND, 502 when it cannot be reached", async () => {
    const { ORPCError } = await import("@orpc/client")
    const notFound = {
      files: {
        get: async () => {
          throw new ORPCError("NOT_FOUND", { defined: true })
        },
      },
    }
    const down = {
      files: {
        get: async () => {
          throw new TypeError("fetch failed")
        },
      },
    }
    const key = ["logos", "2", "AAAAAAAAAAAAAAAAAAAAAA.webp"]
    expect(
      (
        await createFileRoute({ client: () => notFound as never })(
          new Request("http://x"),
          ctx(key)
        )
      ).status
    ).toBe(404)
    // The 502 path logs: keep test output clean and assert it mentions what went wrong.
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const res = await createFileRoute({ client: () => down as never })(
        new Request("http://x"),
        ctx(key)
      )
      expect(res.status).toBe(502)
      expect(logged).toHaveBeenCalled()
    } finally {
      logged.mockRestore()
    }
  })

  test("the 502 line carries the request's own x-request-id", async () => {
    const down = {
      files: {
        get: async () => {
          throw new Error("fetch failed")
        },
      },
    }
    const logged = spyOn(console, "error").mockImplementation(() => {})
    try {
      const res = await createFileRoute({ client: () => down as never })(
        new Request("http://x", { headers: { "x-request-id": "req-files-0002" } }),
        ctx(["avatars", "1", "AAAAAAAAAAAAAAAAAAAAAA.png"])
      )
      expect(res.status).toBe(502)
      expect(String(logged.mock.calls[0]?.[0])).toContain("req-files-0002")
    } finally {
      logged.mockRestore()
    }
  })

  test("hands the request's own x-request-id to the client, and only a well-formed one", async () => {
    const seen: Array<string | null> = []
    const client = (_clientId: string | undefined, requestId: string | null) => {
      seen.push(requestId)
      return ok as never
    }
    const key = ["avatars", "1", "AAAAAAAAAAAAAAAAAAAAAA.png"]
    const withId = (id: string) => new Request("http://x", { headers: { "x-request-id": id } })
    await createFileRoute({ client })(withId("req-files-0001"), ctx(key))
    await createFileRoute({ client })(withId("bad id"), ctx(key))
    expect(seen).toEqual(["req-files-0001", null])
  })

  test("derives a per-browser files:<hash> client id from the request's ip", async () => {
    const seen: Array<string | undefined> = []
    const client = (clientId: string | undefined) => {
      seen.push(clientId)
      return ok as never
    }
    const withIp = (ip: string) => new Request("http://x", { headers: { "x-real-ip": ip } })
    const key = ["avatars", "1", "AAAAAAAAAAAAAAAAAAAAAA.png"]
    await createFileRoute({ client })(withIp("203.0.113.9"), ctx(key))
    await createFileRoute({ client })(withIp("203.0.113.10"), ctx(key))
    await createFileRoute({ client })(new Request("http://x"), ctx(key))
    expect(seen[0]).toMatch(/^files:[0-9a-f]{32}$/)
    expect(seen[1]).toMatch(/^files:[0-9a-f]{32}$/)
    expect(seen[0]).not.toBe(seen[1])
    expect(seen[2]).toBeUndefined()
  })
})
