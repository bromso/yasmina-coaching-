import { describe, expect, test } from "bun:test"
import { createHistogram } from "../histogram"
import {
  burstUntilDropped,
  capFailure,
  DEFAULT_PROCESS_CAP,
  DEFAULT_REALTIME_DURATION_MS,
  DEFAULT_STREAMS,
  DEFAULT_WORKSPACES,
  DROP_BATCH,
  DROP_BURST_MAX,
  deliveryResult,
  distribute,
  extractSentAt,
  parseProcessCap,
  parseRealtimeDurationMs,
  parseStreams,
  parseWorkspaces,
  planSlots,
  slotCounts,
} from "./realtime"

describe("parseStreams / parseWorkspaces / parseRealtimeDurationMs / parseProcessCap", () => {
  test("default when unset", () => {
    expect(parseStreams({})).toBe(DEFAULT_STREAMS)
    expect(parseWorkspaces({})).toBe(DEFAULT_WORKSPACES)
    expect(parseRealtimeDurationMs({})).toBe(DEFAULT_REALTIME_DURATION_MS)
    expect(parseProcessCap({})).toBe(DEFAULT_PROCESS_CAP)
  })

  test("parses a positive integer", () => {
    expect(parseStreams({ LOAD_STREAMS: "40" })).toBe(40)
    expect(parseWorkspaces({ LOAD_WORKSPACES: "4" })).toBe(4)
    expect(parseRealtimeDurationMs({ LOAD_REALTIME_DURATION_MS: "5000" })).toBe(5_000)
    expect(parseProcessCap({ LOAD_PROCESS_CAP: "5" })).toBe(5)
  })

  test("throws on zero, negative or non-numeric", () => {
    for (const bad of ["0", "-5", "nope", "1.5"]) {
      expect(() => parseStreams({ LOAD_STREAMS: bad })).toThrow("LOAD_STREAMS")
      expect(() => parseWorkspaces({ LOAD_WORKSPACES: bad })).toThrow("LOAD_WORKSPACES")
    }
  })
})

describe("distribute", () => {
  test("divides evenly when it can", () => {
    expect(distribute(20, 10)).toEqual(Array(10).fill(2))
  })

  test("gives the remainder to the first buckets", () => {
    expect(distribute(23, 10)).toEqual([3, 3, 3, 2, 2, 2, 2, 2, 2, 2])
  })

  test("every count sums back to the total", () => {
    for (const [total, buckets] of [
      [200, 10],
      [7, 3],
      [1, 5],
      [0, 4],
    ] as const) {
      const counts = distribute(total, buckets)
      expect(counts).toHaveLength(buckets)
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total)
    }
  })

  test("throws on non-positive buckets or a negative total", () => {
    expect(() => distribute(10, 0)).toThrow("buckets")
    expect(() => distribute(-1, 2)).toThrow("total")
  })
})

describe("planSlots", () => {
  test("fills one session (5) then the next, within one user, before a second user", () => {
    const slots = planSlots(12)
    expect(slots.slice(0, 5)).toEqual(
      Array.from({ length: 5 }, () => ({ userIndex: 0, sessionIndex: 0 }))
    )
    expect(slots.slice(5, 10)).toEqual(
      Array.from({ length: 5 }, () => ({ userIndex: 0, sessionIndex: 1 }))
    )
    expect(slots.slice(10, 12)).toEqual([
      { userIndex: 1, sessionIndex: 0 },
      { userIndex: 1, sessionIndex: 0 },
    ])
  })

  test("never puts more than maxPerUser on one user even across many sessions", () => {
    const slots = planSlots(23, 5, 10)
    for (let u = 0; u <= 2; u++) {
      expect(slots.filter((s) => s.userIndex === u).length).toBeLessThanOrEqual(10)
    }
    expect(slots).toHaveLength(23)
  })

  test("empty for 0", () => {
    expect(planSlots(0)).toEqual([])
  })

  test("custom caps are honoured", () => {
    const slots = planSlots(7, 2, 4)
    expect(slots.filter((s) => s.userIndex === 0)).toHaveLength(4)
    expect(slots.filter((s) => s.userIndex === 1)).toHaveLength(3)
    expect(new Set(slots.filter((s) => s.userIndex === 0).map((s) => s.sessionIndex)).size).toBe(2)
  })
})

describe("slotCounts", () => {
  test("20 streams (the default-run per-workspace count) need 2 users, 2 sessions each", () => {
    const { users, sessionsPerUser } = slotCounts(planSlots(20))
    expect(users).toBe(2)
    expect(sessionsPerUser).toEqual([2, 2])
  })

  test("3 streams need 1 user, 1 session", () => {
    expect(slotCounts(planSlots(3))).toEqual({ users: 1, sessionsPerUser: [1] })
  })

  test("empty plan needs 0 users", () => {
    expect(slotCounts([])).toEqual({ users: 0, sessionsPerUser: [] })
  })
})

describe("extractSentAt", () => {
  test("reads sentAt from a note.created event's note body", () => {
    const data = JSON.stringify({
      type: "note.created",
      note: {
        id: 1,
        title: "x",
        body: JSON.stringify({ sentAt: 123.5 }),
        createdAt: "now",
        authorId: 1,
        apiKey: null,
      },
    })
    expect(extractSentAt(data)).toBe(123.5)
  })

  test("null for a presence or resync event", () => {
    expect(extractSentAt(JSON.stringify({ type: "resync" }))).toBeNull()
    expect(
      extractSentAt(JSON.stringify({ type: "presence", replicaId: "r", members: [] }))
    ).toBeNull()
  })

  test("null for unparseable JSON or a body with no sentAt", () => {
    expect(extractSentAt("not json")).toBeNull()
    const data = JSON.stringify({
      type: "note.created",
      note: { body: JSON.stringify({ other: 1 }) },
    })
    expect(extractSentAt(data)).toBeNull()
  })
})

describe("capFailure", () => {
  test("null when the status matches", () => {
    expect(capFailure("x", 429, 429)).toBeNull()
  })

  test("names the label, actual and expected when it does not", () => {
    expect(capFailure("6th stream", 200, 429)).toBe("6th stream: got 200, expected 429")
  })
})

describe("deliveryResult", () => {
  test("wraps the histogram as one label, counting open failures as errors", () => {
    const h = createHistogram()
    h.record(10)
    h.record(20)
    const result = deliveryResult(h, 1_000, 1)
    const stats = result.labels["note.delivery"]
    expect(stats?.count).toBe(3)
    expect(stats?.ok).toBe(2)
    expect(stats?.errors).toEqual({ "stream-open-failed": 1 })
    expect(stats?.rps).toBe(2)
  })

  test("no errors key when every stream opened", () => {
    const result = deliveryResult(createHistogram(), 1_000, 0)
    expect(result.labels["note.delivery"]?.errors).toEqual({})
  })
})

describe("burstUntilDropped", () => {
  test("stops at the first batch after which the drop is seen", async () => {
    const batches: Array<[number, number]> = []
    let checks = 0
    const result = await burstUntilDropped({
      max: 100,
      batch: 25,
      create: async (count, offset) => {
        batches.push([count, offset])
      },
      dropped: async () => ++checks >= 2,
    })
    expect(result).toEqual({ sent: 50, seen: true })
    expect(batches).toEqual([
      [25, 0],
      [25, 25],
    ])
  })

  test("runs to max (last batch trimmed) when the drop cannot be observed", async () => {
    const batches: number[] = []
    const result = await burstUntilDropped({
      max: 60,
      batch: 25,
      create: async (count) => {
        batches.push(count)
      },
      dropped: async () => undefined,
    })
    expect(result).toEqual({ sent: 60, seen: false })
    expect(batches).toEqual([25, 25, 10])
  })

  test("the default burst is far past the ~1.75 MB a never-reading client was seen to absorb", () => {
    // Each note is ≈ 7 KB framed; 250 of them (≈ 1.75 MB) was not always enough to trip the drop.
    expect(DROP_BURST_MAX * 7_000).toBeGreaterThanOrEqual(3 * 250 * 7_000)
    expect(DROP_BURST_MAX % DROP_BATCH).toBe(0)
  })
})
