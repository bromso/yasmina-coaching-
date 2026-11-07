// Outgoing webhooks end to end: every emitter, the `webhook.deliver` job against a real local
// receiver (`Bun.serve` on 127.0.0.1, reached as `*.localhost` with localhost delivery on), the
// fetch seam for what is dialled, the `test` procedure and `webhooks.prune`. Runs on SQLite, and
// on Postgres with TEST_DATABASE_URL.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  type ApiClient,
  DELETION_GRACE_MS,
  FEATURE_MESSAGES,
  IMPERSONATING_MESSAGE,
  WEBHOOK_NOT_FOUND_MESSAGE,
  WEBHOOK_TEST_DISABLED_MESSAGE,
  WEBHOOK_TEST_RATE_LIMIT,
  WEBHOOK_TEST_RATE_MESSAGE,
  WEBHOOK_URL_INVALID_MESSAGE,
  type WebhookEventType,
} from "@repo/api-contract"
import { webhookDisabledSubject } from "@repo/email"
import { translatorFor } from "@repo/i18n/translate"
import { WebhookEventSchema } from "@repo/public-api-contract/webhooks"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { BRAND_NAME } from "@repo/sites/brand"
import { Webhook } from "standardwebhooks"
import { purgeUser } from "./jobs/builtin/privacy"
import { createEnqueue } from "./jobs/enqueue"
import { PNG_1X1 } from "./storage/fixtures"
import { clientFor, mailsTo, signUpVerified, signUpWithWorkspace, start } from "./test-server"
import { bunWebhookFetch, type WebhookFetch, type WebhookFetchInit } from "./webhooks/deliver"
import { emitWebhookEvent } from "./webhooks/emit"
import type { Resolver } from "./webhooks/ssrf"

const ROOT = "webhook-delivery-root@example.com"
const HOUR_MS = 3_600_000

// ---------------------------------------------------------------------------------------------
// The receiver: records every request; `respond` decides the answer.

type Received = { path: string; headers: Record<string, string>; body: string }
const received: Received[] = []
let respond: (req: Request) => Response | Promise<Response> = () =>
  new Response(null, { status: 204 })
const receiver = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    received.push({
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(req.headers),
      body: await req.text(),
    })
    return respond(req)
  },
})
/** Where a redirect would send a delivery, if it were ever followed. */
const elsewhere: Received[] = []
const elsewhereServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    elsewhere.push({ path: new URL(req.url).pathname, headers: {}, body: await req.text() })
    return new Response(null, { status: 204 })
  },
})
const hookUrl = `http://receiver.localhost:${receiver.port}/hook?src=test`

// ---------------------------------------------------------------------------------------------
// DNS and fetch seams, and the clock.

/** Per host, the answers to give in turn (the last one repeats). */
const dns = new Map<string, string[][]>()
const resolved: string[] = []
const resolve: Resolver = async (host) => {
  resolved.push(host)
  const answers = dns.get(host)
  if (!answers) return ["93.184.216.34"]
  return (answers.length > 1 ? answers.shift() : answers[0]) as string[]
}
const dialled: Array<{ url: string; init: WebhookFetchInit }> = []
let fetchImpl: WebhookFetch = bunWebhookFetch
const webhookFetch: WebhookFetch = (url, init) => {
  dialled.push({ url, init })
  return fetchImpl(url, init)
}
let offsetMs = 0
const now = () => new Date(Date.now() + offsetMs)
const advance = (ms: number) => {
  offsetMs += ms
}

const logLines: string[] = []
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    webhookResolve: resolve,
    webhookAllowLocalhostHttp: true,
    webhookFetch,
    now,
    log: (message, error) => void logLines.push(`${message} ${String(error ?? "")}`),
    logWrite: (line) => void logLines.push(line),
  })
})
afterAll(async () => {
  await app.stop()
  receiver.stop(true)
  elsewhereServer.stop(true)
})
beforeEach(() => {
  // Signatures are checked against the real clock (5-minute tolerance): start each test on it.
  offsetMs = 0
  received.length = 0
  elsewhere.length = 0
  dialled.length = 0
  resolved.length = 0
  respond = () => new Response(null, { status: 204 })
  fetchImpl = bunWebhookFetch
})
// A failing test must not leave retries behind for the next one's clock to wake.
afterEach(async () => {
  await app.db.sql`DELETE FROM jobs WHERE status IN ('queued', 'running')`
})

// ---------------------------------------------------------------------------------------------
// Helpers

async function paidOwner() {
  const owner = await signUpWithWorkspace(app)
  await app.billing.change(owner.workspaceId, "pro", "month")
  return owner
}

const addEndpoint = (
  client: ApiClient,
  workspaceId: number,
  events: WebhookEventType[],
  url = hookUrl
) => client.workspaces.webhooks.create({ workspaceId, url, events })

const deliveriesOf = (endpointId: number) => app.db.webhooks.listDeliveries(endpointId, 50)

/** Every `webhook.deliver` job queued for `endpointId` (by its dedupe key). */
const jobsFor = async (endpointId: number) =>
  (await app.db.sql`
    SELECT id, status, attempts, dedupe_key, last_error FROM jobs
    WHERE name = 'webhook.deliver' AND dedupe_key LIKE ${`webhook:%:${endpointId}`}
    ORDER BY id
  `) as Array<{
    id: number
    status: string
    attempts: number
    dedupe_key: string
    last_error: string | null
  }>

/** The deliveries the receiver got, verified with the official library and parsed. */
function verified(secret: string) {
  return received.map((r) => {
    const payload = new Webhook(secret).verify(r.body, r.headers)
    return WebhookEventSchema.parse(payload)
  })
}

/** Drains, then lets every pending retry come due and drains again, up to `rounds` times. */
async function runAllAttempts(rounds = 8) {
  await app.drain()
  for (let i = 0; i < rounds; i++) {
    advance(2 * HOUR_MS)
    await app.drain()
  }
}

// ---------------------------------------------------------------------------------------------

describe("a signed delivery to a local receiver", () => {
  test("note.created arrives once, signed (standardwebhooks verifies it), as /v1 shows the note", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { secret, endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    const note = await owner.client.notes.create({ workspaceId, title: "Hej å ä ö 🎉", body: "x" })
    await app.drain()

    expect(received).toHaveLength(1)
    const [request] = received
    expect(request?.path).toBe("/hook?src=test")
    expect(request?.headers["content-type"]).toBe("application/json")
    expect(request?.headers["user-agent"]).toBe(`${BRAND_NAME}-webhooks`)
    expect(request?.headers.host).toBe(`receiver.localhost:${receiver.port}`)
    expect(request?.headers["webhook-id"]).toMatch(/^msg_[A-Za-z0-9_-]{22}$/)
    const [event] = verified(secret)
    expect(event).toEqual({
      type: "note.created",
      timestamp: expect.any(String),
      data: {
        id: note.id,
        title: "Hej å ä ö 🎉",
        body: "x",
        createdAt: note.createdAt,
        author: { type: "user", id: owner.user.id, name: owner.user.name },
      },
    })
    // Minified: the body is exactly what was signed.
    expect(request?.body).toBe(JSON.stringify(event))
    expect(request?.body).not.toContain(owner.email)

    const [row] = await deliveriesOf(endpoint.id)
    expect(row).toMatchObject({
      event_id: request?.headers["webhook-id"],
      event_type: "note.created",
      attempt: 1,
      status: 204,
      error: null,
    })
    expect(row?.duration_ms).toBeGreaterThanOrEqual(0)
    expect((await app.db.webhooks.find(endpoint.id))?.consecutive_failures).toBe(0)
  })

  // What a proxy in the environment does to this (Bun 1.4.2 ignores `proxy: false`) is pinned by
  // deliver.test.ts against a real proxy; here only the dialled address and headers are checked.
  test("dials 127.0.0.1 for *.localhost, with Host naming the host and redirects off", async () => {
    const owner = await paidOwner()
    await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    expect(dialled).toHaveLength(1)
    const [call] = dialled
    expect(call?.url).toBe(`http://127.0.0.1:${receiver.port}/hook?src=test`)
    expect(call?.init).toMatchObject({ method: "POST", redirect: "manual" })
    expect((call?.init.headers as Record<string, string> | undefined)?.host).toBe(
      `receiver.localhost:${receiver.port}`
    )
    // Plain http: no SNI.
    expect(call?.init.tls).toBeUndefined()
  })
})

describe("every emitter fires once, with the /v1 shape", () => {
  async function setup(events: WebhookEventType[]) {
    const owner = await paidOwner()
    const hook = await addEndpoint(owner.client, owner.workspaceId, events)
    return { owner, ...hook }
  }

  test("note.deleted (internal)", async () => {
    const { owner, secret } = await setup(["note.deleted"])
    const note = await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await owner.client.notes.delete({ workspaceId: owner.workspaceId, id: note.id })
    await app.drain()
    expect(verified(secret)).toEqual([
      { type: "note.deleted", timestamp: expect.any(String), data: { id: note.id } },
    ])
  })

  test("note.created and note.deleted through /v1", async () => {
    const { owner, secret } = await setup(["note.created", "note.deleted"])
    const { key, apiKey } = await owner.client.workspaces.apiKeys.create({
      workspaceId: owner.workspaceId,
      name: "CI",
      scopes: ["notes:write", "notes:read"],
      expiresInDays: 90,
    })
    const v1 = (path: string, method: string, body?: unknown) =>
      fetch(new URL(`/v1${path}`, app.server.url), {
        method,
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    const created = (await (await v1("/notes", "POST", { title: "From CI" })).json()) as {
      id: number
    }
    expect((await v1(`/notes/${created.id}`, "DELETE")).status).toBe(204)
    await app.drain()
    const events = verified(secret).sort((x, y) => x.type.localeCompare(y.type))
    expect(events.map((e) => e.type)).toEqual(["note.created", "note.deleted"])
    expect(events[1]?.data).toEqual({ id: created.id })
    expect(events[0]?.data).toMatchObject({
      id: created.id,
      title: "From CI",
      author: { type: "api_key", id: apiKey.id, name: "CI" },
    })
  })

  test("member.joined (accepting an invitation), member.role_changed, member.left", async () => {
    const { owner, secret } = await setup(["member.joined", "member.role_changed", "member.left"])
    const { workspaceId } = owner
    const invitee = await signUpVerified(app)
    const invitation = await owner.client.workspaces.invitations.create({
      workspaceId,
      email: invitee.email,
      role: "member",
    })
    await invitee.client.invitations.acceptById({ id: invitation.id })
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: invitee.user.id,
      role: "admin",
    })
    // The same role again changes nothing and sends nothing.
    await owner.client.workspaces.members.setRole({
      workspaceId,
      userId: invitee.user.id,
      role: "admin",
    })
    await invitee.client.workspaces.leave({ workspaceId })
    await app.drain()
    // Deliveries run concurrently: no order is promised, so look each event up by its type.
    const events = verified(secret)
    expect(events.map((e) => e.type).sort()).toEqual([
      "member.joined",
      "member.left",
      "member.role_changed",
    ])
    const dataOf = (type: string) => events.find((e) => e.type === type)?.data
    const member = {
      userId: invitee.user.id,
      name: invitee.user.name,
      joinedAt: expect.any(String),
    }
    expect(dataOf("member.joined")).toEqual({ ...member, role: "member" })
    expect(dataOf("member.role_changed")).toEqual({
      ...member,
      role: "admin",
      previousRole: "member",
    })
    expect(dataOf("member.left")).toEqual({ ...member, role: "admin" })
    expect(received.map((r) => r.body).join("")).not.toContain(invitee.email)
  })

  test("member.left on a removal; two role changes on an ownership transfer", async () => {
    const { owner, secret } = await setup(["member.left", "member.role_changed"])
    const { workspaceId } = owner
    const [a, b] = [await signUpVerified(app), await signUpVerified(app)]
    await app.db.memberships.add({ workspaceId, userId: a.user.id, role: "member" })
    await app.db.memberships.add({ workspaceId, userId: b.user.id, role: "admin" })
    await owner.client.workspaces.members.remove({ workspaceId, userId: a.user.id })
    await owner.client.workspaces.transferOwnership({ workspaceId, userId: b.user.id })
    await app.drain()
    const events = verified(secret)
    const byUser = (userId: number) =>
      events.filter((e) => (e.data as { userId: number }).userId === userId)
    expect(events).toHaveLength(3)
    expect(byUser(a.user.id).map((e) => e.type)).toEqual(["member.left"])
    expect(byUser(b.user.id).map((e) => [e.type, e.data])).toEqual([
      ["member.role_changed", expect.objectContaining({ role: "owner", previousRole: "admin" })],
    ])
    expect(byUser(owner.user.id).map((e) => [e.type, e.data])).toEqual([
      ["member.role_changed", expect.objectContaining({ role: "admin", previousRole: "owner" })],
    ])
  })

  test("workspace.updated on a rename, a new logo and a removed logo", async () => {
    const { owner, secret } = await setup(["workspace.updated"])
    const { workspaceId } = owner
    await owner.client.workspaces.update({ workspaceId, name: "Renamed" })
    // The same name again: nothing a receiver could see changed, so nothing is sent.
    await owner.client.workspaces.update({ workspaceId, name: "Renamed" })
    await owner.client.workspaces.logo.set({
      workspaceId,
      file: new File([PNG_1X1], "logo.png", { type: "image/png" }),
    })
    await owner.client.workspaces.logo.remove({ workspaceId })
    // Nothing to remove: no change, no event.
    await owner.client.workspaces.logo.remove({ workspaceId })
    await app.drain()
    const events = verified(secret)
    expect(events).toHaveLength(3)
    const { slug } = await owner.client.workspaces.get({ workspaceId })
    for (const event of events)
      expect(event).toEqual({
        type: "workspace.updated",
        timestamp: expect.any(String),
        data: { id: workspaceId, name: "Renamed", slug, plan: "pro" },
      })
  })

  test("api_key.created and api_key.revoked, never the key", async () => {
    const { owner, secret } = await setup(["api_key.created", "api_key.revoked"])
    const { workspaceId } = owner
    const { key, apiKey } = await owner.client.workspaces.apiKeys.create({
      workspaceId,
      name: "Deploy",
      scopes: ["notes:read"],
      expiresInDays: null,
    })
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })
    // Revoking again is a no-op: no second event.
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })
    await app.drain()
    const data = {
      id: apiKey.id,
      name: "Deploy",
      prefix: apiKey.prefix,
      scopes: ["notes:read" as const],
    }
    expect(verified(secret).sort((x, y) => x.type.localeCompare(y.type))).toEqual([
      {
        type: "api_key.created",
        timestamp: expect.any(String),
        data: { ...data, expiresAt: null },
      },
      {
        type: "api_key.revoked",
        timestamp: expect.any(String),
        data: { ...data, expiresAt: null },
      },
    ])
    expect(received.map((r) => r.body).join("")).not.toContain(key)
  })

  test("one event id per event, one job per subscribed endpoint; unsubscribed ones get nothing", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const a = await addEndpoint(owner.client, workspaceId, ["note.created"])
    const b = await addEndpoint(owner.client, workspaceId, ["note.created", "note.deleted"])
    const other = await addEndpoint(owner.client, workspaceId, ["member.left"])
    await owner.client.notes.create({ workspaceId, title: "t" })
    const [jobA] = await jobsFor(a.endpoint.id)
    const [jobB] = await jobsFor(b.endpoint.id)
    expect(await jobsFor(a.endpoint.id)).toHaveLength(1)
    expect(await jobsFor(other.endpoint.id)).toHaveLength(0)
    const eventOf = (key?: string) => key?.split(":")[1]
    expect(eventOf(jobA?.dedupe_key)).toBe(eventOf(jobB?.dedupe_key))
    await app.drain()
    expect(received).toHaveLength(2)
    expect(new Set(received.map((r) => r.headers["webhook-id"])).size).toBe(1)
  })
})

describe("nothing is sent (Review Focus 2 and 4)", () => {
  test("a disabled endpoint, or a workspace without the api feature, gets no job at all", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    await owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: false })
    await owner.client.notes.create({ workspaceId, title: "while off" })
    expect(await jobsFor(endpoint.id)).toHaveLength(0)

    await owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: true })
    await app.billing.change(workspaceId, "cancel", "month")
    await owner.client.notes.create({ workspaceId, title: "on Free" })
    expect(await jobsFor(endpoint.id)).toHaveLength(0)
    await app.drain()
    expect(received).toHaveLength(0)
  })

  test("queued, then disabled, unsubscribed, deleted or downgraded: the job sends nothing", async () => {
    const cases: Array<
      [string, (o: Awaited<ReturnType<typeof paidOwner>>, id: number) => Promise<unknown>]
    > = [
      [
        "disabled",
        (o, id) =>
          o.client.workspaces.webhooks.update({ workspaceId: o.workspaceId, id, enabled: false }),
      ],
      [
        "unsubscribed",
        (o, id) =>
          o.client.workspaces.webhooks.update({
            workspaceId: o.workspaceId,
            id,
            events: ["note.deleted"],
          }),
      ],
      [
        "deleted",
        (o, id) => o.client.workspaces.webhooks.delete({ workspaceId: o.workspaceId, id }),
      ],
      ["downgraded", (o) => app.billing.change(o.workspaceId, "cancel", "month")],
    ]
    for (const [, change] of cases) {
      const owner = await paidOwner()
      const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
      await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "queued" })
      expect(await jobsFor(endpoint.id)).toHaveLength(1)
      await change(owner, endpoint.id)
      await app.drain()
      expect(await deliveriesOf(endpoint.id)).toEqual([])
    }
    expect(received).toHaveLength(0)
    expect(dialled).toHaveLength(0)
  })

  test("an emit inside a transaction that rolls back enqueues nothing", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.deleted"])
    const enqueue = createEnqueue({ db: app.db })
    const ctx = { db: app.db, billing: app.billing, enqueue }
    const rolledBack = app.db.transaction(async (tx) => {
      const id = await emitWebhookEvent(ctx, workspaceId, "note.deleted", { id: 1 }, { tx })
      expect(id).toMatch(/^msg_/)
      throw new Error("roll back")
    })
    await expect(rolledBack).rejects.toThrow("roll back")
    expect(await jobsFor(endpoint.id)).toHaveLength(0)
    // The same emit, committed, enqueues once.
    await app.db.transaction((tx) =>
      emitWebhookEvent(ctx, workspaceId, "note.deleted", { id: 1 }, { tx })
    )
    expect(await jobsFor(endpoint.id)).toHaveLength(1)
  })

  test("a refused change (the last owner leaving) emits nothing", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["member.left"])
    const [error] = await safe(owner.client.workspaces.leave({ workspaceId }))
    expect(error).toMatchObject({ code: "CONFLICT" })
    expect(await jobsFor(endpoint.id)).toHaveLength(0)
  })
})

describe("an account deletion (privacy.purge)", () => {
  const due = () => new Date(Date.now() + DELETION_GRACE_MS + 86_400_000).toISOString()

  /** A paid workspace with an endpoint on member.left, and a member who asked to be deleted. */
  async function leaving() {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const hook = await addEndpoint(owner.client, workspaceId, ["member.left"])
    const user = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: user.user.id, role: "member" })
    await user.client.account.delete({ email: user.email })
    return { owner, user, workspaceId, ...hook }
  }

  test("sends member.left for each shared workspace, without the erased name", async () => {
    const { user, secret, endpoint } = await leaving()
    const outcome = await purgeUser(user.user.id, due(), {
      db: app.db,
      billing: app.billing,
      enqueue: app.enqueue,
      recordFailure: () => {},
    })
    expect(outcome).toEqual({ purged: true })
    await app.drain()
    expect(verified(secret)).toEqual([
      {
        type: "member.left",
        timestamp: expect.any(String),
        data: { userId: user.user.id, name: "", role: "member", joinedAt: expect.any(String) },
      },
    ])
    expect(received[0]?.body).not.toContain(user.email)
    expect(await jobsFor(endpoint.id)).toHaveLength(1)
  })

  test("a purge that rolls back sends nothing", async () => {
    const { user, endpoint, workspaceId } = await leaving()
    const outcome = purgeUser(
      user.user.id,
      due(),
      { db: app.db, billing: app.billing, enqueue: app.enqueue, recordFailure: () => {} },
      {
        beforePurge: async () => {
          throw new Error("connection lost")
        },
      }
    )
    await expect(outcome).rejects.toThrow("connection lost")
    expect(await app.db.memberships.find(workspaceId, user.user.id)).toBeDefined()
    expect(await jobsFor(endpoint.id)).toHaveLength(0)
    await app.drain()
    expect(received).toHaveLength(0)
    await app.db.users.cancelDeletion(user.user.id)
  })
})

describe("outcomes", () => {
  test("a 5xx is recorded and retried; the retry's success resets the failure count", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { secret, endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    await app.db
      .sql`UPDATE webhook_endpoints SET consecutive_failures = 3 WHERE id = ${endpoint.id}`
    let calls = 0
    respond = () => new Response("try later", { status: calls++ === 0 ? 503 : 200 })
    await owner.client.notes.create({ workspaceId, title: "t" })
    await app.drain()
    expect((await jobsFor(endpoint.id))[0]).toMatchObject({
      status: "queued",
      last_error: "webhook delivery failed: http 503",
    })
    advance(2 * HOUR_MS)
    await app.drain()
    expect((await jobsFor(endpoint.id))[0]?.status).toBe("succeeded")
    const rows = await deliveriesOf(endpoint.id)
    expect(rows.map((r) => [r.attempt, r.status, r.error])).toEqual([
      [2, 200, null],
      [1, 503, "http"],
    ])
    // The same event id on both attempts; each attempt signed afresh.
    expect(new Set(received.map((r) => r.headers["webhook-id"])).size).toBe(1)
    expect(received[1]?.headers["webhook-timestamp"]).not.toBe(
      received[0]?.headers["webhook-timestamp"]
    )
    expect((await app.db.webhooks.find(endpoint.id))?.consecutive_failures).toBe(0)
    // The first attempt was signed on the real clock: the official library accepts it.
    const [first] = received
    if (!first) throw new Error("no first attempt")
    expect(new Webhook(secret).verify(first.body, first.headers)).toMatchObject({
      type: "note.created",
    })
  })

  test("all 8 attempts failing: the job dies and the endpoint's failure count goes up by one", async () => {
    const owner = await paidOwner()
    const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
    respond = () => new Response(null, { status: 500 })
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await runAllAttempts()
    const [job] = await jobsFor(endpoint.id)
    expect(job).toMatchObject({ status: "dead", attempts: 8 })
    const rows = await deliveriesOf(endpoint.id)
    expect(rows.map((r) => r.attempt).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rows.every((r) => r.status === 500 && r.error === "http")).toBe(true)
    expect(await app.db.webhooks.find(endpoint.id)).toMatchObject({
      enabled: true,
      consecutive_failures: 1,
    })
  })

  test("the fifth dead delivery in a row turns the endpoint off, audits it and mails each owner", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const coOwner = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: coOwner.user.id, role: "owner" })
    await coOwner.client.account.setLocale({ locale: "sv" })
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    await app.db
      .sql`UPDATE webhook_endpoints SET consecutive_failures = 4 WHERE id = ${endpoint.id}`
    respond = () => new Response(null, { status: 500 })
    await owner.client.notes.create({ workspaceId, title: "t" })
    await runAllAttempts()

    expect(await app.db.webhooks.find(endpoint.id)).toMatchObject({
      enabled: false,
      disabled_reason: "failures",
      consecutive_failures: 5,
    })
    const audits = (await app.db.sql`
      SELECT actor_user_id, metadata FROM audit_log
      WHERE action = 'workspace.webhook_disabled' AND workspace_id = ${workspaceId}
    `) as Array<{ actor_user_id: number | null; metadata: string }>
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actor_user_id).toBeNull()
    expect(JSON.parse(audits[0]?.metadata as string)).toEqual({
      endpointId: endpoint.id,
      host: `receiver.localhost:${receiver.port}`,
      events: ["note.created"],
      reason: "failures",
      consecutiveFailures: 5,
    })
    const [en] = await mailsTo(app, owner.email, webhookDisabledSubject)
    expect(en?.text).toContain(`receiver.localhost:${receiver.port}`)
    expect(en?.text).toMatch(/after 5 deliveries in a row failed/)
    expect(en?.text).toContain("http://account.example.com/workspace")
    // The co-owner chose Swedish.
    const sv = translatorFor("sv", "email")("webhookDisabled.subject")
    await mailsTo(app, coOwner.email, sv)
    // …and each owner has one webhook.disabled notification naming the host, never the path.
    for (const who of [owner, coOwner]) {
      const { items } = await who.client.notifications.list()
      expect(items.filter((n) => n.type === "webhook.disabled")).toEqual([
        {
          id: expect.any(Number),
          type: "webhook.disabled",
          data: {
            workspaceName: "Notes",
            host: `receiver.localhost:${receiver.port}`,
            reason: "failures",
          },
          workspaceId,
          createdAt: expect.any(String),
          read: false,
        },
      ])
      expect(JSON.stringify(items)).not.toContain("/hook")
    }

    // Off now: the next event is not even queued.
    await owner.client.notes.create({ workspaceId, title: "after" })
    expect(await jobsFor(endpoint.id)).toHaveLength(1)
  })

  test("410 Gone turns the endpoint off at once, without a retry", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    respond = () => new Response("bye", { status: 410 })
    await owner.client.notes.create({ workspaceId, title: "t" })
    await runAllAttempts(2)
    expect(received).toHaveLength(1)
    expect((await jobsFor(endpoint.id))[0]?.status).toBe("succeeded")
    expect(await app.db.webhooks.find(endpoint.id)).toMatchObject({
      enabled: false,
      disabled_reason: "gone",
    })
    expect((await deliveriesOf(endpoint.id)).map((r) => [r.status, r.error])).toEqual([[410, null]])
    await mailsTo(app, owner.email, webhookDisabledSubject)
    const [audit] = (await app.db.sql`
      SELECT metadata FROM audit_log
      WHERE action = 'workspace.webhook_disabled' AND workspace_id = ${workspaceId}
    `) as Array<{ metadata: string }>
    expect(JSON.parse(audit?.metadata as string)).toMatchObject({ reason: "gone" })
    const { items } = await owner.client.notifications.list()
    expect(items.filter((n) => n.type === "webhook.disabled").map((n) => n.data)).toEqual([
      { workspaceName: "Notes", host: `receiver.localhost:${receiver.port}`, reason: "gone" },
    ])
  })

  test("a disable whose transaction fails tells nobody; the retry disables and tells once", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    respond = () => new Response("bye", { status: 410 })
    await owner.client.notes.create({ workspaceId, title: "t" })
    const disabledNotifications = async () =>
      (await owner.client.notifications.list()).items.filter((n) => n.type === "webhook.disabled")
    // Every transaction fails right after it queued a notification's publish.
    const original = app.db.transaction
    app.db.transaction = (fn) =>
      original((tx) =>
        fn({
          ...tx,
          afterCommit: (callback) => {
            tx.afterCommit(callback)
            throw new Error("after the notification")
          },
        })
      )
    try {
      await app.drain()
    } finally {
      app.db.transaction = original
    }
    expect(await app.db.webhooks.find(endpoint.id)).toMatchObject({ enabled: true })
    expect(await disabledNotifications()).toEqual([])
    expect((await jobsFor(endpoint.id))[0]?.status).toBe("queued")
    // The retry gets its 410 again and commits: one notification.
    advance(2 * HOUR_MS)
    await app.drain()
    expect(await app.db.webhooks.find(endpoint.id)).toMatchObject({
      enabled: false,
      disabled_reason: "gone",
    })
    expect((await disabledNotifications()).map((n) => n.data)).toEqual([
      { workspaceName: "Notes", host: `receiver.localhost:${receiver.port}`, reason: "gone" },
    ])
  })

  // 307 and 308 keep the method and body: following one would re-POST the signed event to
  // wherever `Location` points, the real SSRF risk.
  for (const status of [301, 302, 303, 307, 308]) {
    test(`a ${status} redirect is a failure and is never followed`, async () => {
      const owner = await paidOwner()
      const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
      respond = () =>
        new Response(null, {
          status,
          headers: { location: `http://127.0.0.1:${elsewhereServer.port}/internal` },
        })
      await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
      await app.drain()
      expect(elsewhere).toHaveLength(0)
      expect((await deliveriesOf(endpoint.id)).map((r) => [r.status, r.error])).toEqual([
        [status, "redirect"],
      ])
      expect((await jobsFor(endpoint.id))[0]?.status).toBe("queued")
    })
  }

  test("the last attempt is the row's own max_attempts, not today's definition", async () => {
    const owner = await paidOwner()
    const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
    respond = () => new Response(null, { status: 500 })
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    // Queued under an older definition that allowed 2 attempts.
    await app.db.sql`
      UPDATE jobs SET max_attempts = 2
      WHERE name = 'webhook.deliver' AND dedupe_key LIKE ${`webhook:%:${endpoint.id}`}
    `
    await runAllAttempts(2)
    expect((await jobsFor(endpoint.id))[0]).toMatchObject({ status: "dead", attempts: 2 })
    expect((await app.db.webhooks.find(endpoint.id))?.consecutive_failures).toBe(1)
  })

  test("a timeout and a refused connection are recorded as such", async () => {
    const owner = await paidOwner()
    const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
    fetchImpl = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError")
    }
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    fetchImpl = async () => {
      throw new Error("ECONNREFUSED")
    }
    advance(2 * HOUR_MS)
    await app.drain()
    expect((await deliveriesOf(endpoint.id)).map((r) => [r.attempt, r.status, r.error])).toEqual([
      [2, null, "network"],
      [1, null, "timeout"],
    ])
  })

  test("the response body is never stored, logged or kept in the job", async () => {
    const owner = await paidOwner()
    const { secret, endpoint } = await addEndpoint(owner.client, owner.workspaceId, [
      "note.created",
    ])
    const marker = "RESPONSE-BODY-MARKER-7f3a"
    respond = () => new Response(marker, { status: 500 })
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    const stored = JSON.stringify({
      deliveries: await deliveriesOf(endpoint.id),
      jobs: await jobsFor(endpoint.id),
    })
    expect(stored).not.toContain(marker)
    const logs = logLines.join("\n")
    expect(logs).not.toContain(marker)
    // Nor the signing secret, in either form.
    expect(logs).not.toContain(secret.slice(6))
    expect(stored).not.toContain(secret.slice(6))
    expect(logs).not.toContain((await app.db.webhooks.find(endpoint.id))?.secret as string)
  })
})

describe("the SSRF guard runs again before every attempt (Review Focus 1)", () => {
  /** A Pro owner with an https endpoint on `host` (public when created). */
  async function httpsEndpoint(host: string, answers: string[][]) {
    dns.set(host, [["93.184.216.34"], ...answers])
    const owner = await paidOwner()
    const hook = await addEndpoint(
      owner.client,
      owner.workspaceId,
      ["note.created"],
      `https://${host}/in?x=1`
    )
    return { owner, ...hook }
  }

  test("DNS rebinding: public when saved, private at delivery → never dialled, recorded blocked", async () => {
    const { owner, endpoint } = await httpsEndpoint("rebind.example.com", [["10.0.0.5"]])
    fetchImpl = async () => new Response(null, { status: 204 })
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    expect(dialled).toHaveLength(0)
    expect((await deliveriesOf(endpoint.id)).map((r) => [r.status, r.error])).toEqual([
      [null, "blocked"],
    ])
  })

  test("only the address the job just checked is dialled, with Host and SNI naming the host", async () => {
    // Saved: A1. The job's own check: A2. Anything asked later: a private address.
    const { owner, endpoint } = await httpsEndpoint("pinned.example.com", [
      ["203.0.114.7", "2606:4700::6810:1"],
      ["127.0.0.1"],
    ])
    fetchImpl = async () => {
      // A lookup made now would answer 127.0.0.1: the dial must not depend on it.
      await resolve("pinned.example.com")
      return new Response(null, { status: 200 })
    }
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    expect(dialled).toHaveLength(1)
    const [call] = dialled
    expect(call?.url).toBe("https://203.0.114.7/in?x=1")
    expect(call?.init).toMatchObject({
      method: "POST",
      redirect: "manual",
      tls: { serverName: "pinned.example.com" },
    })
    expect((call?.init.headers as Record<string, string> | undefined)?.host).toBe(
      "pinned.example.com"
    )
    expect((await deliveriesOf(endpoint.id))[0]).toMatchObject({ status: 200, error: null })
  })

  test("several addresses: a connection error moves on to the next; IPv6 is bracketed", async () => {
    const { owner } = await httpsEndpoint("multi.example.com", [
      ["203.0.114.8", "2606:4700::6810:2"],
    ])
    fetchImpl = async (url) => {
      if (url.startsWith("https://203.0.114.8")) throw new Error("ECONNREFUSED")
      return new Response(null, { status: 204 })
    }
    await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "t" })
    await app.drain()
    expect(dialled.map((d) => d.url)).toEqual([
      "https://203.0.114.8/in?x=1",
      "https://[2606:4700::6810:2]/in?x=1",
    ])
  })
})

describe("workspaces.webhooks.test", () => {
  test("queues a signed ping to that endpoint only, whatever it subscribes to", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { secret, endpoint } = await addEndpoint(owner.client, workspaceId, ["member.left"])
    const other = await addEndpoint(owner.client, workspaceId, ["member.left"])
    const { eventId } = await owner.client.workspaces.webhooks.test({
      workspaceId,
      id: endpoint.id,
    })
    expect(eventId).toMatch(/^msg_/)
    await app.drain()
    expect(received).toHaveLength(1)
    expect(received[0]?.headers["webhook-id"]).toBe(eventId)
    expect(verified(secret)).toEqual([
      { type: "ping", timestamp: expect.any(String), data: { endpointId: endpoint.id } },
    ])
    expect(await deliveriesOf(other.endpoint.id)).toEqual([])
    expect((await deliveriesOf(endpoint.id))[0]).toMatchObject({ event_type: "ping", status: 204 })
  })

  test("is limited to WEBHOOK_TEST_RATE_LIMIT per workspace per hour (webhook-test:<workspaceId>)", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    for (let n = 0; n < WEBHOOK_TEST_RATE_LIMIT; n++) {
      await owner.client.workspaces.webhooks.test({ workspaceId, id: endpoint.id })
    }
    expect(
      (await safe(owner.client.workspaces.webhooks.test({ workspaceId, id: endpoint.id })))[0]
    ).toMatchObject({ code: "TOO_MANY_REQUESTS", message: WEBHOOK_TEST_RATE_MESSAGE })
    // Another workspace has its own budget.
    const other = await paidOwner()
    const { endpoint: otherEndpoint } = await addEndpoint(other.client, other.workspaceId, [
      "note.created",
    ])
    await other.client.workspaces.webhooks.test({
      workspaceId: other.workspaceId,
      id: otherEndpoint.id,
    })
  })

  test("refusals: disabled (CONFLICT), unknown (NOT_FOUND), Free, member role, impersonation", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await addEndpoint(owner.client, workspaceId, ["note.created"])
    const send = (c: ApiClient, id = endpoint.id) =>
      safe(c.workspaces.webhooks.test({ workspaceId, id }))

    expect((await send(owner.client, 999_999))[0]).toMatchObject({
      code: "NOT_FOUND",
      message: WEBHOOK_NOT_FOUND_MESSAGE,
    })
    const member = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: member.user.id, role: "member" })
    expect((await send(member.client))[0]).toMatchObject({
      code: "FORBIDDEN",
      message: "Requires the admin role",
    })
    const root = await signUpVerified(app, ROOT)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: {},
    })
    expect((await send(clientFor(app, token)))[0]).toMatchObject({
      code: "FORBIDDEN",
      message: IMPERSONATING_MESSAGE,
    })

    await owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: false })
    expect((await send(owner.client))[0]).toMatchObject({
      code: "CONFLICT",
      message: WEBHOOK_TEST_DISABLED_MESSAGE,
    })
    await owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: true })
    await app.billing.change(workspaceId, "cancel", "month")
    expect((await send(owner.client))[0]).toMatchObject({
      code: "FORBIDDEN",
      message: FEATURE_MESSAGES.api,
    })
    await app.drain()
    expect(received).toHaveLength(0)
  })
})

describe("webhooks.prune", () => {
  test("deletes delivery rows older than 30 days, keeps newer ones", async () => {
    const owner = await paidOwner()
    const { endpoint } = await addEndpoint(owner.client, owner.workspaceId, ["note.created"])
    const day = 86_400_000
    for (const [eventId, ageDays] of [
      ["msg_old", 31],
      ["msg_new", 29],
    ] as const)
      await app.db.webhooks.recordDelivery({
        endpointId: endpoint.id,
        eventId,
        eventType: "note.created",
        attempt: 1,
        status: 200,
        error: null,
        durationMs: 1,
        createdAt: new Date(now().getTime() - ageDays * day).toISOString(),
      })
    const { webhooksPruneJob } = await import("./jobs/builtin/webhooks")
    await createEnqueue({ db: app.db, now })(webhooksPruneJob, {})
    await app.drain()
    expect((await deliveriesOf(endpoint.id)).map((r) => r.event_id)).toEqual(["msg_new"])
  })
})

describe("registration", () => {
  test("webhooks.prune is scheduled nightly at 03:55; webhook.deliver retries 8 times", async () => {
    const { SCHEDULES, jobByName } = await import("./jobs/registry")
    const schedule = SCHEDULES.find((s) => s.name === "webhooks.prune")
    expect(schedule?.cron).toBe("55 3 * * *")
    expect(jobByName("webhook.deliver")?.maxAttempts).toBe(8)
  })

  test("a delivery payload whose data does not match its type never reaches the queue", async () => {
    const { webhookDeliverJob } = await import("./jobs/builtin/webhooks")
    const enqueue = createEnqueue({ db: app.db })
    const base = {
      endpointId: 1,
      eventId: "msg_AAAAAAAAAAAAAAAAAAAAAA",
      timestamp: new Date().toISOString(),
    }
    await expect(
      enqueue(webhookDeliverJob, { ...base, type: "note.deleted", data: { title: "x" } })
    ).rejects.toThrow()
    await expect(
      enqueue(
        webhookDeliverJob,
        { ...base, type: "ping", data: { endpointId: 1 } },
        {
          dedupeKey: "webhook:test-only",
        }
      )
    ).resolves.toBeGreaterThan(0)
  })
})

describe("localhost delivery is opt-in", () => {
  test("a server not given the opt-in refuses *.localhost, even outside production", async () => {
    const plain = await start({ webhookResolve: resolve })
    try {
      const owner = await signUpWithWorkspace(plain)
      await plain.billing.change(owner.workspaceId, "pro", "month")
      const [error] = await safe(
        owner.client.workspaces.webhooks.create({
          workspaceId: owner.workspaceId,
          url: hookUrl,
          events: ["note.created"],
        })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: WEBHOOK_URL_INVALID_MESSAGE })
    } finally {
      await plain.stop()
    }
  }, 30_000)
})
