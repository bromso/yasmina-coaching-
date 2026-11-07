import { ORPCError } from "@orpc/server"

export type ErrorResponseOptions = {
  status?: number
  message?: string
  headers?: Bun.HeadersInit
}

/**
 * An error response in the shape oRPC gives contract errors — `{ defined, code, status, message }`
 * — so a client handles every error from these services one way, and oRPC's own clients turn it
 * into an ORPCError.
 */
export function errorResponse(code: string, options: ErrorResponseOptions = {}): Response {
  const error = new ORPCError(code, { status: options.status, message: options.message })
  const headers = options.headers === undefined ? undefined : new Headers(options.headers)
  return Response.json(error.toJSON(), { status: error.status, headers })
}
