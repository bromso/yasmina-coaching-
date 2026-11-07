import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  type ApiClient,
  FEATURE_MESSAGES,
  IMPERSONATING_MESSAGE,
  MAX_WEBHOOK_ENDPOINTS,
  WEBHOOK_DELIVERIES_LIMIT,
  WEBHOOK_LIMIT_MESSAGE,
  WEBHOOK_NOT_FOUND_MESSAGE,
  WEBHOOK_URL_BLOCKED_MESSAGE,
  WEBHOOK_URL_INVALID_MESSAGE,
  WEBHOOK_URL_UNRESOLVED_MESSAGE,
} from "@repo/api-contract"
import { WEBHOOK_EVENT_TYPES } from "@repo/api-contract/webhooks-limits"
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from "@repo/public-api-contract/webhooks"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { DEV_TWO_FACTOR_KEY } from "./env"
import { clientFor, signUpVerified, signUpWithWorkspace, start } from "./test-server"
import { decryptWebhookSecret } from "./webhooks/secret"
import { WEBHOOK_SECRET_PATTERN } from "./webhooks/sign"
import type { Resolver } from "./webhooks/ssrf"

const ROOT = "webhooks-root@example.com"
const logLines: string[] = []
/** What the stub DNS answers per host; anything else resolves to one public address. */
const dns = new Map<string, string[] | Error>()
const resolved: string[] = []
const resolve: Resolver = async (host) => {
  resolved.push(host)
  const answer = dns.get(host)
  if (answer instanceof Error) throw answer
  return answer ?? ["93.184.216.34"]
}
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  dns.set("internal.example.com", ["10.0.0.5"])
  dns.set("mixed.example.com", ["93.184.216.34", "169.254.169.254"])
  dns.set("mapped.example.com", ["::ffff:127.0.0.1"])
  dns.set("nxdomain.example.com", new Error("ENOTFOUND"))
  dns.set("empty.example.com", [])
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    logWrite: (line) => void logLines.push(line),
    log: (message, error) => void logLines.push(`${message} ${String(error ?? "")}`),
    webhookResolve: resolve,
  })
})
afterAll(() => app.stop())

/** A verified owner of a workspace on Pro (the `api` feature on). */
async function paidOwner() {
  const owner = await signUpWithWorkspace(app)
  await app.billing.change(owner.workspaceId, "pro", "month")
  return owner
}

type CreateInput = Parameters<ApiClient["workspaces"]["webhooks"]["create"]>[0]
const create = (client: ApiClient, workspaceId: number, overrides: Partial<CreateInput> = {}) =>
  client.workspaces.webhooks.create({
    workspaceId,
    url: "https://hooks.example.com/in",
    events: ["note.created"],
    ...overrides,
  })

/** Inserts an endpoint straight through the queries (for the cap tests). */
const insertEndpoint = (workspaceId: number, createdBy: number) =>
  app.db.webhooks.create({
    workspaceId,
    url: "https://hooks.example.com/inserted",
    description: null,
    events: ["note.created"],
    secret: "v1:x:y",
    createdBy,
    createdAt: new Date().toISOString(),
  })

const storedSecret = async (id: number) => (await app.db.webhooks.find(id))?.secret as string

const auditRows = (workspaceId: number, action: string) =>
  app.db.sql`
    SELECT * FROM audit_log WHERE action = ${action} AND workspace_id = ${workspaceId}
    ORDER BY id
  ` as Promise<
    Array<{
      actor_user_id: number
      metadata: string | null
      target_type: string
      target_id: string
    }>
  >

describe("the internal event list", () => {
  test("is the public contract's subscribable list", () => {
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([...SUBSCRIBABLE_WEBHOOK_EVENTS])
  })
})

describe("workspaces.webhooks.create", () => {
  test("returns the whsec_ secret once and a summary; stores it encrypted", async () => {
    const owner = await paidOwner()
    const { secret, endpoint } = await create(owner.client, owner.workspaceId, {
      url: "https://Hooks.Example.com/in?x=1",
      description: "  CI  ",
      events: ["api_key.revoked", "note.created"],
    })
    expect(secret).toMatch(WEBHOOK_SECRET_PATTERN)
    expect(endpoint).toMatchObject({
      // The URL the guard checked, WHATWG-normalised.
      url: "https://hooks.example.com/in?x=1",
      description: "CI",
      // Canonical order, whatever order they were asked in.
      events: ["note.created", "api_key.revoked"],
      enabled: true,
      disabledReason: null,
      disabledAt: null,
      consecutiveFailures: 0,
      createdBy: { id: owner.user.id, name: owner.user.name },
      lastDelivery: null,
    })
    const stored = await storedSecret(endpoint.id)
    expect(stored.startsWith("v1:")).toBe(true)
    expect(stored).not.toContain(secret.slice(6))
    expect(await decryptWebhookSecret(stored, DEV_TWO_FACTOR_KEY)).toBe(secret)
  })

  test("a blank description stores none; the description is optional", async () => {
    const owner = await paidOwner()
    const blank = await create(owner.client, owner.workspaceId, { description: "   " })
    expect(blank.endpoint.description).toBeNull()
    const none = await create(owner.client, owner.workspaceId)
    expect(none.endpoint.description).toBeNull()
  })

  test("URL shape refusals: http, userinfo, a fragment, not a URL", async () => {
    const owner = await paidOwner()
    for (const url of [
      "http://hooks.example.com/",
      "https://user:pass@hooks.example.com/",
      "https://hooks.example.com/#x",
      "hooks.example.com",
      "ftp://hooks.example.com/",
    ]) {
      const [error] = await safe(create(owner.client, owner.workspaceId, { url }))
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: WEBHOOK_URL_INVALID_MESSAGE })
    }
    expect((await owner.client.workspaces.webhooks.list(owner)).items).toEqual([])
  })

  test("a URL short as typed but over 2000 characters once normalised is a 400, not a 500", async () => {
    const owner = await paidOwner()
    const url = `https://hooks.example.com/${"é".repeat(1000)}`
    const [error] = await safe(create(owner.client, owner.workspaceId, { url }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", message: WEBHOOK_URL_INVALID_MESSAGE })
    const { endpoint } = await create(owner.client, owner.workspaceId)
    const [updateError] = await safe(
      owner.client.workspaces.webhooks.update({
        workspaceId: owner.workspaceId,
        id: endpoint.id,
        url,
      })
    )
    expect(updateError).toMatchObject({
      code: "BAD_REQUEST",
      message: WEBHOOK_URL_INVALID_MESSAGE,
    })
  })

  test("the SSRF guard: a private, mixed or mapped answer is blocked; no answer is unresolved", async () => {
    const owner = await paidOwner()
    for (const url of [
      "https://internal.example.com/",
      "https://mixed.example.com/",
      "https://mapped.example.com/",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost/",
      "https://receiver.brand.localhost/",
    ]) {
      const [error] = await safe(create(owner.client, owner.workspaceId, { url }))
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: WEBHOOK_URL_BLOCKED_MESSAGE })
    }
    for (const url of ["https://nxdomain.example.com/", "https://empty.example.com/"]) {
      const [error] = await safe(create(owner.client, owner.workspaceId, { url }))
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: WEBHOOK_URL_UNRESOLVED_MESSAGE })
    }
    expect((await owner.client.workspaces.webhooks.list(owner)).items).toEqual([])
  })

  test("refusals answer in the caller's language", async () => {
    const owner = await paidOwner()
    const sv = clientFor(app, owner.token, "sv")
    const [blocked] = await safe(create(sv, owner.workspaceId, { url: "https://10.0.0.1/" }))
    expect(blocked).toMatchObject({
      code: "BAD_REQUEST",
      message:
        "Adressen pekar på en privat eller reserverad adress. Använd en offentlig mottagare.",
    })
  })

  test("a Free workspace is refused with the api feature's message, before DNS is asked", async () => {
    const owner = await signUpWithWorkspace(app)
    resolved.length = 0
    const [error] = await safe(
      create(owner.client, owner.workspaceId, { url: "https://free-plan.example.com/" })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: FEATURE_MESSAGES.api })
    expect(resolved).not.toContain("free-plan.example.com")
  })

  test(`at most ${MAX_WEBHOOK_ENDPOINTS} endpoints, enabled or not`, async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    for (let i = 0; i < MAX_WEBHOOK_ENDPOINTS - 1; i++) {
      const row = await insertEndpoint(workspaceId, owner.user.id)
      if (i === 0) await app.db.webhooks.disable(row.id, "manual", new Date().toISOString())
    }
    const { endpoint } = await create(owner.client, workspaceId)
    const [error] = await safe(create(owner.client, workspaceId))
    expect(error).toMatchObject({ code: "CONFLICT", message: WEBHOOK_LIMIT_MESSAGE })
    expect(await app.db.webhooks.countForWorkspace(workspaceId)).toBe(MAX_WEBHOOK_ENDPOINTS)
    // Deleting one makes room again.
    await owner.client.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })
    await create(owner.client, workspaceId)
  })

  test("two creates at the cap minus one, sent together: one passes", async () => {
    const owner = await paidOwner()
    for (let i = 0; i < MAX_WEBHOOK_ENDPOINTS - 1; i++)
      await insertEndpoint(owner.workspaceId, owner.user.id)
    const results = await Promise.all([
      safe(create(owner.client, owner.workspaceId)),
      safe(create(owner.client, owner.workspaceId)),
    ])
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(await app.db.webhooks.countForWorkspace(owner.workspaceId)).toBe(MAX_WEBHOOK_ENDPOINTS)
  })

  test("audited with the host and events — never the secret, its ciphertext, the path or query", async () => {
    const owner = await paidOwner()
    const { secret, endpoint } = await create(owner.client, owner.workspaceId, {
      url: "https://hooks.example.com:8443/in/tok3n?key=abc",
      events: ["member.joined", "member.left"],
    })
    const [row, ...rest] = await auditRows(owner.workspaceId, "workspace.webhook_created")
    expect(rest).toEqual([])
    expect(row).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "webhook",
      target_id: String(endpoint.id),
    })
    expect(JSON.parse(row?.metadata as string)).toEqual({
      endpointId: endpoint.id,
      host: "hooks.example.com:8443",
      events: ["member.joined", "member.left"],
    })
    expect(row?.metadata).not.toContain(secret.slice(6))
    expect(row?.metadata).not.toContain(await storedSecret(endpoint.id))
    expect(row?.metadata).not.toContain("tok3n")
  })
})

describe("workspaces.webhooks.list", () => {
  test("every endpoint, newest first, with its last delivery; never the secret", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const first = await create(owner.client, workspaceId, { url: "https://a.example.com/" })
    const second = await create(owner.client, workspaceId, { url: "https://b.example.com/" })
    await app.db.webhooks.recordDelivery({
      endpointId: first.endpoint.id,
      eventId: "msg_one",
      eventType: "note.created",
      attempt: 1,
      status: 500,
      error: "http",
      durationMs: 12,
      createdAt: "2026-10-18T10:00:00.000Z",
    })
    await app.db.webhooks.recordDelivery({
      endpointId: first.endpoint.id,
      eventId: "msg_one",
      eventType: "note.created",
      attempt: 2,
      status: 200,
      error: null,
      durationMs: 30,
      createdAt: "2026-10-18T10:01:00.000Z",
    })
    const { items } = await owner.client.workspaces.webhooks.list({ workspaceId })
    expect(items.map((e) => e.id)).toEqual([second.endpoint.id, first.endpoint.id])
    expect(items[0]?.lastDelivery).toBeNull()
    expect(items[1]?.lastDelivery).toMatchObject({
      eventId: "msg_one",
      eventType: "note.created",
      attempt: 2,
      status: 200,
      error: null,
      durationMs: 30,
      createdAt: "2026-10-18T10:01:00.000Z",
    })
    const text = JSON.stringify(items)
    for (const { secret, endpoint } of [first, second]) {
      expect(text).not.toContain(secret.slice(6))
      expect(text).not.toContain(await storedSecret(endpoint.id))
    }
  })

  test("the last delivery is the deliveries page's first row, even when ids and times disagree", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    const record = (eventId: string, createdAt: string) =>
      app.db.webhooks.recordDelivery({
        endpointId: endpoint.id,
        eventId,
        eventType: "note.created",
        attempt: 1,
        status: 200,
        error: null,
        durationMs: 1,
        createdAt,
      })
    await record("msg_newer", "2026-10-18T12:00:00.000Z")
    // A higher id with an older time.
    await record("msg_older", "2026-10-18T11:00:00.000Z")
    const { items } = await owner.client.workspaces.webhooks.list({ workspaceId })
    const page = await owner.client.workspaces.webhooks.deliveries({ workspaceId, id: endpoint.id })
    expect(items[0]?.lastDelivery?.eventId).toBe("msg_newer")
    expect(page.items[0]?.eventId).toBe("msg_newer")
  })

  test("only the workspace's own endpoints", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    await create(a.client, a.workspaceId)
    expect((await b.client.workspaces.webhooks.list({ workspaceId: b.workspaceId })).items).toEqual(
      []
    )
  })

  test("a purged creator reads as gone; the endpoint stays", async () => {
    const owner = await paidOwner()
    const admin = await signUpVerified(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: admin.user.id,
      role: "admin",
    })
    const { endpoint } = await create(admin.client, owner.workspaceId)
    await app.db.transaction((tx) => tx.users.purge(admin.user.id, new Date().toISOString()))
    const [listed] = (await owner.client.workspaces.webhooks.list(owner)).items
    expect(listed).toMatchObject({ id: endpoint.id, createdBy: null, enabled: true })
  })
})

describe("workspaces.webhooks.update", () => {
  test("changes events, description and URL; only what is given; one audit row", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId, { description: "old" })
    const updated = await owner.client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      events: ["workspace.updated", "note.deleted"],
    })
    expect(updated).toMatchObject({
      url: endpoint.url,
      description: "old",
      events: ["note.deleted", "workspace.updated"],
    })
    const moved = await owner.client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      url: "https://new.example.com/hook",
      description: "",
    })
    expect(moved).toMatchObject({ url: "https://new.example.com/hook", description: null })
    const rows = await auditRows(workspaceId, "workspace.webhook_updated")
    expect(rows.map((r) => JSON.parse(r.metadata as string))).toEqual([
      {
        endpointId: endpoint.id,
        host: "hooks.example.com",
        events: ["note.deleted", "workspace.updated"],
        enabled: true,
        changed: ["events"],
      },
      {
        endpointId: endpoint.id,
        host: "new.example.com",
        events: ["note.deleted", "workspace.updated"],
        enabled: true,
        changed: ["url", "description"],
      },
    ])
  })

  test("nothing to change writes no audit row and does not ask DNS for an unchanged URL", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId, {
      url: "https://same.example.com/",
    })
    resolved.length = 0
    await owner.client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      url: "https://same.example.com/",
      events: ["note.created"],
      enabled: true,
    })
    expect(resolved).toEqual([])
    expect(await auditRows(workspaceId, "workspace.webhook_updated")).toEqual([])
  })

  test("a new URL is re-checked by the SSRF guard; refused, nothing changes", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    for (const [url, message] of [
      ["https://internal.example.com/", WEBHOOK_URL_BLOCKED_MESSAGE],
      ["http://hooks.example.com/in", WEBHOOK_URL_INVALID_MESSAGE],
      ["https://nxdomain.example.com/", WEBHOOK_URL_UNRESOLVED_MESSAGE],
    ] as const) {
      const [error] = await safe(
        owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, url })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", message })
    }
    const [still] = (await owner.client.workspaces.webhooks.list({ workspaceId })).items
    expect(still?.url).toBe(endpoint.url)
  })

  test("disable is manual; re-enabling clears the reason, the time and the failure count", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    const off = await owner.client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      enabled: false,
    })
    expect(off).toMatchObject({ enabled: false, disabledReason: "manual" })
    expect(off.disabledAt).not.toBeNull()

    // As the delivery job leaves it after five dead deliveries.
    await app.db.webhooks.enable(endpoint.id, workspaceId)
    for (let i = 0; i < 5; i++) await app.db.webhooks.incrementFailures(endpoint.id)
    await app.db.webhooks.disable(endpoint.id, "failures", new Date().toISOString())
    const [failed] = (await owner.client.workspaces.webhooks.list({ workspaceId })).items
    expect(failed).toMatchObject({
      enabled: false,
      disabledReason: "failures",
      consecutiveFailures: 5,
    })
    const on = await owner.client.workspaces.webhooks.update({
      workspaceId,
      id: endpoint.id,
      enabled: true,
    })
    expect(on).toMatchObject({
      enabled: true,
      disabledReason: null,
      disabledAt: null,
      consecutiveFailures: 0,
    })
  })

  test("another workspace's endpoint or an unknown id is NOT_FOUND", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { endpoint } = await create(a.client, a.workspaceId)
    for (const id of [endpoint.id, 999_999]) {
      const [error] = await safe(
        b.client.workspaces.webhooks.update({ workspaceId: b.workspaceId, id, enabled: false })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND", message: WEBHOOK_NOT_FOUND_MESSAGE })
    }
    const [still] = (await a.client.workspaces.webhooks.list(a)).items
    expect(still?.enabled).toBe(true)
  })
})

describe("workspaces.webhooks.rotateSecret", () => {
  test("a new secret, once; the stored one is replaced; audited without either", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { secret: first, endpoint } = await create(owner.client, workspaceId)
    const { secret: second } = await owner.client.workspaces.webhooks.rotateSecret({
      workspaceId,
      id: endpoint.id,
    })
    expect(second).toMatch(WEBHOOK_SECRET_PATTERN)
    expect(second).not.toBe(first)
    expect(await decryptWebhookSecret(await storedSecret(endpoint.id), DEV_TWO_FACTOR_KEY)).toBe(
      second
    )
    const [row] = await auditRows(workspaceId, "workspace.webhook_secret_rotated")
    expect(JSON.parse(row?.metadata as string)).toEqual({
      endpointId: endpoint.id,
      host: "hooks.example.com",
    })
    expect(row?.metadata).not.toContain(first.slice(6))
    expect(row?.metadata).not.toContain(second.slice(6))
  })

  test("an unknown id is NOT_FOUND", async () => {
    const owner = await paidOwner()
    const [error] = await safe(
      owner.client.workspaces.webhooks.rotateSecret({ workspaceId: owner.workspaceId, id: 999_999 })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND", message: WEBHOOK_NOT_FOUND_MESSAGE })
  })
})

describe("workspaces.webhooks.delete", () => {
  test("deletes the endpoint and its deliveries; audited; a second delete is NOT_FOUND", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    await app.db.webhooks.recordDelivery({
      endpointId: endpoint.id,
      eventId: "msg_x",
      eventType: "ping",
      attempt: 1,
      status: 204,
      error: null,
      durationMs: 5,
      createdAt: new Date().toISOString(),
    })
    await owner.client.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })
    expect(await app.db.webhooks.find(endpoint.id)).toBeUndefined()
    expect(await app.db.webhooks.listDeliveries(endpoint.id, 50)).toEqual([])
    const [row] = await auditRows(workspaceId, "workspace.webhook_deleted")
    expect(JSON.parse(row?.metadata as string)).toEqual({
      endpointId: endpoint.id,
      host: "hooks.example.com",
      events: ["note.created"],
    })
    const [error] = await safe(
      owner.client.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND", message: WEBHOOK_NOT_FOUND_MESSAGE })
  })

  test("another workspace's endpoint is NOT_FOUND and stays", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { endpoint } = await create(a.client, a.workspaceId)
    const [error] = await safe(
      b.client.workspaces.webhooks.delete({ workspaceId: b.workspaceId, id: endpoint.id })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND", message: WEBHOOK_NOT_FOUND_MESSAGE })
    expect(await app.db.webhooks.find(endpoint.id)).toBeDefined()
  })
})

describe("workspaces.webhooks.deliveries", () => {
  test(`the newest ${WEBHOOK_DELIVERIES_LIMIT} attempts, newest first`, async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    for (let i = 0; i < WEBHOOK_DELIVERIES_LIMIT + 5; i++)
      await app.db.webhooks.recordDelivery({
        endpointId: endpoint.id,
        eventId: `msg_${i}`,
        eventType: "note.created",
        attempt: 1,
        status: i % 2 ? 200 : null,
        error: i % 2 ? null : "timeout",
        durationMs: 10_000,
        createdAt: new Date(Date.UTC(2026, 9, 18, 0, i)).toISOString(),
      })
    const { items } = await owner.client.workspaces.webhooks.deliveries({
      workspaceId,
      id: endpoint.id,
    })
    expect(items).toHaveLength(WEBHOOK_DELIVERIES_LIMIT)
    expect(items[0]).toMatchObject({ eventId: `msg_${WEBHOOK_DELIVERIES_LIMIT + 4}`, status: null })
    expect(items[0]?.error).toBe("timeout")
    expect(items.at(-1)?.eventId).toBe("msg_5")
  })

  test("another workspace's endpoint is NOT_FOUND", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { endpoint } = await create(a.client, a.workspaceId)
    const [error] = await safe(
      b.client.workspaces.webhooks.deliveries({
        workspaceId: b.workspaceId,
        id: endpoint.id,
      })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND", message: WEBHOOK_NOT_FOUND_MESSAGE })
  })
})

describe("plans", () => {
  test("after a drop to Free: list, deliveries and delete work; create, update, rotate do not", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    const other = await create(owner.client, workspaceId)
    await app.billing.change(workspaceId, "cancel", "month")
    expect((await owner.client.workspaces.webhooks.list({ workspaceId })).items).toHaveLength(2)
    await owner.client.workspaces.webhooks.deliveries({ workspaceId, id: endpoint.id })
    const results = await Promise.all([
      safe(create(owner.client, workspaceId)),
      safe(
        owner.client.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: false })
      ),
      safe(owner.client.workspaces.webhooks.rotateSecret({ workspaceId, id: endpoint.id })),
    ])
    for (const [error] of results)
      expect(error).toMatchObject({ code: "FORBIDDEN", message: FEATURE_MESSAGES.api })
    await owner.client.workspaces.webhooks.delete({ workspaceId, id: other.endpoint.id })
    expect((await owner.client.workspaces.webhooks.list({ workspaceId })).items).toHaveLength(1)
  })
})

describe("roles", () => {
  test("admin and owner manage endpoints; member and viewer get FORBIDDEN; outsiders NOT_FOUND", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    const byRole = async (role: "viewer" | "member" | "admin") => {
      const user = await signUpVerified(app)
      await app.db.memberships.add({ workspaceId, userId: user.user.id, role })
      return user.client
    }
    const calls = (c: ApiClient): Promise<unknown>[] => [
      c.workspaces.webhooks.list({ workspaceId }),
      create(c, workspaceId),
      c.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: false }),
      c.workspaces.webhooks.rotateSecret({ workspaceId, id: endpoint.id }),
      c.workspaces.webhooks.delete({ workspaceId, id: endpoint.id }),
      c.workspaces.webhooks.deliveries({ workspaceId, id: endpoint.id }),
    ]
    for (const role of ["viewer", "member"] as const) {
      const client = await byRole(role)
      for (const [error] of await Promise.all(calls(client).map((p) => safe(p))))
        expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
    }
    const outsider = (await signUpVerified(app)).client
    for (const [error] of await Promise.all(calls(outsider).map((p) => safe(p))))
      expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })

    const admin = await byRole("admin")
    expect((await admin.workspaces.webhooks.list({ workspaceId })).items).toHaveLength(1)
    await create(admin, workspaceId)
    const [still] = (await owner.client.workspaces.webhooks.list({ workspaceId })).items.filter(
      (e) => e.id === endpoint.id
    )
    expect(still?.enabled).toBe(true)
  })
})

describe("impersonation", () => {
  test("list and deliveries stay readable; create, update, rotateSecret and delete are refused", async () => {
    const root = await signUpVerified(app, ROOT)
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { endpoint } = await create(owner.client, workspaceId)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: {},
    })
    const asUser = clientFor(app, token)
    expect((await asUser.workspaces.webhooks.list({ workspaceId })).items).toHaveLength(1)
    await asUser.workspaces.webhooks.deliveries({ workspaceId, id: endpoint.id })
    const results = await Promise.all([
      safe(create(asUser, workspaceId)),
      safe(asUser.workspaces.webhooks.update({ workspaceId, id: endpoint.id, enabled: false })),
      safe(asUser.workspaces.webhooks.rotateSecret({ workspaceId, id: endpoint.id })),
      safe(asUser.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })),
    ])
    for (const [error] of results)
      expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    const [still] = (await owner.client.workspaces.webhooks.list({ workspaceId })).items
    expect(still).toMatchObject({ id: endpoint.id, enabled: true })
  })
})

describe("workspace deletion", () => {
  test("deletes the workspace's endpoints and their deliveries", async () => {
    const owner = await paidOwner()
    const { endpoint } = await create(owner.client, owner.workspaceId)
    await app.db.webhooks.recordDelivery({
      endpointId: endpoint.id,
      eventId: "msg_y",
      eventType: "ping",
      attempt: 1,
      status: 200,
      error: null,
      durationMs: 1,
      createdAt: new Date().toISOString(),
    })
    await owner.client.workspaces.delete({ workspaceId: owner.workspaceId })
    expect(await app.db.webhooks.find(endpoint.id)).toBeUndefined()
    expect(await app.db.webhooks.listDeliveries(endpoint.id, 50)).toEqual([])
  })
})

describe("no secret in the logs", () => {
  test("nothing written while creating, rotating, listing and deleting carries a secret", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { secret, endpoint } = await create(owner.client, workspaceId)
    const { secret: rotated } = await owner.client.workspaces.webhooks.rotateSecret({
      workspaceId,
      id: endpoint.id,
    })
    const ciphertext = await storedSecret(endpoint.id)
    await owner.client.workspaces.webhooks.list({ workspaceId })
    await owner.client.workspaces.webhooks.delete({ workspaceId, id: endpoint.id })
    await app.drain()
    expect(logLines.length).toBeGreaterThan(0)
    const all = logLines.join("\n")
    for (const value of [secret.slice(6), rotated.slice(6), ciphertext])
      expect(all).not.toContain(value)
  })
})

describe("localhost targets (outside production)", () => {
  let dev: Awaited<ReturnType<typeof start>>
  // A second server: on Postgres, creating and migrating its database can take over 5 s.
  beforeAll(async () => {
    dev = await start({ webhookAllowLocalhostHttp: true, webhookResolve: resolve })
  }, 30_000)
  // Stopping it drops that database, which on Postgres can take over 5 s too.
  afterAll(() => dev.stop(), 30_000)

  test("http and https to *.localhost are accepted; other private targets still are not", async () => {
    const owner = await signUpWithWorkspace(dev)
    await dev.billing.change(owner.workspaceId, "pro", "month")
    const { endpoint } = await create(owner.client, owner.workspaceId, {
      url: "http://receiver.brand.localhost:4100/hook",
    })
    expect(endpoint.url).toBe("http://receiver.brand.localhost:4100/hook")
    for (const url of ["http://hooks.example.com/", "https://10.0.0.1/"]) {
      const [error] = await safe(create(owner.client, owner.workspaceId, { url }))
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
    }
  })
})

/**
 * Holds the next `n` transactions at their very start until all `n` are open, so they really
 * overlap — each then takes the workspace row's lock for itself. Postgres only: on SQLite a second
 * transaction cannot begin while the first is open (and its single writer serialises them anyway).
 */
function overlapNextTransactions(n: number, timeoutMs = 5_000) {
  const original = app.db.transaction
  let arrived = 0
  let release = () => {}
  let abort = (_error: Error) => {}
  let timedOut: Error | undefined
  const allOpen = new Promise<void>((resolve, reject) => {
    release = resolve
    abort = reject
  })
  allOpen.catch(() => {})
  const timer = setTimeout(() => {
    timedOut = new Error(`only ${arrived} of ${n} transactions opened within ${timeoutMs} ms`)
    app.db.transaction = original
    abort(timedOut)
  }, timeoutMs)
  app.db.transaction = (fn) => {
    arrived += 1
    if (arrived === n) {
      app.db.transaction = original
      clearTimeout(timer)
      release()
    }
    return original(async (tx) => {
      await allOpen
      return fn(tx)
    })
  }
  return () => {
    clearTimeout(timer)
    app.db.transaction = original
    if (timedOut) throw timedOut
  }
}

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("creates under real overlap (Postgres)", () => {
  test(`two creates at ${MAX_WEBHOOK_ENDPOINTS - 1} endpoints, both inside their transactions: never ${MAX_WEBHOOK_ENDPOINTS + 1}`, async () => {
    const owner = await paidOwner()
    for (let i = 0; i < MAX_WEBHOOK_ENDPOINTS - 1; i++)
      await insertEndpoint(owner.workspaceId, owner.user.id)
    const restore = overlapNextTransactions(2)
    const results = await Promise.all([
      safe(create(owner.client, owner.workspaceId)),
      safe(create(owner.client, owner.workspaceId)),
    ]).finally(restore)
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
      { code: "CONFLICT", message: WEBHOOK_LIMIT_MESSAGE },
    ])
    expect(await app.db.webhooks.countForWorkspace(owner.workspaceId)).toBe(MAX_WEBHOOK_ENDPOINTS)
  })
})
