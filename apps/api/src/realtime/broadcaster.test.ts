import { afterEach, describe, expect, test } from "bun:test"
import {
  type BroadcastEvent,
  NOTIFY_PAYLOAD_LIMIT,
  type RealtimeEvent,
  userChannel,
  workspaceChannel,
} from "@repo/api-contract"
import { SQL } from "bun"
import { engines, testDatabase } from "../test-db"
import { type Broadcaster, createSubscriberRegistry, encodePayload } from "./broadcaster"
import { createBroadcaster } from "./create-broadcaster"
import { memoryBroadcaster } from "./memory"
import { postgresBroadcaster, resyncOnReconnect } from "./postgres"

const noop = () => {}

const waitFor = async (check: () => boolean | Promise<boolean>, ms = 2_000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(5)
  }
}

/** A note.created event whose `{channel, event}` JSON is exactly `targetBytes` long. */
function eventOfSize(channel: string, targetBytes: number): RealtimeEvent {
  const base: RealtimeEvent = {
    type: "note.created",
    note: {
      id: 1,
      title: "T",
      body: "",
      createdAt: new Date().toISOString(),
      authorId: 1,
      apiKey: null,
    },
  }
  const baseLength = Buffer.byteLength(JSON.stringify({ channel, event: base }))
  const pad = Math.max(0, targetBytes - baseLength)
  return { ...base, note: { ...base.note, body: "x".repeat(pad) } }
}

type Bus = "memory" | "postgres"
const buses: Bus[] = engines.includes("postgres") ? ["memory", "postgres"] : ["memory"]

describe.each(buses)("%s broadcaster", (bus) => {
  const cleanups: Array<() => Promise<void> | void> = []
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn()
  })

  /** A fresh broadcaster on its own database (Postgres: a throwaway one, dropped on cleanup). */
  async function create(): Promise<Broadcaster> {
    if (bus === "memory") return memoryBroadcaster()
    const db = await testDatabase("postgres")
    cleanups.push(() => db.cleanup())
    const broadcaster = await postgresBroadcaster(new SQL(db.url), noop)
    cleanups.push(() => broadcaster.close())
    return broadcaster
  }

  test("a user channel carries notification.created to that user's subscriber only", async () => {
    const broadcaster = await create()
    const mine: BroadcastEvent[] = []
    const theirs: BroadcastEvent[] = []
    const workspace: BroadcastEvent[] = []
    broadcaster.subscribe(userChannel(1), (event) => {
      mine.push(event)
    })
    broadcaster.subscribe(userChannel(2), (event) => {
      theirs.push(event)
    })
    // `user:1` and `workspace:1` are different channels.
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      workspace.push(event)
    })

    await broadcaster.publish(userChannel(1), { type: "notification.created", id: 42 })
    await waitFor(() => mine.length > 0)
    await Bun.sleep(50)

    expect(mine).toEqual([{ type: "notification.created", id: 42 }])
    expect(theirs).toEqual([])
    expect(workspace).toEqual([])
  })

  test("a subscriber of its channel receives a publish; another channel's does not", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    const other: BroadcastEvent[] = []
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })
    broadcaster.subscribe(workspaceChannel(2), (event) => {
      other.push(event)
    })

    await broadcaster.publish(workspaceChannel(1), { type: "note.deleted", id: 7 })
    await waitFor(() => received.length > 0)

    expect(received).toEqual([{ type: "note.deleted", id: 7 }])
    expect(other).toEqual([])
  })

  test("unsubscribe stops delivery", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    const control: BroadcastEvent[] = []
    const unsubscribe = broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })
    unsubscribe()
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      control.push(event)
    })

    await broadcaster.publish(workspaceChannel(1), { type: "resync" })
    // Confirms delivery had time to happen at all (the still-subscribed control got it) before
    // asserting the unsubscribed one got nothing.
    await waitFor(() => control.length > 0)

    expect(received).toEqual([])
  })

  test("two subscribers both receive; one that throws does not block the other", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    broadcaster.subscribe(workspaceChannel(1), () => {
      throw new Error("boom")
    })
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })

    await broadcaster.publish(workspaceChannel(1), { type: "resync" })
    await waitFor(() => received.length > 0)

    expect(received).toEqual([{ type: "resync" }])
  })

  test("an async subscriber that rejects does not block another", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    broadcaster.subscribe(workspaceChannel(1), async () => {
      throw new Error("async boom")
    })
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })

    await broadcaster.publish(workspaceChannel(1), { type: "resync" })
    await waitFor(() => received.length > 0)

    expect(received).toEqual([{ type: "resync" }])
  })

  test("an over-limit payload is rejected before delivery", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })

    const oversized = eventOfSize(workspaceChannel(1), NOTIFY_PAYLOAD_LIMIT)
    await expect(broadcaster.publish(workspaceChannel(1), oversized)).rejects.toThrow(
      "realtime payload too large"
    )
    // Give a real bus a moment to prove nothing was sent, rather than just trusting the throw.
    await Bun.sleep(20)
    expect(received).toEqual([])
  })

  test("close() stops delivery", async () => {
    const broadcaster = await create()
    const received: BroadcastEvent[] = []
    broadcaster.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })
    await broadcaster.close() // afterEach closes it again; both document that as idempotent

    // A publish racing shutdown resolves, like the memory bus — it never throws, so
    // `publishAfterCommit` never records a failure just because the broadcaster had closed.
    await expect(
      broadcaster.publish(workspaceChannel(1), { type: "resync" })
    ).resolves.toBeUndefined()
    await Bun.sleep(20)
    expect(received).toEqual([])
  })
})

describe("encodePayload", () => {
  const channel = workspaceChannel(1)

  test("accepts a payload exactly one byte under the limit", () => {
    const event = eventOfSize(channel, NOTIFY_PAYLOAD_LIMIT - 1)
    expect(Buffer.byteLength(JSON.stringify({ channel, event }))).toBe(NOTIFY_PAYLOAD_LIMIT - 1)
    expect(() => encodePayload(channel, event)).not.toThrow()
  })

  test("refuses a payload exactly at the limit", () => {
    const event = eventOfSize(channel, NOTIFY_PAYLOAD_LIMIT)
    expect(Buffer.byteLength(JSON.stringify({ channel, event }))).toBe(NOTIFY_PAYLOAD_LIMIT)
    expect(() => encodePayload(channel, event)).toThrow("realtime payload too large")
  })
})

describe("memoryBroadcaster", () => {
  test("logs when a subscriber throws, same message as postgres.ts", async () => {
    const logs: Array<[string, unknown]> = []
    const broadcaster = memoryBroadcaster((message, error) => logs.push([message, error]))
    broadcaster.subscribe(workspaceChannel(1), () => {
      throw new Error("boom")
    })

    await broadcaster.publish(workspaceChannel(1), { type: "resync" })
    await waitFor(() => logs.length > 0)

    expect(logs[0]?.[0]).toBe("realtime: subscriber threw")
  })
})

describe("createSubscriberRegistry", () => {
  test("a channel's entry goes away with its last subscriber", () => {
    const registry = createSubscriberRegistry()
    const a = registry.subscribe(workspaceChannel(1), () => {})
    const b = registry.subscribe(workspaceChannel(1), () => {})
    const c = registry.subscribe(workspaceChannel(2), () => {})
    expect(registry.size()).toBe(2)
    a()
    expect(registry.size()).toBe(2)
    b()
    expect(registry.size()).toBe(1)
    expect(registry.channels()).toEqual([workspaceChannel(2)])
    c()
    c() // twice is harmless
    expect(registry.size()).toBe(0)
  })

  test("an unsubscribe from before clear() never removes a newer subscriber's entry", () => {
    const registry = createSubscriberRegistry()
    const stale = registry.subscribe(workspaceChannel(1), noop)
    registry.clear()
    const received: BroadcastEvent[] = []
    registry.subscribe(workspaceChannel(1), (event) => {
      received.push(event)
    })
    stale()
    registry.publishLocal(workspaceChannel(1), { type: "resync" })
    expect(received).toEqual([{ type: "resync" }])
  })
})

describe("postgresBroadcaster close()", () => {
  test("does not hang on an UNLISTEN that is never answered", async () => {
    const closes: unknown[] = []
    const logs: string[] = []
    const fakeSql = {
      listen: async () => ({ unlisten: () => new Promise<void>(() => {}) }),
      close: async (options: unknown) => {
        closes.push(options)
      },
    }
    const broadcaster = await postgresBroadcaster(
      fakeSql as unknown as SQL,
      (message) => logs.push(message),
      { unlistenTimeoutMs: 50 }
    )
    const startedAt = Date.now()
    await broadcaster.close()
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(closes).toEqual([{ timeout: 2 }])
    expect(logs).toEqual(["realtime: UNLISTEN timed out; closing anyway"])
  })
})

describe("resyncOnReconnect", () => {
  test("does nothing on the first call; resyncs every channel with a subscriber from the second", () => {
    const registry = createSubscriberRegistry()
    const onReconnect = resyncOnReconnect(registry, noop)

    const subscribed: BroadcastEvent[] = []
    registry.subscribe(workspaceChannel(1), (event) => {
      subscribed.push(event)
    })
    const unsubscribed: BroadcastEvent[] = []
    const stop = registry.subscribe(workspaceChannel(2), (event) => {
      unsubscribed.push(event)
    })
    stop() // workspace:2 has no subscriber left: channels() must not include it

    onReconnect() // the initial LISTEN ack — not a reconnect, nothing to resync
    expect(subscribed).toEqual([])
    expect(unsubscribed).toEqual([])

    onReconnect() // a reconnect — every channel that still has a subscriber resyncs
    expect(subscribed).toEqual([{ type: "resync" }])
    expect(unsubscribed).toEqual([])
  })
})

describe("postgresBroadcaster", () => {
  if (!engines.includes("postgres")) {
    test.skip("needs TEST_DATABASE_URL", () => {})
    return
  }

  test("two broadcasters on the same database: a publish on A reaches a subscriber on B", async () => {
    const db = await testDatabase("postgres")
    try {
      const a = await postgresBroadcaster(new SQL(db.url), noop)
      const b = await postgresBroadcaster(new SQL(db.url), noop)
      try {
        const received: BroadcastEvent[] = []
        b.subscribe(workspaceChannel(1), (event) => {
          received.push(event)
        })

        await a.publish(workspaceChannel(1), { type: "resync" })
        await waitFor(() => received.length > 0)

        expect(received).toEqual([{ type: "resync" }])
      } finally {
        await a.close()
        await b.close()
      }
    } finally {
      await db.cleanup()
    }
  })

  test("createBroadcaster's client holds two connections, however many publishes run at once", async () => {
    const db = await testDatabase("postgres")
    const admin = new SQL(Bun.env.TEST_DATABASE_URL as string)
    try {
      const dbName = new URL(db.url).pathname.replace(/^\//, "")
      const countConnections = async () => {
        const [row] = await admin<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = ${dbName}
        `
        return row?.n ?? 0
      }
      const broadcaster = await createBroadcaster({
        bus: "postgres",
        databaseUrl: db.url,
        log: noop,
      })
      try {
        await Promise.all(
          Array.from({ length: 30 }, () =>
            broadcaster.publish(workspaceChannel(1), { type: "resync" })
          )
        )
        await Bun.sleep(100)
        // One LISTEN connection (outside the pool) + the pool's one for NOTIFY.
        expect(await countConnections()).toBe(2)
      } finally {
        await broadcaster.close()
      }
    } finally {
      await admin.close()
      await db.cleanup()
    }
  })

  test("close() releases the LISTEN connection", async () => {
    const db = await testDatabase("postgres")
    const admin = new SQL(Bun.env.TEST_DATABASE_URL as string)
    try {
      const dbName = new URL(db.url).pathname.replace(/^\//, "")
      const countConnections = async () => {
        const [row] = await admin<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = ${dbName}
        `
        return row?.n ?? 0
      }

      const broadcaster = await postgresBroadcaster(new SQL(db.url), noop)
      // The LISTEN's dedicated connection may take a moment to show up server-side.
      await waitFor(async () => (await countConnections()) > 0)

      await broadcaster.close()
      // And must go away again — not become a connection the pool just reuses.
      await waitFor(async () => (await countConnections()) === 0)
    } finally {
      await admin.close()
      await db.cleanup()
    }
  })

  test("publish() after close() resolves, like the memory bus, without opening a new connection", async () => {
    const db = await testDatabase("postgres")
    const admin = new SQL(Bun.env.TEST_DATABASE_URL as string)
    try {
      const dbName = new URL(db.url).pathname.replace(/^\//, "")
      const countConnections = async () => {
        const [row] = await admin<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = ${dbName}
        `
        return row?.n ?? 0
      }

      const broadcaster = await postgresBroadcaster(new SQL(db.url), noop)
      await broadcaster.close()
      await waitFor(async () => (await countConnections()) === 0)

      await expect(
        broadcaster.publish(workspaceChannel(1), { type: "resync" })
      ).resolves.toBeUndefined()
      expect(await countConnections()).toBe(0)
    } finally {
      await admin.close()
      await db.cleanup()
    }
  })
})
