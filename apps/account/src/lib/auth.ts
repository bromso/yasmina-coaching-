import { createAuth, loadEnv } from "@repo/session"

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
