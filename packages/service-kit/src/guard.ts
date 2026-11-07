import { timingSafeEqual } from "node:crypto"
import { errorResponse } from "./errors"

export type GuardOptions = {
  token: string
  allowedOrigins: string[]
  /** Development only: also allow http://localhost:<port> and http://<name>.localhost:<port>. */
  allowLocalhostOrigins: boolean
}

const LOCALHOST_ORIGIN = /^http:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/

/**
 * `(req) => true` when `req` carries `authorization: Bearer <token>`, compared in constant time.
 * The guard's own token check; also used to decide whether a caller's `x-request-id` is trusted.
 */
export function createBearerCheck(token: string) {
  const expected = Buffer.from(token)
  return (req: Request): boolean => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")
    const given = Buffer.from(match?.[1] ?? "")
    return given.length === expected.length && timingSafeEqual(given, expected)
  }
}

/**
 * Token + origin check for every protected route. Not user auth: it keeps a deployed service from
 * being open to anyone. Returns a response to send, or null when the request may proceed. The
 * token belongs on the server — call the service from your backend, never with the token in
 * browser code.
 */
export function createGuard({ token, allowedOrigins, allowLocalhostOrigins }: GuardOptions) {
  const hasToken = createBearerCheck(token)
  const originAllowed = (origin: string) =>
    allowedOrigins.includes(origin) || (allowLocalhostOrigins && LOCALHOST_ORIGIN.test(origin))

  return (req: Request): Response | null => {
    if (!hasToken(req)) {
      return errorResponse("UNAUTHORIZED", {
        message: "Unauthorized",
        headers: { "www-authenticate": "Bearer" },
      })
    }

    // No Origin header means a server-to-server call; any present origin must be allowed.
    const origin = req.headers.get("origin")
    if (origin !== null && !originAllowed(origin)) {
      return errorResponse("FORBIDDEN", { message: "Origin not allowed" })
    }

    return null
  }
}
