// /v1's one error shape: `{ "error": { "code", "message" } }`, from the guard (outside oRPC) and
// from the handlers (through `customErrorResponseBodyEncoder`) alike.
import type { ORPCError } from "@orpc/server"
import { ERROR_STATUS, type ErrorBody, type ErrorCode } from "@repo/public-api-contract"

/** Every refused key gets this one message — malformed, unknown, revoked, expired or feature
 * lost — so the answer is no oracle for which. */
export const UNAUTHORIZED_MESSAGE = "Invalid or missing API key"
export const RATE_LIMITED_MESSAGE = "Too many requests"
export const NOT_FOUND_MESSAGE = "Not found"
export const NOTE_NOT_FOUND_MESSAGE = "Note not found"
export const INTERNAL_MESSAGE = "Internal error"
export const PAYLOAD_TOO_LARGE_MESSAGE = "Payload too large"

/** The `forbidden_scope` message: names the scope the route needs. */
export const scopeMessage = (scope: string) => `This API key does not have the ${scope} scope`

export const errorBody = (code: ErrorCode, message: string): ErrorBody => ({
  error: { code, message },
})

/** A /v1 error response; `status` defaults to the code's own (a 413 overrides it). */
export function v1Error(
  code: ErrorCode,
  message: string,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  return Response.json(errorBody(code, message), {
    status: options.status ?? ERROR_STATUS[code],
    headers: options.headers,
  })
}

/** oRPC's codes (what the handlers and oRPC's own input validation throw) to /v1's. */
const CODE_OF: Record<string, ErrorCode> = {
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden_scope",
  NOT_FOUND: "not_found",
  BAD_REQUEST: "validation_failed",
  PAYLOAD_TOO_LARGE: "validation_failed",
  TOO_MANY_REQUESTS: "rate_limited",
}

/**
 * `OpenAPIHandler`'s `customErrorResponseBodyEncoder`: the status stays oRPC's (the code's), the
 * body becomes /v1's. Anything unexpected — a thrown database error included — is `internal`
 * with a fixed message, so no internal detail ever reaches a caller.
 */
export function encodeV1Error(error: ORPCError<string, unknown>): ErrorBody {
  const code = CODE_OF[error.code]
  return code ? errorBody(code, error.message) : errorBody("internal", INTERNAL_MESSAGE)
}
