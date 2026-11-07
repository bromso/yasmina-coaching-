/**
 * A tiny Prometheus text-exposition reader for the scenarios that sample `/metrics`
 * (`realtime_streams_open`, `jobs_queue{status}`, `job_runs_total{name,outcome}`,
 * `process_resident_memory_bytes`): `parseMetrics` is the pure part (fed the response text,
 * unit-tested directly); `fetchMetrics` is the one line of IO over it, bearer-token gated like
 * `apps/api`'s `/metrics` route itself (see `METRICS_TOKEN` / `stack.ts`'s `LOAD_METRICS_TOKEN`).
 */

export type MetricSample = { labels: Record<string, string>; value: number }
export type Metrics = Map<string, MetricSample[]>

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)$/
const LABEL = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g

/** Parses Prometheus text exposition (format 0.0.4) into samples per metric name. */
export function parseMetrics(text: string): Metrics {
  const out: Metrics = new Map()
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue
    const match = LINE.exec(line)
    if (!match) continue
    const [, name, labelsRaw, valueRaw] = match
    const value = Number(valueRaw)
    if (!name || !Number.isFinite(value)) continue
    const labels: Record<string, string> = {}
    if (labelsRaw) {
      for (const pair of labelsRaw.matchAll(LABEL)) {
        labels[pair[1] as string] = (pair[2] as string).replace(/\\(.)/g, "$1")
      }
    }
    const list = out.get(name) ?? []
    list.push({ labels, value })
    out.set(name, list)
  }
  return out
}

/** The first sample of `name` whose labels match every given key (default: no labels), or undefined. */
export function metricValue(
  metrics: Metrics,
  name: string,
  labels: Record<string, string> = {}
): number | undefined {
  return metrics
    .get(name)
    ?.find((sample) => Object.entries(labels).every(([k, v]) => sample.labels[k] === v))?.value
}

/** Sums every sample of `name` matching `labels` (a subset match, like `metricValue`). */
export function metricSum(
  metrics: Metrics,
  name: string,
  labels: Record<string, string> = {}
): number {
  const samples = metrics.get(name) ?? []
  return samples
    .filter((sample) => Object.entries(labels).every(([k, v]) => sample.labels[k] === v))
    .reduce((sum, sample) => sum + sample.value, 0)
}

/** `GET /metrics` with the bearer token, parsed. Throws on a non-200 (wrong/missing token, 404). */
export async function fetchMetrics(apiUrl: string | URL, token: string): Promise<Metrics> {
  const res = await fetch(new URL("/metrics", apiUrl), {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET /metrics: ${res.status}`)
  return parseMetrics(await res.text())
}
