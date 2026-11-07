import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"
import { REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { anonymousClientId } from "@repo/session/client"
import { loadEnv } from "@repo/session/env"
import type { ApplyApiFactory } from "./apply"

let env: ReturnType<typeof loadEnv<"API_URL" | "API_SERVICE_TOKEN">> | undefined

/**
 * Headers for an anonymous `jobs.apply` call: the service bearer, the per-browser
 * `anon:<ip hash>` client id (so no visitor shares `jobs:unknown` with everyone else) and
 * `x-locale` from a real signal only. There is no session here — the jobs board never signs
 * anyone in. `x-request-id` carries the id the app's proxy gave this request, when well-formed.
 */
export function applyHeaders({
  serviceToken,
  clientId,
  locale,
  requestId,
}: {
  serviceToken: string
  clientId?: string
  locale?: string
  requestId?: string | null
}): Record<string, string> {
  const forwardedRequestId = validRequestId(requestId)
  return {
    authorization: `Bearer ${serviceToken}`,
    ...(clientId ? { "x-api-client-id": clientId } : {}),
    ...(locale ? { "x-locale": locale } : {}),
    ...(forwardedRequestId ? { [REQUEST_ID_HEADER]: forwardedRequestId } : {}),
  }
}

function buildClient(options: {
  apiUrl: string
  serviceToken: string
  clientId?: string
  locale?: string
  requestId?: string | null
}): ApiClient {
  return createORPCClient(
    new RPCLink({
      url: `${options.apiUrl}/rpc`,
      headers: async () => applyHeaders(options),
    })
  )
}

/**
 * The api as an anonymous caller with the service token, keyed per browser ip for the rate
 * limiter (see `applyHeaders`). Call it from the server action, never at a page's module scope:
 * env is read on first use, not at `next build`. `locale` is sent as `x-locale`; omit it for the
 * English default. Mirrors `apps/help/src/lib/api.ts`'s `anonymousApiFor`. `requestId` (the
 * request's `x-request-id`) is forwarded so the api's log lines carry it.
 */
export const anonymousApiFor =
  (requestId?: string | null): ApplyApiFactory =>
  async (ip, locale) => {
    env ??= loadEnv(["API_URL", "API_SERVICE_TOKEN"])
    const clientId = await anonymousClientId(ip)
    const client = buildClient({
      apiUrl: env.API_URL,
      serviceToken: env.API_SERVICE_TOKEN,
      clientId,
      locale,
      requestId,
    })
    return client.jobs
  }
