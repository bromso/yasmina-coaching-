import { errorResponse } from "./errors"
import type { RateLimiter } from "./rate-limit"

export type ClientAddress = { requestIP(req: Request): { address: string } | null }
export type Handler = (req: Request) => Response | Promise<Response>
export type ProtectedHandler = (req: Request, server: ClientAddress) => Promise<Response>

export const MAX_CLIENT_ID_LENGTH = 128

/**
 * Rate-limit key. Only used after the guard, so the caller holds the token — a trusted backend.
 * Behind that backend every request shares one IP, so it may name the end user in `header`; the
 * prefixes keep a client id from ever colliding with an IP key.
 */
export function clientKey(header: string) {
  return (req: Request, server: ClientAddress): string => {
    const clientId = req.headers.get(header)?.trim().slice(0, MAX_CLIENT_ID_LENGTH)
    if (clientId) return `client:${clientId}`
    return `ip:${server.requestIP(req)?.address ?? "unknown"}`
  }
}

/** Guard, then rate limit, then the handler: every protected route goes through here. */
export function createProtect({
  guard,
  rateLimiter,
  keyFor,
}: {
  guard: (req: Request) => Response | null
  rateLimiter: RateLimiter
  keyFor: (req: Request, server: ClientAddress) => string
}) {
  return (handler: Handler): ProtectedHandler =>
    async (req, server) => {
      const denied = guard(req)
      if (denied) return denied
      const verdict = await rateLimiter.hit(keyFor(req, server))
      if (!verdict.allowed) {
        return errorResponse("TOO_MANY_REQUESTS", {
          message: "Too many requests",
          headers: { "retry-after": String(verdict.retryAfterSeconds) },
        })
      }
      return handler(req)
    }
}
