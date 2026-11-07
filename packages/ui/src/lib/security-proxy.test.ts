import { describe, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { securityHeaders } from "./security-headers"
import { createSecurityProxy } from "./security-proxy"

const request = (headers?: Record<string, string>) =>
  new NextRequest("https://app.example.com/notes?x=1", { headers })

describe("createSecurityProxy", () => {
  test("sets every header on the pass-through response", () => {
    const response = createSecurityProxy({ dev: false })(request())
    for (const [name, value] of Object.entries(securityHeaders({ dev: false }))) {
      expect(response.headers.get(name)).toBe(value)
    }
    // NextResponse.next() marks the response as a pass-through.
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  // frame-src is the append example only; see the COEP note in security-headers.ts.
  test("passes csp extras through", () => {
    const response = createSecurityProxy({
      dev: false,
      csp: { "frame-src": ["https://x.example"] },
    })(request())
    expect(response.headers.get("Content-Security-Policy")).toContain("frame-src https://x.example")
  })

  test("defaults dev from NODE_ENV", () => {
    // bun test sets NODE_ENV=test, which is not production: the dev policy applies.
    const response = createSecurityProxy()(request())
    expect(response.headers.get("Content-Security-Policy")).toContain("'unsafe-eval'")
    expect(response.headers.get("Strict-Transport-Security")).toBeNull()
  })

  // Next transports an overridden request header as `x-middleware-request-<name>`.
  test("sets x-url to the request URL, overwriting a client-sent value", () => {
    const proxy = createSecurityProxy({ dev: false })
    const plain = proxy(request())
    expect(plain.headers.get("x-middleware-request-x-url")).toBe(
      "https://app.example.com/notes?x=1"
    )
    const spoofed = proxy(request({ "x-url": "https://evil.com" }))
    expect(spoofed.headers.get("x-middleware-request-x-url")).toBe(
      "https://app.example.com/notes?x=1"
    )
    expect(spoofed.headers.get("x-middleware-override-headers")).toContain("x-url")
  })

  test("keeps a well-formed incoming x-request-id on the request and the response", () => {
    const response = createSecurityProxy({ dev: false })(
      request({ "x-request-id": "lb-request-0001" })
    )
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe("lb-request-0001")
    expect(response.headers.get("x-request-id")).toBe("lb-request-0001")
  })

  test("replaces a missing or malformed x-request-id with a fresh one", () => {
    const proxy = createSecurityProxy({ dev: false })
    for (const incoming of [undefined, "short", "has spaces in it", "x".repeat(65)]) {
      const response = proxy(request(incoming ? { "x-request-id": incoming } : undefined))
      const id = response.headers.get("x-request-id")
      expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
      expect(id).not.toBe(incoming ?? null)
      expect(response.headers.get("x-middleware-request-x-request-id")).toBe(id)
    }
    const a = proxy(request()).headers.get("x-request-id")
    const b = proxy(request()).headers.get("x-request-id")
    expect(a).not.toBe(b)
  })
})
