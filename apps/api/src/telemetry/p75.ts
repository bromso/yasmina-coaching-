import type { TelemetryVitals } from "@repo/api-contract"
import type { VitalP75Row } from "../queries/telemetry"

/**
 * Folds the per-(app, metric) p75 rows `vitalP75` returns into one row per app. `samples` is the
 * sum over the app's LCP, INP and CLS samples; a metric with no samples is null.
 */
export function vitalsByApp(rows: VitalP75Row[]): TelemetryVitals["apps"] {
  type Entry = { lcp: number | null; inp: number | null; cls: number | null; samples: number }
  const byApp = new Map<string, Entry>()
  for (const r of rows) {
    const entry = byApp.get(r.app) ?? { lcp: null, inp: null, cls: null, samples: 0 }
    entry.samples += r.samples
    if (r.name === "LCP") entry.lcp = r.p75
    else if (r.name === "INP") entry.inp = r.p75
    else if (r.name === "CLS") entry.cls = r.p75
    byApp.set(r.app, entry)
  }
  return [...byApp.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([app, e]) => ({
      app: app as TelemetryVitals["apps"][number]["app"],
      samples: e.samples,
      lcp: e.lcp,
      inp: e.inp,
      cls: e.cls,
    }))
}
