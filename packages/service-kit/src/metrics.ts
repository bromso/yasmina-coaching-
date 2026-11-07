import { createBearerCheck } from "./guard"

export type Labels = Record<string, string>

export type Counter = {
  inc(labels?: Labels, by?: number): void
}

export type Gauge = {
  set(labels?: Labels, value?: number): void
}

export type Histogram = {
  observe(labels?: Labels, seconds?: number): void
}

export type CollectResult = number | Array<{ labels: Labels; value: number }>

export type GaugeCollect = () => CollectResult | Promise<CollectResult>

export type Registry = {
  counter(name: string, help: string, labelNames?: string[]): Counter
  gauge(name: string, help: string, labelNames?: string[], collect?: GaugeCollect): Gauge
  histogram(name: string, help: string, labelNames?: string[], buckets?: number[]): Histogram
  render(): Promise<string>
}

/** Default latency buckets, in seconds. */
export const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
]

const NO_LABELS: Labels = {}

function labelKey(labels: Labels): string {
  return JSON.stringify(
    Object.keys(labels)
      .sort()
      .map((key) => [key, labels[key]])
  )
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
}

function sampleLine(name: string, labels: Labels, value: number): string {
  const entries = Object.entries(labels)
  if (entries.length === 0) return `${name} ${value}`
  const rendered = entries.map(([key, v]) => `${key}="${escapeLabelValue(v)}"`).join(",")
  return `${name}{${rendered}} ${value}`
}

type MetricEntry = {
  name: string
  help: string
  type: "counter" | "gauge" | "histogram"
  lines: () => Promise<string[]>
}

/** How long one scrape-time collector (a database read) may take before its metric is skipped. */
export const COLLECT_TIMEOUT_MS = 2_000

async function renderMetric(metric: MetricEntry, timeoutMs: number): Promise<string[]> {
  let body: string[]
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // A throwing or hung collector (a database that stops answering) must not fail or stall the
    // whole scrape: skip this metric only.
    body = await Promise.race([
      metric.lines(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("collector timed out")), timeoutMs)
      }),
    ])
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
  if (body.length === 0) return []
  return [`# HELP ${metric.name} ${metric.help}`, `# TYPE ${metric.name} ${metric.type}`, ...body]
}

/** An in-process, dependency-free Prometheus registry rendering text format 0.0.4. */
export function createRegistry({
  collectTimeoutMs = COLLECT_TIMEOUT_MS,
}: {
  collectTimeoutMs?: number
} = {}): Registry {
  const metrics: MetricEntry[] = []

  function counter(name: string, help: string, _labelNames: string[] = []): Counter {
    const values = new Map<string, { labels: Labels; value: number }>()
    metrics.push({
      name,
      help,
      type: "counter",
      lines: async () =>
        Array.from(values.values()).map((entry) => sampleLine(name, entry.labels, entry.value)),
    })
    return {
      inc(labels = NO_LABELS, by = 1) {
        const key = labelKey(labels)
        const existing = values.get(key)
        if (existing) existing.value += by
        else values.set(key, { labels, value: by })
      },
    }
  }

  function gauge(
    name: string,
    help: string,
    _labelNames: string[] = [],
    collect?: GaugeCollect
  ): Gauge {
    const values = new Map<string, { labels: Labels; value: number }>()
    metrics.push({
      name,
      help,
      type: "gauge",
      lines: async () => {
        if (collect) {
          const result = await collect()
          const samples =
            typeof result === "number" ? [{ labels: NO_LABELS, value: result }] : result
          return samples.map((sample) => sampleLine(name, sample.labels, sample.value))
        }
        return Array.from(values.values()).map((entry) =>
          sampleLine(name, entry.labels, entry.value)
        )
      },
    })
    return {
      set(labels = NO_LABELS, value = 0) {
        values.set(labelKey(labels), { labels, value })
      },
    }
  }

  function histogram(
    name: string,
    help: string,
    _labelNames: string[] = [],
    buckets: number[] = DEFAULT_BUCKETS as number[]
  ): Histogram {
    const sorted = [...buckets].sort((a, b) => a - b)
    type BucketCount = { threshold: number; count: number }
    type Entry = { labels: Labels; buckets: BucketCount[]; sum: number; count: number }
    const values = new Map<string, Entry>()

    metrics.push({
      name,
      help,
      type: "histogram",
      lines: async () => {
        const out: string[] = []
        for (const entry of values.values()) {
          for (const bucket of entry.buckets) {
            out.push(
              sampleLine(
                `${name}_bucket`,
                { ...entry.labels, le: String(bucket.threshold) },
                bucket.count
              )
            )
          }
          out.push(sampleLine(`${name}_bucket`, { ...entry.labels, le: "+Inf" }, entry.count))
          out.push(sampleLine(`${name}_sum`, entry.labels, entry.sum))
          out.push(sampleLine(`${name}_count`, entry.labels, entry.count))
        }
        return out
      },
    })

    return {
      observe(labels = NO_LABELS, seconds = 0) {
        const key = labelKey(labels)
        let entry = values.get(key)
        if (!entry) {
          entry = {
            labels,
            buckets: sorted.map((threshold) => ({ threshold, count: 0 })),
            sum: 0,
            count: 0,
          }
          values.set(key, entry)
        }
        for (const bucket of entry.buckets) {
          if (seconds <= bucket.threshold) bucket.count++
        }
        entry.sum += seconds
        entry.count++
      },
    }
  }

  async function render(): Promise<string> {
    const rendered = await Promise.all(
      metrics.map((metric) => renderMetric(metric, collectTimeoutMs))
    )
    const lines = rendered.flat()
    return lines.length === 0 ? "" : `${lines.join("\n")}\n`
  }

  return { counter, gauge, histogram, render }
}

/**
 * `/metrics` behind an optional bearer token: unset `token` -> 404 (never silently open), a
 * missing or wrong token -> 401 (compared in constant time), else the Prometheus exposition.
 */
export function metricsRoute(
  registry: Registry,
  token: string | undefined
): (req: Request) => Promise<Response> {
  const hasToken = token ? createBearerCheck(token) : null
  return async (req: Request): Promise<Response> => {
    if (!hasToken) return new Response("Not Found", { status: 404 })
    if (!hasToken(req)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "www-authenticate": "Bearer" },
      })
    }

    const body = await registry.render()
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
    })
  }
}
