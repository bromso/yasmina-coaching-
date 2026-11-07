import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { connect } from "node:net"
import type { ApiClient, BroadcastEvent } from "@repo/api-contract"
import { workspaceChannel } from "@repo/api-contract/realtime"
import type { ErrorBody } from "@repo/public-api-contract"
import { buildV1OpenAPIDocument } from "@repo/public-api-contract/openapi"
import { createMemoryRateLimiter, REQUEST_TIMEOUT_MESSAGE } from "@repo/service-kit"
import { siteUrl } from "@repo/sites"
import { BRAND_NAME } from "@repo/sites/brand"
import { generateApiKey, hashApiKey } from "../api-keys"
import { auth, signUpVerified, signUpWithWorkspace, start } from "../test-server"
import { scopeMessage, UNAUTHORIZED_MESSAGE } from "./errors"

const DAY_MS = 24 * 60 * 60_000
/** A test that boots its own server: on Postgres that is a fresh database and every migration. */
const BOOT_TIMEOUT_MS = 30_000
const logLines: string[] = []
/** Shifts the api's clock (`now`): key expiry, the last-used throttle. Sessions use real time. */
const clock = { offset: 0 }
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    now: () => new Date(Date.now() + clock.offset),
    logWrite: (line) => void logLines.push(line),
    // The anonymous /v1 limiter has its own test; the refusal tests here share one address.
    apiAnonLimiter: createMemoryRateLimiter({ limit: 10_000, windowMs: 60_000 }),
    log: (message, error) =>
      void logLines.push(
        `${message} ${error instanceof Error ? error.message : String(error ?? "")}`
      ),
  })
})
afterAll(() => app.stop())

type Scope = "workspace:read" | "members:read" | "notes:read" | "notes:write"
const ALL: Scope[] = ["workspace:read", "members:read", "notes:read", "notes:write"]

async function paidOwner() {
  const owner = await signUpWithWorkspace(app)
  await app.billing.change(owner.workspaceId, "pro", "month")
  return owner
}

async function keyFor(
  owner: { client: ApiClient; workspaceId: number },
  scopes: Scope[] = ALL,
  expiresInDays: 30 | 90 | 365 | null = 90,
  name = "CI"
) {
  return owner.client.workspaces.apiKeys.create({
    workspaceId: owner.workspaceId,
    name,
    scopes,
    expiresInDays,
  })
}

/** A /v1 call; `key` null sends no Authorization header. */
async function call(
  path: string,
  key: string | null,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { ...init.headers }
  if (key !== null) headers.authorization = `Bearer ${key}`
  if (init.body !== undefined) headers["content-type"] = "application/json"
  const res = await fetch(new URL(`/v1${path}`, app.server.url), {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const text = await res.text()
  return { res, status: res.status, json: text ? JSON.parse(text) : null }
}

const errorOf = (code: ErrorBody["error"]["code"], message: string) => ({
  error: { code, message },
})

describe("authentication", () => {
  test("no key, a malformed one, an unknown one, a wrong secret: one 401, one message", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const wrongSecret = `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`
    const unknown = `bb_live_ZZZZZZZZ_${key.slice(17)}`
    const attempts: Array<Record<string, string>> = [
      {},
      { authorization: key },
      { authorization: `Basic ${key}` },
      { authorization: `Bearer  ${key}` },
      { authorization: `Bearer ${key.replace("bb_live_", "bb_test_")}` },
      { authorization: `Bearer ${unknown}` },
      { authorization: `Bearer ${wrongSecret}` },
    ]
    for (const headers of attempts) {
      const { status, json, res } = await call("/notes", null, { headers })
      expect(status).toBe(401)
      expect(json).toEqual(errorOf("unauthorized", UNAUTHORIZED_MESSAGE))
      expect(res.headers.get("www-authenticate")).toBe("Bearer")
    }
    expect((await call("/notes", key)).status).toBe(200)
  })

  test("the service token and a session are not credentials here", async () => {
    const owner = await paidOwner()
    expect((await call("/notes", null, { headers: auth })).status).toBe(401)
    const withSession = await call("/notes", null, {
      headers: { ...auth, "x-session-token": owner.token },
    })
    expect(withSession.json).toEqual(errorOf("unauthorized", UNAUTHORIZED_MESSAGE))
  })

  test("a revoked key is refused at once, and its use recorded without key material", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner)
    expect((await call("/notes", key)).status).toBe(200)
    await owner.client.workspaces.apiKeys.revoke({ workspaceId: owner.workspaceId, id: apiKey.id })
    const { status, json } = await call("/notes", key)
    expect(status).toBe(401)
    expect(json).toEqual(errorOf("unauthorized", UNAUTHORIZED_MESSAGE))
    const recorded = logLines.filter((line) => line.startsWith("api key: revoked key used"))
    expect(recorded.some((line) => line.includes(`revoked API key ${apiKey.id} `))).toBe(true)
    await Bun.sleep(50)
    const rows = (await app.db.sql`
      SELECT message FROM telemetry_errors WHERE message LIKE ${`%API key ${apiKey.id} %`}
    `) as Array<{ message: string }>
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.message).not.toContain(key.slice(17))
      expect(row.message).not.toContain(apiKey.prefix)
    }
  })

  test("an expired key is refused once the api's clock reaches its expiry", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ALL, 30)
    try {
      clock.offset = 30 * DAY_MS - 60_000
      expect((await call("/notes", key)).status).toBe(200)
      clock.offset = 30 * DAY_MS
      expect((await call("/notes", key)).status).toBe(401)
    } finally {
      clock.offset = 0
    }
  })

  test("a workspace that drops to Free loses the API at once; upgrading again restores it", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    await app.billing.change(owner.workspaceId, "cancel", "month")
    expect(await call("/workspace", key)).toMatchObject({
      status: 401,
      json: errorOf("unauthorized", UNAUTHORIZED_MESSAGE),
    })
    await app.billing.change(owner.workspaceId, "team", "month")
    expect((await call("/workspace", key)).json).toMatchObject({ plan: "team" })
  })

  test("a key whose workspace row is gone is refused", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    // Only the workspace row: SQLite (no enforced foreign keys) keeps the key row, Postgres
    // cascades it away. Either way the key no longer works.
    await app.db.sql`DELETE FROM workspaces WHERE id = ${owner.workspaceId}`
    expect((await call("/notes", key)).status).toBe(401)
  })

  test("deleting the workspace deletes its keys (the cascade, and the explicit delete)", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner)
    await owner.client.workspaces.delete({ workspaceId: owner.workspaceId })
    expect(await app.db.apiKeys.findByPrefix(apiKey.prefix)).toBeUndefined()
    expect((await call("/notes", key)).status).toBe(401)
  })
})

describe("scopes", () => {
  test("a route outside the key's scopes is 403 forbidden_scope, naming the scope", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ["notes:read"])
    expect(await call("/workspace", key)).toMatchObject({
      status: 403,
      json: errorOf("forbidden_scope", scopeMessage("workspace:read")),
    })
    expect((await call("/members", key)).json).toEqual(
      errorOf("forbidden_scope", scopeMessage("members:read"))
    )
    const post = await call("/notes", key, { method: "POST", body: { title: "x" } })
    expect(post).toMatchObject({
      status: 403,
      json: errorOf("forbidden_scope", "This API key does not have the notes:write scope"),
    })
    expect((await call("/notes/1", key, { method: "DELETE" })).status).toBe(403)
    expect((await call("/notes", key)).status).toBe(200)
    // Nothing was written.
    expect((await owner.client.notes.list({ workspaceId: owner.workspaceId })).items).toEqual([])
  })
})

describe("GET /v1/workspace", () => {
  test("the key's own workspace and its plan", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const workspace = await owner.client.workspaces.get({ workspaceId: owner.workspaceId })
    const { status, json } = await call("/workspace", key)
    expect(status).toBe(200)
    expect(json).toEqual({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      plan: "pro",
    })
  })
})

describe("GET /v1/members", () => {
  test("pages by user id, never an email; limit 1–100", async () => {
    const owner = await paidOwner()
    const second = await signUpVerified(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: second.user.id,
      role: "viewer",
    })
    const { key } = await keyFor(owner)
    const first = await call("/members?limit=1", key)
    expect(first.status).toBe(200)
    expect(first.json.items).toEqual([
      {
        userId: owner.user.id,
        name: owner.user.name,
        role: "owner",
        joinedAt: expect.any(String),
      },
    ])
    expect(first.json.nextCursor).toBe(owner.user.id)
    const next = await call(`/members?limit=1&cursor=${first.json.nextCursor}`, key)
    expect(next.json).toEqual({
      items: [
        {
          userId: second.user.id,
          name: second.user.name,
          role: "viewer",
          joinedAt: expect.any(String),
        },
      ],
      nextCursor: null,
    })
    const text = JSON.stringify([first.json, next.json])
    expect(text).not.toContain(owner.user.email)
    expect(text).not.toContain(second.user.email)
    expect(text).not.toContain("email")
    for (const bad of ["limit=0", "limit=101", "cursor=abc"]) {
      const { status, json } = await call(`/members?${bad}`, key)
      expect(status).toBe(400)
      expect(json.error.code).toBe("validation_failed")
    }
  })

  test("a cursor naming another workspace's member returns only this workspace's members", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { key } = await keyFor(a)
    for (const user of [await signUpVerified(app), await signUpVerified(app)])
      await app.db.memberships.add({
        workspaceId: b.workspaceId,
        userId: user.user.id,
        role: "member",
      })
    // B's own members as cursors: only A's rows (none past them), never one of B's.
    for (const cursor of [b.user.id - 1, b.user.id])
      expect((await call(`/members?cursor=${cursor}`, key)).json).toEqual({
        items: [],
        nextCursor: null,
      })
    // A cursor before every id: exactly A's members, still none of B's.
    expect((await call("/members?cursor=1", key)).json).toEqual({
      items: a.user.id > 1 ? [expect.objectContaining({ userId: a.user.id })] : [],
      nextCursor: null,
    })
  })
})

describe("notes", () => {
  test("POST creates a note authored by the key; GET lists and reads it; DELETE removes it", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner, ALL, 90, "Deploy bot")
    const created = await call("/notes", key, {
      method: "POST",
      body: { title: "From CI", body: "Build 42 passed" },
    })
    expect(created.status).toBe(201)
    expect(created.json).toEqual({
      id: expect.any(Number),
      title: "From CI",
      body: "Build 42 passed",
      createdAt: expect.any(String),
      author: { type: "api_key", id: apiKey.id, name: "Deploy bot" },
    })
    const id = created.json.id as number
    const row = await app.db.notes.findRow({ workspaceId: owner.workspaceId, id })
    expect(row).toMatchObject({ api_key_id: apiKey.id, user_id: null })

    const list = await call("/notes", key)
    expect(list.json).toEqual({ items: [created.json], nextCursor: null })
    expect((await call(`/notes/${id}`, key)).json).toEqual(created.json)

    const deleted = await call(`/notes/${id}`, key, { method: "DELETE" })
    expect(deleted.status).toBe(204)
    expect(deleted.json).toBeNull()
    expect(await call(`/notes/${id}`, key)).toMatchObject({
      status: 404,
      json: errorOf("not_found", "Note not found"),
    })
    expect((await call(`/notes/${id}`, key, { method: "DELETE" })).status).toBe(404)
  })

  test("a person's note shows them as its author; a purged author is null", async () => {
    const owner = await paidOwner()
    const writer = await signUpVerified(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: writer.user.id,
      role: "member",
    })
    const mine = await owner.client.notes.create({ workspaceId: owner.workspaceId, title: "Mine" })
    const theirs = await writer.client.notes.create({
      workspaceId: owner.workspaceId,
      title: "Theirs",
    })
    await app.db.transaction((tx) => tx.users.purge(writer.user.id, new Date().toISOString()))
    const { key } = await keyFor(owner)
    expect((await call(`/notes/${mine.id}`, key)).json.author).toEqual({
      type: "user",
      id: owner.user.id,
      name: owner.user.name,
    })
    expect((await call(`/notes/${theirs.id}`, key)).json.author).toBeNull()
  })

  test("paging: newest first, limit and cursor", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    for (const title of ["1", "2", "3"])
      await call("/notes", key, { method: "POST", body: { title } })
    const first = await call("/notes?limit=2", key)
    expect(first.json.items.map((n: { title: string }) => n.title)).toEqual(["3", "2"])
    const rest = await call(`/notes?limit=2&cursor=${first.json.nextCursor}`, key)
    expect(rest.json.items.map((n: { title: string }) => n.title)).toEqual(["1"])
    expect(rest.json.nextCursor).toBeNull()
  })

  test("invalid input is 400 validation_failed", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    for (const body of [{}, { title: "" }, { title: "x".repeat(201) }, { title: "x", body: 7 }]) {
      const { status, json } = await call("/notes", key, { method: "POST", body })
      expect(status).toBe(400)
      expect(json.error).toMatchObject({ code: "validation_failed" })
    }
    expect((await call("/notes/abc", key)).status).toBe(400)
  })

  test("the internal list, realtime and the product event see the key, not a person", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner, ALL, 90, "Importer")
    const events: BroadcastEvent[] = []
    const unsubscribe = await app.broadcaster.subscribe(
      workspaceChannel(owner.workspaceId),
      (event) => void events.push(event)
    )
    const { json } = await call("/notes", key, { method: "POST", body: { title: "Imported" } })
    await Bun.sleep(20)
    unsubscribe()
    const expected = {
      id: json.id,
      title: "Imported",
      body: "",
      createdAt: json.createdAt,
      authorId: null,
      apiKey: { id: apiKey.id, name: "Importer" },
    }
    expect(events).toContainEqual({ type: "note.created", note: expected })
    const internal = await owner.client.notes.list({ workspaceId: owner.workspaceId })
    expect(internal.items).toEqual([expected])
    expect(await owner.client.notes.find({ workspaceId: owner.workspaceId, id: json.id })).toEqual(
      expected
    )

    await app.drain()
    const rows = (await app.db.sql`
      SELECT user_id, workspace_id FROM analytics_events
      WHERE name = 'note_created' AND workspace_id = ${owner.workspaceId}
    `) as Array<{ user_id: number | null; workspace_id: number }>
    expect(rows).toEqual([{ user_id: null, workspace_id: owner.workspaceId }])

    // The note outlives the key's revocation, still naming it.
    await owner.client.workspaces.apiKeys.revoke({ workspaceId: owner.workspaceId, id: apiKey.id })
    const after = await owner.client.notes.list({ workspaceId: owner.workspaceId })
    expect(after.items[0]?.apiKey).toEqual({ id: apiKey.id, name: "Importer" })
  })

  test("a deletion through /v1 is published", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const { json } = await call("/notes", key, { method: "POST", body: { title: "Gone soon" } })
    const events: BroadcastEvent[] = []
    const unsubscribe = await app.broadcaster.subscribe(
      workspaceChannel(owner.workspaceId),
      (event) => void events.push(event)
    )
    await call(`/notes/${json.id}`, key, { method: "DELETE" })
    await Bun.sleep(20)
    unsubscribe()
    expect(events).toContainEqual({ type: "note.deleted", id: json.id })
  })
})

describe("isolation", () => {
  test("another workspace's note id is 404 not_found for get and delete, and stays", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { key } = await keyFor(a)
    const theirs = await b.client.notes.create({ workspaceId: b.workspaceId, title: "B's" })
    expect(await call(`/notes/${theirs.id}`, key)).toMatchObject({
      status: 404,
      json: errorOf("not_found", "Note not found"),
    })
    expect((await call(`/notes/${theirs.id}`, key, { method: "DELETE" })).status).toBe(404)
    expect(await b.client.notes.find({ workspaceId: b.workspaceId, id: theirs.id })).toMatchObject({
      title: "B's",
    })
    // A list cursor past B's note still lists only A's (none).
    expect((await call(`/notes?cursor=${theirs.id + 1}`, key)).json).toEqual({
      items: [],
      nextCursor: null,
    })
    // The workspace route names only the key's own workspace.
    expect((await call("/workspace", key)).json.id).toBe(a.workspaceId)
  })
})

describe("last_used_at", () => {
  test("written on use, at most once a minute per key", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner)
    const lastUsed = async () => (await app.db.apiKeys.findByPrefix(apiKey.prefix))?.last_used_at
    expect(await lastUsed()).toBeNull()
    try {
      await call("/notes", key)
      const first = await lastUsed()
      expect(first).toBeString()
      clock.offset = 30_000
      await call("/notes", key)
      expect(await lastUsed()).toBe(first as string)
      clock.offset = 61_000
      await call("/notes", key)
      const third = await lastUsed()
      expect(Date.parse(third as string)).toBeGreaterThan(Date.parse(first as string) + 60_000)
    } finally {
      clock.offset = 0
    }
    // The workspace's own list shows it.
    const [listed] = (
      await owner.client.workspaces.apiKeys.list({ workspaceId: owner.workspaceId })
    ).items
    expect(listed?.lastUsedAt).toBeString()
  })
})

describe("the limiter", () => {
  test(
    "api-key:<id>: past the budget, 429 rate_limited with Retry-After; other keys unaffected",
    async () => {
      const limited = await start({
        apiKeyLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
      })
      try {
        const owner = await signUpWithWorkspace(limited)
        await limited.billing.change(owner.workspaceId, "pro", "month")
        const make = async () =>
          (
            await owner.client.workspaces.apiKeys.create({
              workspaceId: owner.workspaceId,
              name: "K",
              scopes: ["notes:read"],
              expiresInDays: 90,
            })
          ).key
        const [one, two] = [await make(), await make()]
        const hit = (key: string) =>
          fetch(new URL("/v1/notes", limited.server.url), {
            headers: { authorization: `Bearer ${key}` },
          })
        expect((await hit(one)).status).toBe(200)
        expect((await hit(one)).status).toBe(200)
        const refused = await hit(one)
        expect(refused.status).toBe(429)
        expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
        expect(await refused.json()).toEqual(errorOf("rate_limited", "Too many requests"))
        expect((await hit(two)).status).toBe(200)
      } finally {
        await limited.stop()
      }
    },
    BOOT_TIMEOUT_MS
  )

  test(
    "/v1 is outside the service token's per-client limiter",
    async () => {
      const tight = await start({
        rateLimiter: createMemoryRateLimiter({ limit: 30, windowMs: 60_000 }),
      })
      try {
        const owner = await signUpWithWorkspace(tight)
        await tight.billing.change(owner.workspaceId, "pro", "month")
        const { key } = await owner.client.workspaces.apiKeys.create({
          workspaceId: owner.workspaceId,
          name: "K",
          scopes: ["notes:read"],
          expiresInDays: 90,
        })
        for (let i = 0; i < 40; i++) {
          const res = await fetch(new URL("/v1/notes", tight.server.url), {
            headers: { authorization: `Bearer ${key}` },
          })
          expect(res.status).toBe(200)
        }
      } finally {
        await tight.stop()
      }
    },
    BOOT_TIMEOUT_MS
  )
})

describe("the spec, docs and other paths", () => {
  test("/v1/openapi.json is open and generated from the public contract", async () => {
    const res = await fetch(new URL("/v1/openapi.json", app.server.url))
    expect(res.status).toBe(200)
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
      components: { securitySchemes: Record<string, unknown> }
    }
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/v1/members",
      "/v1/notes",
      "/v1/notes/{id}",
      "/v1/workspace",
    ])
    expect(Object.keys(spec.paths["/v1/notes"] ?? {}).sort()).toEqual(["get", "post"])
    expect(spec.components.securitySchemes.apiKey).toMatchObject({ type: "http", scheme: "bearer" })
    // The internal procedures are not in it.
    expect(JSON.stringify(spec)).not.toContain("/auth/")
    expect(JSON.stringify(spec.paths["/v1/notes/{id}"]?.get?.responses)).toContain(
      "forbidden_scope"
    )
  })

  test("/v1/openapi.json is exactly buildV1OpenAPIDocument(), modulo its server URL", async () => {
    const res = await fetch(new URL("/v1/openapi.json", app.server.url))
    const live = (await res.json()) as { servers?: unknown }
    // The api fills `servers` in from the live request's own origin (see handler.ts); the
    // builder, called with no `serverUrl`, has none. Everything else must match exactly.
    const { servers: _liveServers, ...liveRest } = live
    const built = await buildV1OpenAPIDocument({
      title: `${BRAND_NAME} API`,
      docsUrl: `${siteUrl("docs")}/developers`,
    })
    const { servers: _builtServers, ...builtRest } = built
    expect(liveRest).toEqual(builtRest)
    expect(live.servers).toEqual([new URL("/", app.server.url).toString()].map((url) => ({ url })))
  })

  test("/v1/docs is open", async () => {
    const res = await fetch(new URL("/v1/docs", app.server.url))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
  })

  test("an unknown /v1 path is 401 without a key and 404 not_found with one", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    expect((await call("/nothing", null)).json).toEqual(
      errorOf("unauthorized", UNAUTHORIZED_MESSAGE)
    )
    expect(await call("/nothing", key)).toMatchObject({
      status: 404,
      json: errorOf("not_found", "Not found"),
    })
  })

  test("the 413 size check applies only to a POST: a GET or DELETE body is never read", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const big = JSON.stringify({ padding: "y".repeat(300_000) })
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" }
    // fetch() refuses a GET with a body, so that one goes over a raw socket.
    const url = new URL(app.server.url)
    const raw = await new Promise<string>((resolve, reject) => {
      let received = ""
      const socket = connect(Number(url.port), url.hostname, () => {
        socket.write(
          `GET /v1/notes HTTP/1.1\r\nhost: ${url.host}\r\nauthorization: Bearer ${key}\r\n` +
            `content-type: application/json\r\ncontent-length: ${big.length}\r\n` +
            `connection: close\r\n\r\n${big}`
        )
      })
      socket.on("data", (chunk) => {
        received += chunk.toString()
      })
      socket.on("end", () => resolve(received))
      // The server may answer and close before reading the unread body; the answer still came.
      socket.on("error", (error) => (received ? resolve(received) : reject(error)))
    })
    expect(raw.split("\r\n")[0]).toBe("HTTP/1.1 200 OK")
    const deleted = await fetch(new URL("/v1/notes/999999", app.server.url), {
      method: "DELETE",
      headers,
      body: big,
    })
    expect(deleted.status).toBe(404)
    expect(await deleted.json()).toEqual(errorOf("not_found", "Note not found"))
    const posted = await fetch(new URL("/v1/notes", app.server.url), {
      method: "POST",
      headers,
      body: big,
    })
    expect(posted.status).toBe(413)
    expect(await posted.json()).toEqual(errorOf("validation_failed", "Payload too large"))
  })

  test("bare /v1 is a /v1 not_found, with or without a key", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    for (const headers of [{}, { authorization: `Bearer ${key}` }] as Record<string, string>[]) {
      const res = await fetch(new URL("/v1", app.server.url), { headers })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual(errorOf("not_found", "Not found"))
    }
  })

  test("an oversized body is refused before it is read", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const { status, json } = await call("/notes", key, {
      method: "POST",
      body: { title: "x", body: "y".repeat(300_000) },
    })
    expect(status).toBe(413)
    expect(json).toEqual(errorOf("validation_failed", "Payload too large"))
  })
})

/**
 * The error responses the spec declares for each route — and so the docs' errors list — are
 * exactly the ones the route can answer. Every route: the guard's 401 and 429, the scope check's
 * 403 (before input validation), an unexpected failure's 500 and the request deadline's 503 (both
 * `internal`, see "every /v1 failure keeps the /v1 shape"). A route with input adds 400; one
 * addressing a note by id, 404; the one that takes a body, 413.
 */
describe("the spec's error responses are what each route can answer", () => {
  const ALWAYS = [401, 403, 429, 500, 503]
  const EXPECTED: Record<string, { method: string; path: string; statuses: number[] }> = {
    getWorkspace: { method: "get", path: "/v1/workspace", statuses: ALWAYS },
    listMembers: { method: "get", path: "/v1/members", statuses: [400, ...ALWAYS] },
    listNotes: { method: "get", path: "/v1/notes", statuses: [400, ...ALWAYS] },
    getNote: { method: "get", path: "/v1/notes/{id}", statuses: [400, 404, ...ALWAYS] },
    createNote: { method: "post", path: "/v1/notes", statuses: [400, 413, ...ALWAYS] },
    deleteNote: { method: "delete", path: "/v1/notes/{id}", statuses: [400, 404, ...ALWAYS] },
  }

  test("the document declares exactly these error statuses per route", async () => {
    const doc = (await buildV1OpenAPIDocument()) as unknown as {
      paths: Record<string, Record<string, { operationId: string; responses: object }>>
    }
    for (const [operationId, { method, path, statuses }] of Object.entries(EXPECTED)) {
      const operation = doc.paths[path]?.[method]
      expect(operation?.operationId).toBe(operationId)
      const errors = Object.keys(operation?.responses ?? {})
        .map(Number)
        .filter((status) => status >= 400)
        .sort((a, b) => a - b)
      expect({ operationId, errors }).toEqual({
        operationId,
        errors: [...statuses].sort((a, b) => a - b),
      })
    }
  })

  test("every route answers 401 without a key and 403 without its scope", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ["workspace:read"])
    const { key: noScope } = await keyFor(owner, ["members:read"])
    const calls: [string, string, unknown?][] = [
      ["GET", "/workspace"],
      ["GET", "/members"],
      ["GET", "/notes"],
      ["GET", "/notes/1"],
      ["POST", "/notes", { title: "T" }],
      ["DELETE", "/notes/1"],
    ]
    for (const [method, path, body] of calls) {
      expect((await call(path, null, { method, body })).status).toBe(401)
      const scoped = path === "/workspace" ? noScope : key
      const refused = await call(path, scoped, { method, body })
      expect({ path, method, status: refused.status }).toEqual({ path, method, status: 403 })
    }
  })

  test("getWorkspace answers the declared 401, not 404, when the workspace vanishes mid-request", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ["workspace:read"])
    // The guard's lookup sees the workspace; the handler's, one step later, finds it deleted.
    const workspaces = app.db.workspaces
    const find = workspaces.find
    let calls = 0
    workspaces.find = (async (...args: Parameters<typeof find>) =>
      ++calls === 1 ? find.apply(workspaces, args) : null) as typeof find
    try {
      const { status, json } = await call("/workspace", key)
      expect(calls).toBe(2)
      expect(status).toBe(401)
      expect(json).toEqual(errorOf("unauthorized", UNAUTHORIZED_MESSAGE))
    } finally {
      workspaces.find = find
    }
  })

  test("getWorkspace has no input to refuse: junk query parameters still answer 200", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ["workspace:read"])
    expect((await call("/workspace?limit=abc&cursor=-1&x=%7B", key)).status).toBe(200)
  })
})

describe("no key material in the logs", () => {
  test("nothing written while using a key — including a revoked one — carries it or its hash", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await keyFor(owner)
    const before = logLines.length
    await call("/notes", key, { method: "POST", body: { title: "Logged" } })
    await call("/notes", key)
    await call("/workspace", key)
    await owner.client.workspaces.apiKeys.revoke({ workspaceId: owner.workspaceId, id: apiKey.id })
    await call("/notes", key)
    await app.drain()
    const lines = logLines.slice(before)
    expect(lines.length).toBeGreaterThan(0)
    const all = lines.join("\n")
    expect(all).not.toContain(key.slice(17))
    expect(all).not.toContain(hashApiKey(key))
    // The access line carries the bounded route label, not the path's id or query.
    expect(all).toContain("route=v1:notes")
  })
})

describe("the public contract's own vocabularies", () => {
  test("match the internal ones they mirror", async () => {
    const internal = await import("@repo/api-contract")
    const pub = await import("@repo/public-api-contract")
    expect([...pub.SCOPES]).toEqual([...internal.API_SCOPES])
    expect([...pub.PLANS]).toEqual([...internal.PLAN_KEYS])
    expect([...pub.ROLES]).toEqual([...internal.ROLES])
  })
})

describe("order: authenticate, then limit, then scope, then validate", () => {
  test(
    "a key that lost the feature is 401, never 429, even past its budget",
    async () => {
      const limited = await start({
        apiKeyLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      })
      try {
        const owner = await signUpWithWorkspace(limited)
        await limited.billing.change(owner.workspaceId, "pro", "month")
        const { key } = await owner.client.workspaces.apiKeys.create({
          workspaceId: owner.workspaceId,
          name: "K",
          scopes: ["notes:read"],
          expiresInDays: 90,
        })
        const hit = () =>
          fetch(new URL("/v1/notes", limited.server.url), {
            headers: { authorization: `Bearer ${key}` },
          })
        expect((await hit()).status).toBe(200)
        await limited.billing.change(owner.workspaceId, "cancel", "month")
        for (let i = 0; i < 2; i++) {
          const res = await hit()
          expect(res.status).toBe(401)
          expect(await res.json()).toEqual(errorOf("unauthorized", UNAUTHORIZED_MESSAGE))
        }
      } finally {
        await limited.stop()
      }
    },
    BOOT_TIMEOUT_MS
  )

  test("a key without the scope gets 403 whatever its body or id", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner, ["notes:read"])
    for (const body of [{}, { title: "" }, { title: 7 }]) {
      expect(await call("/notes", key, { method: "POST", body })).toMatchObject({
        status: 403,
        json: errorOf("forbidden_scope", scopeMessage("notes:write")),
      })
    }
    expect((await call("/notes/abc", key, { method: "DELETE" })).status).toBe(403)
    expect((await call("/members?limit=0", key)).status).toBe(403)
    // With the scope, the same bodies are validation errors.
    const { key: writer } = await keyFor(owner, ["notes:write"])
    expect((await call("/notes", writer, { method: "POST", body: {} })).status).toBe(400)
  })
})

describe("every /v1 failure keeps the /v1 shape", () => {
  test("a database failure in the guard is 500 internal", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const original = app.db.apiKeys.findByPrefix
    app.db.apiKeys.findByPrefix = async () => {
      throw new Error("database is down")
    }
    try {
      const { status, json } = await call("/notes", key)
      expect(status).toBe(500)
      expect(json).toEqual(errorOf("internal", "Internal error"))
    } finally {
      app.db.apiKeys.findByPrefix = original
    }
    expect(logLines.some((line) => line.includes("database is down"))).toBe(true)
  })

  test(
    "a request past REQUEST_TIMEOUT_MS is 503 internal",
    async () => {
      const slow = await start({ requestTimeoutMs: 200 })
      try {
        // Set up through the queries, not /rpc: with a 200 ms deadline on the whole server, only
        // the one /v1 call below goes over HTTP, and only it is held past the deadline.
        const user = await slow.db.users.create({
          email: "timeout@example.com",
          passwordHash: null,
          name: "Timeout",
        })
        const workspace = await slow.db.workspaces.create({
          name: "Slow",
          slug: "slow",
          createdBy: user.id,
        })
        await slow.db.memberships.add({ workspaceId: workspace.id, userId: user.id, role: "owner" })
        await slow.billing.change(workspace.id, "pro", "month")
        const { key, prefix, secretHash } = generateApiKey()
        await slow.db.apiKeys.create({
          workspaceId: workspace.id,
          name: "K",
          prefix,
          secretHash,
          scopes: ["notes:read"],
          createdBy: user.id,
          createdAt: new Date().toISOString(),
          expiresAt: null,
        })
        // The guard's lookup waits until the test has its answer: past the deadline by construction.
        let release = () => {}
        const held = new Promise<void>((resolve) => {
          release = resolve
        })
        const original = slow.db.apiKeys.findByPrefix
        slow.db.apiKeys.findByPrefix = async (p) => {
          await held
          return original(p)
        }
        try {
          const res = await fetch(new URL("/v1/notes", slow.server.url), {
            headers: { authorization: `Bearer ${key}` },
          })
          expect(res.status).toBe(503)
          expect(await res.json()).toEqual(errorOf("internal", REQUEST_TIMEOUT_MESSAGE))
        } finally {
          release()
          slow.db.apiKeys.findByPrefix = original
        }
      } finally {
        await slow.stop()
      }
    },
    BOOT_TIMEOUT_MS
  )
})

describe("the anonymous limiter (v1-anon:<ip hash>)", () => {
  test(
    "refused requests share a per-address budget; a valid key is never held by it",
    async () => {
      const lines: string[] = []
      const anon = await start({
        apiAnonLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
        log: (message, error) =>
          void lines.push(`${message} ${error instanceof Error ? error.message : ""}`),
      })
      try {
        const owner = await signUpWithWorkspace(anon)
        await anon.billing.change(owner.workspaceId, "pro", "month")
        const create = async () =>
          owner.client.workspaces.apiKeys.create({
            workspaceId: owner.workspaceId,
            name: "K",
            scopes: ["notes:read"],
            expiresInDays: 90,
          })
        const valid = await create()
        const revoked = await create()
        await owner.client.workspaces.apiKeys.revoke({
          workspaceId: owner.workspaceId,
          id: revoked.apiKey.id,
        })
        const hit = (authorization?: string) =>
          fetch(new URL("/v1/notes", anon.server.url), {
            headers: authorization ? { authorization } : undefined,
          })
        expect((await hit()).status).toBe(401)
        expect((await hit("Bearer nope")).status).toBe(401)
        expect((await hit(`Bearer ${revoked.key}`)).status).toBe(401)
        const refused = await hit(`Bearer ${revoked.key}`)
        expect(refused.status).toBe(429)
        expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
        expect(await refused.json()).toEqual(errorOf("rate_limited", "Too many requests"))
        // The revoked key's two uses (the 429'd one too) are one report: at most one a minute.
        expect(lines.filter((line) => line.startsWith("api key: revoked key used"))).toHaveLength(1)
        // The valid key is untouched by the anonymous budget.
        expect((await hit(`Bearer ${valid.key}`)).status).toBe(200)
      } finally {
        await anon.stop()
      }
    },
    BOOT_TIMEOUT_MS
  )
})

describe("an API key is not a credential anywhere else", () => {
  test("/rpc and /openapi refuse it", async () => {
    const owner = await paidOwner()
    const { key } = await keyFor(owner)
    const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" }
    const rpc = await fetch(new URL("/rpc/notes/list", app.server.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ json: { workspaceId: owner.workspaceId } }),
    })
    expect(rpc.status).toBe(401)
    const rest = await fetch(
      new URL(`/openapi/notes?workspaceId=${owner.workspaceId}`, app.server.url),
      { headers }
    )
    expect(rest.status).toBe(401)
  })
})
