import type { Locale } from "@repo/i18n/locales"
import { createApiClient } from "@repo/session/client"
import { loadEnv } from "@repo/session/env"
import type { UnsubscribeApi } from "./unsubscribe"

let env: ReturnType<typeof loadEnv<"API_URL" | "API_SERVICE_TOKEN">> | undefined

/**
 * The api as an anonymous caller with the service token, for the unsubscribe route and page:
 * built like `createAuth`'s `anonymousApi`, but keyed by an `unsub:` id rather than the sign-in
 * `anon:` bucket (mirroring how apps/help's contact action keeps its own client id), and never
 * carrying a session — the token alone names the user. Env is read on first use, never at build.
 */
export function unsubscribeApi(options: {
  /** `unsubscribeClientId(ip)` for the page and its button (a person in a browser), or
   * `unsubscribeTokenClientId(token)` for the one-click POST (a mail provider's servers). */
  clientId?: string
  locale?: Locale
  requestId?: string | null
}): UnsubscribeApi {
  env ??= loadEnv(["API_URL", "API_SERVICE_TOKEN"])
  return createApiClient({
    apiUrl: env.API_URL,
    serviceToken: env.API_SERVICE_TOKEN,
    clientId: options.clientId,
    locale: options.locale,
    requestId: options.requestId,
  }).auth.notificationEmail
}
