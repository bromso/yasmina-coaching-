import { describe, expect, test } from "bun:test"
import { securityHeaders } from "./security-headers"

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ")

const csp = (headers: Record<string, string>) => headers["Content-Security-Policy"] ?? ""
const directive = (policy: string, name: string) =>
  policy.split("; ").find((d) => d.startsWith(`${name} `) || d === name)

describe("securityHeaders (production)", () => {
  const headers = securityHeaders()

  test("is exactly the documented header set", () => {
    expect(headers).toEqual({
      "Content-Security-Policy": PRODUCTION_CSP,
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    })
  })

  test("never allows eval and always upgrades", () => {
    expect(csp(headers)).not.toContain("unsafe-eval")
    expect(csp(headers)).toContain("upgrade-insecure-requests")
  })

  test("lists every directive once", () => {
    const names = csp(headers)
      .split("; ")
      .map((d) => d.split(" ")[0])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("securityHeaders (dev)", () => {
  const headers = securityHeaders({ dev: true })

  test("adds what Next HMR needs and nothing else", () => {
    expect(directive(csp(headers), "script-src")).toBe(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    )
    expect(directive(csp(headers), "connect-src")).toBe(
      "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com ws: wss:"
    )
    expect(csp(headers)).not.toContain("upgrade-insecure-requests")
    expect(headers["Strict-Transport-Security"]).toBeUndefined()
    const { "Content-Security-Policy": _csp, ...rest } = headers
    const {
      "Content-Security-Policy": _p,
      "Strict-Transport-Security": _h,
      ...prodRest
    } = securityHeaders()
    expect(rest).toEqual(prodRest)
  })
})

describe("securityHeaders({ csp })", () => {
  test("appends to an existing directive and leaves the others alone", () => {
    const headers = securityHeaders({ csp: { "connect-src": ["https://api.example.com"] } })
    expect(directive(csp(headers), "connect-src")).toBe(
      "connect-src 'self' https://api.iconify.design https://raw.githubusercontent.com https://api.example.com"
    )
    expect(directive(csp(headers), "script-src")).toBe("script-src 'self' 'unsafe-inline'")
  })

  // frame-src is the append example only; see the COEP note in security-headers.ts.
  test("adds a directive the base policy does not have", () => {
    const headers = securityHeaders({ csp: { "frame-src": ["https://www.youtube.com"] } })
    expect(directive(csp(headers), "frame-src")).toBe("frame-src https://www.youtube.com")
    // New directives join in order, before the trailing upgrade flag.
    expect(csp(headers)).toContain("object-src 'none'; frame-src https://www.youtube.com")
    expect(csp(headers).endsWith("upgrade-insecure-requests")).toBe(true)
  })
})
