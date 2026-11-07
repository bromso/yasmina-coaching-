import type { Env } from "../env"
import type { TelemetryProvider } from "./provider"
import { sentryProvider } from "./sentry"
import { storeProvider } from "./store"

export type TelemetryEnv = Pick<Env, "TELEMETRY_PROVIDER" | "NODE_ENV"> &
  Partial<Pick<Env, "SENTRY_DSN" | "SENTRY_ENVIRONMENT">>

/** Picks the provider by TELEMETRY_PROVIDER; a bad DSN fails here, at boot. */
export function createTelemetryProvider(
  env: TelemetryEnv,
  log: (message: string, error: unknown) => void
): TelemetryProvider {
  if (env.TELEMETRY_PROVIDER !== "sentry") return storeProvider
  // Unreachable after loadEnv, which refuses sentry without a DSN.
  if (!env.SENTRY_DSN) throw new Error("TELEMETRY_PROVIDER=sentry needs SENTRY_DSN")
  return sentryProvider({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    log,
  })
}
