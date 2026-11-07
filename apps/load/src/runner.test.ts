import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { fakeClock } from "./fake-clock"
import { classifyError, evaluate, HttpError, type RunResult, run } from "./runner"

describe("run — closed model", () => {
  test("3 VUs × 1 s with a 100 ms scenario: ~30 iterations, each ~100 ms", async () => {
    const clock = fakeClock()
    const result = await clock.drive(
      run({
        name: "closed",
        vus: 3,
        durationMs: 1_000,
        now: clock.now,
        sleep: clock.sleep,
        scenario: (ctx) => ctx.measure("step", () => clock.sleep(100)),
      })
    )
    expect(result.model).toBe("closed")
    expect(result.iterations).toBe(30)
    const step = result.labels.step
    expect(step).toMatchObject({ count: 30, ok: 30, errors: {} })
    expect(step?.p50).toBe(100)
    expect(step?.p99).toBe(100)
    expect(step?.rps).toBe(30)
  })

  test("a throwing scenario is counted, never fatal", async () => {
    const clock = fakeClock()
    const result = await clock.drive(
      run({
        name: "throws",
        vus: 2,
        durationMs: 500,
        now: clock.now,
        sleep: clock.sleep,
        scenario: async (ctx) => {
          await ctx.measure("ok", () => clock.sleep(50))
          if (ctx.iteration % 2 === 0) {
            await ctx.measure("bad", async () => {
              await clock.sleep(50)
              throw new ORPCError("INTERNAL_SERVER_ERROR", { status: 500 })
            })
          }
          throw new Error("scenario bug")
        },
      })
    )
    expect(result.iterations).toBeGreaterThan(0)
    expect(result.failedIterations).toBe(result.iterations)
    expect(result.labels.bad?.errors).toEqual({ "status:500": result.labels.bad?.count ?? -1 })
    expect(result.labels.bad?.ok).toBe(0)
  })

  test("warmup requests are discarded", async () => {
    const clock = fakeClock()
    const result = await clock.drive(
      run({
        name: "warmup",
        vus: 1,
        durationMs: 1_000,
        warmupMs: 500,
        now: clock.now,
        sleep: clock.sleep,
        scenario: (ctx) => ctx.measure("step", () => clock.sleep(100)),
      })
    )
    expect(result.labels.step?.count).toBe(10)
    expect(result.iterations).toBe(10)
  })
})

describe("run — open model", () => {
  test("10/s with a 500 ms target: latency ~500 ms from the scheduled start as requests pile up", async () => {
    const clock = fakeClock()
    let concurrent = 0
    let peak = 0
    const result = await clock.drive(
      run({
        name: "open",
        ratePerSecond: 10,
        durationMs: 2_000,
        now: clock.now,
        sleep: clock.sleep,
        scenario: (ctx) =>
          ctx.measure("slow", async () => {
            peak = Math.max(peak, ++concurrent)
            await clock.sleep(500)
            concurrent--
          }),
      })
    )
    expect(result.model).toBe("open")
    expect(result.labels.slow?.count).toBe(20) // arrivals follow the clock, not completions
    expect(result.labels.slow?.p50).toBe(500)
    expect(result.labels.slow?.max).toBe(500)
    expect(peak).toBe(5)
    expect(result.dropped).toBe(0)
  })

  test("latency counts from the scheduled start, not from when the request got going", async () => {
    const clock = fakeClock()
    // A queue in front of the target: each request waits for the previous one (100 ms of service at
    // 20 arrivals/s), so latency must grow with the backlog — a closed loop would hide that.
    let queue = Promise.resolve()
    const result = await clock.drive(
      run({
        name: "backlog",
        ratePerSecond: 20,
        durationMs: 1_000,
        now: clock.now,
        sleep: clock.sleep,
        scenario: (ctx) =>
          ctx.measure("queued", () => {
            const mine = queue.then(() => clock.sleep(100))
            queue = mine
            return mine
          }),
      })
    )
    const stats = result.labels.queued
    expect(stats?.count).toBe(20)
    // Request i is scheduled at 50·i ms and done at 100·(i+1) ms: the last waits 1 050 ms.
    expect(stats?.max).toBe(1_050)
    expect(stats?.p50).toBeGreaterThan(500)
  })

  test("arrivals past maxInFlight are dropped and counted", async () => {
    const clock = fakeClock()
    const result = await clock.drive(
      run({
        name: "capped",
        ratePerSecond: 10,
        maxInFlight: 3,
        durationMs: 2_000,
        now: clock.now,
        sleep: clock.sleep,
        scenario: (ctx) => ctx.measure("slow", () => clock.sleep(500)),
      })
    )
    const started = result.labels.slow?.count ?? 0
    expect(result.dropped).toBeGreaterThan(0)
    expect(started + result.dropped).toBe(20)
    expect(result.iterations).toBe(started)
  })

  test("refuses both models at once", async () => {
    await expect(
      run({ name: "x", vus: 1, ratePerSecond: 1, durationMs: 1, scenario: async () => {} })
    ).rejects.toThrow("not both")
  })
})

describe("classifyError", () => {
  test("an ORPCError's status", () => {
    expect(classifyError(new ORPCError("TOO_MANY_REQUESTS", { status: 429 }))).toBe("status:429")
    expect(classifyError(new HttpError(503))).toBe("status:503")
  })

  test("an abort or a timeout", () => {
    expect(classifyError(new DOMException("aborted", "AbortError"))).toBe("timeout")
    expect(classifyError(new DOMException("timed out", "TimeoutError"))).toBe("timeout")
  })

  test("a failed fetch", async () => {
    const error = await fetch("http://127.0.0.1:1/").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TypeError)
    expect(classifyError(error)).toBe("network")
    expect(classifyError(new TypeError("fetch failed"))).toBe("network")
  })

  test("anything else", () => {
    expect(classifyError(new Error("boom"))).toBe("other")
    expect(classifyError("boom")).toBe("other")
    expect(classifyError(undefined)).toBe("other")
  })

  test("follows a cause", () => {
    const wrapped = new Error("wrapped", { cause: new DOMException("t", "TimeoutError") })
    expect(classifyError(wrapped)).toBe("timeout")
  })
})

const resultWith = (labels: RunResult["labels"]): RunResult => ({
  name: "r",
  model: "closed",
  durationMs: 1_000,
  iterations: 0,
  failedIterations: 0,
  dropped: 0,
  labels,
})

const stats = (over: Partial<RunResult["labels"][string]> = {}) => ({
  count: 100,
  ok: 100,
  errors: {},
  p50: 10,
  p95: 20,
  p99: 30,
  max: 40,
  rps: 100,
  ...over,
})

describe("evaluate", () => {
  test("within budget passes", () => {
    const verdict = evaluate(resultWith({ read: stats() }), [
      { label: "*", p95Ms: 250, max5xx: 0, errorRate: 0.01 },
    ])
    expect(verdict).toEqual({ passed: true, failures: [] })
  })

  test("p95 over budget fails, naming the label", () => {
    const verdict = evaluate(resultWith({ "notes.list": stats({ p95: 300 }) }), [
      { label: "notes.list", p95Ms: 250 },
    ])
    expect(verdict.passed).toBe(false)
    expect(verdict.failures[0]).toContain("notes.list")
    expect(verdict.failures[0]).toContain("p95")
  })

  test("max5xx 0 fails on a single 5xx", () => {
    const verdict = evaluate(
      resultWith({ write: stats({ ok: 99, errors: { "status:503": 1 } }) }),
      [{ label: "*", max5xx: 0 }]
    )
    expect(verdict.passed).toBe(false)
    expect(verdict.failures[0]).toContain("5xx")
  })

  test("429s are not 5xx", () => {
    const verdict = evaluate(
      resultWith({ form: stats({ ok: 10, errors: { "status:429": 90 } }) }),
      [{ label: "form", max5xx: 0 }]
    )
    expect(verdict.passed).toBe(true)
  })

  test("a label with no successes fails even when fast", () => {
    const verdict = evaluate(
      resultWith({ dead: stats({ ok: 0, p95: 1, errors: { "status:500": 100 } }) }),
      [{ label: "dead", p95Ms: 250 }]
    )
    expect(verdict.passed).toBe(false)
    expect(verdict.failures[0]).toContain("0 successful")
  })

  test("error rate over budget fails", () => {
    const verdict = evaluate(resultWith({ x: stats({ ok: 90, errors: { timeout: 10 } }) }), [
      { label: "x", errorRate: 0.05 },
    ])
    expect(verdict.passed).toBe(false)
    expect(verdict.failures[0]).toContain("error rate")
  })

  test("a threshold naming a label that never ran fails", () => {
    expect(evaluate(resultWith({}), [{ label: "missing" }]).passed).toBe(false)
    expect(evaluate(resultWith({}), [{ label: "*" }]).passed).toBe(false)
  })
})
