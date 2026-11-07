import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import type { SupportTopic } from "@repo/api-contract"
import { clientFor, signUpVerified, start } from "./test-server"

const ROOT = "support-root@example.com"

let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({ superadminEmails: [ROOT] })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const iso = () => new Date().toISOString()

/** Inserts a support request directly, bypassing `support.create`'s limiters and mail. */
async function supportRequest(
  overrides: {
    email?: string
    topic?: SupportTopic
    userId?: number | null
    ipHash?: string | null
  } = {}
) {
  const { id } = await app.db.support.create({
    email: overrides.email ?? `visitor-${Date.now()}-${Math.random()}@example.com`,
    name: null,
    topic: overrides.topic ?? "other",
    message: "Something is not working the way I expect.",
    page: null,
    userId: overrides.userId ?? null,
    ipHash: overrides.ipHash ?? null,
    createdAt: iso(),
  })
  return id
}

describe("admin.support.list", () => {
  test("defaults to open, filters by status, and `all` covers both", async () => {
    const open = await supportRequest()
    const resolved = await supportRequest()
    await app.db.support.resolve(resolved, root.user.id, iso())

    const defaultList = await root.client.admin.support.list({})
    expect(defaultList.items.map((r) => r.id)).toContain(open)
    expect(defaultList.items.map((r) => r.id)).not.toContain(resolved)

    const resolvedList = await root.client.admin.support.list({ status: "resolved" })
    expect(resolvedList.items.map((r) => r.id)).toContain(resolved)
    expect(resolvedList.items.map((r) => r.id)).not.toContain(open)

    const allList = await root.client.admin.support.list({ status: "all" })
    expect(allList.items.map((r) => r.id)).toEqual(expect.arrayContaining([open, resolved]))
  })

  test("shapes an item: reference, fields, and the resolving admin", async () => {
    const id = await supportRequest({ email: "Visitor@Example.com", topic: "billing" })
    expect(await root.client.admin.support.resolve({ id })).toEqual({ ok: true })
    const { items } = await root.client.admin.support.list({ status: "resolved" })
    const item = items.find((r) => r.id === id)
    expect(item).toMatchObject({
      id,
      reference: `HELP-${id}`,
      email: "Visitor@Example.com",
      topic: "billing",
      status: "resolved",
      resolvedBy: { id: root.user.id, email: root.email },
    })
    expect(item?.resolvedAt).not.toBeNull()
  })

  test("pages newest first with a keyset cursor", async () => {
    const ids: number[] = []
    for (let i = 0; i < 51; i++) ids.push(await supportRequest())
    const first = await root.client.admin.support.list({ status: "all" })
    expect(first.items).toHaveLength(50)
    expect(first.items[0]?.id).toBe(ids[ids.length - 1])
    expect(first.nextCursor).toBe(first.items.at(-1)?.id ?? null)
    const second = await root.client.admin.support.list({
      status: "all",
      cursor: first.nextCursor ?? 0,
    })
    expect(second.items[0]?.id).toBeLessThan(first.items.at(-1)?.id ?? 0)
  })
})

describe("admin.support.resolve", () => {
  test("marks the request resolved, stamped with the admin and the time, and is audited", async () => {
    const id = await supportRequest()
    expect(await root.client.admin.support.resolve({ id })).toEqual({ ok: true })
    const row = await app.db.support.find(id)
    expect(row).toMatchObject({ status: "resolved", resolved_by: root.user.id })
    expect(row?.resolved_at).not.toBeNull()

    const { items } = await root.client.admin.audit.list({
      targetType: "support",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "support.resolved",
      actor: { id: root.user.id },
      targetType: "support",
      targetId: String(id),
    })
  })

  test("resolving an already-resolved request is a no-op: one audit row, original resolved_by kept", async () => {
    const id = await supportRequest()
    const other = await signUpVerified(app)
    // Simulate a first admin (`other`) having already resolved it, bypassing the router so no
    // audit row comes from this step.
    await app.db.support.resolve(id, other.user.id, iso())

    // Root's stale tab tries to resolve the same request: succeeds, but changes nothing.
    expect(await root.client.admin.support.resolve({ id })).toEqual({ ok: true })
    const row = await app.db.support.find(id)
    expect(row).toMatchObject({ status: "resolved", resolved_by: other.user.id })

    const { items } = await root.client.admin.audit.list({
      targetType: "support",
      targetId: String(id),
    })
    expect(items).toHaveLength(0)
  })

  test("resolve of a missing id is NOT_FOUND", async () => {
    const [error] = await safe(root.client.admin.support.resolve({ id: 999_999 }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("resolve erases the IP hash", async () => {
    const id = await supportRequest({ ipHash: "203.0.113.9-hash" })
    expect(await root.client.admin.support.resolve({ id })).toEqual({ ok: true })
    const row = await app.db.support.find(id)
    expect(row?.ip_hash).toBeNull()
  })
})

describe("admin.support.reopen", () => {
  test("clears status, resolvedAt, and resolvedBy, and is audited", async () => {
    const id = await supportRequest()
    await app.db.support.resolve(id, root.user.id, iso())
    expect(await root.client.admin.support.reopen({ id })).toEqual({ ok: true })
    const row = await app.db.support.find(id)
    expect(row).toMatchObject({ status: "open", resolved_at: null, resolved_by: null })

    const { items } = await root.client.admin.audit.list({
      targetType: "support",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "support.reopened",
      actor: { id: root.user.id },
      targetType: "support",
      targetId: String(id),
    })
  })

  test("reopen of a missing id is NOT_FOUND", async () => {
    const [error] = await safe(root.client.admin.support.reopen({ id: 999_999 }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("reopening an already-open request is a no-op success with no audit row", async () => {
    const id = await supportRequest()
    expect(await root.client.admin.support.reopen({ id })).toEqual({ ok: true })
    const row = await app.db.support.find(id)
    expect(row?.status).toBe("open")

    const { items } = await root.client.admin.audit.list({
      targetType: "support",
      targetId: String(id),
    })
    expect(items).toHaveLength(0)
  })
})

describe("admin.support is NOT_FOUND to anyone else", () => {
  test("a non-admin and an impersonation session cannot reach list, resolve, or reopen", async () => {
    const nobody = await signUpVerified(app)
    const [listError] = await safe(nobody.client.admin.support.list({}))
    expect(listError).toMatchObject({ code: "NOT_FOUND" })
    const id = await supportRequest()
    const [resolveError] = await safe(nobody.client.admin.support.resolve({ id }))
    expect(resolveError).toMatchObject({ code: "NOT_FOUND" })
    const [reopenError] = await safe(nobody.client.admin.support.reopen({ id }))
    expect(reopenError).toMatchObject({ code: "NOT_FOUND" })
    const row = await app.db.support.find(id)
    expect(row?.status).toBe("open")

    // A fresh app: the shared root's impersonation limiter is nearly spent by other test files.
    const own = await start({ superadminEmails: [ROOT] })
    try {
      const rootOwn = await signUpVerified(own, ROOT)
      const target = await signUpVerified(own)
      const result = await rootOwn.client.admin.users.impersonate({
        id: target.user.id,
        reason: "testing",
        client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
      })
      const session = clientFor(own, result.token)
      const [impListError] = await safe(session.admin.support.list({}))
      expect(impListError).toMatchObject({ code: "NOT_FOUND" })
      const ownId = (
        await own.db.support.create({
          email: "impersonated@example.com",
          name: null,
          topic: "other",
          message: "Still here.",
          page: null,
          userId: null,
          ipHash: null,
          createdAt: iso(),
        })
      ).id
      const [impResolveError] = await safe(session.admin.support.resolve({ id: ownId }))
      expect(impResolveError).toMatchObject({ code: "NOT_FOUND" })
      await session.admin.stopImpersonation()
    } finally {
      await own.stop()
    }
  })
})
