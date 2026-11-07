/**
 * The api-wide caps on sign-up, password reset and magic link refuse silently (or with a generic
 * 429), so nothing tells an operator that real users are being turned away. This logs a tripped
 * cap at most once per key per `everyMs`, however hard a flood hits it. For fixed, low-cardinality
 * keys only (`reset:global`, `telemetry:app:<app>`): it remembers every key it has seen.
 */
export function capTripLogger(
  log: (message: string, error: unknown) => void,
  { everyMs = 60_000, now = Date.now }: { everyMs?: number; now?: () => number } = {}
) {
  const last = new Map<string, number>()
  return (key: string) => {
    const t = now()
    const previous = last.get(key)
    if (previous !== undefined && t - previous < everyMs) return
    last.set(key, t)
    log(`rate cap tripped: ${key} (refusing until the window passes)`, undefined)
  }
}
