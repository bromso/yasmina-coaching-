import { anonymousClientId, createApiClient, loadEnv } from "@repo/session"

let env: ReturnType<typeof loadEnv<"API_URL" | "API_SERVICE_TOKEN">> | undefined

/**
 * The api with the service token only, keyed per browser ip for the rate limiter. Call it from a
 * server action, never at a page's module scope: env is read on first use, not at `next build`.
 * `locale` is sent as `x-locale`; omit it for the English default (no real choice to report).
 * `requestId` (the request's `x-request-id`, set by the shared proxy) is sent on when well-formed.
 */
export async function anonymousApi(ip?: string, locale?: string, requestId?: string | null) {
  env ??= loadEnv(["API_URL", "API_SERVICE_TOKEN"])
  return createApiClient({
    apiUrl: env.API_URL,
    serviceToken: env.API_SERVICE_TOKEN,
    clientId: await anonymousClientId(ip),
    locale,
    requestId,
  })
}
