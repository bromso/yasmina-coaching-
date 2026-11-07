import { describe, expect, test } from "bun:test"
import { createRegistry, DEFAULT_BUCKETS, metricsRoute } from "./metrics"

describe("createRegistry", () => {
  test("a counter with no labels renders one sample", async () => {
    const registry = createRegistry()
    const requests = registry.counter("requests_total", "Total requests")
    requests.inc()
    requests.inc(undefined, 2)
    const body = await registry.render()
    expect(body).toContain("# HELP requests_total Total requests")
    expect(body).toContain("# TYPE requests_total counter")
    expect(body).toContain("requests_total 3")
  })

  test('a counter with labels renders name{a="x"} value, once per metric header', async () => {
    const registry = createRegistry()
    const requests = registry.counter("requests_total", "Total requests", ["route"])
    requests.inc({ route: "a" })
    requests.inc({ route: "a" }, 2)
    requests.inc({ route: "b" })
    const body = await registry.render()
    const lines = body.split("\n").filter(Boolean)
    expect(lines.filter((l) => l.startsWith("# HELP requests_total"))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith("# TYPE requests_total"))).toHaveLength(1)
    expect(body).toContain('requests_total{route="a"} 3')
    expect(body).toContain('requests_total{route="b"} 1')
  })

  test("label values escape backslash, quote and newline", async () => {
    const registry = createRegistry()
    const g = registry.gauge("g", "A gauge", ["k"])
    g.set({ k: 'back\\slash "quoted"\nline' }, 1)
    const body = await registry.render()
    expect(body).toContain('g{k="back\\\\slash \\"quoted\\"\\nline"} 1')
  })

  test("a gauge without collect renders the last set value", async () => {
    const registry = createRegistry()
    const g = registry.gauge("g", "A gauge")
    g.set(undefined, 5)
    g.set(undefined, 7)
    const body = await registry.render()
    expect(body).toContain("g 7")
  })

  test("a gauge with collect is evaluated on render(), sync or async, number or label array", async () => {
    const registry = createRegistry()
    registry.gauge("sync_gauge", "sync", [], () => 42)
    registry.gauge("async_gauge", "async", [], async () => 9)
    registry.gauge("labelled_gauge", "labelled", ["k"], () => [
      { labels: { k: "a" }, value: 1 },
      { labels: { k: "b" }, value: 2 },
    ])
    const body = await registry.render()
    expect(body).toContain("sync_gauge 42")
    expect(body).toContain("async_gauge 9")
    expect(body).toContain('labelled_gauge{k="a"} 1')
    expect(body).toContain('labelled_gauge{k="b"} 2')
  })

  test("a throwing or rejecting collector renders nothing for that metric, not a failed scrape", async () => {
    const registry = createRegistry()
    registry.gauge("broken", "throws", [], () => {
      throw new Error("boom")
    })
    registry.gauge("broken_async", "rejects", [], async () => {
      throw new Error("boom")
    })
    const other = registry.counter("fine", "still works")
    other.inc()
    const rendered = await registry.render()
    expect(rendered).not.toContain("broken")
    expect(rendered).toContain("fine 1")
  })

  test("a collector that never answers is skipped after the timeout, not a stalled scrape", async () => {
    const registry = createRegistry({ collectTimeoutMs: 50 })
    registry.gauge("hung", "never resolves", [], () => new Promise<number>(() => {}))
    registry.counter("fine", "still works").inc()
    const started = Date.now()
    const rendered = await registry.render()
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(rendered).not.toContain("hung")
    expect(rendered).toContain("fine 1")
  })

  test("a histogram renders cumulative buckets, +Inf, sum and count", async () => {
    const registry = createRegistry()
    const h = registry.histogram("duration_seconds", "Duration", [], [0.1, 0.5, 1])
    h.observe(undefined, 0.05)
    h.observe(undefined, 0.3)
    h.observe(undefined, 2)
    const body = await registry.render()
    expect(body).toContain("# TYPE duration_seconds histogram")
    expect(body).toContain('duration_seconds_bucket{le="0.1"} 1')
    expect(body).toContain('duration_seconds_bucket{le="0.5"} 2')
    expect(body).toContain('duration_seconds_bucket{le="1"} 2')
    expect(body).toContain('duration_seconds_bucket{le="+Inf"} 3')
    expect(body).toContain("duration_seconds_sum 2.35")
    expect(body).toContain("duration_seconds_count 3")
  })

  test("DEFAULT_BUCKETS is the standard latency ladder", () => {
    expect(DEFAULT_BUCKETS).toEqual([0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10])
  })
})

describe("metricsRoute", () => {
  test("404 when no token is configured", async () => {
    const registry = createRegistry()
    const route = metricsRoute(registry, undefined)
    const res = await route(new Request("http://x/metrics"))
    expect(res.status).toBe(404)
  })

  test("401 on a missing or wrong bearer token", async () => {
    const registry = createRegistry()
    const route = metricsRoute(registry, "a-real-token-at-least-24-chars")
    const noAuth = await route(new Request("http://x/metrics"))
    expect(noAuth.status).toBe(401)
    const wrong = await route(
      new Request("http://x/metrics", { headers: { authorization: "Bearer nope" } })
    )
    expect(wrong.status).toBe(401)
  })

  test("200 with the Prometheus exposition and content type on a correct token", async () => {
    const registry = createRegistry()
    registry.counter("requests_total", "Total requests").inc()
    const token = "a-real-token-at-least-24-chars"
    const route = metricsRoute(registry, token)
    const res = await route(
      new Request("http://x/metrics", { headers: { authorization: `Bearer ${token}` } })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8")
    const body = await res.text()
    expect(body).toContain("requests_total 1")
  })
})
