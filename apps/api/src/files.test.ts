import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { safe } from "@orpc/client"
import {
  IMAGE_UPLOAD_MESSAGE,
  STORAGE_UNAVAILABLE_MESSAGE,
  UPLOAD_RATE_MESSAGE,
} from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { has, jpegWithExif, PNG_1X1 } from "./storage/fixtures"
import { localStorage } from "./storage/local"
import type { Storage } from "./storage/storage"
import { clientFor, signUpVerified, signUpWithWorkspace, start } from "./test-server"

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

const png = (name = "me.png") => new File([PNG_1X1], name, { type: "image/png" })
const jpegExif = (name = "me.jpg") => new File([jpegWithExif()], name, { type: "image/jpeg" })
/** An SVG masquerading as a PNG: the wrong bytes behind a trusted-looking name and content type. */
const fakePng = (name = "x.png") =>
  new File([new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")], name, {
    type: "image/png",
  })

/** `/files/avatars/<id>/<key>.png` → the bare storage key, `avatars/<id>/<key>.png`. */
const keyOf = (url: string) => url.replace(/^\/files\//, "")

describe("account.avatar", () => {
  test("set: avatarUrl matches the pattern, auth.me agrees, the object exists in storage", async () => {
    const user = await signUpVerified(app)
    const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
    expect(avatarUrl).toMatch(/^\/files\/avatars\/\d+\/[A-Za-z0-9_-]{22}\.png$/)
    const me = await user.client.auth.me()
    expect(me.user.avatarUrl).toBe(avatarUrl)
    const stored = await app.storage.get(keyOf(avatarUrl))
    expect(stored).not.toBeNull()
    expect(stored?.contentType).toBe("image/png")
  })

  test("set: a JPEG's EXIF (GPS included) never reaches storage", async () => {
    const user = await signUpVerified(app)
    const { avatarUrl } = await user.client.account.avatar.set({ file: jpegExif() })
    const stored = await app.storage.get(keyOf(avatarUrl))
    expect(stored).not.toBeNull()
    expect(has(stored?.body ?? new Uint8Array(), "GPSDATA")).toBe(false)
  })

  test("set: an SVG named .png with an image/png type is refused, nothing stored", async () => {
    let putCalled = false
    const storage: Storage = {
      kind: "local",
      put: async () => {
        putCalled = true
      },
      get: async () => null,
      delete: async () => {},
      list: async function* () {},
    }
    const isolated = await start({ storage })
    try {
      const user = await signUpVerified(isolated)
      const [error] = await safe(user.client.account.avatar.set({ file: fakePng() }))
      expect(error).toMatchObject({ code: "BAD_REQUEST", message: IMAGE_UPLOAD_MESSAGE })
      expect(putCalled).toBe(false)
      const me = await user.client.auth.me()
      expect(me.user.avatarUrl).toBeNull()
    } finally {
      await isolated.stop()
    }
  })

  test("set: a storage failure is the declared 503, recorded; nothing points at it", async () => {
    const failures: string[] = []
    const storage: Storage = {
      kind: "local",
      put: async () => {
        throw new Error("bucket unreachable")
      },
      get: async () => null,
      delete: async () => {},
      list: async function* () {},
    }
    const isolated = await start({ storage, log: (message) => failures.push(message) })
    try {
      const owner = await signUpWithWorkspace(isolated)
      const [avatarError] = await safe(owner.client.account.avatar.set({ file: png() }))
      expect(avatarError).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        status: 503,
        message: STORAGE_UNAVAILABLE_MESSAGE,
      })
      const [logoError] = await safe(
        owner.client.workspaces.logo.set({ workspaceId: owner.workspaceId, file: png("logo.png") })
      )
      expect(logoError).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        status: 503,
        message: STORAGE_UNAVAILABLE_MESSAGE,
      })
      const me = await owner.client.auth.me()
      expect(me.user.avatarUrl).toBeNull()
      // Swedish callers get the Swedish text.
      const sv = clientFor(isolated, owner.token, "sv")
      const [svError] = await safe(sv.account.avatar.set({ file: png() }))
      expect(svError).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "Fillagringen är inte tillgänglig – försök igen senare",
      })
      expect(failures.filter((m) => m === "storage write failed")).toHaveLength(3)
    } finally {
      await isolated.stop()
    }
  })

  test("set: an ordinary (non-impersonated) upload writes no audit row", async () => {
    const user = await signUpVerified(app)
    await user.client.account.avatar.set({ file: png() })
    const rows = await app.db.audit.listForUser(user.user.id, 20)
    expect(rows.filter((r) => r.action === "user.avatar_set")).toEqual([])
  })

  test("set twice: the first object is deleted via a queued job, the second remains", async () => {
    const user = await signUpVerified(app)
    const first = await user.client.account.avatar.set({ file: png("one.png") })
    const second = await user.client.account.avatar.set({ file: png("two.png") })
    expect(second.avatarUrl).not.toBe(first.avatarUrl)
    // Queued, not yet run: the row is there before drain, the object still is too.
    expect((await app.db.jobs.counts()).queued).toBeGreaterThan(0)
    expect(await app.storage.get(keyOf(first.avatarUrl))).not.toBeNull()
    await app.drain()
    expect(await app.storage.get(keyOf(first.avatarUrl))).toBeNull()
    expect(await app.storage.get(keyOf(second.avatarUrl))).not.toBeNull()
    const me = await user.client.auth.me()
    expect(me.user.avatarUrl).toBe(second.avatarUrl)
  })

  test("remove: avatarUrl goes null, the object is gone once drained; calling again is still ok", async () => {
    const user = await signUpVerified(app)
    const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
    const result = await user.client.account.avatar.remove()
    expect(result).toEqual({ ok: true })
    const me = await user.client.auth.me()
    expect(me.user.avatarUrl).toBeNull()
    expect(await app.storage.get(keyOf(avatarUrl))).not.toBeNull()
    await app.drain()
    expect(await app.storage.get(keyOf(avatarUrl))).toBeNull()
    const again = await user.client.account.avatar.remove()
    expect(again).toEqual({ ok: true })
  })

  // Review Focus 3: a database write that fails after storage already has the new object must not
  // leave that object behind.
  test("database write fails after the storage write: the new key is deleted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "files-test-"))
    const base = localStorage(dir)
    let capturedKey: string | undefined
    const storage: Storage = {
      kind: "local",
      put: async (key, bytes, contentType) => {
        capturedKey = key
        await base.put(key, bytes, contentType)
      },
      get: (key) => base.get(key),
      delete: (key) => base.delete(key),
      list: (prefix) => base.list(prefix),
    }
    const isolated = await start({ storage })
    try {
      const user = await signUpVerified(isolated)
      const original = isolated.db.users.setAvatarKey.bind(isolated.db.users)
      let thrown = false
      isolated.db.users.setAvatarKey = async (id: number, key: string | null) => {
        if (!thrown) {
          thrown = true
          throw new Error("boom")
        }
        return original(id, key)
      }
      const [error] = await safe(user.client.account.avatar.set({ file: png() }))
      expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
      expect(capturedKey).toBeDefined()
      await isolated.drain()
      expect(await base.get(capturedKey as string)).toBeNull()
      const me = await user.client.auth.me()
      expect(me.user.avatarUrl).toBeNull()
      // A retry (the database write no longer fails) succeeds normally.
      const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
      expect(avatarUrl).toBeTruthy()
    } finally {
      await isolated.stop()
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("limiter: a second set within the window is TOO_MANY_REQUESTS", async () => {
    const limited = await start({
      uploadLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      const user = await signUpVerified(limited)
      await user.client.account.avatar.set({ file: png("one.png") })
      const [error] = await safe(user.client.account.avatar.set({ file: png("two.png") }))
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS", message: UPLOAD_RATE_MESSAGE })
    } finally {
      await limited.stop()
    }
  })

  test("limiter: the bucket is shared with workspaces.logo.set for the same user", async () => {
    const limited = await start({
      uploadLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      const owner = await signUpWithWorkspace(limited)
      await owner.client.account.avatar.set({ file: png("one.png") })
      const [error] = await safe(
        owner.client.workspaces.logo.set({
          workspaceId: owner.workspaceId,
          file: png("logo.png"),
        })
      )
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS", message: UPLOAD_RATE_MESSAGE })
    } finally {
      await limited.stop()
    }
  })

  test("STORAGE_PUBLIC_URL: avatarUrl is built from it", async () => {
    const withCdn = await start({ storagePublicUrl: "https://cdn.example.com" })
    try {
      const user = await signUpVerified(withCdn)
      const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
      expect(avatarUrl).toMatch(
        /^https:\/\/cdn\.example\.com\/avatars\/\d+\/[A-Za-z0-9_-]{22}\.png$/
      )
    } finally {
      await withCdn.stop()
    }
  })

  test("impersonation: an impersonation session can set an avatar, audited against the user", async () => {
    const ROOT = "root-files@example.com"
    const withAdmin = await start({ superadminEmails: [ROOT] })
    try {
      const root = await signUpVerified(withAdmin, ROOT)
      const target = await signUpVerified(withAdmin)
      const { token } = await root.client.admin.users.impersonate({
        id: target.user.id,
        reason: "support",
        client: {},
      })
      const asTarget = clientFor(withAdmin, token)
      const { avatarUrl } = await asTarget.account.avatar.set({ file: png() })
      expect(avatarUrl).toBeTruthy()
      const { items } = await root.client.admin.audit.list({
        targetType: "user",
        targetId: String(target.user.id),
      })
      expect(items.find((e) => e.action === "user.avatar_set")).toMatchObject({
        actor: { id: root.user.id },
        impersonated: { id: target.user.id },
      })
    } finally {
      await withAdmin.stop()
    }
  })
})

describe("workspaces.logo", () => {
  test("a member is FORBIDDEN, an admin (owner) sets it, a non-member is NOT_FOUND", async () => {
    const owner = await signUpWithWorkspace(app)
    const member = await signUpVerified(app)
    await app.db.memberships.add({
      workspaceId: owner.workspaceId,
      userId: member.user.id,
      role: "member",
    })
    const [forbidden] = await safe(
      member.client.workspaces.logo.set({ workspaceId: owner.workspaceId, file: png("logo.png") })
    )
    expect(forbidden).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })

    const { logoUrl } = await owner.client.workspaces.logo.set({
      workspaceId: owner.workspaceId,
      file: png("logo.png"),
    })
    expect(logoUrl).toMatch(/^\/files\/logos\/\d+\/[A-Za-z0-9_-]{22}\.png$/)
    const got = await owner.client.workspaces.get({ workspaceId: owner.workspaceId })
    expect(got.logoUrl).toBe(logoUrl)
    const { items } = await owner.client.workspaces.list()
    expect(items.find((w) => w.id === owner.workspaceId)?.logoUrl).toBe(logoUrl)

    const outsider = await signUpVerified(app)
    const [notFound] = await safe(
      outsider.client.workspaces.logo.set({
        workspaceId: owner.workspaceId,
        file: png("logo.png"),
      })
    )
    expect(notFound).toMatchObject({ code: "NOT_FOUND" })
  })

  test("workspaces.delete queues the logo object for deletion", async () => {
    const owner = await signUpWithWorkspace(app)
    const { logoUrl } = await owner.client.workspaces.logo.set({
      workspaceId: owner.workspaceId,
      file: png("logo.png"),
    })
    await owner.client.workspaces.delete({ workspaceId: owner.workspaceId })
    expect(await app.storage.get(keyOf(logoUrl))).not.toBeNull()
    await app.drain()
    expect(await app.storage.get(keyOf(logoUrl))).toBeNull()
  })

  test("remove: logoUrl goes null, the object is gone once drained; calling again is still ok", async () => {
    const owner = await signUpWithWorkspace(app)
    const { logoUrl } = await owner.client.workspaces.logo.set({
      workspaceId: owner.workspaceId,
      file: png("logo.png"),
    })
    const result = await owner.client.workspaces.logo.remove({ workspaceId: owner.workspaceId })
    expect(result).toEqual({ ok: true })
    const got = await owner.client.workspaces.get({ workspaceId: owner.workspaceId })
    expect(got.logoUrl).toBeNull()
    expect(await app.storage.get(keyOf(logoUrl))).not.toBeNull()
    await app.drain()
    expect(await app.storage.get(keyOf(logoUrl))).toBeNull()
    const again = await owner.client.workspaces.logo.remove({ workspaceId: owner.workspaceId })
    expect(again).toEqual({ ok: true })
  })
})

describe("files.get", () => {
  test("a referenced avatar's bytes come back with the stored content type", async () => {
    const user = await signUpVerified(app)
    const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
    const file = await user.client.files.get({ key: keyOf(avatarUrl) })
    expect(file.type).toBe("image/png")
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG_1X1)
  })

  test("an unreferenced but well-formed key is NOT_FOUND", async () => {
    const user = await signUpVerified(app)
    const key = "avatars/1/BBBBBBBBBBBBBBBBBBBBBB.png"
    await app.storage.put(key, PNG_1X1, "image/png")
    const [error] = await safe(user.client.files.get({ key }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("a key that fails FILE_KEY_PATTERN is BAD_REQUEST (undeclared is fine)", async () => {
    const user = await signUpVerified(app)
    const [error] = await safe(user.client.files.get({ key: "../../etc/passwd" }))
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a removed avatar's key is NOT_FOUND at once", async () => {
    const user = await signUpVerified(app)
    const { avatarUrl } = await user.client.account.avatar.set({ file: png() })
    await user.client.account.avatar.remove()
    const [error] = await safe(user.client.files.get({ key: keyOf(avatarUrl) }))
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })
})
