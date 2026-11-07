import type { Env } from "../../env"
import { plausibleProvider } from "./plausible"
import { posthogProvider } from "./posthog"
import { type AnalyticsProvider, storeAnalyticsProvider } from "./provider"

export type AnalyticsProviderEnv = Pick<Env, "ANALYTICS_PROVIDER"> &
  Partial<Pick<Env, "POSTHOG_KEY" | "POSTHOG_HOST" | "PLAUSIBLE_DOMAIN" | "PLAUSIBLE_HOST">>

/** Picks the provider by ANALYTICS_PROVIDER; missing vars fail here, at boot (see loadEnv). */
export function createAnalyticsProvider(
  env: AnalyticsProviderEnv,
  opts: { fetch?: typeof fetch; siteUrl: (app: string) => string },
  log: (message: string, error: unknown) => void
): AnalyticsProvider {
  if (env.ANALYTICS_PROVIDER === "posthog") {
    // Same wording and shape as loadEnv's own check (unreachable after it — this is the
    // defensive copy for a caller that built `env` by hand, e.g. a test).
    if (!env.POSTHOG_KEY || !env.POSTHOG_HOST) {
      const missing = (["POSTHOG_KEY", "POSTHOG_HOST"] as const).filter((key) => !env[key])
      throw new Error(`ANALYTICS_PROVIDER=posthog needs ${missing.join(", ")}`)
    }
    return posthogProvider({
      host: env.POSTHOG_HOST,
      apiKey: env.POSTHOG_KEY,
      siteUrl: opts.siteUrl,
      fetch: opts.fetch,
      log,
    })
  }
  if (env.ANALYTICS_PROVIDER === "plausible") {
    if (!env.PLAUSIBLE_DOMAIN || !env.PLAUSIBLE_HOST) {
      const missing = (["PLAUSIBLE_DOMAIN", "PLAUSIBLE_HOST"] as const).filter((key) => !env[key])
      throw new Error(`ANALYTICS_PROVIDER=plausible needs ${missing.join(", ")}`)
    }
    return plausibleProvider({
      host: env.PLAUSIBLE_HOST,
      domain: env.PLAUSIBLE_DOMAIN,
      siteUrl: opts.siteUrl,
      fetch: opts.fetch,
      log,
    })
  }
  return storeAnalyticsProvider
}
