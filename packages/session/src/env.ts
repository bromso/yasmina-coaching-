import { DEV_API_TOKEN } from "@repo/api-contract"
import { siteUrl } from "@repo/sites"

export type AuthEnv = {
  API_URL: string
  API_SERVICE_TOKEN: string
  AI_SERVICE_URL: string
  AI_SERVICE_TOKEN: string
  COOKIE_DOMAIN: string
  AUTH_URL: string
  APP_URL: string
}

/**
 * `AI_SERVICE_TOKEN`'s dev default. It must equal `DEV_TOKEN` in `@repo/ai-contract` (apps/ai's
 * dev token); `env.test.ts` checks that, so this package needs `@repo/ai-contract` only as a
 * devDependency and an app without apps/ai drops one test, not a runtime import.
 */
export const DEV_AI_TOKEN = "dev-only-insecure-token"

const DEV_DEFAULTS: AuthEnv = {
  API_URL: "http://api.brand.localhost:3007",
  API_SERVICE_TOKEN: DEV_API_TOKEN,
  AI_SERVICE_URL: "http://ai.brand.localhost:3008",
  AI_SERVICE_TOKEN: DEV_AI_TOKEN,
  COOKIE_DOMAIN: ".brand.localhost",
  AUTH_URL: siteUrl("auth", {}),
  APP_URL: siteUrl("app", {}),
}

/** A required variable is missing in production. The message names it. */
export class MissingEnvError extends Error {
  constructor(readonly variable: keyof AuthEnv) {
    super(`${variable} is not set`)
    this.name = "MissingEnvError"
  }
}

/**
 * Service URLs and tokens, read when a request needs them rather than at import, because
 * `next build` imports these modules with none of them set. Outside production each falls back
 * to its dev default; production requires the keys asked for, and only those.
 */
export function loadEnv<K extends keyof AuthEnv>(
  keys: readonly K[],
  source: Record<string, string | undefined> = process.env
): Pick<AuthEnv, K> {
  const production = source.NODE_ENV === "production"
  const result: Partial<Record<keyof AuthEnv, string>> = {}
  for (const key of keys) {
    const value = source[key]?.trim() || (production ? undefined : DEV_DEFAULTS[key])
    if (!value) throw new MissingEnvError(key)
    result[key] = key.endsWith("_URL") ? value.replace(/\/+$/, "") : value
  }
  return result as Pick<AuthEnv, K>
}

export const AUTH_ENV_KEYS = [
  "API_URL",
  "API_SERVICE_TOKEN",
  "COOKIE_DOMAIN",
  "AUTH_URL",
  "APP_URL",
] as const

/**
 * Boot-time check for `instrumentation.ts`: a production start missing any of `keys` refuses.
 * Outside production it checks nothing (the dev defaults apply).
 */
export function assertEnv<K extends keyof AuthEnv>(
  keys: readonly K[],
  source: Record<string, string | undefined> = process.env
): void {
  if (source.NODE_ENV !== "production") return
  loadEnv(keys, source)
}

/** `assertEnv` over the full auth env, for the apps with signed-in pages. */
export function assertAuthEnv(source: Record<string, string | undefined> = process.env): void {
  assertEnv(AUTH_ENV_KEYS, source)
}
