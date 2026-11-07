import { REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { type NextRequest, NextResponse } from "next/server"
import { type SecurityHeaderOptions, securityHeaders } from "./security-headers"

// 16 random bytes, base64url — the same shape as `@repo/log`'s `newRequestId`, written with
// `btoa` rather than `Buffer` so it runs in whichever runtime the proxy is given.
function proxyRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * A Next `proxy` that adds the shared security headers to every matched response. Each app's
 * `src/proxy.ts` exports the result plus a literal `config.matcher`.
 *
 * It also sets the `x-url` request header to the request's own URL, overwriting any value the
 * client sent, so server components (`requireUser` in `@repo/session`) can read where they are.
 *
 * And it gives every request an `x-request-id`: a well-formed incoming one is kept (a load
 * balancer's), anything else is replaced by a fresh id. It is set on the forwarded request, so
 * `@repo/session`'s clients send it on to `apps/api`, and on the response.
 */
export function createSecurityProxy({
  dev = process.env.NODE_ENV !== "production",
  csp,
}: SecurityHeaderOptions = {}) {
  const headers = securityHeaders({ dev, csp })
  return (request: NextRequest): NextResponse => {
    const requestId = validRequestId(request.headers.get(REQUEST_ID_HEADER)) ?? proxyRequestId()
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-url", request.url)
    requestHeaders.set(REQUEST_ID_HEADER, requestId)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    response.headers.set(REQUEST_ID_HEADER, requestId)
    return response
  }
}
