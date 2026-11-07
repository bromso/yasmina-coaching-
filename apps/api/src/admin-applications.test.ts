import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { newCvKey } from "./applications"
import { TINY_PDF } from "./storage/fixtures"
import { clientFor, signUpVerified, start } from "./test-server"

const ROOT = "applications-root@example.com"
const FAR_FUTURE = "2099-01-01T00:00:00.000Z"

let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({ superadminEmails: [ROOT] })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const iso = () => new Date().toISOString()

/**
 * Inserts a new application directly, bypassing `jobs.apply`'s limiters and mail, with a real CV
 * object in storage so `admin.applications.cv` has something to download.
 */
async function application(
  overrides: {
    jobSlug?: string
    jobTitle?: string
    name?: string
    email?: string
    link?: string | null
    note?: string | null
  } = {}
) {
  const cvKey = newCvKey()
  await app.storage.put(cvKey, TINY_PDF, "application/pdf")
  const { id } = await app.db.applications.create({
    jobSlug: overrides.jobSlug ?? "senior-engineer",
    jobTitle: overrides.jobTitle ?? "Senior Engineer",
    name: overrides.name ?? "Ada Lovelace",
    email: overrides.email ?? `applicant-${Date.now()}-${Math.random()}@example.com`,
    link: overrides.link ?? null,
    note: overrides.note ?? null,
    cvKey,
    ipHash: null,
    createdAt: iso(),
    deleteAfter: FAR_FUTURE,
  })
  return { id, cvKey }
}

describe("admin.applications.list", () => {
  test("defaults to every status, and filters by status and by role", async () => {
    const { id: a } = await application({ jobSlug: "senior-engineer" })
    const { id: b } = await application({ jobSlug: "designer" })
    await root.client.admin.applications.setStatus({ id: b, status: "reviewing" })

    const all = await root.client.admin.applications.list({})
    expect(all.items.map((x) => x.id)).toEqual(expect.arrayContaining([a, b]))

    const reviewing = await root.client.admin.applications.list({ status: "reviewing" })
    expect(reviewing.items.map((x) => x.id)).toContain(b)
    expect(reviewing.items.map((x) => x.id)).not.toContain(a)

    const byJob = await root.client.admin.applications.list({ job: "designer" })
    expect(byJob.items.map((x) => x.id)).toEqual([b])
  })

  test("shapes an item: reference, job, link, note, and who last changed its status", async () => {
    const { id } = await application({
      jobSlug: "designer",
      jobTitle: "Designer",
      name: "Bo",
      email: "Bo@Example.com",
      link: "https://bo.example/portfolio",
      note: "Excited to apply.",
    })
    await root.client.admin.applications.setStatus({ id, status: "reviewing" })
    const { items } = await root.client.admin.applications.list({})
    const item = items.find((x) => x.id === id)
    expect(item).toMatchObject({
      id,
      reference: `JOB-${id}`,
      job: { slug: "designer", title: "Designer" },
      name: "Bo",
      email: "Bo@Example.com",
      link: "https://bo.example/portfolio",
      note: "Excited to apply.",
      status: "reviewing",
      statusChangedBy: { id: root.user.id, email: root.email },
    })
    expect(item?.statusChangedAt).not.toBeNull()
  })

  test("pages newest first with a keyset cursor", async () => {
    const ids: number[] = []
    for (let i = 0; i < 51; i++) ids.push((await application()).id)
    const first = await root.client.admin.applications.list({})
    expect(first.items).toHaveLength(50)
    expect(first.items[0]?.id).toBe(ids[ids.length - 1])
    expect(first.nextCursor).toBe(first.items.at(-1)?.id ?? null)
    const second = await root.client.admin.applications.list({ cursor: first.nextCursor ?? 0 })
    expect(second.items[0]?.id).toBeLessThan(first.items.at(-1)?.id ?? 0)
  })
})

describe("admin.applications.setStatus", () => {
  test("changes status, stamped with the admin, and is audited", async () => {
    const { id } = await application()
    expect(await root.client.admin.applications.setStatus({ id, status: "hired" })).toEqual({
      ok: true,
    })
    const row = await app.db.applications.find(id)
    expect(row).toMatchObject({ status: "hired", status_changed_by: root.user.id })
    expect(row?.status_changed_at).not.toBeNull()

    const { items } = await root.client.admin.audit.list({
      targetType: "application",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "application.status_changed",
      actor: { id: root.user.id },
      targetType: "application",
      targetId: String(id),
      metadata: { from: "new", to: "hired" },
    })
  })

  test("a second change records the status it was actually changed from", async () => {
    const { id } = await application()
    await root.client.admin.applications.setStatus({ id, status: "reviewing" })
    await root.client.admin.applications.setStatus({ id, status: "hired" })

    const { items } = await root.client.admin.audit.list({
      targetType: "application",
      targetId: String(id),
    })
    const [latest, earlier] = items
    expect(latest).toMatchObject({ metadata: { from: "reviewing", to: "hired" } })
    expect(earlier).toMatchObject({ metadata: { from: "new", to: "reviewing" } })
  })

  test("setting the same status again is a no-op: success, no re-stamp, no audit row", async () => {
    const { id } = await application()
    const other = await signUpVerified(app)
    // Simulate a first admin (`other`) having already set it, bypassing the router so no audit
    // row comes from this step.
    await app.db.applications.setStatus(id, "reviewing", other.user.id, iso())

    expect(await root.client.admin.applications.setStatus({ id, status: "reviewing" })).toEqual({
      ok: true,
    })
    const row = await app.db.applications.find(id)
    expect(row).toMatchObject({ status: "reviewing", status_changed_by: other.user.id })

    const { items } = await root.client.admin.audit.list({
      targetType: "application",
      targetId: String(id),
    })
    expect(items).toHaveLength(0)
  })

  test("setStatus of a missing id is NOT_FOUND", async () => {
    const [error] = await safe(
      root.client.admin.applications.setStatus({ id: 999_999, status: "hired" })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("admin.applications.delete", () => {
  test("deletes the row, is audited, and queues the CV for storage.delete", async () => {
    const { id, cvKey } = await application()
    expect(await app.storage.get(cvKey)).not.toBeNull()
    expect(await root.client.admin.applications.delete({ id })).toEqual({ ok: true })
    expect(await app.db.applications.find(id)).toBeUndefined()

    const { items } = await root.client.admin.audit.list({
      targetType: "application",
      targetId: String(id),
    })
    expect(items[0]).toMatchObject({
      action: "application.deleted",
      actor: { id: root.user.id },
      targetType: "application",
      targetId: String(id),
    })

    await app.drain()
    expect(await app.storage.get(cvKey)).toBeNull()
  })

  test("delete of a missing id is NOT_FOUND", async () => {
    const [error] = await safe(root.client.admin.applications.delete({ id: 999_999 }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("admin.applications.cv", () => {
  test("returns the stored PDF", async () => {
    const { id } = await application()
    const file = await root.client.admin.applications.cv({ id })
    expect(file.type).toBe("application/pdf")
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(TINY_PDF)
  })

  test("cv of a missing id, or a row whose object is gone, is NOT_FOUND", async () => {
    const [missingIdError] = await safe(root.client.admin.applications.cv({ id: 999_999 }))
    expect(missingIdError).toMatchObject({ code: "NOT_FOUND" })

    const { id, cvKey } = await application()
    await app.storage.delete(cvKey)
    const [missingObjectError] = await safe(root.client.admin.applications.cv({ id }))
    expect(missingObjectError).toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("admin.applications is NOT_FOUND to anyone else", () => {
  test("a non-admin and an impersonation session cannot reach list, setStatus, cv, or delete", async () => {
    const nobody = await signUpVerified(app)
    const [listError] = await safe(nobody.client.admin.applications.list({}))
    expect(listError).toMatchObject({ code: "NOT_FOUND" })
    const { id } = await application()
    const [setStatusError] = await safe(
      nobody.client.admin.applications.setStatus({ id, status: "hired" })
    )
    expect(setStatusError).toMatchObject({ code: "NOT_FOUND" })
    const [cvError] = await safe(nobody.client.admin.applications.cv({ id }))
    expect(cvError).toMatchObject({ code: "NOT_FOUND" })
    const [deleteError] = await safe(nobody.client.admin.applications.delete({ id }))
    expect(deleteError).toMatchObject({ code: "NOT_FOUND" })
    expect(await app.db.applications.find(id)).not.toBeUndefined()

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
      const [impListError] = await safe(session.admin.applications.list({}))
      expect(impListError).toMatchObject({ code: "NOT_FOUND" })
      const ownCvKey = newCvKey()
      await own.storage.put(ownCvKey, TINY_PDF, "application/pdf")
      const ownId = (
        await own.db.applications.create({
          jobSlug: "designer",
          jobTitle: "Designer",
          name: "Impersonated",
          email: "impersonated@example.com",
          link: null,
          note: null,
          cvKey: ownCvKey,
          ipHash: null,
          createdAt: iso(),
          deleteAfter: FAR_FUTURE,
        })
      ).id
      const [impSetStatusError] = await safe(
        session.admin.applications.setStatus({ id: ownId, status: "hired" })
      )
      expect(impSetStatusError).toMatchObject({ code: "NOT_FOUND" })
      await session.admin.stopImpersonation()
    } finally {
      await own.stop()
    }
  })
})
