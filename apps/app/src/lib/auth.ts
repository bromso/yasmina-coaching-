import { createAuth, loadEnv } from "@repo/session"

export type { User } from "@repo/session"

let auth: ReturnType<typeof createAuth> | undefined

/**
 * The auth seam, now real: the shared session cookie resolved against apps/api. Built on the
 * first request, not at module scope, so `next build` (no env, production mode) never runs
 * `loadEnv`; instrumentation.ts checks the same keys at boot.
 */
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
