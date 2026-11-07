import { createORPCClient, ORPCError, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient, Me, User } from "@repo/api-contract"
import { createLogger, REQUEST_ID_HEADER, validRequestId } from "@repo/log"

const logger = createLogger({ service: "session" })

export type ApiClientOptions = {
  apiUrl: string
  serviceToken: string
  sessionToken?: string | null
  /** Rate-limit key for calls without a session (see anonymousClientId); a session id wins. */
  clientId?: string
  fetch?: typeof fetch
  /** Abort a call to the api after this long. Default 5 s. */
  timeoutMs?: number
  /** Sent as `x-locale`: the language the api answers in. Omitted when not given (api: English). */
  locale?: string
  /**
   * Sent as `x-request-id` so the api's log lines carry the id the app's proxy gave this request.
   * Dropped unless well-formed (`validRequestId`); the api then makes up its own.
   */
  requestId?: string | null
}

const DEFAULT_TIMEOUT_MS = 5_000

const hashPrefix = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
}

/** `<prefix>:` + 32 hex chars of SHA-256(value): one rate-limit bucket per value, never the raw value. */
const prefixedClientId = async (prefix: string, value: string): Promise<string> =>
  `${prefix}:${await hashPrefix(value)}`

/**
 * The api's rate-limit key for one session: `session:` + 32 hex chars of SHA-256(token). One
 * user cannot exhaust the bucket every other user of this app shares, and the raw token never
 * becomes a key.
 */
export const sessionClientId = (token: string): Promise<string> =>
  prefixedClientId("session", token)

/** `anon:<hash>`: one bucket per browser ip for sign-in/up and password-reset calls. */
export async function anonymousClientId(
  ip: string | null | undefined
): Promise<string | undefined> {
  return ip ? prefixedClientId("anon", ip) : undefined
}

/** `files:<hash>`: one bucket per browser ip for the `/files/<key>` route's api calls. */
export async function filesClientId(ip: string | null | undefined): Promise<string | undefined> {
  return ip ? prefixedClientId("files", ip) : undefined
}

/** `events:<hash>`: one bucket per browser ip for the `/api/events` route's api calls. */
export async function eventsClientId(ip: string | null | undefined): Promise<string | undefined> {
  return ip ? prefixedClientId("events", ip) : undefined
}

/**
 * `unsub:<hash>`: one bucket per browser (or mail client) ip for `apps/auth`'s unsubscribe route
 * and page, apart from the sign-in `anon:` bucket — a mail provider posting many one-click
 * unsubscribes from one address must never exhaust sign-in for whoever shares it.
 */
export async function unsubscribeClientId(
  ip: string | null | undefined
): Promise<string | undefined> {
  return ip ? prefixedClientId("unsub", ip) : undefined
}

/**
 * `unsub:<hash of the token>`: the RFC 8058 one-click POST's bucket. That POST comes from a mail
 * provider's servers (Gmail, Yahoo, …), whose shared egress addresses carry one-clicks for huge
 * numbers of people — keyed per ip, one address would spend the budget for all of them, and with
 * no ip at all every one-click would share one bucket. Keyed per token instead, each real link
 * gets its own budget (a token names one user and one type, so a repeat only ever repeats that
 * one idempotent write). An invented token gets a fresh id too, but the api verifies the token
 * before spending any budget, so a forged one costs one HMAC and spends nothing — neither this
 * bucket nor the api-wide cap. The raw token never becomes a key.
 */
export const unsubscribeTokenClientId = (token: string): Promise<string> =>
  prefixedClientId("unsub", token)

/** The request's own `x-request-id` (set by the shared security proxy) when well-formed, else null. */
export const requestIdFromRequest = (req: Request): string | null =>
  validRequestId(req.headers.get(REQUEST_ID_HEADER))

/** The typed api client as one user: the service bearer plus, when present, the session token. */
export function createApiClient({
  apiUrl,
  serviceToken,
  sessionToken,
  clientId,
  fetch: f = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  locale,
  requestId,
}: ApiClientOptions): ApiClient {
  const forwardedRequestId = validRequestId(requestId)
  return createORPCClient(
    new RPCLink({
      url: `${apiUrl}/rpc`,
      headers: async () => {
        const resolvedClientId = sessionToken ? await sessionClientId(sessionToken) : clientId
        return {
          authorization: `Bearer ${serviceToken}`,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
          ...(resolvedClientId ? { "x-api-client-id": resolvedClientId } : {}),
          ...(locale ? { "x-locale": locale } : {}),
          ...(forwardedRequestId ? { [REQUEST_ID_HEADER]: forwardedRequestId } : {}),
        }
      },
      // A hung api must not hang the page: every call gives up after `timeoutMs`.
      fetch: (request, init) =>
        f(request, {
          ...init,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
        }),
    })
  )
}

/** Null on a missing/invalid session and on any failure to reach the api: never a thrown error. */
export async function getMeFromToken(
  options: Omit<ApiClientOptions, "sessionToken">,
  token: string | null | undefined
): Promise<Me | null> {
  if (!token) return null
  const [error, data] = await safe(createApiClient({ ...options, sessionToken: token }).auth.me())
  if (error) {
    // A missing or expired session is the normal signed-out case; anything else is worth a log line.
    if (!(error instanceof ORPCError && error.code === "UNAUTHORIZED")) {
      const requestId = validRequestId(options.requestId)
      logger.error("auth.me failed", { error, ...(requestId ? { requestId } : {}) })
    }
    return null
  }
  return data
}

/** `getMeFromToken(...)?.user` — kept for route handlers that only need the user. */
export async function getUserFromToken(
  options: Omit<ApiClientOptions, "sessionToken">,
  token: string | null | undefined
): Promise<User | null> {
  return (await getMeFromToken(options, token))?.user ?? null
}
