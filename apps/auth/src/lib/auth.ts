import type { ProviderId } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { createAuth, loadEnv } from "@repo/session"

const logger = createLogger({ service: "auth" })

let auth: ReturnType<typeof createAuth> | undefined

export function getAuth() {
  if (!auth) {
    const env = loadEnv(["API_URL", "API_SERVICE_TOKEN", "COOKIE_DOMAIN", "AUTH_URL", "APP_URL"])
    auth = createAuth({
      apiUrl: env.API_URL,
      serviceToken: env.API_SERVICE_TOKEN,
      cookieDomain: env.COOKIE_DOMAIN,
      authUrl: env.AUTH_URL,
      appUrl: env.APP_URL,
    })
  }
  return auth
}

/**
 * The sign-in providers the api has configured, for the login and sign-up pages. An api that cannot
 * answer hides the buttons rather than the page: email sign-in may still work.
 */
export async function getProviders(ip: string | undefined): Promise<ProviderId[]> {
  try {
    const api = await getAuth().anonymousApi({ ip })
    return (await api.auth.providers()).providers
  } catch (error) {
    logger.error("providers failed", { error })
    return []
  }
}
