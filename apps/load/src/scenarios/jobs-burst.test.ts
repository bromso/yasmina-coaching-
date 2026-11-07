import { describe, expect, test } from "bun:test"
import { createHistogram } from "../histogram"
import {
  assertDrainCounts,
  DEFAULT_DRAIN_TIMEOUT_MS,
  DEFAULT_ENQUEUE_CONCURRENCY,
  DEFAULT_JOBS,
  parseDrainTimeoutMs,
  parseEnqueueConcurrency,
  parseJobsCount,
  pollDrain,
  probeResult,
} from "./jobs-burst"

describe("parseJobsCount / parseEnqueueConcurrency / parseDrainTimeoutMs", () => {
  test("default when unset", () => {
    expect(parseJobsCount({})).toBe(DEFAULT_JOBS)
    expect(parseEnqueueConcurrency({})).toBe(DEFAULT_ENQUEUE_CONCURRENCY)
    expect(parseDrainTimeoutMs({})).toBe(DEFAULT_DRAIN_TIMEOUT_MS)
  })

  test("parses a positive integer", () => {
    expect(parseJobsCount({ LOAD_JOBS: "200" })).toBe(200)
    expect(parseEnqueueConcurrency({ LOAD_JOBS_CONCURRENCY: "10" })).toBe(10)
    expect(parseDrainTimeoutMs({ LOAD_DRAIN_TIMEOUT_MS: "5000" })).toBe(5_000)
  })

  test("throws on zero, negative or non-numeric", () => {
    for (const bad of ["0", "-5", "nope", "1.5"]) {
      expect(() => parseJobsCount({ LOAD_JOBS: bad })).toThrow("LOAD_JOBS")
      expect(() => parseEnqueueConcurrency({ LOAD_JOBS_CONCURRENCY: bad })).toThrow(
        "LOAD_JOBS_CONCURRENCY"
      )
    }
  })
})

describe("assertDrainCounts", () => {
  test("no failures when every count matches exactly", () => {
    expect(assertDrainCounts(200, 200, 0, 200)).toEqual([])
  })

  test("flags a succeeded delta under the enqueued count (a loss)", () => {
    const failures = assertDrainCounts(200, 199, 0, 199)
    expect(failures.some((f) => f.includes("succeeded delta 199"))).toBe(true)
  })

  test("flags a succeeded delta over the enqueued count (run twice)", () => {
    const failures = assertDrainCounts(200, 201, 0, 201)
    expect(failures.some((f) => f.includes("succeeded delta 201"))).toBe(true)
  })

  test("flags any dead delta", () => {
    expect(assertDrainCounts(200, 200, 1, 200)[0]).toContain("dead delta 1")
  })

  test("flags a mailbox delta that does not equal enqueued (missing or duplicate files)", () => {
    expect(assertDrainCounts(200, 200, 0, 199)[0]).toContain("gained 199")
    expect(assertDrainCounts(200, 200, 0, 201)[0]).toContain("gained 201")
  })

  test("reports every mismatch at once, not just the first", () => {
    expect(assertDrainCounts(200, 190, 2, 195)).toHaveLength(3)
  })
})

describe("probeResult", () => {
  test("wraps the histogram as the notes.list label, splitting ok from errored", () => {
    const h = createHistogram()
    h.record(10)
    h.record(20)
    h.record(30)
    const errors = new Map([["status:500", 1]])
    const result = probeResult(h, 1_000, errors)
    const stats = result.labels["notes.list"]
    expect(stats?.count).toBe(3)
    expect(stats?.ok).toBe(2)
    expect(stats?.errors).toEqual({ "status:500": 1 })
    expect(stats?.rps).toBe(3)
  })

  test("empty errors map yields an empty errors object and ok === count", () => {
    const result = probeResult(createHistogram(), 1_000, new Map())
    expect(result.labels["notes.list"]).toMatchObject({ count: 0, ok: 0, errors: {} })
  })
})

describe("pollDrain", () => {
  const url = new URL("http://127.0.0.1:1/")

  test("resolves drained once queued+running reads 0 on two consecutive polls", async () => {
    const readings = ["12", "3", "0", "0"]
    let call = 0
    const sleeps: number[] = []
    const fakeFetch = async () => {
      const queued = readings[call++] ?? "0"
      return new Response(`jobs_queue{status="queued"} ${queued}\njobs_queue{status="running"} 0\n`)
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as unknown as typeof fetch
    try {
      const result = await pollDrain(url, "t", {
        initialDelayMs: 0,
        intervalMs: 50,
        sleep: async (ms) => {
          sleeps.push(ms)
        },
      })
      expect(result.drained).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(sleeps).toEqual([0, 50, 50, 50])
  })

  test("a single zero reading is not enough: the next non-zero reading resets the streak", async () => {
    const readings = ["0", "5", "0", "0"]
    let call = 0
    const fakeFetch = async () =>
      new Response(
        `jobs_queue{status="queued"} ${readings[call++] ?? "0"}\njobs_queue{status="running"} 0\n`
      )
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as unknown as typeof fetch
    try {
      const result = await pollDrain(url, "t", {
        initialDelayMs: 0,
        intervalMs: 1,
        sleep: async () => {},
      })
      expect(result.drained).toBe(true)
      expect(call).toBe(4)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("gives up and reports not drained after the timeout", async () => {
    const fakeFetch = async () =>
      new Response(`jobs_queue{status="queued"} 5\njobs_queue{status="running"} 0\n`)
    const originalFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as unknown as typeof fetch
    let now = 0
    try {
      const result = await pollDrain(url, "t", {
        initialDelayMs: 0,
        intervalMs: 10,
        timeoutMs: 25,
        sleep: async (ms) => {
          now += ms
        },
      })
      expect(result.drained).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
    expect(now).toBeGreaterThan(0)
  })
})
