import { describe, expect, test } from "bun:test"
import { metricSum, metricValue, parseMetrics } from "./metrics-client"

const SAMPLE = `
# HELP realtime_streams_open Open realtime event streams.
# TYPE realtime_streams_open gauge
realtime_streams_open 7
# HELP jobs_queue Jobs in the queue by status.
# TYPE jobs_queue gauge
jobs_queue{status="queued"} 12
jobs_queue{status="running"} 3
jobs_queue{status="dead"} 0
# HELP job_runs_total Job runs by outcome.
# TYPE job_runs_total counter
job_runs_total{name="mail.send",outcome="succeeded"} 150
job_runs_total{name="analytics.event",outcome="succeeded"} 40
job_runs_total{name="mail.send",outcome="dead"} 0
# HELP build_info The running build; always 1.
# TYPE build_info gauge
build_info{version="0.1.0",commit="abc\\"def"} 1
`

describe("parseMetrics", () => {
  test("reads a bare gauge with no labels", () => {
    expect(metricValue(parseMetrics(SAMPLE), "realtime_streams_open")).toBe(7)
  })

  test("reads a labelled sample by matching labels", () => {
    const metrics = parseMetrics(SAMPLE)
    expect(metricValue(metrics, "jobs_queue", { status: "queued" })).toBe(12)
    expect(metricValue(metrics, "jobs_queue", { status: "dead" })).toBe(0)
  })

  test("undefined for an unknown metric or label combination", () => {
    const metrics = parseMetrics(SAMPLE)
    expect(metricValue(metrics, "no_such_metric")).toBeUndefined()
    expect(metricValue(metrics, "jobs_queue", { status: "unknown" })).toBeUndefined()
  })

  test("unescapes a quoted label value", () => {
    const metrics = parseMetrics(SAMPLE)
    expect(metricValue(metrics, "build_info", { commit: 'abc"def' })).toBe(1)
  })

  test("ignores HELP/TYPE/comment lines and blank lines", () => {
    const metrics = parseMetrics(SAMPLE)
    expect(metrics.has("HELP")).toBe(false)
  })

  test("empty text yields an empty map", () => {
    expect(parseMetrics("").size).toBe(0)
  })

  test("metricSum adds every sample matching the given labels", () => {
    const metrics = parseMetrics(SAMPLE)
    expect(metricSum(metrics, "job_runs_total", { outcome: "succeeded" })).toBe(190)
    expect(metricSum(metrics, "job_runs_total", { name: "mail.send" })).toBe(150)
    expect(metricSum(metrics, "job_runs_total")).toBe(190)
  })
})
