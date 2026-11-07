import { describe, expect, test } from "bun:test"
import type { Note } from "@repo/api-contract"
import type { RealtimeEvent } from "@repo/api-contract/realtime"
import {
  applyRealtimeEvent,
  connectionErrored,
  connectionOpened,
  decideAfterProbe,
  hasPresence,
  initialConnection,
  type LiveState,
  presentMembers,
  probeStream,
  reconnectDelay,
  refusalFor,
  shouldRefreshOnResync,
} from "./realtime"

function note(id: number, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: `Note ${id}`,
    body: "",
    createdAt: "2026-10-06T00:00:00.000Z",
    authorId: 1,
    apiKey: null,
    ...overrides,
  }
}

function state(overrides: Partial<LiveState> = {}): LiveState {
  return { notes: [], firstPage: true, presence: {}, ...overrides }
}

describe("applyRealtimeEvent", () => {
  test("note.created prepends on the first page", () => {
    const result = applyRealtimeEvent(
      state({ notes: [note(1)] }),
      {
        type: "note.created",
        note: note(2),
      } satisfies RealtimeEvent,
      0
    )
    expect(result).not.toBe("resync")
    expect((result as LiveState).notes.map((n) => n.id)).toEqual([2, 1])
  })

  test("the same note.created id arrives twice but is applied once", () => {
    const withEvent = applyRealtimeEvent(
      state({ notes: [note(1)] }),
      { type: "note.created", note: note(2) },
      0
    ) as LiveState
    const again = applyRealtimeEvent(
      withEvent,
      { type: "note.created", note: note(2) },
      1
    ) as LiveState
    expect(again.notes.map((n) => n.id)).toEqual([2, 1])
  })

  test("note.created on a later page leaves the list unchanged", () => {
    const initial = state({ notes: [note(1)], firstPage: false })
    const result = applyRealtimeEvent(initial, { type: "note.created", note: note(2) }, 0)
    expect(result).toBe(initial)
  })

  test("note.deleted removes by id on any page", () => {
    const firstPage = applyRealtimeEvent(
      state({ notes: [note(1), note(2)], firstPage: true }),
      { type: "note.deleted", id: 1 },
      0
    ) as LiveState
    expect(firstPage.notes.map((n) => n.id)).toEqual([2])

    const laterPage = applyRealtimeEvent(
      state({ notes: [note(1), note(2)], firstPage: false }),
      { type: "note.deleted", id: 1 },
      0
    ) as LiveState
    expect(laterPage.notes.map((n) => n.id)).toEqual([2])
  })

  test("resync signals the caller to refresh instead of updating state", () => {
    const result = applyRealtimeEvent(state(), { type: "resync" }, 0)
    expect(result).toBe("resync")
  })

  test("presence stores the snapshot by replicaId", () => {
    const result = applyRealtimeEvent(
      state(),
      {
        type: "presence",
        replicaId: "r1",
        members: [{ userId: 1, name: "Ada", avatarUrl: null }],
      },
      1000
    ) as LiveState
    expect(result.presence.r1).toEqual({
      members: [{ userId: 1, name: "Ada", avatarUrl: null }],
      seenAt: 1000,
    })
  })

  test("a newer presence snapshot for the same replica replaces the older one", () => {
    const first = applyRealtimeEvent(
      state(),
      { type: "presence", replicaId: "r1", members: [{ userId: 1, name: "Ada", avatarUrl: null }] },
      1000
    ) as LiveState
    const second = applyRealtimeEvent(
      first,
      { type: "presence", replicaId: "r1", members: [{ userId: 2, name: "Zoe", avatarUrl: null }] },
      2000
    ) as LiveState
    expect(Object.keys(second.presence)).toEqual(["r1"])
    expect(second.presence.r1).toEqual({
      members: [{ userId: 2, name: "Zoe", avatarUrl: null }],
      seenAt: 2000,
    })
  })
})

describe("presentMembers", () => {
  test("merges snapshots from two replicas and de-duplicates a shared user", () => {
    const withBoth = state({
      presence: {
        r1: {
          members: [
            { userId: 1, name: "Ada", avatarUrl: null },
            { userId: 2, name: "Zoe", avatarUrl: null },
          ],
          seenAt: 1000,
        },
        r2: {
          members: [
            { userId: 2, name: "Zoe", avatarUrl: null },
            { userId: 3, name: "Max", avatarUrl: null },
          ],
          seenAt: 1000,
        },
      },
    })
    const members = presentMembers(withBoth, 1000)
    expect(members.map((m) => m.userId).sort()).toEqual([1, 2, 3])
  })

  test("drops a replica unheard from for 61 seconds", () => {
    const withStale = state({
      presence: {
        r1: { members: [{ userId: 1, name: "Ada", avatarUrl: null }], seenAt: 0 },
      },
    })
    const members = presentMembers(withStale, 61_000)
    expect(members).toEqual([])
  })

  test("drops a replica unheard from for exactly 60 seconds", () => {
    const withStale = state({
      presence: {
        r1: { members: [{ userId: 1, name: "Ada", avatarUrl: null }], seenAt: 0 },
      },
    })
    const members = presentMembers(withStale, 60_000)
    expect(members).toEqual([])
  })
})

describe("shouldRefreshOnResync", () => {
  const renderedAt = 1_000_000

  test("skips the first resync when the server render is under 5 s old", () => {
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt + 300 })).toBe(false)
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt + 5_000 })).toBe(false)
  })

  test("refreshes on the first resync when the render is older (back/forward cache restore)", () => {
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt + 5_001 })).toBe(true)
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt + 3_600_000 })).toBe(true)
  })

  test("a browser clock a little behind the server still counts the render as fresh", () => {
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt - 2_000 })).toBe(false)
    expect(shouldRefreshOnResync({ opens: 1, renderedAt, now: renderedAt - 60_000 })).toBe(true)
  })

  test("always refreshes on a resync that follows a reconnect", () => {
    expect(shouldRefreshOnResync({ opens: 2, renderedAt, now: renderedAt + 100 })).toBe(true)
    expect(shouldRefreshOnResync({ opens: 3, renderedAt, now: renderedAt })).toBe(true)
  })
})

describe("reconnectDelay", () => {
  const mid = () => 0.5

  test("5 s doubling to a 60 s cap", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map((n) => reconnectDelay(n, mid))).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
    ])
  })

  test("jitters ±20 %", () => {
    expect(reconnectDelay(0, () => 0)).toBe(4_000)
    expect(reconnectDelay(0, () => 0.999_999)).toBe(6_000)
    expect(reconnectDelay(10, () => 0)).toBe(48_000)
    expect(reconnectDelay(10, () => 0.999_999)).toBe(72_000)
  })
})

describe("connection state", () => {
  const mid = () => 0.5

  test("an error while the browser retries by itself changes nothing", () => {
    expect(connectionErrored(initialConnection, false, mid)).toEqual({
      state: initialConnection,
      retryInMs: null,
    })
  })

  test("each close backs off further until a successful open resets it", () => {
    let state = connectionOpened(initialConnection)
    const delays: Array<number | null> = []
    for (let i = 0; i < 3; i++) {
      const next = connectionErrored(state, true, mid)
      delays.push(next.retryInMs)
      state = next.state
    }
    expect(delays).toEqual([5_000, 10_000, 20_000])
    state = connectionOpened(state)
    expect(state).toEqual({ opens: 2, failures: 0 })
    expect(connectionErrored(state, true, mid).retryInMs).toBe(5_000)
  })

  test("opens count across recreated streams, so the next resync refreshes", () => {
    const first = connectionOpened(initialConnection)
    const closed = connectionErrored(first, true, mid).state
    const reopened = connectionOpened(closed)
    expect(shouldRefreshOnResync({ opens: reopened.opens, renderedAt: 0, now: 0 })).toBe(true)
  })
})

describe("hasPresence", () => {
  test("false with no snapshots yet", () => {
    expect(hasPresence(state())).toBe(false)
  })

  test("true once a snapshot has arrived", () => {
    const withSnapshot = state({
      presence: { r1: { members: [], seenAt: 0 } },
    })
    expect(hasPresence(withSnapshot)).toBe(true)
  })
})

describe("refusalFor", () => {
  test("401 is a sign-out", () => {
    expect(refusalFor(401)).toBe("signedOut")
  })

  test("404 is a gone workspace", () => {
    expect(refusalFor(404)).toBe("gone")
  })

  test("403 is a workspace that requires two-step verification the caller has not turned on", () => {
    expect(refusalFor(403)).toBe("twoFactorRequired")
  })

  test("429, 502, 503 and 200 are not permanent", () => {
    expect(refusalFor(429)).toBeNull()
    expect(refusalFor(502)).toBeNull()
    expect(refusalFor(503)).toBeNull()
    expect(refusalFor(200)).toBeNull()
  })
})

describe("probeStream", () => {
  test("resolves with the status and cancels the body without reading it", async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    const response = new Response(body, { status: 401 })
    const fetchImpl = async () => response
    const status = await probeStream("/api/events?workspace=1", fetchImpl)
    expect(status).toBe(401)
    expect(cancelled).toBe(true)
  })

  test("resolves with null on a network error", async () => {
    const fetchImpl = async () => {
      throw new TypeError("network error")
    }
    const status = await probeStream("/api/events?workspace=1", fetchImpl)
    expect(status).toBeNull()
  })

  test("a rejecting body cancel never surfaces as an unhandled rejection", async () => {
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        return Promise.reject(new Error("cancel failed"))
      },
    })
    const response = new Response(body, { status: 200 })
    const fetchImpl = async () => response
    const status = await probeStream("/api/events?workspace=1", fetchImpl)
    expect(status).toBe(200)
    // Give the detached `.catch(() => {})` a turn; if it were missing, Bun would report an
    // unhandled rejection for this test.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})

describe("decideAfterProbe", () => {
  test("a permanent refusal status refuses, same as refusalFor", () => {
    expect(decideAfterProbe(401)).toEqual({ action: "refuse", refusal: "signedOut" })
    expect(decideAfterProbe(404)).toEqual({ action: "refuse", refusal: "gone" })
    expect(decideAfterProbe(403)).toEqual({ action: "refuse", refusal: "twoFactorRequired" })
  })

  test("a 2xx reconnects at once instead of waiting out the backoff", () => {
    expect(decideAfterProbe(200)).toEqual({ action: "reconnect" })
    expect(decideAfterProbe(204)).toEqual({ action: "reconnect" })
    expect(decideAfterProbe(299)).toEqual({ action: "reconnect" })
  })

  test("a transient non-2xx status, or a network error, waits out the backoff", () => {
    expect(decideAfterProbe(429)).toEqual({ action: "wait" })
    expect(decideAfterProbe(502)).toEqual({ action: "wait" })
    expect(decideAfterProbe(503)).toEqual({ action: "wait" })
    expect(decideAfterProbe(300)).toEqual({ action: "wait" })
    expect(decideAfterProbe(null)).toEqual({ action: "wait" })
  })
})
