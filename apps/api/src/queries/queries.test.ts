import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SQL } from "bun"
import { tokenHash } from "../credentials"
import { createDb } from "../db"
import { engines, testDatabase } from "../test-db"
import { EmailTakenError, isSuspended } from "./users"

describe("isSuspended", () => {
  const now = "2026-06-15T12:00:00.000Z"

  test("never suspended when suspended_at is null, whatever suspended_until says", () => {
    expect(isSuspended({ suspended_at: null, suspended_until: null }, now)).toBe(false)
    expect(
      isSuspended({ suspended_at: null, suspended_until: "2026-06-16T00:00:00.000Z" }, now)
    ).toBe(false)
  })

  test("suspended indefinitely when suspended_until is null", () => {
    expect(
      isSuspended({ suspended_at: "2026-01-01T00:00:00.000Z", suspended_until: null }, now)
    ).toBe(true)
  })

  test("suspended while now is strictly before suspended_until", () => {
    expect(
      isSuspended(
        { suspended_at: "2026-06-01T00:00:00.000Z", suspended_until: "2026-06-15T12:00:00.001Z" },
        now
      )
    ).toBe(true)
  })

  test("not suspended at exactly suspended_until, or any time after it", () => {
    expect(
      isSuspended({ suspended_at: "2026-06-01T00:00:00.000Z", suspended_until: now }, now)
    ).toBe(false)
    expect(
      isSuspended(
        { suspended_at: "2026-06-01T00:00:00.000Z", suspended_until: "2026-06-15T11:59:59.999Z" },
        now
      )
    ).toBe(false)
  })

  test("accepts a Date for now, same as an ISO string", () => {
    expect(
      isSuspended(
        { suspended_at: "2026-06-01T00:00:00.000Z", suspended_until: null },
        new Date(now)
      )
    ).toBe(true)
    expect(
      isSuspended({ suspended_at: "2026-06-01T00:00:00.000Z", suspended_until: now }, new Date(now))
    ).toBe(false)
  })
})

for (const engine of engines) {
  describe(`queries on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const c of cleanups.splice(0)) await c()
    })
    async function fresh() {
      const tdb = await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      cleanups.push(async () => {
        await db.close()
        await tdb.cleanup()
      })
      return db
    }
    const now = () => new Date().toISOString()
    const inMs = (ms: number) => new Date(Date.now() + ms).toISOString()

    test("users: create, find by email (normalised) and id, update", async () => {
      const db = await fresh()
      const u = await db.users.create({ email: "ada@example.com", passwordHash: "h", name: "Ada" })
      expect(u.id).toBe(1)
      expect((await db.users.findByEmail("ada@example.com"))?.id).toBe(1)
      expect(await db.users.findByEmail("nobody@example.com")).toBeUndefined()
      await db.users.update(1, { name: "Ada L." })
      expect((await db.users.find(1))?.name).toBe("Ada L.")
      await expect(
        db.users.create({ email: "ada@example.com", passwordHash: "h", name: "Dup" })
      ).rejects.toThrow()
    })

    test("users.create with a taken email rejects with EmailTakenError, whatever its case", async () => {
      const db = await fresh()
      await db.users.create({ email: "ada@example.com", passwordHash: "h", name: "" })
      await expect(
        db.users.create({ email: "ADA@example.com", passwordHash: "h", name: "" })
      ).rejects.toBeInstanceOf(EmailTakenError)
    })

    test("users: suspend sets every column, re-suspend replaces them, unsuspend clears them", async () => {
      const db = await fresh()
      const admin = await db.users.create({
        email: "admin@example.com",
        passwordHash: "h",
        name: "",
      })
      const u = await db.users.create({ email: "u@example.com", passwordHash: "h", name: "" })
      expect(await db.users.find(u.id)).toMatchObject({
        suspended_at: null,
        suspended_until: null,
        suspension_reason: null,
        suspended_by: null,
      })

      const at = now()
      await db.users.suspend(u.id, { at, until: null, reason: "abuse report", by: admin.id })
      expect(await db.users.find(u.id)).toMatchObject({
        suspended_at: at,
        suspended_until: null,
        suspension_reason: "abuse report",
        suspended_by: admin.id,
      })

      // Re-suspending fully replaces the reason and end date, not merges them.
      const until = inMs(60_000)
      await db.users.suspend(u.id, { at, until, reason: "fraud", by: admin.id })
      expect(await db.users.find(u.id)).toMatchObject({
        suspended_until: until,
        suspension_reason: "fraud",
      })

      await db.users.unsuspend(u.id)
      expect(await db.users.find(u.id)).toMatchObject({
        suspended_at: null,
        suspended_until: null,
        suspension_reason: null,
        suspended_by: null,
      })

      // A no-op write on an account that was never (or no longer) suspended.
      await db.users.unsuspend(u.id)
      expect((await db.users.find(u.id))?.suspended_at).toBeNull()
    })

    test("sessions: only the hash is stored; expired rows are not found or listed; touch, list, delete", async () => {
      const db = await fresh()
      const u = await db.users.create({ email: "a@example.com", passwordHash: "h", name: "" })
      const token = "raw-token-that-must-never-be-stored"
      const s = await db.sessions.create({
        userId: u.id,
        tokenHash: tokenHash(token),
        expiresAt: inMs(60_000),
        userAgent: "UA",
        ip: "127.0.0.1",
      })
      expect((await db.sessions.findByToken(tokenHash(token)))?.id).toBe(s.id)
      expect(await db.sessions.findByToken(tokenHash("other"))).toBeUndefined()
      const raw = await db.sessions.listForUser(u.id, now())
      expect(JSON.stringify(raw)).not.toContain(token)

      const expired = await db.sessions.create({
        userId: u.id,
        tokenHash: tokenHash("old"),
        expiresAt: inMs(-1),
        userAgent: null,
        ip: null,
      })
      expect(await db.sessions.findByToken(tokenHash("old"))).toBeUndefined()
      expect((await db.sessions.listForUser(u.id, now())).map((r) => r.id)).toEqual([s.id])
      // Listed as of a minute ago the expired row is still there; deleteExpired removes it.
      const asOfEarlier = async () =>
        (await db.sessions.listForUser(u.id, inMs(-60_000))).map((r) => r.id)
      expect(await asOfEarlier()).toEqual([s.id, expired.id])
      await db.sessions.deleteExpired(u.id, now())
      expect(await asOfEarlier()).toEqual([s.id])

      const at = now()
      await db.sessions.touch(s.id, at)
      expect((await db.sessions.findByToken(tokenHash(token)))?.last_seen_at).toBe(at)

      expect(await db.sessions.delete({ id: s.id, userId: 999 })).toBe(false)
      expect(await db.sessions.delete({ id: s.id, userId: u.id })).toBe(true)
      expect(await db.sessions.findByToken(tokenHash(token))).toBeUndefined()
    })

    test("sessions.deleteForUser keeps the excepted one", async () => {
      const db = await fresh()
      const u = await db.users.create({ email: "a@example.com", passwordHash: "h", name: "" })
      const mk = (t: string) =>
        db.sessions.create({
          userId: u.id,
          tokenHash: tokenHash(t),
          expiresAt: inMs(60_000),
          userAgent: null,
          ip: null,
        })
      const keep = await mk("keep")
      await mk("a")
      await mk("b")
      await db.sessions.deleteForUser(u.id, { except: keep.id })
      expect((await db.sessions.listForUser(u.id, now())).map((r) => r.id)).toEqual([keep.id])
    })

    describe("tokens", () => {
      test("consume honours purpose, single use and expiry", async () => {
        const db = await fresh()
        const user = await db.users.create({ email: "t1@example.com", passwordHash: "x", name: "" })
        const future = inMs(60_000)
        await db.tokens.create({
          userId: user.id,
          purpose: "email_verify",
          tokenHash: "h1",
          expiresAt: future,
        })
        expect(await db.tokens.consume("h1", "password_reset", now())).toBeUndefined()
        expect(await db.tokens.consume("h1", "email_verify", now())).toMatchObject({
          userId: user.id,
          email: null,
        })
        expect(await db.tokens.consume("h1", "email_verify", now())).toBeUndefined()
        await db.tokens.create({
          userId: user.id,
          purpose: "email_verify",
          tokenHash: "h2",
          expiresAt: inMs(-1),
        })
        expect(await db.tokens.consume("h2", "email_verify", now())).toBeUndefined()
      })

      test("invalidateForUser burns one purpose only", async () => {
        const db = await fresh()
        const user = await db.users.create({ email: "t2@example.com", passwordHash: "x", name: "" })
        const future = inMs(60_000)
        await db.tokens.create({
          userId: user.id,
          purpose: "email_verify",
          tokenHash: "v",
          expiresAt: future,
        })
        await db.tokens.create({
          userId: user.id,
          purpose: "password_reset",
          tokenHash: "r",
          expiresAt: future,
        })
        await db.tokens.invalidateForUser(user.id, "email_verify", now())
        expect(await db.tokens.consume("v", "email_verify", now())).toBeUndefined()
        expect(await db.tokens.consume("r", "password_reset", now())).toMatchObject({
          userId: user.id,
          email: null,
        })
      })

      test("markEmailVerified sets the timestamp once, returning whether it just did", async () => {
        const db = await fresh()
        const user = await db.users.create({ email: "t3@example.com", passwordHash: "x", name: "" })
        expect(user.email_verified_at).toBeNull()
        expect(await db.users.markEmailVerified(user.id, "2026-10-01T00:00:00.000Z")).toBe(true)
        expect((await db.users.find(user.id))?.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
        // Already verified: the `WHERE … IS NULL` matches nothing, the timestamp is untouched.
        expect(await db.users.markEmailVerified(user.id, "2026-10-02T00:00:00.000Z")).toBe(false)
        expect((await db.users.find(user.id))?.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
      })

      test("concurrent markEmailVerified calls: exactly one reports it just verified", async () => {
        const db = await fresh()
        const user = await db.users.create({
          email: "t3b@example.com",
          passwordHash: "x",
          name: "",
        })
        const results = await Promise.all([
          db.users.markEmailVerified(user.id, "2026-10-01T00:00:00.000Z"),
          db.users.markEmailVerified(user.id, "2026-10-01T00:00:00.000Z"),
        ])
        expect(results.filter(Boolean)).toHaveLength(1)
        expect((await db.users.find(user.id))?.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
      })
    })

    test("tokens.deleteStale prunes used and expired rows of any purpose", async () => {
      const db = await fresh()
      const u = await db.users.create({ email: "a@example.com", passwordHash: "h", name: "" })
      const v = await db.users.create({ email: "b@example.com", passwordHash: "h", name: "" })
      const mk = (
        userId: number,
        t: string,
        ms = 60_000,
        purpose: "password_reset" | "email_verify" = "password_reset"
      ) =>
        db.tokens.create({
          userId,
          purpose,
          tokenHash: tokenHash(t),
          expiresAt: inMs(ms),
        })
      await mk(u.id, "expired", -1)
      await mk(v.id, "used-verify", 60_000, "email_verify")
      await db.tokens.consume(tokenHash("used-verify"), "email_verify", now())
      await db.tokens.deleteStale(now())
      await mk(u.id, "u1")
      await mk(v.id, "v1")
      // token_hash is UNIQUE: re-creating a hash only succeeds if the stale row was deleted.
      await mk(u.id, "expired")
      await mk(v.id, "used-verify", 60_000, "email_verify")
      expect(await db.tokens.consume(tokenHash("u1"), "password_reset", now())).toMatchObject({
        userId: u.id,
        email: null,
      })
      expect(
        await db.tokens.consume(tokenHash("used-verify"), "email_verify", now())
      ).toMatchObject({
        userId: v.id,
        email: null,
      })
    })

    describe("identities", () => {
      test("create, find by provider user, list, count, delete", async () => {
        const db = await fresh()
        const user = await db.users.create({
          email: "i1@example.com",
          passwordHash: null,
          name: "",
        })
        await db.identities.create({
          userId: user.id,
          provider: "google",
          providerUserId: "g-1",
          email: "i1@example.com",
        })
        expect(await db.identities.findByProviderUser("google", "g-1")).toMatchObject({
          user_id: user.id,
        })
        expect(await db.identities.findByProviderUser("github", "g-1")).toBeUndefined()
        expect((await db.identities.listForUser(user.id)).map((i) => i.provider)).toEqual([
          "google",
        ])
        expect(await db.identities.countForUser(user.id)).toBe(1)
        expect(await db.identities.deleteForUser(user.id, "google")).toBe(true)
        expect(await db.identities.deleteForUser(user.id, "google")).toBe(false)
      })

      test("the same provider user cannot be claimed twice", async () => {
        const db = await fresh()
        const a = await db.users.create({ email: "i2@example.com", passwordHash: null, name: "" })
        const b = await db.users.create({ email: "i3@example.com", passwordHash: null, name: "" })
        await db.identities.create({
          userId: a.id,
          provider: "github",
          providerUserId: "42",
          email: null,
        })
        await expect(
          db.identities.create({
            userId: b.id,
            provider: "github",
            providerUserId: "42",
            email: null,
          })
        ).rejects.toThrow()
      })
    })

    describe("passwordless users and magic tokens", () => {
      test("a user can be created without a password and verified at once", async () => {
        const db = await fresh()
        const user = await db.users.create({
          email: "p1@example.com",
          passwordHash: null,
          name: "Ada",
          emailVerifiedAt: "2026-10-01T00:00:00.000Z",
        })
        expect(user.password_hash).toBeNull()
        expect(user.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
      })

      test("a magic token can carry an email instead of a user", async () => {
        const db = await fresh()
        await db.tokens.create({
          userId: null,
          purpose: "magic_link",
          tokenHash: "m1",
          expiresAt: inMs(60_000),
          email: "new@example.com",
        })
        expect(await db.tokens.consume("m1", "magic_link", now())).toMatchObject({
          userId: null,
          email: "new@example.com",
        })
      })

      test("magic tokens are stored with a normalised email and burnt by email", async () => {
        const db = await fresh()
        for (const [hash, purpose] of [
          ["e1", "magic_link"],
          ["e2", "magic_link"],
          ["e3", "email_verify"],
        ] as const) {
          await db.tokens.create({
            userId: null,
            purpose,
            tokenHash: hash,
            expiresAt: inMs(60_000),
            email: " New@Example.COM ",
          })
        }
        await db.tokens.create({
          userId: null,
          purpose: "magic_link",
          tokenHash: "other",
          expiresAt: inMs(60_000),
          email: "other@example.com",
        })
        await db.tokens.invalidateForEmail("NEW@example.com", "magic_link", now())
        expect(await db.tokens.consume("e1", "magic_link", now())).toBeUndefined()
        expect(await db.tokens.consume("e2", "magic_link", now())).toBeUndefined()
        expect(await db.tokens.consume("e3", "email_verify", now())).toMatchObject({
          userId: null,
          email: "new@example.com",
        })
        expect(await db.tokens.consume("other", "magic_link", now())).toMatchObject({
          userId: null,
          email: "other@example.com",
        })
      })
    })

    test("notes are scoped to their workspace; delete removes one; deleting a workspace its notes", async () => {
      const db = await fresh()
      const a = await db.users.create({ email: "a@example.com", passwordHash: "h", name: "" })
      const wa = await db.workspaces.create({ name: "A", slug: "a", createdBy: a.id })
      const wb = await db.workspaces.create({ name: "B", slug: "b", createdBy: a.id })
      const mine = await db.notes.create({
        workspaceId: wa.id,
        userId: a.id,
        title: "mine",
        body: "",
      })
      const theirs = await db.notes.create({
        workspaceId: wb.id,
        userId: a.id,
        title: "theirs",
        body: "",
      })
      expect(mine.authorId).toBe(a.id)
      const list = await db.notes.list({ workspaceId: wa.id, limit: 10 })
      expect(list.items.map((n) => n.title)).toEqual(["mine"])
      expect(await db.notes.find({ workspaceId: wb.id, id: mine.id })).toBeUndefined()
      expect((await db.notes.find({ workspaceId: wa.id, id: mine.id }))?.title).toBe("mine")
      expect(await db.notes.findRow({ workspaceId: wa.id, id: mine.id })).toMatchObject({
        user_id: a.id,
        workspace_id: wa.id,
      })
      expect(await db.notes.delete({ workspaceId: wb.id, id: mine.id })).toBe(false)
      expect(await db.notes.delete({ workspaceId: wa.id, id: mine.id })).toBe(true)
      expect(await db.notes.find({ workspaceId: wa.id, id: mine.id })).toBeUndefined()
      await db.workspaces.delete(wb.id)
      expect(await db.notes.findRow({ workspaceId: wb.id, id: theirs.id })).toBeUndefined()
    })

    test("waitlist: add is created once per normalised email; find and count", async () => {
      const db = await fresh()
      expect(await db.waitlist.count()).toBe(0)
      expect(await db.waitlist.add({ email: " Ada@Example.com", source: "www" })).toEqual({
        created: true,
      })
      expect(await db.waitlist.add({ email: "ada@example.com", source: "docs" })).toEqual({
        created: false,
      })
      expect(await db.waitlist.find("ADA@example.com ")).toMatchObject({
        email: "ada@example.com",
        source: "www",
      })
      expect(await db.waitlist.find("nobody@example.com")).toBeUndefined()
      await db.waitlist.add({ email: "bob@example.com", source: "help" })
      expect(await db.waitlist.count()).toBe(2)
    })

    describe("workspaces, memberships and invitations", () => {
      test("listForUser reports role and member_count; ownerCount counts owners", async () => {
        const db = await fresh()
        const owner = await db.users.create({
          email: "owner@example.com",
          passwordHash: "h",
          name: "Owner",
        })
        const member = await db.users.create({
          email: "member@example.com",
          passwordHash: "h",
          name: "Member",
        })
        const ws = await db.workspaces.create({
          name: "Ada's Team",
          slug: "ada-s-team",
          createdBy: owner.id,
        })
        expect(ws).toMatchObject({ name: "Ada's Team", slug: "ada-s-team", created_by: owner.id })
        expect(await db.workspaces.find(ws.id)).toMatchObject({ id: ws.id })
        expect(await db.workspaces.slugExists("ada-s-team")).toBe(true)
        expect(await db.workspaces.slugExists("nope")).toBe(false)

        await db.memberships.add({ workspaceId: ws.id, userId: owner.id, role: "owner" })
        await db.memberships.add({ workspaceId: ws.id, userId: member.id, role: "member" })

        expect(await db.workspaces.memberCount(ws.id)).toBe(2)
        expect(await db.memberships.ownerCount(ws.id)).toBe(1)

        const forOwner = await db.workspaces.listForUser(owner.id)
        expect(forOwner).toHaveLength(1)
        expect(forOwner[0]).toMatchObject({ id: ws.id, role: "owner", member_count: 2 })

        const forMember = await db.workspaces.listForUser(member.id)
        expect(forMember[0]).toMatchObject({ id: ws.id, role: "member", member_count: 2 })

        expect(await db.workspaces.listForUser(999)).toEqual([])

        await db.workspaces.rename(ws.id, "Renamed")
        expect((await db.workspaces.find(ws.id))?.name).toBe("Renamed")
      })

      test("memberships: find, setRole, remove, list (owners first, then by join date)", async () => {
        const db = await fresh()
        const owner = await db.users.create({
          email: "o@example.com",
          passwordHash: "h",
          name: "Owner",
        })
        const admin = await db.users.create({
          email: "a@example.com",
          passwordHash: "h",
          name: "Admin",
        })
        const viewer = await db.users.create({
          email: "v@example.com",
          passwordHash: "h",
          name: "Viewer",
        })
        const ws = await db.workspaces.create({ name: "Team", slug: "team", createdBy: owner.id })
        await db.memberships.add({ workspaceId: ws.id, userId: owner.id, role: "owner" })
        await db.memberships.add({ workspaceId: ws.id, userId: viewer.id, role: "viewer" })
        await db.memberships.add({ workspaceId: ws.id, userId: admin.id, role: "admin" })

        expect(await db.memberships.find(ws.id, owner.id)).toMatchObject({ role: "owner" })
        expect(await db.memberships.find(ws.id, 999)).toBeUndefined()

        expect(await db.memberships.setRole(ws.id, viewer.id, "member")).toBe(true)
        expect((await db.memberships.find(ws.id, viewer.id))?.role).toBe("member")
        expect(await db.memberships.setRole(ws.id, 999, "member")).toBe(false)

        const list = await db.memberships.list(ws.id)
        expect(list.map((m) => m.user_id)).toEqual([owner.id, admin.id, viewer.id])
        expect(list.map((m) => m.email)).toEqual([
          "o@example.com",
          "a@example.com",
          "v@example.com",
        ])

        expect(await db.memberships.remove(ws.id, 999)).toBe(false)
        expect(await db.memberships.remove(ws.id, viewer.id)).toBe(true)
        expect((await db.memberships.list(ws.id)).map((m) => m.user_id)).toEqual([
          owner.id,
          admin.id,
        ])
      })

      test("invitations: create replaces any pending invite for the address; accept is single-use and honours expiry", async () => {
        const db = await fresh()
        const owner = await db.users.create({
          email: "inv-owner@example.com",
          passwordHash: "h",
          name: "",
        })
        const ws = await db.workspaces.create({
          name: "Team",
          slug: "inv-team",
          createdBy: owner.id,
        })
        const first = await db.invitations.create({
          workspaceId: ws.id,
          email: "Guest@Example.com",
          role: "member",
          tokenHash: "hash-1",
          invitedBy: owner.id,
          expiresAt: inMs(60_000),
        })
        expect(first).toMatchObject({
          email: "guest@example.com",
          role: "member",
          accepted_at: null,
        })

        const second = await db.invitations.create({
          workspaceId: ws.id,
          email: "guest@example.com",
          role: "admin",
          tokenHash: "hash-2",
          invitedBy: owner.id,
          expiresAt: inMs(60_000),
        })
        expect(second.token_hash).toBe("hash-2")
        expect(second.token_hash).not.toBe(first.token_hash)

        const pending = await db.invitations.listPending(ws.id, now())
        expect(pending).toHaveLength(1)
        expect(pending[0]).toMatchObject({
          id: second.id,
          role: "admin",
          workspace_name: "Team",
          inviter_name: "",
        })

        expect(await db.invitations.findByTokenHash("hash-1")).toBeUndefined()
        expect(await db.invitations.findByTokenHash("hash-2")).toMatchObject({ id: second.id })
        expect(await db.invitations.find(second.id)).toMatchObject({ email: "guest@example.com" })

        expect(await db.invitations.listPendingForEmail("GUEST@example.com", now())).toHaveLength(1)

        const at = now()
        expect(await db.invitations.accept(second.id, at)).toBe(true)
        expect(await db.invitations.accept(second.id, at)).toBe(false)
        expect(await db.invitations.listPending(ws.id, now())).toEqual([])

        const expired = await db.invitations.create({
          workspaceId: ws.id,
          email: "late@example.com",
          role: "viewer",
          tokenHash: "hash-3",
          invitedBy: owner.id,
          expiresAt: inMs(-1),
        })
        expect(await db.invitations.accept(expired.id, now())).toBe(false)
        expect(await db.invitations.listPending(ws.id, now())).toEqual([])

        expect(await db.invitations.delete(expired.id, ws.id)).toMatchObject({ id: expired.id })
        expect(await db.invitations.delete(expired.id, ws.id)).toBeUndefined()
      })

      test("workspaces.delete removes its memberships and invitations", async () => {
        const db = await fresh()
        const owner = await db.users.create({
          email: "del-owner@example.com",
          passwordHash: "h",
          name: "",
        })
        const member = await db.users.create({
          email: "del-member@example.com",
          passwordHash: "h",
          name: "",
        })
        const ws = await db.workspaces.create({ name: "Gone", slug: "gone", createdBy: owner.id })
        await db.memberships.add({ workspaceId: ws.id, userId: owner.id, role: "owner" })
        await db.memberships.add({ workspaceId: ws.id, userId: member.id, role: "member" })
        await db.invitations.create({
          workspaceId: ws.id,
          email: "pending@example.com",
          role: "member",
          tokenHash: "hash-del",
          invitedBy: owner.id,
          expiresAt: inMs(60_000),
        })

        await db.workspaces.delete(ws.id)

        expect(await db.workspaces.find(ws.id)).toBeUndefined()
        expect(await db.memberships.find(ws.id, owner.id)).toBeUndefined()
        expect(await db.memberships.find(ws.id, member.id)).toBeUndefined()
        expect(await db.invitations.findByTokenHash("hash-del")).toBeUndefined()
      })
    })

    describe("two-factor", () => {
      test("revokeSessions stamps, kills open challenges and deletes sessions (but `except`)", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "rv1@example.com", passwordHash: "h", name: "" })
        const session = (hash: string) =>
          db.sessions.create({
            userId: u.id,
            tokenHash: hash,
            expiresAt: inMs(60_000),
            userAgent: null,
            ip: null,
            impersonatedBy: null,
            reason: null,
          })
        const keep = await session("s-keep")
        await session("s-gone")
        await db.tokens.create({
          userId: u.id,
          purpose: "two_factor_challenge",
          tokenHash: "rv-tfc",
          expiresAt: inMs(60_000),
        })
        expect((await db.users.find(u.id))?.sessions_revoked_at).toBeNull()
        expect(await db.users.lockForSession(u.id)).toEqual({ sessionsRevokedAt: null })
        const at = now()
        await db.users.revokeSessions(u.id, at, { except: keep.id })
        expect((await db.users.find(u.id))?.sessions_revoked_at).toBe(at)
        expect((await db.sessions.listForUser(u.id, now())).map((r) => r.id)).toEqual([keep.id])
        expect(await db.tokens.peek("rv-tfc", "two_factor_challenge", now())).toBeUndefined()
        expect(await db.transaction((tx) => tx.users.lockForSession(u.id))).toEqual({
          sessionsRevokedAt: at,
        })
        await db.users.revokeSessions(u.id, now())
        expect(await db.sessions.listForUser(u.id, now())).toEqual([])
        expect(await db.users.lockForSession(999_999)).toBeUndefined()
        const later = inMs(1_000)
        await db.users.stampSessionsRevoked(u.id, later)
        expect((await db.users.find(u.id))?.sessions_revoked_at).toBe(later)
      })

      test("findUnusedRecoveryCode only matches, never spends", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "rc1@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.replaceRecoveryCodes(u.id, [tokenHash("code-a")])
        expect(await db.twoFactor.findUnusedRecoveryCode(u.id, tokenHash("code-a"))).toBe(true)
        expect(await db.twoFactor.findUnusedRecoveryCode(u.id, tokenHash("code-b"))).toBe(false)
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(1)
        await db.twoFactor.useRecoveryCode(u.id, tokenHash("code-a"), now())
        expect(await db.twoFactor.findUnusedRecoveryCode(u.id, tokenHash("code-a"))).toBe(false)
      })

      test("setPendingSecret stores the secret, leaves enabled_at and last_step null, and clears any recovery codes", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf1@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher-a")
        expect(
          await db.twoFactor.enable(u.id, "v1:iv:cipher-a", now(), [tokenHash("code-a")])
        ).toBe(true)
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(1)
        // A new pending secret (regardless of enabled state) drops the old codes: they were
        // minted for a secret that is no longer the one on the account.
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher-b")
        const row = await db.users.find(u.id)
        expect(row?.two_factor_secret).toBe("v1:iv:cipher-b")
        expect(row?.two_factor_enabled_at).toBeNull()
        expect(row?.two_factor_last_step).toBeNull()
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(0)
      })

      test("enable sets enabled_at and stores 10 recovery codes", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf2@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        const hashes = Array.from({ length: 10 }, (_, i) => tokenHash(`code-${i}`))
        const at = now()
        expect(await db.twoFactor.enable(u.id, "v1:iv:cipher", at, hashes)).toBe(true)
        expect((await db.users.find(u.id))?.two_factor_enabled_at).toBe(at)
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(10)
      })

      test("enable with a null stamp takes the time inside its transaction", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf2n@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        const before = new Date().toISOString()
        expect(await db.twoFactor.enable(u.id, "v1:iv:cipher", null, [tokenHash("n")])).toBe(true)
        const after = new Date().toISOString()
        const stamp = (await db.users.find(u.id))?.two_factor_enabled_at ?? ""
        expect(stamp >= before && stamp <= after).toBe(true)
        // Refused like any other enable once the account is on: the stamp is not rewritten.
        expect(await db.twoFactor.enable(u.id, "v1:iv:cipher", null, [])).toBe(false)
        expect((await db.users.find(u.id))?.two_factor_enabled_at).toBe(stamp)
      })

      test("enable refuses when the secret no longer matches, or the account is already enabled", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf2b@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        // A concurrent setup (or an enable that already happened) changed the secret underneath:
        // this caller checked a code against a secret that is no longer stored.
        expect(await db.twoFactor.enable(u.id, "v1:iv:other", now(), [tokenHash("code-y")])).toBe(
          false
        )
        expect((await db.users.find(u.id))?.two_factor_enabled_at).toBeNull()
        expect(await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [tokenHash("code-z")])).toBe(
          true
        )
        // Already enabled: a second call with the same secret must not re-run.
        expect(await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [tokenHash("code-w")])).toBe(
          false
        )
      })

      test("useRecoveryCode consumes a code once", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf3@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        const hash = tokenHash("code-a")
        await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [hash, tokenHash("code-b")])
        expect(await db.twoFactor.useRecoveryCode(u.id, hash, now())).toBe(true)
        expect(await db.twoFactor.useRecoveryCode(u.id, hash, now())).toBe(false)
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(1)
      })

      test("replaceRecoveryCodes swaps the whole set", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf4@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [
          tokenHash("old-1"),
          tokenHash("old-2"),
        ])
        await db.twoFactor.replaceRecoveryCodes(u.id, [tokenHash("new-1")])
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(1)
        expect(await db.twoFactor.useRecoveryCode(u.id, tokenHash("old-1"), now())).toBe(false)
        expect(await db.twoFactor.useRecoveryCode(u.id, tokenHash("new-1"), now())).toBe(true)
      })

      test("setLastStep refuses a non-increasing step (the replay guard)", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf5@example.com", passwordHash: "h", name: "" })
        expect(await db.twoFactor.setLastStep(u.id, 100)).toBe(true)
        expect((await db.users.find(u.id))?.two_factor_last_step).toBe(100)
        expect(await db.twoFactor.setLastStep(u.id, 100)).toBe(false)
        expect(await db.twoFactor.setLastStep(u.id, 99)).toBe(false)
        expect(await db.twoFactor.setLastStep(u.id, 101)).toBe(true)
        expect((await db.users.find(u.id))?.two_factor_last_step).toBe(101)
      })

      test("disable clears the secret, enabled flag, last step and every recovery code", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf6@example.com", passwordHash: "h", name: "" })
        await db.twoFactor.setPendingSecret(u.id, "v1:iv:cipher")
        await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [tokenHash("code-x")])
        await db.twoFactor.setLastStep(u.id, 5)
        await db.twoFactor.disable(u.id)
        const row = await db.users.find(u.id)
        expect(row?.two_factor_secret).toBeNull()
        expect(row?.two_factor_enabled_at).toBeNull()
        expect(row?.two_factor_last_step).toBeNull()
        expect(await db.twoFactor.recoveryCodesLeft(u.id)).toBe(0)
      })

      test("tokens.create accepts the two_factor_challenge purpose; peek does not consume", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "tf7@example.com", passwordHash: "h", name: "" })
        await db.tokens.create({
          userId: u.id,
          purpose: "two_factor_challenge",
          tokenHash: "tfc1",
          expiresAt: inMs(60_000),
        })
        expect(await db.tokens.peek("tfc1", "two_factor_challenge", now())).toEqual({
          userId: u.id,
        })
        // peeking again finds it unchanged — a wrong attempt must not burn the token itself.
        expect(await db.tokens.peek("tfc1", "two_factor_challenge", now())).toEqual({
          userId: u.id,
        })
        const consumed = await db.tokens.consume("tfc1", "two_factor_challenge", now())
        expect(consumed).toMatchObject({ userId: u.id, email: null })
        // The creation time comes back, so verify can compare it with `sessions_revoked_at`.
        expect(consumed?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(await db.tokens.peek("tfc1", "two_factor_challenge", now())).toBeUndefined()
      })

      test("tokens.create accepts the passkey_challenge purpose and carries its ceremony", async () => {
        const db = await fresh()
        const u = await db.users.create({
          email: "pk-tok@example.com",
          passwordHash: "h",
          name: "",
        })
        // register: bound to the caller.
        await db.tokens.create({
          userId: u.id,
          purpose: "passkey_challenge",
          tokenHash: "pkc-reg",
          expiresAt: inMs(60_000),
          ceremony: "register",
        })
        expect(await db.tokens.consume("pkc-reg", "passkey_challenge", now())).toMatchObject({
          userId: u.id,
          ceremony: "register",
        })
        // authenticate: discoverable, no user known yet.
        await db.tokens.create({
          userId: null,
          purpose: "passkey_challenge",
          tokenHash: "pkc-auth",
          expiresAt: inMs(60_000),
          ceremony: "authenticate",
        })
        expect(await db.tokens.consume("pkc-auth", "passkey_challenge", now())).toMatchObject({
          userId: null,
          ceremony: "authenticate",
        })
        // single-use, like every other purpose.
        expect(await db.tokens.consume("pkc-reg", "passkey_challenge", now())).toBeUndefined()
      })
    })

    describe("passkeys", () => {
      test("create, listForUser (oldest first), findByCredentialId, countForUser", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "pk1@example.com", passwordHash: "h", name: "" })
        const a = await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-a",
          publicKey: "pub-a",
          counter: 0,
          transports: JSON.stringify(["internal"]),
          name: "This device",
        })
        const b = await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-b",
          publicKey: "pub-b",
          counter: 0,
          transports: null,
          name: "Security key",
        })
        expect(await db.passkeys.countForUser(u.id)).toBe(2)
        expect((await db.passkeys.listForUser(u.id)).map((p) => p.id)).toEqual([a.id, b.id])
        expect(await db.passkeys.findByCredentialId("cred-a")).toMatchObject({
          id: a.id,
          user_id: u.id,
          public_key: "pub-a",
          transports: JSON.stringify(["internal"]),
          last_used_at: null,
        })
        expect(await db.passkeys.findByCredentialId("missing")).toBeUndefined()
        expect(await db.passkeys.countForUser(999_999)).toBe(0)
      })

      test("rename and delete only touch the owner's own row", async () => {
        const db = await fresh()
        const owner = await db.users.create({
          email: "pk2@example.com",
          passwordHash: "h",
          name: "",
        })
        const other = await db.users.create({
          email: "pk3@example.com",
          passwordHash: "h",
          name: "",
        })
        const key = await db.passkeys.create({
          userId: owner.id,
          credentialId: "cred-rename",
          publicKey: "pub",
          counter: 0,
          transports: null,
          name: "Old name",
        })
        expect(await db.passkeys.rename(key.id, other.id, "Stolen")).toBe(false)
        expect(await db.passkeys.rename(key.id, owner.id, "New name")).toBe(true)
        expect((await db.passkeys.listForUser(owner.id))[0]?.name).toBe("New name")
        expect(await db.passkeys.delete(key.id, other.id)).toBe(false)
        expect(await db.passkeys.delete(key.id, owner.id)).toBe(true)
        expect(await db.passkeys.delete(key.id, owner.id)).toBe(false)
        expect(await db.passkeys.countForUser(owner.id)).toBe(0)
      })

      test("deleteAllForUser removes every passkey and reports how many", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "pk4@example.com", passwordHash: "h", name: "" })
        for (const n of [1, 2, 3]) {
          await db.passkeys.create({
            userId: u.id,
            credentialId: `cred-${n}`,
            publicKey: "pub",
            counter: 0,
            transports: null,
            name: `Key ${n}`,
          })
        }
        expect(await db.passkeys.deleteAllForUser(u.id)).toBe(3)
        expect(await db.passkeys.countForUser(u.id)).toBe(0)
        expect(await db.passkeys.deleteAllForUser(u.id)).toBe(0)
      })

      test("recordUse writes the counter and last_used_at only from the expected counter", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "pk5@example.com", passwordHash: "h", name: "" })
        const key = await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-touch",
          publicKey: "pub",
          counter: 0,
          transports: null,
          name: "Device",
        })
        const at = now()
        expect(await db.passkeys.recordUse(key.id, 0, 7, at)).toBe(true)
        expect((await db.passkeys.listForUser(u.id))[0]).toMatchObject({
          counter: 7,
          last_used_at: at,
        })
        // A concurrent sign-in already moved it from 0: this one changes nothing.
        expect(await db.passkeys.recordUse(key.id, 0, 8, now())).toBe(false)
        expect((await db.passkeys.listForUser(u.id))[0]).toMatchObject({
          counter: 7,
          last_used_at: at,
        })
      })

      test("a sign count above 2^31 round-trips as a number", async () => {
        // The WebAuthn counter is a uint32: past int4 on Postgres, and Bun reads int8 as a string.
        const db = await fresh()
        const u = await db.users.create({ email: "pk6@example.com", passwordHash: "h", name: "" })
        const high = 0xffff_fff0
        const key = await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-high",
          publicKey: "pub",
          counter: high,
          transports: null,
          name: "Device",
        })
        expect(key.counter).toBe(high)
        expect((await db.passkeys.findByCredentialId("cred-high"))?.counter).toBe(high)
        expect(await db.passkeys.recordUse(key.id, high, 0xffff_ffff, now())).toBe(true)
        expect((await db.passkeys.listForUser(u.id))[0]?.counter).toBe(0xffff_ffff)
        // A zero counter reads back as the number 0, never "0".
        const zero = await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-zero",
          publicKey: "pub",
          counter: 0,
          transports: null,
          name: "Zero",
        })
        expect((await db.passkeys.findByCredentialId("cred-zero"))?.counter).toBe(0)
        expect(zero.counter).toBe(0)
      })
    })

    describe("privacy", () => {
      test("users.scheduleDeletion keeps the first date; cancelDeletion clears it", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "d@example.com", passwordHash: "h", name: "" })
        expect((await db.users.find(u.id))?.deletion_scheduled_at).toBeNull()
        const first = "2026-10-17T00:00:00.000Z"
        expect(await db.users.scheduleDeletion(u.id, first)).toBe(first)
        expect(await db.users.scheduleDeletion(u.id, "2026-12-01T00:00:00.000Z")).toBe(first)
        expect((await db.users.find(u.id))?.deletion_scheduled_at).toBe(first)
        await db.users.cancelDeletion(u.id)
        expect((await db.users.find(u.id))?.deletion_scheduled_at).toBeNull()
        const second = "2026-12-01T00:00:00.000Z"
        expect(await db.users.scheduleDeletion(u.id, second)).toBe(second)
      })

      test("users.dueForDeletion returns only past dates, oldest first, up to the limit", async () => {
        const db = await fresh()
        const mk = (email: string) => db.users.create({ email, passwordHash: "h", name: "" })
        const a = await mk("a@example.com")
        const b = await mk("b@example.com")
        const c = await mk("c@example.com")
        await mk("none@example.com")
        await db.users.scheduleDeletion(a.id, "2026-10-02T00:00:00.000Z")
        await db.users.scheduleDeletion(b.id, "2026-10-01T00:00:00.000Z")
        await db.users.scheduleDeletion(c.id, "2026-10-20T00:00:00.000Z")
        const at = "2026-10-10T00:00:00.000Z"
        const ids = (rows: Array<{ id: number }>) => rows.map((row) => row.id)
        expect(ids(await db.users.dueForDeletion(at))).toEqual([b.id, a.id])
        const [first] = await db.users.dueForDeletion(at, 1)
        expect(first?.id).toBe(b.id)
        expect(ids(await db.users.dueForDeletion(at, 1, first))).toEqual([a.id])
        expect(await db.users.dueForDeletion("2026-09-01T00:00:00.000Z")).toEqual([])
      })

      test("exports: create, latest, find, markReady, lastRequestedAt, expireBefore, liveKeys", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "e@example.com", passwordHash: "h", name: "" })
        const other = await db.users.create({ email: "o@example.com", passwordHash: "h", name: "" })
        expect(await db.exports.latest(u.id)).toBeUndefined()
        expect(await db.exports.lastRequestedAt(u.id)).toBeNull()

        const first = await db.exports.create(u.id, "2026-10-01T00:00:00.000Z")
        expect(await db.exports.find(first.id)).toMatchObject({
          id: first.id,
          user_id: u.id,
          status: "pending",
          storage_key: null,
          created_at: "2026-10-01T00:00:00.000Z",
          ready_at: null,
          expires_at: null,
        })
        const key1 = `exports/${u.id}/${"a".repeat(22)}.json`
        await db.exports.markReady(
          first.id,
          key1,
          "2026-10-01T00:01:00.000Z",
          "2026-10-08T00:01:00.000Z"
        )
        expect(await db.exports.find(first.id)).toMatchObject({
          status: "ready",
          storage_key: key1,
          ready_at: "2026-10-01T00:01:00.000Z",
          expires_at: "2026-10-08T00:01:00.000Z",
        })

        const second = await db.exports.create(u.id, "2026-10-09T00:00:00.000Z")
        const key2 = `exports/${u.id}/${"b".repeat(22)}.json`
        await db.exports.markReady(
          second.id,
          key2,
          "2026-10-09T00:01:00.000Z",
          "2026-10-16T00:01:00.000Z"
        )
        const otherExport = await db.exports.create(other.id, "2026-10-09T00:00:00.000Z")
        expect((await db.exports.latest(u.id))?.id).toBe(second.id)
        expect((await db.exports.latest(other.id))?.id).toBe(otherExport.id)
        expect(await db.exports.lastRequestedAt(u.id)).toBe("2026-10-09T00:00:00.000Z")
        expect(await db.exports.find(9999)).toBeUndefined()

        expect(await db.exports.liveKeys()).toEqual(new Set([key1, key2]))
        expect(await db.exports.liveKeys(`exports/${other.id}/`)).toEqual(new Set())

        // Only ready rows past their expiry turn expired; a pending one has no expiry.
        expect(await db.exports.expireBefore("2026-10-10T00:00:00.000Z")).toEqual([
          { id: first.id, storageKey: key1 },
        ])
        expect((await db.exports.find(first.id))?.status).toBe("expired")
        expect((await db.exports.find(second.id))?.status).toBe("ready")
        expect((await db.exports.find(otherExport.id))?.status).toBe("pending")
        expect(await db.exports.expireBefore("2026-10-10T00:00:00.000Z")).toEqual([])
        expect(await db.exports.liveKeys()).toEqual(new Set([key2]))
      })

      test("support: create stores an open request; find reads it back", async () => {
        const db = await fresh()
        const u = await db.users.create({ email: "s@example.com", passwordHash: "h", name: "" })
        const input = {
          email: "s@example.com",
          name: "Sam",
          topic: "bug" as const,
          message: "Something broke today.",
          page: "/getting-started",
          ipHash: "anon:abc",
          createdAt: "2026-10-10T00:00:00.000Z",
        }
        const linked = await db.support.create({ ...input, userId: u.id })
        const anon = await db.support.create({ ...input, userId: null, name: null, page: null })
        expect(anon.id).toBe(linked.id + 1)
        expect(await db.support.find(linked.id)).toEqual({
          id: linked.id,
          email: "s@example.com",
          name: "Sam",
          topic: "bug",
          message: "Something broke today.",
          page: "/getting-started",
          user_id: u.id,
          ip_hash: "anon:abc",
          status: "open",
          created_at: "2026-10-10T00:00:00.000Z",
          resolved_at: null,
          resolved_by: null,
        })
        expect(await db.support.find(9999)).toBeUndefined()
      })

      test("applications: create, find, list filters, setStatus, delete, expiry, export, live keys", async () => {
        const db = await fresh()
        const admin = await db.users.create({
          email: "root@example.com",
          passwordHash: "h",
          name: "",
        })
        const base = {
          jobSlug: "engineer",
          jobTitle: "Engineer",
          name: "Ada",
          email: "ada@example.com",
          link: "https://ada.example",
          note: "Hello",
          ipHash: "anon:abc",
          createdAt: "2026-10-10T00:00:00.000Z",
          deleteAfter: "2027-04-10T00:00:00.000Z",
        }
        const key = (c: string) => `applications/${c.repeat(22)}.pdf`
        const a = await db.applications.create({ ...base, cvKey: key("a") })
        const b = await db.applications.create({
          ...base,
          jobSlug: "designer",
          jobTitle: "Designer",
          email: "bo@example.com",
          link: null,
          note: null,
          cvKey: key("b"),
          deleteAfter: "2026-10-01T00:00:00.000Z",
        })
        expect(await db.applications.find(a.id)).toEqual({
          id: a.id,
          job_slug: "engineer",
          job_title: "Engineer",
          name: "Ada",
          email: "ada@example.com",
          link: "https://ada.example",
          note: "Hello",
          cv_key: key("a"),
          ip_hash: "anon:abc",
          status: "new",
          created_at: base.createdAt,
          status_changed_at: null,
          status_changed_by: null,
          delete_after: base.deleteAfter,
        })
        expect(await db.applications.find(9999)).toBeUndefined()

        const ids = async (input: Parameters<typeof db.applications.list>[0]) =>
          (await db.applications.list(input)).map((row) => row.id)
        expect(await ids({})).toEqual([b.id, a.id])
        expect(await ids({ job: "engineer" })).toEqual([a.id])
        expect(await ids({ cursor: b.id })).toEqual([a.id])
        expect(await ids({ limit: 1 })).toEqual([b.id])

        expect(await db.applications.setStatus(a.id, "reviewing", admin.id, now())).toBe(true)
        // Same status again: a no-op, not a re-stamp.
        expect(await db.applications.setStatus(a.id, "reviewing", admin.id, now())).toBe(false)
        expect(await db.applications.setStatus(9999, "hired", admin.id, now())).toBe(false)
        expect(await ids({ status: "reviewing" })).toEqual([a.id])
        const [listed] = await db.applications.list({ status: "reviewing" })
        expect(listed).toMatchObject({
          status_changed_by: admin.id,
          status_changed_by_email: "root@example.com",
        })

        expect(await db.applications.expiredBefore("2026-10-11T00:00:00.000Z")).toEqual([
          { id: b.id, cvKey: key("b") },
        ])
        expect(await db.applications.liveKeys()).toEqual(new Set([key("a"), key("b")]))
        expect(await db.applications.forEmail("ADA@example.com")).toEqual([
          {
            id: a.id,
            job_slug: "engineer",
            job_title: "Engineer",
            name: "Ada",
            email: "ada@example.com",
            link: "https://ada.example",
            note: "Hello",
            status: "reviewing",
            created_at: base.createdAt,
          },
        ])

        expect(await db.applications.delete(b.id)).toEqual({ cvKey: key("b") })
        expect(await db.applications.delete(b.id)).toBeUndefined()
        expect(await db.applications.liveKeys()).toEqual(new Set([key("a")]))
      })

      test("users.purge leaves no row linked to the user; their notes keep user_id", async () => {
        // A second connection must see what the first wrote: a temp file on SQLite (`:memory:`
        // is private per connection), the throwaway database on Postgres.
        const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "api-test-")) : null
        const tdb = dir
          ? {
              url: `sqlite://${join(dir, "t.db")}`,
              cleanup: async () => rmSync(dir, { recursive: true, force: true }),
            }
          : await testDatabase(engine)
        const db = createDb(tdb.url)
        await db.migrate()
        const sql = new SQL(tdb.url)
        cleanups.push(async () => {
          await sql.close()
          await db.close()
          await tdb.cleanup()
        })

        const mk = (email: string) => db.users.create({ email, passwordHash: "h", name: "" })
        const u = await mk("gone@example.com")
        const keep = await mk("keep@example.com")
        const avatar = `avatars/${u.id}/${"a".repeat(22)}.png`
        await db.users.setAvatarKey(u.id, avatar)

        const session = (userId: number, t: string, impersonatedBy: number | null = null) =>
          db.sessions.create({
            userId,
            tokenHash: tokenHash(t),
            expiresAt: inMs(60_000),
            userAgent: null,
            ip: null,
            impersonatedBy,
          })
        await session(u.id, "own")
        // `u` impersonating someone else: the session belongs to `keep` but names `u`.
        await session(keep.id, "imp", u.id)
        await session(keep.id, "keep")
        await db.tokens.create({
          userId: u.id,
          purpose: "password_reset",
          tokenHash: "t1",
          expiresAt: inMs(60_000),
        })
        await db.tokens.create({
          userId: null,
          purpose: "magic_link",
          tokenHash: "t2",
          expiresAt: inMs(60_000),
          email: "gone@example.com",
        })
        await db.identities.create({
          userId: u.id,
          provider: "github",
          providerUserId: "gh-1",
          email: "gone@example.com",
        })
        await db.twoFactor.enable(u.id, "v1:iv:cipher", now(), [tokenHash("code")])
        await db.passkeys.create({
          userId: u.id,
          credentialId: "cred-gone",
          publicKey: "pk",
          counter: 0,
          transports: null,
          name: "Device",
        })

        const ws = await db.workspaces.create({ name: "W", slug: "w", createdBy: u.id })
        await db.memberships.add({ workspaceId: ws.id, userId: u.id, role: "owner" })
        await db.memberships.add({ workspaceId: ws.id, userId: keep.id, role: "owner" })
        await db.invitations.create({
          workspaceId: ws.id,
          email: "friend@example.com",
          role: "member",
          tokenHash: "inv",
          invitedBy: u.id,
          expiresAt: inMs(60_000),
        })
        const note = await db.notes.create({
          workspaceId: ws.id,
          userId: u.id,
          title: "kept",
          body: "",
        })
        const audit = (actorUserId: number | null, impersonatedUserId: number | null) =>
          db.audit.create({
            actorUserId,
            impersonatedUserId,
            action: "note.created",
            targetType: null,
            targetId: null,
            reason: null,
            ip: null,
            userAgent: null,
            metadata: null,
          })
        await audit(u.id, keep.id)
        await audit(keep.id, u.id)
        const day = now().slice(0, 10)
        await db.analytics.insertPageview({
          app: "app",
          path: "/notes",
          referrerHost: null,
          visitorId: "v",
          userId: u.id,
          workspaceId: ws.id,
          day,
          createdAt: now(),
        })
        await db.analytics.insertEvent({
          name: "note_created",
          source: "api",
          props: {},
          visitorId: null,
          userId: u.id,
          workspaceId: ws.id,
          day,
          createdAt: now(),
        })
        // Checkout stored the paying owner's own address, as Stripe reported it (any case).
        await db.billing.customers.upsert({
          workspaceId: ws.id,
          provider: "stripe",
          customerId: "cus_gone",
          email: "Gone@Example.com",
        })
        const ws2 = await db.workspaces.create({ name: "W2", slug: "w2", createdBy: keep.id })
        await db.billing.customers.upsert({
          workspaceId: ws2.id,
          provider: "stripe",
          customerId: "cus_keep",
          email: "keep@example.com",
        })
        const exp = await db.exports.create(u.id, now())
        const exportKey = `exports/${u.id}/${"e".repeat(22)}.json`
        await db.exports.markReady(exp.id, exportKey, now(), inMs(60_000))
        await db.exports.create(u.id, now())
        const support = (userId: number | null) =>
          db.support.create({
            email: "gone@example.com",
            name: null,
            topic: "other",
            message: "a request support may still answer",
            page: null,
            userId,
            ipHash: null,
            createdAt: now(),
          })
        const linkedRequest = await support(u.id)
        const keptRequest = await support(keep.id)
        await sql`UPDATE support_requests SET status = 'resolved', resolved_by = ${u.id}
          WHERE id = ${keptRequest.id}`
        const application = await db.applications.create({
          jobSlug: "engineer",
          jobTitle: "Engineer",
          name: "Ada",
          email: "applicant@example.com",
          link: null,
          note: null,
          cvKey: `applications/${"c".repeat(22)}.pdf`,
          ipHash: null,
          createdAt: now(),
          deleteAfter: inMs(60_000),
        })
        await db.applications.setStatus(application.id, "reviewing", u.id, now())
        // `u`, acting as an admin, suspended `keep`: purging `u` must not touch `keep`'s own
        // suspension, only who is credited with having issued it.
        await db.users.suspend(keep.id, {
          at: now(),
          until: null,
          reason: "flagged by an admin who is about to be purged",
          by: u.id,
        })

        await db.notifications.create({
          userId: u.id,
          workspaceId: null,
          type: "export.ready",
          data: "{}",
          createdAt: now(),
        })
        const kept = await db.notifications.create({
          userId: keep.id,
          workspaceId: null,
          type: "export.ready",
          data: "{}",
          createdAt: now(),
        })

        for (const userId of [u.id, keep.id])
          await db.notificationPreferences.set({
            userId,
            type: "plan.changed",
            email: false,
            fallback: true,
            at: now(),
          })

        const result = await db.transaction((tx) => tx.users.purge(u.id, now()))
        expect(result).toEqual({ avatarKey: avatar, exportKeys: [exportKey] })
        // Another user's email settings stay.
        expect((await db.notificationPreferences.list(keep.id)).map((r) => r.type)).toEqual([
          "plan.changed",
        ])
        // Another user's notification stays.
        expect(
          (await db.notifications.list({ userId: keep.id, unreadOnly: false, limit: 5 })).map(
            (r) => r.id
          )
        ).toEqual([kept.id])

        const count = async (table: string, where: string) => {
          // The id is a number we made, so inlining it is safe and works on both engines.
          const clause = where.replaceAll("$1", String(u.id))
          const [row] = await sql.unsafe(`SELECT COUNT(*) AS n FROM ${table} WHERE ${clause}`)
          return Number(row.n)
        }
        const linked: Array<[string, string]> = [
          ["users", "id = $1"],
          ["users", "suspended_by = $1"],
          ["sessions", "user_id = $1 OR impersonated_by = $1"],
          ["tokens", "user_id = $1"],
          ["identities", "user_id = $1"],
          ["memberships", "user_id = $1"],
          ["two_factor_recovery_codes", "user_id = $1"],
          ["passkeys", "user_id = $1"],
          ["data_exports", "user_id = $1"],
          ["notifications", "user_id = $1"],
          ["notification_preferences", "user_id = $1"],
          ["invitations", "invited_by = $1"],
          ["workspaces", "created_by = $1"],
          ["audit_log", "actor_user_id = $1 OR impersonated_user_id = $1"],
          ["analytics_pageviews", "user_id = $1"],
          ["analytics_events", "user_id = $1"],
          ["support_requests", "user_id = $1 OR resolved_by = $1"],
          ["job_applications", "status_changed_by = $1"],
        ]
        for (const [table, where] of linked) {
          expect({ table, n: await count(table, where) }).toEqual({ table, n: 0 })
        }
        // The requests stay, with their typed address: the user's de-linked, another's untouched.
        expect(await db.support.find(linkedRequest.id)).toMatchObject({
          user_id: null,
          email: "gone@example.com",
        })
        expect(await db.support.find(keptRequest.id)).toMatchObject({
          user_id: keep.id,
          resolved_by: null,
        })
        // The address-bound magic link went too.
        const [tokens] =
          await sql`SELECT COUNT(*) AS n FROM tokens WHERE email = 'gone@example.com'`
        expect(Number(tokens.n)).toBe(0)

        // The billing address that was the user's is gone; the customer row and others stay.
        const customers = await sql`
          SELECT customer_id, email FROM billing_customers ORDER BY customer_id
        `
        expect(
          customers.map((c: { customer_id: string; email: string | null }) => ({ ...c }))
        ).toEqual([
          { customer_id: "cus_gone", email: null },
          { customer_id: "cus_keep", email: "keep@example.com" },
        ])

        // What belongs to others stays, de-linked; the note keeps its author id.
        expect(await db.notes.find({ workspaceId: ws.id, id: note.id })).toMatchObject({
          id: note.id,
        })
        const [noteRow] = await sql`SELECT user_id FROM notes WHERE id = ${note.id}`
        expect(Number(noteRow.user_id)).toBe(u.id)
        expect(await db.workspaces.find(ws.id)).toMatchObject({ id: ws.id, created_by: null })
        expect(await db.memberships.find(ws.id, keep.id)).toBeDefined()
        const [inv] = await sql`SELECT invited_by FROM invitations`
        expect(inv.invited_by).toBeNull()
        expect(Number((await sql`SELECT COUNT(*) AS n FROM audit_log`)[0].n)).toBe(2)
        expect(Number((await sql`SELECT COUNT(*) AS n FROM analytics_pageviews`)[0].n)).toBe(1)
        expect(Number((await sql`SELECT COUNT(*) AS n FROM analytics_events`)[0].n)).toBe(1)
        expect((await db.sessions.listForUser(keep.id, now())).length).toBe(1)
        expect((await db.users.find(keep.id))?.id).toBe(keep.id)
        // `keep`'s own suspension survives the purge of the admin who issued it — only the
        // attribution is gone.
        expect(await db.users.find(keep.id)).toMatchObject({
          suspended_at: expect.any(String),
          suspended_by: null,
        })
      })
    })

    test("the raw schema holds no plaintext secrets", async () => {
      // A second connection must observe what the first wrote: unlike testDatabase()'s sqlite
      // `:memory:` (private per connection), a temp-file database is shared by URL.
      const dir = engine === "sqlite" ? mkdtempSync(join(tmpdir(), "api-test-")) : null
      const tdb = dir
        ? {
            url: `sqlite://${join(dir, "t.db")}`,
            cleanup: async () => rmSync(dir, { recursive: true, force: true }),
          }
        : await testDatabase(engine)
      const db = createDb(tdb.url)
      await db.migrate()
      const sql = new SQL(tdb.url)
      cleanups.push(async () => {
        await sql.close()
        await db.close()
        await tdb.cleanup()
      })
      const u = await db.users.create({ email: "a@example.com", passwordHash: "hashed", name: "" })
      await db.sessions.create({
        userId: u.id,
        tokenHash: tokenHash("SECRET1"),
        expiresAt: inMs(60_000),
        userAgent: null,
        ip: null,
      })
      await db.tokens.create({
        userId: u.id,
        purpose: "password_reset",
        tokenHash: tokenHash("SECRET2"),
        expiresAt: inMs(60_000),
      })
      const dump = JSON.stringify([
        await sql`SELECT * FROM sessions`,
        await sql`SELECT * FROM tokens`,
      ])
      expect(dump).not.toContain("SECRET1")
      expect(dump).not.toContain("SECRET2")
    })
  })
}
