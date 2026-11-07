import type { Logger } from "@repo/log"
import { newRequestId, REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { withRequestContext } from "@repo/log/context"
import { errorResponse } from "./errors"

/** The default server-side request deadline (`REQUEST_TIMEOUT_MS`). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

/** What a request past its deadline answers: the standard error shape, 503. */
export const REQUEST_TIMEOUT_MESSAGE =
  "The request took too long. It may still complete — check before retrying."

export type WithRequestOptions = {
  /** Whether the caller may name its own request id (it passed the service-bearer check). */
  trusted: (req: Request) => boolean
  logger: Logger
  /** A bounded label for the access line and metrics: a template or procedure path, never ids. */
  routeOf: (req: Request) => string
  /**
   * Who is calling, for the access line (`x-api-client-id` on the api); omitted when null.
   * `trusted` is `trusted(req)`'s answer, computed once per request, so no second bearer compare.
   */
  clientIdOf?: (req: Request, trusted: boolean) => string | null | undefined
  /** Called once per request after the response is known (metrics). */
  record?: (route: string, method: string, status: number, seconds: number) => void
  /**
   * Answers a handler that throws, inside the request's context (so its log lines carry the id
   * and the response gets the header). Without it the error propagates to the server's own,
   * after the access line (status 500) and `record` have run.
   */
  onError?: (error: unknown) => Response | Promise<Response>
  /**
   * A server-side deadline: when the handler has not answered within this many ms, the request
   * answers 503 `SERVICE_UNAVAILABLE` (`REQUEST_TIMEOUT_MESSAGE`), logs a warning and is recorded
   * as a 503. The handler keeps running in the background (nothing can cancel a pending query)
   * and its late result is discarded — a late body is cancelled, a late error logged. Only the
   * time to a `Response` counts: a streamed body (chat, event streams) is not cut once it began.
   * Unset or 0 → no deadline (wrap event streams without one).
   */
  timeoutMs?: number
  /**
   * What a request past `timeoutMs` answers instead of the standard 503 (`REQUEST_TIMEOUT_MESSAGE`
   * in oRPC's error shape) — for a route family with its own error body, such as the api's `/v1`.
   * Logging and recording are unchanged; the response still gets its `x-request-id`.
   */
  timeoutResponse?: () => Response
}

const TIMED_OUT = Symbol("timed out")

/** `answer`, or `TIMED_OUT` once `ms` passed first; an earlier rejection still rejects. */
async function withinDeadline(
  answer: Promise<Response>,
  ms: number
): Promise<Response | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      answer,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Sets the header, cloning the response when its headers are immutable (a fetched Response). */
function withHeader(res: Response, name: string, value: string): Response {
  try {
    res.headers.set(name, value)
    return res
  } catch {
    const copy = new Response(res.body, res)
    copy.headers.set(name, value)
    return copy
  }
}

/**
 * Wraps a `(req, server) => Response` handler: resolves the request id (the caller's, when
 * trusted and well formed, else a new one), runs the handler inside that request context, echoes
 * the id as `x-request-id`, writes one access line and calls `record`. Shared by every Bun
 * service (`apps/api`, `apps/ai`) so the request-id and access-log behaviour never drifts between
 * them.
 */
export function withRequest<S, Args extends unknown[] = []>(
  handler: (req: Request, server: S, ...rest: Args) => Response | Promise<Response>,
  opts: WithRequestOptions
): (req: Request, server: S, ...rest: Args) => Promise<Response> {
  return (req, server, ...rest) => {
    const trusted = opts.trusted(req)
    const incoming = trusted ? validRequestId(req.headers.get(REQUEST_ID_HEADER)) : null
    const requestId = incoming ?? newRequestId()
    return withRequestContext({ requestId }, async () => {
      const started = performance.now()
      // Once per request: a handler that throws after its deadline already answered must not
      // write a second access line or count twice.
      let finished = false
      const finish = (status: number) => {
        if (finished) return
        finished = true
        const seconds = (performance.now() - started) / 1000
        const route = opts.routeOf(req)
        const clientId = opts.clientIdOf?.(req, trusted) || undefined
        opts.logger.info("request", {
          method: req.method,
          route,
          status,
          ms: Math.round(seconds * 1000 * 10) / 10,
          ...(clientId ? { clientId } : {}),
        })
        opts.record?.(route, req.method, status, seconds)
      }
      const answer = (async (): Promise<Response> => {
        try {
          return await handler(req, server, ...rest)
        } catch (error) {
          if (!opts.onError) {
            // The server's own error handler answers; whatever it sends, count it as a 500.
            finish(500)
            throw error
          }
          return await opts.onError(error)
        }
      })()
      let res = opts.timeoutMs ? await withinDeadline(answer, opts.timeoutMs) : await answer
      if (res === TIMED_OUT) {
        const route = opts.routeOf(req)
        opts.logger.warn("request timed out", {
          method: req.method,
          route,
          timeoutMs: opts.timeoutMs,
        })
        // The late answer is nobody's: free its body, and keep a late failure in the log.
        answer.then(
          (late) => void late.body?.cancel().catch(() => {}),
          (error: unknown) =>
            opts.logger.error("request failed after its timeout", { route, error })
        )
        res =
          opts.timeoutResponse?.() ??
          errorResponse("SERVICE_UNAVAILABLE", { message: REQUEST_TIMEOUT_MESSAGE })
      }
      res = withHeader(res, REQUEST_ID_HEADER, requestId)
      finish(res.status)
      return res
    })
  }
}
