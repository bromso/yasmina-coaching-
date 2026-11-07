import { describe, expect, test } from "bun:test"
import { DEFAULT_CLIENT_TIMEOUT_MS } from "../clients"
import { percentile, result, type Sample, startLoop, verdict } from "./common"
import { DRILL_REQUEST_TIMEOUT_MS, judgeOutage, requestBoundMs } from "./database"
import { DRILLS, selectDrills } from "./index"
import { judgeProviders } from "./providers"
import { errorLines, judgeSigterm } from "./sigterm"
import { judgeSlow } from "./slow"

const sample = (start: number, end: number, ok = true, kind?: Sample["kind"]): Sample => ({
  label: "notes.list",
  vu: 0,
  start,
  end,
  ok,
  kind,
})

describe("common", () => {
  test("percentile: nearest rank, 0 for none", () => {
    expect(percentile([], 95)).toBe(0)
    expect(percentile([7], 50)).toBe(7)
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(hundred, 95)).toBe(95)
    expect(percentile(hundred, 100)).toBe(100)
  })

  test("result: PASS only when every check passes, one line naming each", () => {
    expect(result("x", [{ ok: true, text: "ok a" }]).passed).toBe(true)
    const failed = result("x", [
      { ok: true, text: "ok a" },
      { ok: false, text: "✗ b" },
    ])
    expect(failed.passed).toBe(false)
    expect(failed.lines).toEqual(["FAIL x: ok a; ✗ b"])
    expect(verdict("y", true, ["n"])).toBe("PASS y: n")
  })

  test("startLoop records each request, swallows throws, and stops after in-flight ones", async () => {
    let calls = 0
    const loop = startLoop(2, async (_vu, measure) => {
      await measure("x", async () => {
        const n = ++calls
        await Bun.sleep(5)
        if (n % 2 === 0) throw new TypeError("fetch failed")
      })
    })
    await Bun.sleep(40)
    await loop.stop()
    expect(loop.samples.length).toBe(loop.started())
    expect(loop.samples.some((s) => s.ok)).toBe(true)
    expect(loop.samples.some((s) => s.kind === "network")).toBe(true)
    const after = loop.started()
    await Bun.sleep(20)
    expect(loop.started()).toBe(after)
  })
})

describe("database", () => {
  const base = {
    engine: "postgres" as "sqlite" | "postgres",
    outage: { start: 1_000, end: 11_000 },
    recoveryFrom: 12_000,
    boundMs: requestBoundMs(),
    finalReady: 200 as number | string,
    sameProcess: true,
  }

  test("the request bound is the drill's REQUEST_TIMEOUT_MS + 1 s, under the client timeout", () => {
    expect(DRILL_REQUEST_TIMEOUT_MS).toBe(3_000)
    expect(requestBoundMs()).toBe(4_000)
    expect(requestBoundMs()).toBeLessThan(DEFAULT_CLIENT_TIMEOUT_MS)
  })

  test("passes on a 503 during the outage, bounded requests and a clean recovery", () => {
    const checks = judgeOutage({
      ...base,
      probes: [
        { at: 500, answer: 200 },
        { at: 2_000, answer: 503 },
        { at: 12_500, answer: 200 },
      ],
      samples: [sample(900, 4_000, false, "status:503"), sample(12_100, 12_110)],
    })
    expect(checks.every((c) => c.ok)).toBe(true)
  })

  test("fails when /ready hangs or never says 503", () => {
    const hung = judgeOutage({
      ...base,
      probes: [
        { at: 2_000, answer: 503 },
        { at: 5_000, answer: "timeout" },
      ],
      samples: [sample(12_100, 12_110)],
    })
    expect(hung[0]?.ok).toBe(false)
    const healthy = judgeOutage({
      ...base,
      probes: [{ at: 2_000, answer: 200 }],
      samples: [sample(12_100, 12_110)],
    })
    expect(healthy[0]?.ok).toBe(false)
  })

  test("fails on a request past the bound, a client timeout, an error after release, or no recovery traffic", () => {
    const probes = [{ at: 2_000, answer: 503 }]
    const slow = judgeOutage({
      ...base,
      probes,
      samples: [sample(1_000, 6_000), sample(12_100, 12_110)],
    })
    expect(slow[1]?.ok).toBe(false)
    const aborted = judgeOutage({
      ...base,
      probes,
      samples: [sample(1_000, 2_000, false, "timeout"), sample(12_100, 12_110)],
    })
    expect(aborted[1]?.ok).toBe(false)
    const broken = judgeOutage({
      ...base,
      probes,
      samples: [sample(12_100, 12_110, false, "status:500")],
    })
    expect(broken[2]?.ok).toBe(false)
    expect(judgeOutage({ ...base, probes, samples: [] })[2]?.ok).toBe(false)
    expect(
      judgeOutage({ ...base, probes, samples: [sample(12_100, 12_110)], sameProcess: false })[4]?.ok
    ).toBe(false)
  })

  test("SQLite records /ready and the stall but judges only recovery and survival", () => {
    const sqlite = { ...base, engine: "sqlite" as const }
    const stalled = judgeOutage({
      ...sqlite,
      probes: [{ at: 2_000, answer: "timeout" }],
      samples: [sample(1_000, 11_000, false, "timeout"), sample(12_100, 12_110)],
    })
    expect(stalled.every((c) => c.ok)).toBe(true)
    expect(stalled[0]?.text).toMatch(/^info .*longest stall 10000 ms/)
    const notRecovered = judgeOutage({
      ...sqlite,
      probes: [],
      samples: [sample(12_100, 12_110, false, "status:500")],
    })
    expect(notRecovered[1]?.ok).toBe(false)
    expect(
      judgeOutage({ ...sqlite, probes: [], samples: [sample(12_100, 12_110)], finalReady: 503 })[2]
        ?.ok
    ).toBe(false)
    expect(
      judgeOutage({
        ...sqlite,
        probes: [],
        samples: [sample(12_100, 12_110)],
        sameProcess: false,
      })[3]?.ok
    ).toBe(false)
  })
})

describe("slow", () => {
  const list = (ms: number, n = 20) =>
    Array.from({ length: n }, (_, i) => sample(i * 10, i * 10 + ms))

  test("passes when p95 sits between the delay and 2 s with no 5xx or timeout", () => {
    expect(judgeSlow(list(400)).every((c) => c.ok)).toBe(true)
  })

  test("fails when the delay did not apply, when it is too slow, on a 5xx or a timeout", () => {
    expect(judgeSlow(list(20))[0]?.ok).toBe(false)
    expect(judgeSlow(list(2_500))[0]?.ok).toBe(false)
    expect(judgeSlow([...list(400), sample(0, 300, false, "status:503")])[1]?.ok).toBe(false)
    expect(judgeSlow([...list(400), sample(0, 10_000, false, "timeout")])[2]?.ok).toBe(false)
  })
})

describe("providers", () => {
  const good = {
    upload: { kind: "status:503" as const, ms: 12 },
    healthAfter: 200,
    retriedBefore: 0,
    retriedAfter: 3,
    deadAfter: 0,
    samples: [sample(0, 5), sample(10, 14)],
  }

  test("passes on a prompt error status, live health, rising retries and a fast notes.list", () => {
    expect(judgeProviders(good).every((c) => c.ok)).toBe(true)
  })

  test("fails on a hung or successful upload, a dead api, no retries, or slow reads", () => {
    expect(judgeProviders({ ...good, upload: { kind: "timeout", ms: 10_000 } })[0]?.ok).toBe(false)
    expect(judgeProviders({ ...good, upload: { kind: "ok", ms: 10 } })[0]?.ok).toBe(false)
    // A generic 500 is not the declared answer.
    expect(judgeProviders({ ...good, upload: { kind: "status:500", ms: 10 } })[0]?.ok).toBe(false)
    expect(judgeProviders({ ...good, healthAfter: "network" })[1]?.ok).toBe(false)
    expect(judgeProviders({ ...good, retriedAfter: 0 })[2]?.ok).toBe(false)
    expect(judgeProviders({ ...good, deadAfter: 1 })[2]?.ok).toBe(false)
    expect(judgeProviders({ ...good, samples: [sample(0, 900)] })[3]?.ok).toBe(false)
  })
})

describe("sigterm", () => {
  const good = {
    started: 3,
    samples: [sample(0, 5), sample(90, 120), sample(95, 130)],
    signalAt: 100,
    closedAfterMs: 50,
    newRequestRefused: true,
    exit: { code: 0, afterMs: 60 },
    errors: [],
  }

  test("passes when in-flight requests finish, the port closes, the exit is 0 and the log clean", () => {
    expect(judgeSigterm(good).every((c) => c.ok)).toBe(true)
  })

  test("fails on a cut-off request, a port still open, a bad exit or an error line", () => {
    expect(judgeSigterm({ ...good, samples: [sample(90, 120, false, "network")] })[0]?.ok).toBe(
      false
    )
    expect(judgeSigterm({ ...good, started: 4 })[0]?.ok).toBe(false)
    expect(
      judgeSigterm({ ...good, samples: [sample(0, 5), sample(10, 20)], started: 2 })[0]?.ok
    ).toBe(false)
    // A request started after the signal may be refused.
    const refused = [...good.samples, sample(101, 102, false, "network")]
    expect(judgeSigterm({ ...good, samples: refused, started: 4 })[0]?.ok).toBe(true)
    expect(judgeSigterm({ ...good, closedAfterMs: null })[1]?.ok).toBe(false)
    expect(judgeSigterm({ ...good, closedAfterMs: 9_000 })[1]?.ok).toBe(false)
    expect(judgeSigterm({ ...good, newRequestRefused: false })[1]?.ok).toBe(false)
    expect(judgeSigterm({ ...good, exit: { code: 1, afterMs: 60 } })[2]?.ok).toBe(false)
    expect(judgeSigterm({ ...good, exit: null })[2]?.ok).toBe(false)
    expect(judgeSigterm({ ...good, errors: ["x"] })[3]?.ok).toBe(false)
  })

  test("errorLines picks error-level JSON lines and unhandled rejections", () => {
    const log = [
      '{"level":"info","message":"shutting down"}',
      '{"level":"error","message":"unhandled","error":{}}',
      "error: Unhandled promise rejection",
      '{"level":"warn","message":"fine"}',
    ].join("\n")
    expect(errorLines(log)).toHaveLength(2)
  })
})

describe("index", () => {
  test("no names runs every drill; names select; an unknown one throws", () => {
    expect(selectDrills([])).toEqual(Object.keys(DRILLS) as never)
    expect(selectDrills(["slow", "sigterm"])).toEqual(["slow", "sigterm"])
    expect(() => selectDrills(["nope"])).toThrow("unknown drill nope")
  })
})
