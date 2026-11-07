import { afterEach, describe, expect, test } from "bun:test"
import { userChannel } from "@repo/api-contract"
import {
  clientFor,
  openStream,
  openUserStream,
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
type Stream = Awaited<ReturnType<typeof openUserStream>>

const ROOT = "root@example.com"
const PASSWORD = "correct horse battery"

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

async function me(app: App, input: Parameters<typeof openUserStream>[1] = {}) {
  const stream = await openUserStream(app, input)
  streams.push(stream)
  return stream
}

async function workspaceStream(app: App, input: Parameters<typeof openStream>[1]) {
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

const isResync = (frame: SseFrame) => frame.kind === "event" && frame.data.type === "resync"
const isNotification =
  (id?: number) =>
  (frame: SseFrame): boolean =>
    frame.kind === "event" &&
    frame.data.type === "notification.created" &&
    (id === undefined || frame.data.id === id)
const notificationIds = (frames: SseFrame[]) =>
  frames.flatMap((f) =>
    f.kind === "event" && f.data.type === "notification.created" ? [f.data.id] : []
  )

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

/** Waits until the process holds `count` open streams (a closed one is released asynchronously). */
async function openCountIs(app: App, count: number) {
  const deadline = Date.now() + 1_000
  while (app.streams.openCount() !== count && Date.now() < deadline) await Bun.sleep(5)
  expect(app.streams.openCount()).toBe(count)
}

describe("GET /events/me", () => {
  test("no session or a bogus one is 401; the bearer guard applies", async () => {
    const app = await boot()
    const anonymous = await me(app)
    expect(anonymous.status).toBe(401)
    expect(anonymous.json).toMatchObject({ code: "UNAUTHORIZED", message: "Sign in required" })
    expect((await me(app, { token: "not-a-session" })).status).toBe(401)

    const res = await fetch(new URL("/events/me", app.server.url))
    expect(res.status).toBe(401)
  })

  test("starts with retry and a resync — no presence, no workspace", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    const stream = await me(app, { token: owner.token })

    expect(stream.status).toBe(200)
    expect(stream.headers.get("content-type")).toBe("text/event-stream")
    expect(stream.headers.get("cache-control")).toBe("no-store")
    expect(stream.headers.get("x-accel-buffering")).toBe("no")

    await stream.waitFor(isResync)
    expect(stream.frames).toHaveLength(2)
    expect(stream.frames[0]).toEqual({ kind: "retry", retry: 3000 })
    expect(stream.frames[1]).toMatchObject({
      kind: "event",
      event: "message",
      data: { type: "resync" },
    })
    if (stream.frames[1]?.kind !== "event") throw new Error("resync")
    expect(stream.frames[1].id).toBeGreaterThan(0)
  })

  test("a notification written for the user arrives with an id line", async () => {
    const app = await boot()
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const stream = await me(app, { token: other.token })
    await stream.waitFor(isResync)

    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: other.user.id,
      role: "admin",
    })
    const [row] = await app.db.notifications.list({
      userId: other.user.id,
      limit: 1,
      unreadOnly: false,
    })
    if (!row) throw new Error("no notification row")
    const frame = await stream.waitFor(isNotification(row.id))
    expect(frame).toMatchObject({ kind: "event", event: "message" })
    if (frame.kind !== "event") throw new Error("event")
    expect(frame.data).toEqual({ type: "notification.created", id: row.id })
    expect(frame.id).toBeGreaterThan(0)
  })

  test("another user's notifications and workspace events never arrive", async () => {
    const app = await boot()
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const ownerStream = await me(app, { token: owner.token })
    const otherStream = await me(app, { token: other.token })
    await ownerStream.waitFor(isResync)
    await otherStream.waitFor(isResync)

    // A note (a workspace event) and a notification for `other` only.
    await owner.client.notes.create({ workspaceId, title: "Not on the user channel" })
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: other.user.id,
      role: "admin",
    })
    await otherStream.waitFor(isNotification())
    await app.broadcaster.publish(userChannel(other.user.id), {
      type: "notification.created",
      id: 9_999,
    })
    await otherStream.waitFor(isNotification(9_999))
    await Bun.sleep(50)

    for (const frame of ownerStream.frames) {
      if (frame.kind === "event") expect(frame.data).toEqual({ type: "resync" })
    }
    for (const frame of otherStream.frames) {
      if (frame.kind === "event")
        expect(["resync", "notification.created"]).toContain(frame.data.type)
    }
  })

  test("a ping comment arrives within pingMs", async () => {
    const app = await boot({ realtimePingMs: 100 })
    const owner = await signUpWithWorkspace(app)
    const stream = await me(app, { token: owner.token })
    await stream.waitFor((f) => f.kind === "comment" && f.text === "ping", { timeoutMs: 1_000 })
  })

  test("signing the session out ends the stream within recheckMs", async () => {
    const app = await boot({ realtimeRecheckMs: 100 })
    const owner = await signUpWithWorkspace(app)
    const stream = await me(app, { token: owner.token })
    await stream.waitFor(isResync)

    await owner.client.auth.signOut()
    await within(stream.ended, 1_000)
    await openCountIs(app, 0)
  })

  test("has its own per-session cap, apart from workspace streams", async () => {
    const app = await boot({ realtimeMaxPerSession: 2 })
    const owner = await signUpWithWorkspace(app)
    const workspace = { workspaceId: owner.workspaceId, token: owner.token }
    expect((await workspaceStream(app, workspace)).status).toBe(200)
    expect((await workspaceStream(app, workspace)).status).toBe(200)
    // The session's workspace streams are at their cap; its own stream still opens, twice.
    expect((await me(app, { token: owner.token })).status).toBe(200)
    expect((await me(app, { token: owner.token })).status).toBe(200)

    const third = await me(app, { token: owner.token })
    expect(third.status).toBe(429)
    expect(third.json).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    expect((await workspaceStream(app, workspace)).status).toBe(429)

    // Another session of the same user still connects; closing a stream frees its own kind's slot.
    const second = signedIn(
      await clientFor(app).auth.signIn({ email: owner.email, password: PASSWORD })
    ).session.token
    expect((await me(app, { token: second })).status).toBe(200)
    await streams[2]?.close()
    await openCountIs(app, 4)
    expect((await me(app, { token: owner.token })).status).toBe(200)
    expect((await workspaceStream(app, workspace)).status).toBe(429)
  })

  test("five workspace streams and five of the user's own fit in one session", async () => {
    const app = await boot()
    const owner = await signUpWithWorkspace(app)
    for (let i = 0; i < 5; i++) {
      expect(
        (await workspaceStream(app, { workspaceId: owner.workspaceId, token: owner.token })).status
      ).toBe(200)
      expect((await me(app, { token: owner.token })).status).toBe(200)
    }
    await openCountIs(app, 10)
    expect((await me(app, { token: owner.token })).status).toBe(429)
    expect(
      (await workspaceStream(app, { workspaceId: owner.workspaceId, token: owner.token })).status
    ).toBe(429)
  })

  test("has its own per-user cap across sessions, apart from workspace streams", async () => {
    const app = await boot({ realtimeMaxPerUser: 2 })
    const owner = await signUpWithWorkspace(app)
    const second = signedIn(
      await clientFor(app).auth.signIn({ email: owner.email, password: PASSWORD })
    ).session.token
    expect(
      (await workspaceStream(app, { workspaceId: owner.workspaceId, token: owner.token })).status
    ).toBe(200)
    expect(
      (await workspaceStream(app, { workspaceId: owner.workspaceId, token: second })).status
    ).toBe(200)
    expect((await me(app, { token: owner.token })).status).toBe(200)
    expect((await me(app, { token: second })).status).toBe(200)

    expect((await me(app, { token: second })).status).toBe(429)
    expect(
      (await workspaceStream(app, { workspaceId: owner.workspaceId, token: second })).status
    ).toBe(429)

    // Another user is unaffected.
    const other = await signUpVerified(app)
    expect((await me(app, { token: other.token })).status).toBe(200)
  })

  test("counts toward REALTIME_MAX_STREAMS together with workspace streams", async () => {
    const app = await boot({ realtimeMaxStreams: 1 })
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    expect((await workspaceStream(app, { workspaceId, token: owner.token })).status).toBe(200)
    const refused = await me(app, { token: other.token })
    expect(refused.status).toBe(503)
    expect(refused.json).toMatchObject({ code: "SERVICE_UNAVAILABLE" })
  })

  test("shutdown ends every open stream promptly", async () => {
    const app = await start({ drainMs: 5_000 })
    const owner = await signUpWithWorkspace(app)
    const stream = await openUserStream(app, { token: owner.token })
    await stream.waitFor(isResync)

    const startedAt = Date.now()
    await app.stop()
    expect(Date.now() - startedAt).toBeLessThan(2_000)
    await within(stream.ended, 1_000)
  })
})

describe("GET /events/me while impersonating", () => {
  async function impersonating(app: App) {
    const { owner, other, workspaceId } = await workspaceWithTwo(app)
    const root = await signUpVerified(app, ROOT)
    const { token: asOther } = await root.client.admin.users.impersonate({
      id: other.user.id,
      reason: "support",
    })
    return { owner, other, root, workspaceId, asOther }
  }

  test("receives the impersonated user's notifications, never the admin's own", async () => {
    const app = await boot({ superadminEmails: [ROOT] })
    const { owner, other, root, workspaceId, asOther } = await impersonating(app)
    const adminOwn = await me(app, { token: root.token })
    const impersonation = await me(app, { token: asOther })
    expect(impersonation.status).toBe(200)
    await adminOwn.waitFor(isResync)
    await impersonation.waitFor(isResync)

    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: other.user.id,
      role: "admin",
    })
    const [row] = await app.db.notifications.list({
      userId: other.user.id,
      limit: 1,
      unreadOnly: false,
    })
    if (!row) throw new Error("no notification row")
    await impersonation.waitFor(isNotification(row.id))

    // Something for the admin themselves reaches their own stream only.
    await app.broadcaster.publish(userChannel(root.user.id), {
      type: "notification.created",
      id: 4_242,
    })
    await adminOwn.waitFor(isNotification(4_242))
    await Bun.sleep(50)
    expect(notificationIds(impersonation.frames)).toEqual([row.id])
    expect(notificationIds(adminOwn.frames)).toEqual([4_242])
  })

  test("counts against the admin's caps, not the impersonated user's", async () => {
    const app = await boot({ superadminEmails: [ROOT], realtimeMaxPerUser: 2 })
    const { other, root, asOther } = await impersonating(app)
    // The impersonated user fills their own cap.
    expect((await me(app, { token: other.token })).status).toBe(200)
    expect((await me(app, { token: other.token })).status).toBe(200)

    // The admin holds none yet, so the impersonation still opens.
    expect((await me(app, { token: asOther })).status).toBe(200)
    // One more stream of the admin's own fills the admin's cap; the next impersonation is refused.
    expect((await me(app, { token: root.token })).status).toBe(200)
    expect((await me(app, { token: asOther })).status).toBe(429)
    // And the user's own cap never moved in either direction.
    expect((await me(app, { token: other.token })).status).toBe(429)
  })

  test("stopping the impersonation ends its stream within recheckMs", async () => {
    const app = await boot({ superadminEmails: [ROOT], realtimeRecheckMs: 100 })
    const { asOther } = await impersonating(app)
    const stream = await me(app, { token: asOther })
    await stream.waitFor(isResync)

    await clientFor(app, asOther).admin.stopImpersonation()
    await within(stream.ended, 1_000)
  })
})

describe("GET /events/me backpressure and idle timeout", () => {
  test("a client that stops reading is dropped, releasing its slot and subscription", async () => {
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
    const handler = createStreamHandler({
      db: app.db,
      broadcaster,
      presence: createPresence(),
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
      const res = await handler.handleMe(
        new Request("http://api.test/events/me", { headers: { "x-session-token": owner.token } })
      )
      expect(res.status).toBe(200) // and its body is never read
      expect(handler.openCount()).toBe(1)
      expect(subscriptions).toBe(1)

      // 64 KiB of buffer + 1 KiB of slack, at ~60 bytes a frame.
      for (let i = 1; i <= 5_000 && handler.openCount() > 0; i++) {
        await broadcaster.publish(userChannel(owner.user.id), {
          type: "notification.created",
          id: i,
        })
      }
      expect(handler.openCount()).toBe(0)
      expect(subscriptions).toBe(0)
      const outcome = await res.body
        ?.getReader()
        .read()
        .then(
          () => "readable",
          (reason: unknown) => ({ reason })
        )
      expect(outcome).toEqual({ reason: undefined })
    } finally {
      handler.closeAll()
    }
  })

  test("a refused stream keeps the idle timeout; an open one turns it off", async () => {
    const app = await boot({ idleTimeout: 1 })
    const owner = await signUpWithWorkspace(app)
    const stream = await me(app, { token: owner.token })
    expect(stream.status).toBe(200)

    let response = ""
    let closed!: () => void
    const closedAt = new Promise<void>((resolve) => {
      closed = resolve
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
    socket.write(
      [
        "GET /events/me HTTP/1.1",
        "host: api.test",
        `authorization: Bearer ${TOKEN}`,
        "x-api-client-id: refused",
        "connection: keep-alive",
        "",
        "",
      ].join("\r\n")
    )
    try {
      await within(closedAt, 8_000)
      expect(response).toStartWith("HTTP/1.1 401")
      expect(stream.isDone()).toBe(false)
      expect(app.streams.openCount()).toBe(1)
    } finally {
      socket.end()
    }
  }, 15_000)
})
