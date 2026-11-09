import { anonymousClientId, createApiClient, loadEnv } from "@repo/session"

/**
 * The api with the service token only, keyed per browser ip for the rate limiter. Call it from a
 * server action or route handler, never at a page's module scope: env is read per call, not at
 * `next build` (and never cached, so a test file's stub api is the one its own calls reach).
 * `locale` is sent as `x-locale` (the site's own `sv` unless the visitor chose otherwise);
 * omitted, the api answers in English.
 * `requestId` (the request's `x-request-id`, set by the shared proxy) is sent on when well-formed.
 */
export async function anonymousApi(ip?: string, locale?: string, requestId?: string | null) {
  const env = loadEnv(["API_URL", "API_SERVICE_TOKEN"])
  return createApiClient({
    apiUrl: env.API_URL,
    serviceToken: env.API_SERVICE_TOKEN,
    clientId: await anonymousClientId(ip),
    locale,
    requestId,
  })
}
