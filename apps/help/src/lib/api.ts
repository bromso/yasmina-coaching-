import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"
import { REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { anonymousClientId } from "@repo/session/client"
import { loadEnv } from "@repo/session/env"
import type { ContactApiFactory } from "./contact"

let env: ReturnType<typeof loadEnv<"API_URL" | "API_SERVICE_TOKEN">> | undefined

/**
 * Headers for an anonymous call that may still carry a live session. The rate-limit client id is
 * always `anon:<ip hash>` — never the `session:<hash>` that `@repo/session`'s own
 * `createApiClient` would switch to the instant a `sessionToken` is set, which is exactly the
 * per-session bucket CLAUDE.md's Controller ruling rules out here (it would let one signed-in
 * visitor exhaust the limiter for everyone sharing their ip, and vice versa). `x-session-token`
 * is still added whenever a `session` cookie was forwarded, so `support.create` can link the
 * request to its caller's account without changing whose bucket the limiter counts against.
 * `x-request-id` carries the id the app's proxy gave this request, when well-formed.
 */
export function contactHeaders({
  serviceToken,
  clientId,
  sessionToken,
  locale,
  requestId,
}: {
  serviceToken: string
  clientId?: string
  sessionToken?: string | null
  locale?: string
  requestId?: string | null
}): Record<string, string> {
  const forwardedRequestId = validRequestId(requestId)
  return {
    authorization: `Bearer ${serviceToken}`,
    ...(sessionToken ? { "x-session-token": sessionToken } : {}),
    ...(clientId ? { "x-api-client-id": clientId } : {}),
    ...(locale ? { "x-locale": locale } : {}),
    ...(forwardedRequestId ? { [REQUEST_ID_HEADER]: forwardedRequestId } : {}),
  }
}

function buildClient(options: {
  apiUrl: string
  serviceToken: string
  clientId?: string
  sessionToken?: string | null
  locale?: string
  requestId?: string | null
}): ApiClient {
  return createORPCClient(
    new RPCLink({
      url: `${options.apiUrl}/rpc`,
      headers: async () => contactHeaders(options),
    })
  )
}

/**
 * The api as an anonymous caller with the service token, keyed per browser ip for the rate
 * limiter (see `contactHeaders`). Call it from the server action, never at a page's module scope:
 * env is read on first use, not at `next build`. `locale` is sent as `x-locale`; omit it for the
 * English default (no real choice to report). Mirrors `apps/www/src/lib/api.ts`'s `anonymousApi`.
 * `requestId` (the request's `x-request-id`) is forwarded so the api's log lines carry it.
 */
export const anonymousApiFor =
  (requestId?: string | null): ContactApiFactory =>
  async (ip, locale, sessionToken) => {
    env ??= loadEnv(["API_URL", "API_SERVICE_TOKEN"])
    const clientId = await anonymousClientId(ip)
    const client = buildClient({
      apiUrl: env.API_URL,
      serviceToken: env.API_SERVICE_TOKEN,
      clientId,
      sessionToken,
      locale,
      requestId,
    })
    return client.support
  }
