import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { type RealtimeEvent, workspaceChannel } from "@repo/api-contract"
import {
  clientFor,
  eventsOf,
  openStream,
  type SseFrame,
  signedIn,
  signUpVerified,
  signUpWithWorkspace,
  start,
  TOKEN,
} from "../test-server"
import type { Broadcaster } from "./broadcaster"
import { memoryBroadcaster } from "./memory"
import { createPresence } from "./presence"
import { createStreamHandler } from "./stream"

type App = Awaited<ReturnType<typeof start>>
type Stream = Awaited<ReturnType<typeof openStream>>

const apps: App[] = []
const streams: Stream[] = []
afterEach(async () => {
  for (const stream of streams.splice(0)) await stream.close()
  for (const app of apps.splice(0)) await app.stop()
})

async function boot(overrides: Parameters<typeof start>[0] = {}) {
  const app = await start(overrides)
  apps.push(app)
  return app
}

async function open(app: App, input: Parameters<typeof openStream>[1]) {
  const stream = await openStream(app, input)
  streams.push(stream)
  return stream
}

/** An owner with a workspace, plus a second verified user added to it as a member. */
async function workspaceWithTwo(app: App) {
  const owner = await signUpWithWorkspace(app)
  const other = await signUpVerified(app)
  await app.db.memberships.add({
    workspaceId: owner.workspaceId,
    userId: other.user.id,
    role: "member",
  })
  return { owner, other, workspaceId: owner.workspaceId }
}

const isEvent =
  <T extends RealtimeEvent["type"]>(
    type: T,
    where: (e: Extract<RealtimeEvent, { type: T }>) => boolean = () => true
  ) =>
  (frame: SseFrame) =>
    frame.kind === "event" &&
    frame.data.type === type &&
    where(frame.data as Extract<RealtimeEvent, { type: T }>)

const presenceIds = (frame: SseFrame) =>
  frame.kind === "event" && frame.data.type === "presence"
    ? frame.data.members.map((m) => m.userId).sort()
    : []

const within = async (promise: Promise<unknown>, ms: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`not within ${ms} ms`)), ms)
  })
  try {
    await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

describe("GET /events/workspaces/:workspaceId", () => {
  test("no session is 401; a non-member and an unknown workspace are both 404", async () => {
    const app = await boot()
    const { workspaceId } = await signUpWithWorkspace(app)
    const outsider = await signUpVerified(app)

    const anonymous = await open(app, { workspaceId })
    expect(anonymous.status).toBe(401)
    expect(anonymous.json).toMatchObject({ code: "UNAUTHORIZED", message: "Sign in required" })

    const bogus = await open(app, { workspaceId, token: "not-a-session" })
    expect(bogus.status).toBe(401)

    const nonMember = await open(app, { workspaceId, token: outsider.token })
    expect(nonMember.status).toBe(404)
    expect(nonMember.json).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })

    const unknown = await open(app, { workspaceId: 999_999, token: outsider.token })
    expect(unknown.status).toBe(404)
    expect(unknown.json).toEqual(nonMember.json)

    const garbage = await open(app, { workspaceId: "abc", token: outsider.token })
    expect(garbage.status).toBe(404)
  })

  test("the bearer guard applies", async () => {
    const app = await boot()
    const res = await fetch(new URL("/events/workspaces/1", app.server.url))
    expect(res.status).toBe(401)
  })

  test("starts with retry, a presence snapshot listing the member (no email) and a resync", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: owner.workspaceId, token: owner.token })

    expect(stream.status).toBe(200)
    expect(stream.headers.get("content-type")).toBe("text/event-stream")
    expect(stream.headers.get("cache-control")).toBe("no-store")
    expect(stream.headers.get("x-accel-buffering")).toBe("no")

    await stream.waitFor(isEvent("resync"))
    const [retry, presence, resync] = stream.frames
    expect(retry).toEqual({ kind: "retry", retry: 3000 })
    expect(presence).toMatchObject({ kind: "event", event: "message" })
    if (presence?.kind !== "event" || presence.data.type !== "presence") throw new Error("presence")
    expect(presence.data.members).toEqual([
      { userId: owner.user.id, name: owner.user.name, avatarUrl: null },
    ])
    expect(JSON.stringify(presence.data)).not.toContain(owner.email)
    expect(typeof presence.data.replicaId).toBe("string")
    expect(resync).toMatchObject({ kind: "event", data: { type: "resync" } })
  })

  test("note.created and note.deleted by another member arrive, with increasing ids", async () => {
    const app = await boot()
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const stream = await open(app, { workspaceId, token: owner.token })
    await stream.waitFor(isEvent("resync"))

    const note = await other.client.notes.create({ workspaceId, title: "Live", body: "hello" })
    const created = await stream.waitFor(isEvent("note.created", (e) => e.note.id === note.id))
    expect(created).toMatchObject({ kind: "event", data: { type: "note.created", note } })

    await other.client.notes.delete({ workspaceId, id: note.id })
    const deleted = await stream.waitFor(isEvent("note.deleted", (e) => e.id === note.id))

    const ids = stream.frames.flatMap((f) => (f.kind === "event" ? [f.id] : []))
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
    expect(new Set(ids).size).toBe(ids.length)
    if (created.kind !== "event" || deleted.kind !== "event") throw new Error("events")
    expect(deleted.id).toBeGreaterThan(created.id)
  })

  test("another workspace's notes never arrive", async () => {
    const app = await boot()
    const a = await signUpWithWorkspace(app)
    const b = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: a.workspaceId, token: a.token })
    await stream.waitFor(isEvent("resync"))

    await b.client.notes.create({ workspaceId: b.workspaceId, title: "Elsewhere" })
    const mine = await a.client.notes.create({ workspaceId: a.workspaceId, title: "Mine" })
    await stream.waitFor(isEvent("note.created", (e) => e.note.id === mine.id))

    const created = eventsOf(stream.frames).filter((e) => e.type === "note.created")
    expect(created).toHaveLength(1)
  })

  test("a note too large for one payload arrives as a resync, and nothing is recorded", async () => {
    const logs: string[] = []
    const app = await boot({ log: (message) => logs.push(message) })
    const owner = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    await stream.waitFor(isEvent("resync"))
    const from = stream.frames.length

    await owner.client.notes.create({
      workspaceId: owner.workspaceId,
      title: "Long",
      body: "x".repeat(9_000),
    })
    await stream.waitFor(isEvent("resync"), { from })

    expect(eventsOf(stream.frames).some((e) => e.type === "note.created")).toBe(false)
    expect(logs.filter((m) => m.startsWith("realtime"))).toEqual([])
  })

  test("a second member connecting and leaving updates the first stream's presence", async () => {
    const app = await boot()
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const first = await open(app, { workspaceId, token: owner.token })
    await first.waitFor(isEvent("resync"))

    const second = await open(app, { workspaceId, token: other.token })
    const both = [owner.user.id, other.user.id].sort()
    await first.waitFor((f) => JSON.stringify(presenceIds(f)) === JSON.stringify(both))
    const from = first.frames.length

    await second.close()
    await first.waitFor((f) => JSON.stringify(presenceIds(f)) === JSON.stringify([owner.user.id]), {
      from,
    })
  })

  test("two tabs of one user are one person; closing one publishes nothing", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const watcher = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    await watcher.waitFor(isEvent("resync"))
    // The watcher's own join comes back through the bus (asynchronously, on Postgres) — after it,
    // nothing else should publish presence.
    await watcher.waitFor(isEvent("presence"), { from: 3 })
    const tab = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    await tab.waitFor(isEvent("resync"))
    const from = watcher.frames.length

    await tab.close()
    await Bun.sleep(50)
    expect(watcher.frames.slice(from).filter(isEvent("presence"))).toEqual([])
  })

  test("a ping comment arrives within pingMs", async () => {
    const app = await boot({ realtimePingMs: 100 })
    const owner = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    await stream.waitFor((f) => f.kind === "comment" && f.text === "ping", { timeoutMs: 400 })
  })

  test("the sixth stream of one session is 429; another session still connects", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    for (let i = 0; i < 5; i++) {
      const ok = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
      expect(ok.status).toBe(200)
    }
    const sixth = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    expect(sixth.status).toBe(429)
    expect(sixth.json).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many open streams",
    })

    const again = signedIn(
      await clientFor(app).auth.signIn({ email: owner.email, password: "correct horse battery" })
    )
    const other = await open(app, { workspaceId: owner.workspaceId, token: again.session.token })
    expect(other.status).toBe(200)
  })

  test("closing one of five streams frees its slot for another", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const five: Stream[] = []
    for (let i = 0; i < 5; i++) {
      five.push(await open(app, { workspaceId: owner.workspaceId, token: owner.token }))
    }
    await five[0]?.close()
    const deadline = Date.now() + 1_000
    while (app.streams.openCount() > 4 && Date.now() < deadline) await Bun.sleep(5)

    const replacement = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    expect(replacement.status).toBe(200)
  })

  test("every stream carries the same id for the same event", async () => {
    const app = await boot()
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const a = await open(app, { workspaceId, token: owner.token })
    const b = await open(app, { workspaceId, token: other.token })
    await a.waitFor(isEvent("resync"))
    await b.waitFor(isEvent("resync"))

    const note = await owner.client.notes.create({ workspaceId, title: "Same id" })
    const match = isEvent("note.created", (e) => e.note.id === note.id)
    const [fa, fb] = [await a.waitFor(match), await b.waitFor(match)]
    if (fa.kind !== "event" || fb.kind !== "event") throw new Error("events")
    expect(fa.id).toBe(fb.id)
  })

  test("removing the member ends their stream within recheckMs", async () => {
    const app = await boot({ realtimeRecheckMs: 100 })
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const stream = await open(app, { workspaceId, token: other.token })
    await stream.waitFor(isEvent("resync"))

    await owner.client.workspaces.members.remove({ workspaceId, userId: other.user.id })
    await within(stream.ended, 1_000)
    expect(stream.isDone()).toBe(true)
  })

  test("signing the session out ends the stream within recheckMs", async () => {
    const app = await boot({ realtimeRecheckMs: 100 })
    const owner = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    await stream.waitFor(isEvent("resync"))

    await owner.client.auth.signOut()
    await within(stream.ended, 1_000)
    expect(app.streams.openCount()).toBe(0)
  })

  test("one user's streams are capped at 10 across sessions; the eleventh is 429", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const signIn = async () =>
      signedIn(
        await clientFor(app).auth.signIn({ email: owner.email, password: "correct horse battery" })
      ).session.token
    const sessions = [owner.token, await signIn(), await signIn()]
    for (const token of sessions.slice(0, 2)) {
      for (let i = 0; i < 5; i++) {
        expect((await open(app, { workspaceId: owner.workspaceId, token })).status).toBe(200)
      }
    }
    // A third session is under its own cap of 5, but the user already holds 10.
    const eleventh = await open(app, { workspaceId: owner.workspaceId, token: sessions[2] })
    expect(eleventh.status).toBe(429)
    expect(eleventh.json).toMatchObject({ code: "TOO_MANY_REQUESTS" })

    // Another user is unaffected, and closing one of the ten frees a slot for the user.
    const other = await signUpWithWorkspace(app)
    expect((await open(app, { workspaceId: other.workspaceId, token: other.token })).status).toBe(
      200
    )
    await streams[0]?.close()
    const deadline = Date.now() + 1_000
    while (app.streams.openCount() > 10 && Date.now() < deadline) await Bun.sleep(5)
    const again = await open(app, { workspaceId: owner.workspaceId, token: sessions[2] })
    expect(again.status).toBe(200)
  })

  test("an impersonation stream counts against the admin's cap, not the impersonated user's", async () => {
    const ROOT = "root@example.com"
    const app = await boot({ superadminEmails: [ROOT] })
    const owner = await signUpWithWorkspace(app)
    const root = await signUpVerified(app, ROOT)
    const signIn = async () =>
      signedIn(
        await clientFor(app).auth.signIn({ email: owner.email, password: "correct horse battery" })
      ).session.token
    const sessions = [owner.token, await signIn(), await signIn()]
    for (const token of sessions.slice(0, 2)) {
      for (let i = 0; i < 5; i++) {
        expect((await open(app, { workspaceId: owner.workspaceId, token })).status).toBe(200)
      }
    }
    expect(app.streams.openCount()).toBe(10) // the user already holds their cap

    const { token: asOwner } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
    })
    // The admin holds none of their own streams yet, so impersonating the capped-out user still
    // opens an eleventh stream overall — it counts against the admin, not the user.
    const impersonation = await open(app, { workspaceId: owner.workspaceId, token: asOwner })
    expect(impersonation.status).toBe(200)
    expect(app.streams.openCount()).toBe(11)

    // Closing the admin's stream frees the admin's own slot, not one of the user's ten.
    await streams.at(-1)?.close()
    const deadline = Date.now() + 1_000
    while (app.streams.openCount() > 10 && Date.now() < deadline) await Bun.sleep(5)
    expect(app.streams.openCount()).toBe(10)

    // The user's own eleventh real stream is still refused: the impersonation never touched
    // their cap, in either direction.
    const eleventh = await open(app, { workspaceId: owner.workspaceId, token: sessions[2] })
    expect(eleventh.status).toBe(429)
  })

  test("an impersonation stream gets note events but never appears in presence", async () => {
    const ROOT = "root@example.com"
    const app = await boot({ superadminEmails: [ROOT] })
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const root = await signUpVerified(app, ROOT)
    const { token: asOther } = await root.client.admin.users.impersonate({
      id: other.user.id,
      reason: "support",
    })

    const watcher = await open(app, { workspaceId, token: owner.token })
    await watcher.waitFor(isEvent("resync"))
    const impersonation = await open(app, { workspaceId, token: asOther })
    expect(impersonation.status).toBe(200)
    await impersonation.waitFor(isEvent("resync"))

    const note = await owner.client.notes.create({ workspaceId, title: "Seen", body: "by both" })
    await impersonation.waitFor(isEvent("note.created", (e) => e.note.id === note.id))
    await watcher.waitFor(isEvent("note.created", (e) => e.note.id === note.id))

    await impersonation.close()
    await Bun.sleep(50)
    // Neither stream ever saw the impersonated user present, and no snapshot listed them.
    for (const frame of [...watcher.frames, ...impersonation.frames]) {
      expect(presenceIds(frame)).not.toContain(other.user.id)
    }
    // The user's own session still shows up as usual.
    const real = await open(app, { workspaceId, token: other.token })
    expect(real.status).toBe(200)
    const both = [owner.user.id, other.user.id].sort()
    await watcher.waitFor((f) => JSON.stringify(presenceIds(f)) === JSON.stringify(both))
  })

  test("past maxStreams a new stream is 503", async () => {
    const app = await boot({ realtimeMaxStreams: 1 })
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const first = await open(app, { workspaceId, token: owner.token })
    expect(first.status).toBe(200)
    const second = await open(app, { workspaceId, token: other.token })
    expect(second.status).toBe(503)
    expect(second.json).toMatchObject({ code: "SERVICE_UNAVAILABLE" })
  })

  test("shutdown ends every open stream promptly", async () => {
    const app = await start({ drainMs: 5_000 })
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const a = await open(app, { workspaceId, token: owner.token })
    const b = await open(app, { workspaceId, token: other.token })
    await a.waitFor(isEvent("resync"))
    await b.waitFor(isEvent("resync"))

    const startedAt = Date.now()
    await app.stop()
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    await within(Promise.all([a.ended, b.ended]), 1_000)
  })

  test("a failing publish does not fail notes.create and is recorded", async () => {
    const logs: Array<[string, unknown]> = []
    const inner = memoryBroadcaster()
    const app = await boot({
      log: (message, error) => logs.push([message, error]),
      broadcaster: {
        ...inner,
        publish: () => {
          throw new Error("bus down")
        },
      },
    })
    const owner = await signUpWithWorkspace(app)

    const note = await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "Hi" })
    expect(note.title).toBe("Hi")

    const deadline = Date.now() + 1_000
    while (!logs.some(([m]) => m === "realtime publish failed") && Date.now() < deadline) {
      await Bun.sleep(5)
    }
    const failure = logs.find(([m]) => m === "realtime publish failed")
    expect((failure?.[1] as Error | undefined)?.message).toBe("bus down")
  })
})

describe("createStreamHandler backpressure", () => {
  test("a client that stops reading is dropped, releasing its slot, presence and subscription", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    let subscriptions = 0
    const inner = memoryBroadcaster()
    const broadcaster: Broadcaster = {
      ...inner,
      subscribe(channel, onEvent) {
        subscriptions += 1
        const unsubscribe = inner.subscribe(channel, onEvent)
        return () => {
          subscriptions -= 1
          unsubscribe()
        }
      },
    }
    const presence = createPresence()
    const streams = createStreamHandler({
      db: app.db,
      broadcaster,
      presence,
      replicaId: "test",
      maxStreams: 10,
      maxQueuedBytes: 1_024,
      fileUrl: () => null,
      log: () => {},
      recordFailure: () => {},
      superadminEmails: new Set(),
      now: () => new Date(),
    })
    try {
      const res = await streams.handle(
        new Request(`http://api.test/events/workspaces/${owner.workspaceId}`, {
          headers: { "x-session-token": owner.token },
        })
      )
      expect(res.status).toBe(200) // and its body is never read
      expect(streams.openCount()).toBe(1)
      expect(subscriptions).toBe(1)
      expect(presence.members(owner.workspaceId)).toHaveLength(1)

      const note = {
        id: 1,
        title: "Big",
        body: "x".repeat(7_000),
        createdAt: new Date().toISOString(),
        authorId: owner.user.id,
        apiKey: null,
      }
      // 64 KiB of buffer + 1 KiB of slack: a dozen ~7 KB frames is well past it.
      for (let i = 0; i < 12 && streams.openCount() > 0; i++) {
        await broadcaster.publish(workspaceChannel(owner.workspaceId), {
          type: "note.created",
          note,
        })
      }

      expect(streams.openCount()).toBe(0)
      expect(subscriptions).toBe(0)
      expect(presence.members(owner.workspaceId)).toEqual([])
      // Errored, not closed: the queued frames are discarded rather than left readable. With no
      // reason — the one value Bun.serve does not print a stack trace for (see stream.ts).
      const outcome = await res.body
        ?.getReader()
        .read()
        .then(
          () => "readable",
          (reason: unknown) => ({ reason })
        )
      expect(outcome).toEqual({ reason: undefined })
    } finally {
      streams.closeAll()
    }
  })

  test("a stream that ends while it opens never runs its first frames or onOpen", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    let published = 0
    const inner = memoryBroadcaster()
    const broadcaster: Broadcaster = {
      ...inner,
      async publish(channel, event) {
        published += 1
        return inner.publish(channel, event)
      },
    }
    const presence = createPresence()
    const streams = createStreamHandler({
      db: app.db,
      broadcaster,
      presence,
      replicaId: "test",
      maxStreams: 10,
      // Below any reachable queue size, so the very first write (`retry:`) drops the stream: the
      // one way to end a stream between its registration and its first frames.
      maxQueuedBytes: -1_000_000,
      pingMs: 10,
      recheckMs: 10,
      fileUrl: () => null,
      log: () => {},
      recordFailure: () => {},
      superadminEmails: new Set(),
      now: () => new Date(),
    })
    try {
      const res = await streams.handle(
        new Request(`http://api.test/events/workspaces/${owner.workspaceId}`, {
          headers: { "x-session-token": owner.token },
        })
      )
      expect(res.status).toBe(200)
      expect(streams.openCount()).toBe(0)
      // `first()` would have joined presence after `onClose` left it (a ghost entry), and
      // `onOpen` would have published the newcomer's snapshot.
      expect(presence.members(owner.workspaceId)).toEqual([])
      await Bun.sleep(50) // no ping or recheck keeps running for the ended stream
      expect(published).toBe(0)
    } finally {
      streams.closeAll()
    }
  })

  test("over a real socket that never reads, the drop also releases the request", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port: Number(app.server.url.port),
      socket: { data() {} },
    })
    socket.pause() // never reads: the kernel buffers fill, then Bun's, then the stream's queue
    socket.write(
      [
        `GET /events/workspaces/${owner.workspaceId} HTTP/1.1`,
        "host: api.test",
        `authorization: Bearer ${TOKEN}`,
        "x-api-client-id: never-reads",
        `x-session-token: ${owner.token}`,
        "",
        "",
      ].join("\r\n")
    )
    try {
      const opened = Date.now() + 2_000
      while (app.streams.openCount() < 1 && Date.now() < opened) await Bun.sleep(5)
      expect(app.streams.openCount()).toBe(1)

      const note = {
        id: 1,
        title: "Big",
        body: "x".repeat(7_000),
        createdAt: new Date().toISOString(),
        authorId: owner.user.id,
        apiKey: null,
      }
      for (let i = 0; i < 5_000 && app.streams.openCount() > 0; i++) {
        await app.broadcaster.publish(workspaceChannel(owner.workspaceId), {
          type: "note.created",
          note,
        })
        if (i % 50 === 0) await Bun.sleep(1) // let Bun flush what the socket will take
      }
      expect(app.streams.openCount()).toBe(0)

      // Errored body + a short idle timeout: Bun closes the connection instead of holding the
      // undeliverable bytes (and the request) open forever. Bun sweeps idle timeouts every 4 s,
      // so the release lands anywhere up to ~4 s after the drop (seen at ~3.9 s on Linux CI).
      const released = Date.now() + 10_000
      while (app.server.pendingRequests > 0 && Date.now() < released) await Bun.sleep(50)
      expect(app.server.pendingRequests).toBe(0)
    } finally {
      socket.end()
    }
  }, 15_000)
})

describe("the events route and Bun's idle timeout", () => {
  /** A raw keep-alive request; resolves with the socket and a promise for its close. */
  async function rawRequest(app: App, headers: string[]) {
    let response = ""
    let closed!: () => void
    const closedAt = new Promise<number>((resolve) => {
      closed = () => resolve(Date.now())
    })
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port: Number(app.server.url.port),
      socket: {
        data(_, chunk) {
          response += new TextDecoder().decode(chunk)
        },
        close: () => closed(),
        end: () => closed(),
      },
    })
    socket.write([...headers, "connection: keep-alive", "", ""].join("\r\n"))
    return { socket, closedAt, response: () => response }
  }

  test("a refused stream keeps the idle timeout; an open one turns it off", async () => {
    const app = await boot({ idleTimeout: 1 })
    const owner = await signUpWithWorkspace(app)
    const stream = await open(app, { workspaceId: owner.workspaceId, token: owner.token })
    expect(stream.status).toBe(200)

    const startedAt = Date.now()
    const refused = await rawRequest(app, [
      `GET /events/workspaces/${owner.workspaceId} HTTP/1.1`,
      "host: api.test",
      `authorization: Bearer ${TOKEN}`,
      "x-api-client-id: refused",
    ])
    try {
      // 1 s idle timeout, swept every 4 s by Bun: closed well within 8 s, not held forever.
      await within(refused.closedAt, 8_000)
      expect(refused.response()).toStartWith("HTTP/1.1 401")
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
      // The open stream has been idle just as long (no ping for 25 s) and is still open.
      expect(stream.isDone()).toBe(false)
      expect(app.streams.openCount()).toBe(1)
    } finally {
      refused.socket.end()
    }
  }, 15_000)
})

describe("server drops are quiet", () => {
  test("a dropped stream prints nothing to stderr (Bun prints any body error with a reason)", async () => {
    const script = `
      import { openStream, signUpWithWorkspace, start } from "./src/test-server"
      const app = await start()
      const owner = await signUpWithWorkspace(app)
      const s = await openStream(app, { workspaceId: owner.workspaceId, token: owner.token })
      await s.waitFor((f) => f.kind === "event" && f.data.type === "resync")
      app.streams.closeAll()
      await s.ended
      await Bun.sleep(100)
      await app.stop()
    `
    const child = Bun.spawn([process.execPath, "--eval", script], {
      cwd: join(import.meta.dir, "../.."),
      env: process.env,
      stdout: "ignore",
      stderr: "pipe",
    })
    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited])
    expect(code).toBe(0)
    expect(stderr).toBe("")
  }, 15_000)
})
