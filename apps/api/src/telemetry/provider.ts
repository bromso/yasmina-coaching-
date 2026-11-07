import type { ErrorRow } from "../queries/telemetry"

/** Where new errors go besides the tables. `store` is the keyless default; `sentry` forwards. */
export type TelemetryProvider = {
  kind: "store" | "sentry"
  /**
   * Called once per new (fingerprint, day) row, from the `telemetry.forward` job (never
   * detached from the request directly). Throw for a failure the job should retry (a transient
   * one — the provider unreachable, overloaded, or rate-limiting); the job retries with backoff
   * and eventually dies, recorded through `recordFailure`. Return normally (log, don't throw) for
   * a failure retrying would just repeat (a permanent one, e.g. a 4xx from the provider).
   */
  onNewError(row: ErrorRow): Promise<void>
}
