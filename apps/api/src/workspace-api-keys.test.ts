import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import {
  API_KEY_LIMIT_MESSAGE,
  API_KEY_NOT_FOUND_MESSAGE,
  type ApiClient,
  FEATURE_MESSAGES,
  IMPERSONATING_MESSAGE,
  MAX_API_KEYS,
} from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { API_KEY_PATTERN, generateApiKey, hashApiKey, verifyApiKey } from "./api-keys"
import { API_KEY_CREATE_ATTEMPTS } from "./router"
import { clientFor, signUpVerified, signUpWithWorkspace, start } from "./test-server"

const ROOT = "api-keys-root@example.com"
const DAY_MS = 24 * 60 * 60_000
const logLines: string[] = []
/** Shifts the api's clock (`now`). Sessions are issued on real time, so a test that moves it far
 * extends its own session row. */
const clock = { offset: 0 }
/** Keys `create` draws next, before falling back to `generateApiKey` (a forced collision). */
const queuedKeys: Array<ReturnType<typeof generateApiKey>> = []
let draws = 0
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    // Every line the api writes, structured or legacy: the key must reach neither.
    logWrite: (line) => void logLines.push(line),
    log: (message, error) => void logLines.push(`${message} ${String(error ?? "")}`),
    now: () => new Date(Date.now() + clock.offset),
    generateApiKey: () => {
      draws += 1
      return queuedKeys.shift() ?? generateApiKey()
    },
  })
})
afterAll(() => app.stop())

/** A verified owner of a workspace on Pro (the `api` feature on). */
async function paidOwner() {
  const owner = await signUpWithWorkspace(app)
  await app.billing.change(owner.workspaceId, "pro", "month")
  return owner
}

const create = (
  client: ApiClient,
  workspaceId: number,
  overrides: Partial<Parameters<ApiClient["workspaces"]["apiKeys"]["create"]>[0]> = {}
) =>
  client.workspaces.apiKeys.create({
    workspaceId,
    name: "CI",
    scopes: ["notes:read"],
    expiresInDays: 90,
    ...overrides,
  })

/** Inserts a key straight through the queries (for the cap and status tests). */
async function insertKey(
  workspaceId: number,
  createdBy: number,
  extra: { expiresAt?: string | null; revokedAt?: string } = {}
) {
  const { prefix, secretHash } = generateApiKey()
  const row = await app.db.apiKeys.create({
    workspaceId,
    name: "Inserted",
    prefix,
    secretHash,
    scopes: ["notes:read"],
    createdBy,
    createdAt: new Date().toISOString(),
    expiresAt: extra.expiresAt ?? null,
  })
  if (extra.revokedAt) await app.db.apiKeys.revoke(row.id, workspaceId, extra.revokedAt)
  return row
}

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

describe("workspaces.apiKeys.create", () => {
  test("returns the full key once and a summary; stores only the hash", async () => {
    const owner = await paidOwner()
    const before = Date.now()
    const { key, apiKey } = await create(owner.client, owner.workspaceId, {
      name: "  Deploy bot  ",
      scopes: ["notes:write", "workspace:read"],
    })
    expect(key).toMatch(API_KEY_PATTERN)
    expect(apiKey).toMatchObject({
      name: "Deploy bot",
      prefix: key.slice(8, 16),
      // Stored in API_SCOPES order, whatever order they were asked in.
      scopes: ["workspace:read", "notes:write"],
      createdBy: { id: owner.user.id, name: owner.user.name },
      creatorLeft: false,
      lastUsedAt: null,
      revokedAt: null,
      status: "active",
    })
    const expires = Date.parse(apiKey.expiresAt as string) - Date.parse(apiKey.createdAt)
    expect(expires).toBe(90 * DAY_MS)
    expect(Date.parse(apiKey.createdAt)).toBeGreaterThanOrEqual(before - 1000)

    const row = await app.db.apiKeys.findByPrefix(apiKey.prefix)
    expect(row?.secret_hash).toBe(hashApiKey(key))
    expect(verifyApiKey(key, row?.secret_hash as string)).toBe(true)
    // The key itself is in no column.
    expect(JSON.stringify(row)).not.toContain(key.slice(17))
  })

  test("30 and 365 days, and null for no expiry", async () => {
    const owner = await paidOwner()
    for (const days of [30, 365] as const) {
      const { apiKey } = await create(owner.client, owner.workspaceId, { expiresInDays: days })
      expect(Date.parse(apiKey.expiresAt as string) - Date.parse(apiKey.createdAt)).toBe(
        days * DAY_MS
      )
    }
    const { apiKey } = await create(owner.client, owner.workspaceId, { expiresInDays: null })
    expect(apiKey.expiresAt).toBeNull()
    expect(apiKey.status).toBe("active")
  })

  test("a Free workspace is refused with the api feature's message, in the caller's language", async () => {
    const owner = await signUpWithWorkspace(app)
    const [error] = await safe(create(owner.client, owner.workspaceId))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: FEATURE_MESSAGES.api })
    const sv = clientFor(app, owner.token, "sv")
    const [svError] = await safe(create(sv, owner.workspaceId))
    expect(svError).toMatchObject({
      code: "FORBIDDEN",
      message: "Uppgradera för att använda API:et",
    })
    expect(
      (await owner.client.workspaces.apiKeys.list({ workspaceId: owner.workspaceId })).items
    ).toEqual([])
  })

  test(`at most ${MAX_API_KEYS} live keys: revoked and expired ones do not count`, async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const past = new Date(Date.now() - 1000).toISOString()
    await insertKey(workspaceId, owner.user.id, { revokedAt: past })
    await insertKey(workspaceId, owner.user.id, { expiresAt: past })
    for (let i = 0; i < MAX_API_KEYS - 1; i++) await insertKey(workspaceId, owner.user.id)
    await create(owner.client, workspaceId)
    const [error] = await safe(create(owner.client, workspaceId))
    expect(error).toMatchObject({ code: "CONFLICT", message: API_KEY_LIMIT_MESSAGE })
    expect(await app.db.apiKeys.countLive(workspaceId, new Date().toISOString())).toBe(MAX_API_KEYS)

    // Revoking one makes room again.
    const [first] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items.filter(
      (k) => k.status === "active"
    )
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: first?.id as number })
    await create(owner.client, workspaceId)
  })

  test("two creates at the cap minus one, sent together: one passes", async () => {
    const owner = await paidOwner()
    for (let i = 0; i < MAX_API_KEYS - 1; i++) await insertKey(owner.workspaceId, owner.user.id)
    const results = await Promise.all([
      safe(create(owner.client, owner.workspaceId)),
      safe(create(owner.client, owner.workspaceId)),
    ])
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(await app.db.apiKeys.countLive(owner.workspaceId, new Date().toISOString())).toBe(
      MAX_API_KEYS
    )
  })

  test("audited with name, prefix, scopes and expiry — never the key or its hash", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await create(owner.client, owner.workspaceId, {
      name: "Audited",
      scopes: ["members:read"],
      expiresInDays: 30,
    })
    const [row, ...rest] = await auditRows(owner.workspaceId, "workspace.api_key_created")
    expect(rest).toEqual([])
    expect(row).toMatchObject({
      actor_user_id: owner.user.id,
      target_type: "api_key",
      target_id: String(apiKey.id),
    })
    expect(JSON.parse(row?.metadata as string)).toEqual({
      name: "Audited",
      prefix: apiKey.prefix,
      scopes: ["members:read"],
      expiresAt: apiKey.expiresAt,
    })
    expect(row?.metadata).not.toContain(key.slice(17))
    expect(row?.metadata).not.toContain(hashApiKey(key))
  })
})

describe("create: a prefix collision and a vanished workspace", () => {
  test("a taken prefix is retried with a fresh key", async () => {
    const owner = await paidOwner()
    const taken = (await create(owner.client, owner.workspaceId)).apiKey.prefix
    const clash = generateApiKey()
    queuedKeys.push({ ...clash, prefix: taken, key: clash.key.replace(clash.prefix, taken) })
    draws = 0
    const { key, apiKey } = await create(owner.client, owner.workspaceId, { name: "Second" })
    expect(draws).toBe(2)
    expect(apiKey.prefix).not.toBe(taken)
    expect(key.slice(8, 16)).toBe(apiKey.prefix)
    expect(await auditRows(owner.workspaceId, "workspace.api_key_created")).toHaveLength(2)
  })

  test(`after ${API_KEY_CREATE_ATTEMPTS} collisions in a row it fails, writing nothing`, async () => {
    const owner = await paidOwner()
    const taken = (await create(owner.client, owner.workspaceId)).apiKey.prefix
    for (let i = 0; i < API_KEY_CREATE_ATTEMPTS + 1; i++) {
      const clash = generateApiKey()
      queuedKeys.push({ ...clash, prefix: taken, key: clash.key.replace(clash.prefix, taken) })
    }
    draws = 0
    const [error] = await safe(create(owner.client, owner.workspaceId))
    queuedKeys.length = 0
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
    expect(draws).toBe(API_KEY_CREATE_ATTEMPTS)
    const { items } = await owner.client.workspaces.apiKeys.list({ workspaceId: owner.workspaceId })
    expect(items).toHaveLength(1)
  })

  test("a workspace deleted before the lock is NOT_FOUND, and no key is stored", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const original = app.db.transaction
    app.db.transaction = (fn) => {
      app.db.transaction = original
      return original(async (tx) => {
        await tx.workspaces.delete(workspaceId)
        return fn(tx)
      })
    }
    const [error] = await safe(create(owner.client, workspaceId)).finally(() => {
      app.db.transaction = original
    })
    expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
    const rows = (await app.db.sql`
      SELECT id FROM api_keys WHERE workspace_id = ${workspaceId}
    `) as unknown[]
    expect(rows).toEqual([])
  })
})

describe("the injected clock", () => {
  test("a 30-day key reads expired, and stops counting toward the cap, by the api's clock", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    for (let i = 0; i < MAX_API_KEYS - 1; i++) await insertKey(workspaceId, owner.user.id)
    const { apiKey } = await create(owner.client, workspaceId, { expiresInDays: 30 })
    const [full] = await safe(create(owner.client, workspaceId))
    expect(full).toMatchObject({ code: "CONFLICT", message: API_KEY_LIMIT_MESSAGE })
    // The session was issued on real time; keep it alive across the jump.
    await app.db.sql`
      UPDATE sessions SET expires_at = ${new Date(Date.now() + 365 * DAY_MS).toISOString()}
      WHERE user_id = ${owner.user.id}
    `
    try {
      clock.offset = 30 * DAY_MS - 60_000
      const before = await owner.client.workspaces.apiKeys.list({ workspaceId })
      expect(before.items.find((k) => k.id === apiKey.id)?.status).toBe("active")
      clock.offset = 30 * DAY_MS
      const after = await owner.client.workspaces.apiKeys.list({ workspaceId })
      expect(after.items.find((k) => k.id === apiKey.id)?.status).toBe("expired")
      // Only the clock moved: the expired key no longer holds a slot.
      const { apiKey: next } = await create(owner.client, workspaceId, { name: "Fits again" })
      expect(next.status).toBe("active")
      expect(Date.parse(next.createdAt)).toBeGreaterThan(Date.now() + 29 * DAY_MS)
    } finally {
      clock.offset = 0
    }
  })
})

describe("workspaces.apiKeys.list", () => {
  test("every key with its status; never the key or its hash", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { key } = await create(owner.client, workspaceId, { name: "Live" })
    const expired = await insertKey(workspaceId, owner.user.id, {
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const revoked = await insertKey(workspaceId, owner.user.id, {
      revokedAt: new Date().toISOString(),
    })
    const { items } = await owner.client.workspaces.apiKeys.list({ workspaceId })
    expect(items.map((k) => [k.name, k.status])).toEqual(
      expect.arrayContaining([
        ["Live", "active"],
        ["Inserted", "expired"],
        ["Inserted", "revoked"],
      ])
    )
    expect(items).toHaveLength(3)
    expect(items.find((k) => k.id === expired.id)?.status).toBe("expired")
    expect(items.find((k) => k.id === revoked.id)?.status).toBe("revoked")
    const text = JSON.stringify(items)
    expect(text).not.toContain(key.slice(17))
    expect(text).not.toContain(hashApiKey(key))
    expect(text).not.toContain(expired.secret_hash)
    for (const item of items) {
      expect(Object.keys(item)).not.toContain("key")
      expect(Object.keys(item)).not.toContain("secretHash")
    }
  })

  test("only the workspace's own keys", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    await create(a.client, a.workspaceId, { name: "A's" })
    await create(b.client, b.workspaceId, { name: "B's" })
    const { items } = await a.client.workspaces.apiKeys.list({ workspaceId: a.workspaceId })
    expect(items.map((k) => k.name)).toEqual(["A's"])
  })

  test("a creator who left is shown as such; a purged one as gone — the key stays active", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const left = await signUpVerified(app)
    const purged = await signUpVerified(app)
    for (const user of [left, purged])
      await app.db.memberships.add({ workspaceId, userId: user.user.id, role: "admin" })
    const byLeft = (await create(left.client, workspaceId, { name: "By left" })).apiKey
    const byPurged = (await create(purged.client, workspaceId, { name: "By purged" })).apiKey
    expect(byLeft.creatorLeft).toBe(false)

    await left.client.workspaces.leave({ workspaceId })
    await app.db.transaction((tx) => tx.users.purge(purged.user.id, new Date().toISOString()))

    const { items } = await owner.client.workspaces.apiKeys.list({ workspaceId })
    expect(items.find((k) => k.id === byLeft.id)).toMatchObject({
      createdBy: { id: left.user.id },
      creatorLeft: true,
      status: "active",
    })
    expect(items.find((k) => k.id === byPurged.id)).toMatchObject({
      createdBy: null,
      creatorLeft: true,
      status: "active",
    })
    // users.purge leaves the id in place (shown as a former member), like the design says.
    expect((await app.db.apiKeys.findByPrefix(byPurged.prefix))?.created_by).toBe(purged.user.id)
  })
})

describe("workspaces.apiKeys.revoke", () => {
  test("stamps revokedAt once; a second revoke is a no-op; audited once", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { apiKey } = await create(owner.client, workspaceId)
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })
    const [first] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items
    expect(first).toMatchObject({ id: apiKey.id, status: "revoked" })
    expect(first?.revokedAt).toBeString()
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })
    const [again] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items
    expect(again?.revokedAt).toBe(first?.revokedAt as string)
    const rows = await auditRows(workspaceId, "workspace.api_key_revoked")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ target_type: "api_key", target_id: String(apiKey.id) })
    expect(JSON.parse(rows[0]?.metadata as string)).toEqual({
      name: "CI",
      prefix: apiKey.prefix,
      scopes: ["notes:read"],
    })
  })

  test("another workspace's key or an unknown id is NOT_FOUND, and stays active", async () => {
    const a = await paidOwner()
    const b = await paidOwner()
    const { apiKey } = await create(b.client, b.workspaceId)
    for (const id of [apiKey.id, 999_999]) {
      const [error] = await safe(
        a.client.workspaces.apiKeys.revoke({ workspaceId: a.workspaceId, id })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND", message: API_KEY_NOT_FOUND_MESSAGE })
    }
    const [own] = (await b.client.workspaces.apiKeys.list({ workspaceId: b.workspaceId })).items
    expect(own?.status).toBe("active")
  })

  test("listing and revoking still work after the workspace drops to Free; creating does not", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { apiKey } = await create(owner.client, workspaceId)
    await app.billing.change(workspaceId, "cancel", "month")
    const [listed] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items
    expect(listed).toMatchObject({ id: apiKey.id, status: "active" })
    await owner.client.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })
    const [revoked] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items
    expect(revoked).toMatchObject({ id: apiKey.id, status: "revoked" })
    expect(await auditRows(workspaceId, "workspace.api_key_revoked")).toHaveLength(1)
    const [error] = await safe(create(owner.client, workspaceId))
    expect(error).toMatchObject({ code: "FORBIDDEN", message: FEATURE_MESSAGES.api })
  })

  test("a workspace that was never paid can list (empty) and is told NOT_FOUND for any id", async () => {
    const owner = await signUpWithWorkspace(app)
    const { workspaceId } = owner
    expect((await owner.client.workspaces.apiKeys.list({ workspaceId })).items).toEqual([])
    const [error] = await safe(owner.client.workspaces.apiKeys.revoke({ workspaceId, id: 1 }))
    expect(error).toMatchObject({ code: "NOT_FOUND", message: API_KEY_NOT_FOUND_MESSAGE })
  })
})

describe("roles", () => {
  test("admin and owner manage keys; member and viewer get FORBIDDEN; outsiders NOT_FOUND", async () => {
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { apiKey } = await create(owner.client, workspaceId)
    const byRole = async (role: "viewer" | "member" | "admin") => {
      const user = await signUpVerified(app)
      await app.db.memberships.add({ workspaceId, userId: user.user.id, role })
      return user.client
    }
    const calls = (c: ApiClient): Promise<unknown>[] => [
      c.workspaces.apiKeys.list({ workspaceId }),
      create(c, workspaceId),
      c.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id }),
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
    expect((await admin.workspaces.apiKeys.list({ workspaceId })).items.length).toBeGreaterThan(0)
    await create(admin, workspaceId)
  })
})

describe("impersonation", () => {
  test("list stays readable; create and revoke are refused", async () => {
    const root = await signUpVerified(app, ROOT)
    const owner = await paidOwner()
    const { workspaceId } = owner
    const { apiKey } = await create(owner.client, workspaceId)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: {},
    })
    const asUser = clientFor(app, token)
    expect((await asUser.workspaces.apiKeys.list({ workspaceId })).items).toHaveLength(1)
    // Both wrapped in `safe` at once: awaited one by one, the second could reject before it was
    // wrapped — an unhandled rejection that failed this test on Postgres now and then.
    const results = await Promise.all([
      safe(create(asUser, workspaceId)),
      safe(asUser.workspaces.apiKeys.revoke({ workspaceId, id: apiKey.id })),
    ])
    for (const [error] of results)
      expect(error).toMatchObject({ code: "FORBIDDEN", message: IMPERSONATING_MESSAGE })
    const [still] = (await owner.client.workspaces.apiKeys.list({ workspaceId })).items
    expect(still?.status).toBe("active")
  })
})

describe("workspace deletion", () => {
  test("deletes the workspace's keys", async () => {
    const owner = await paidOwner()
    const { apiKey } = await create(owner.client, owner.workspaceId)
    await owner.client.workspaces.delete({ workspaceId: owner.workspaceId })
    expect(await app.db.apiKeys.findByPrefix(apiKey.prefix)).toBeUndefined()
  })
})

describe("no key material in the logs", () => {
  test("nothing written while creating, listing and revoking carries the key or its hash", async () => {
    const owner = await paidOwner()
    const { key, apiKey } = await create(owner.client, owner.workspaceId)
    await owner.client.workspaces.apiKeys.list({ workspaceId: owner.workspaceId })
    await owner.client.workspaces.apiKeys.revoke({ workspaceId: owner.workspaceId, id: apiKey.id })
    await app.drain()
    expect(logLines.length).toBeGreaterThan(0)
    const all = logLines.join("\n")
    expect(all).not.toContain(key.slice(17))
    expect(all).not.toContain(hashApiKey(key))
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
  test(`two creates at ${MAX_API_KEYS - 1} live keys, both inside their transactions: never ${MAX_API_KEYS + 1}`, async () => {
    const owner = await paidOwner()
    for (let i = 0; i < MAX_API_KEYS - 1; i++) await insertKey(owner.workspaceId, owner.user.id)
    const restore = overlapNextTransactions(2)
    const results = await Promise.all([
      safe(create(owner.client, owner.workspaceId)),
      safe(create(owner.client, owner.workspaceId)),
    ]).finally(restore)
    expect(results.filter(([error]) => error === null)).toHaveLength(1)
    expect(results.map(([error]) => error).filter(Boolean)).toMatchObject([
      { code: "CONFLICT", message: API_KEY_LIMIT_MESSAGE },
    ])
    expect(await app.db.apiKeys.countLive(owner.workspaceId, new Date().toISOString())).toBe(
      MAX_API_KEYS
    )
  })
})
