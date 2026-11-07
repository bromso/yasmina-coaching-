import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { type ApiClient, SEAT_LIMIT_MESSAGE } from "@repo/api-contract"
import { invitationSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { exportedMetadata } from "./jobs/builtin/privacy"
import { inviteDomainsOf } from "./queries/workspaces"
import {
  clientFor,
  mailsTo,
  signUp,
  signUpVerified,
  signUpWithWorkspace,
  start,
  verify,
} from "./test-server"
import { activityDetails } from "./workspace-activity"

// The invitation domain allowlist (Phase 12 C), stored and managed: `workspaces.security.get`'s
// `inviteDomains` and `workspaces.security.setInviteDomains` — validation, no-op, audit — and
// enforced: `workspaces.invitations.create` (and re-invites), `invitations.accept` / `acceptById`
// and `invitations.preview`'s `domainAllowed`.

const ROOT = "root@example.com"
type App = Awaited<ReturnType<typeof start>>
let app: App
let root: Awaited<ReturnType<typeof signUpVerified>>
beforeAll(async () => {
  app = await start({
    superadminEmails: [ROOT],
    impersonateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
  root = await signUpVerified(app, ROOT)
})
afterAll(() => app.stop())

const ACTION = "workspace.invite_domains_changed"

type AuditRow = {
  actor_user_id: number | null
  target_type: string
  target_id: string
  metadata: string | null
}
const auditRows = (workspaceId: number) =>
  app.db.sql`
    SELECT * FROM audit_log WHERE workspace_id = ${workspaceId} AND action = ${ACTION} ORDER BY id
  ` as Promise<AuditRow[]>

const stored = async (workspaceId: number) => {
  const row = await app.db.workspaces.find(workspaceId)
  return row ? inviteDomainsOf(row) : null
}

/** An owner's workspace with an admin and a member. */
async function team() {
  const owner = await signUpWithWorkspace(app)
  const workspaceId = owner.workspaceId
  const add = async (role: "member" | "admin") => {
    const user = await signUpVerified(app)
    await app.db.memberships.add({ workspaceId, userId: user.user.id, role })
    return user
  }
  return { owner, workspaceId, admin: await add("admin"), member: await add("member") }
}

describe("workspaces.security.setInviteDomains", () => {
  test("stores the normalised, deduplicated list and audits the change once", async () => {
    const t = await team()
    const result = await t.owner.client.workspaces.security.setInviteDomains({
      workspaceId: t.workspaceId,
      domains: ["ACME.com", "", "@acme.com", "Bücher.de", "acme.com.", "Ⓐcme.com"],
    })
    expect(result).toEqual({ inviteDomains: ["acme.com", "xn--bcher-kva.de"] })
    expect(await stored(t.workspaceId)).toEqual(["acme.com", "xn--bcher-kva.de"])
    // Admins read it back.
    const read = await t.admin.client.workspaces.security.get({ workspaceId: t.workspaceId })
    expect(read.inviteDomains).toEqual(["acme.com", "xn--bcher-kva.de"])

    const rows = await auditRows(t.workspaceId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actor_user_id: t.owner.user.id,
      target_type: "workspace",
      target_id: String(t.workspaceId),
    })
    expect(JSON.parse(rows[0]?.metadata ?? "null")).toEqual({
      added: ["acme.com", "xn--bcher-kva.de"],
      removed: [],
    })
  })

  test("a new workspace allows any address: an empty list", async () => {
    const owner = await signUpWithWorkspace(app)
    const read = await owner.client.workspaces.security.get({ workspaceId: owner.workspaceId })
    expect(read.inviteDomains).toEqual([])
  })

  test("the same set again (any form, any order) is a no-op: nothing written or audited", async () => {
    const t = await team()
    const set = (domains: string[]) =>
      t.owner.client.workspaces.security.setInviteDomains({ workspaceId: t.workspaceId, domains })

    // Empty while already empty.
    expect(await set([])).toEqual({ inviteDomains: [] })
    expect(await set(["", "  "])).toEqual({ inviteDomains: [] })
    expect(await auditRows(t.workspaceId)).toHaveLength(0)

    await set(["acme.com", "acme.se"])
    expect(await set(["ACME.SE.", "@acme.com"])).toEqual({ inviteDomains: ["acme.com", "acme.se"] })
    expect(await stored(t.workspaceId)).toEqual(["acme.com", "acme.se"])
    expect(await auditRows(t.workspaceId)).toHaveLength(1)
  })

  test("each change records what it added and removed; clearing it opens invitations again", async () => {
    const t = await team()
    const set = (domains: string[]) =>
      t.owner.client.workspaces.security.setInviteDomains({ workspaceId: t.workspaceId, domains })
    await set(["acme.com", "acme.se"])
    await set(["acme.se", "acme.no"])
    expect(await set([])).toEqual({ inviteDomains: [] })
    const rows = await auditRows(t.workspaceId)
    expect(rows.map((r) => JSON.parse(r.metadata ?? "null"))).toEqual([
      { added: ["acme.com", "acme.se"], removed: [] },
      { added: ["acme.no"], removed: ["acme.com"] },
      { added: [], removed: ["acme.se", "acme.no"] },
    ])
    expect(await stored(t.workspaceId)).toEqual([])
  })

  test("concurrent identical changes write and audit once", async () => {
    const t = await team()
    await Promise.all(
      [1, 2, 3].map(() =>
        t.owner.client.workspaces.security.setInviteDomains({
          workspaceId: t.workspaceId,
          domains: ["acme.com"],
        })
      )
    )
    expect(await auditRows(t.workspaceId)).toHaveLength(1)
    expect(await stored(t.workspaceId)).toEqual(["acme.com"])
  })

  test("invalid lines: BAD_REQUEST with their indexes only, never their text; nothing stored", async () => {
    const t = await team()
    await t.owner.client.workspaces.security.setInviteDomains({
      workspaceId: t.workspaceId,
      domains: ["acme.com"],
    })
    const domains = ["acme.se", "a_b.com", "", "localhost", "secret-<script>.com", "acme.com."]
    for (const [client, message] of [
      [t.owner.client, "Check the lines listed below."],
      [clientFor(app, t.owner.token, "sv"), "Kontrollera raderna som listas nedan."],
    ] as const) {
      const [error, , isDefined] = await safe(
        client.workspaces.security.setInviteDomains({ workspaceId: t.workspaceId, domains })
      )
      expect(error).toMatchObject({ code: "BAD_REQUEST", status: 400, message })
      expect((error as unknown as { data: object }).data).toEqual({
        reason: "invite_domain_invalid",
        indexes: [1, 3, 4],
      })
      expect(JSON.stringify(error)).not.toContain("a_b")
      expect(JSON.stringify(error)).not.toContain("script")
      // Declared, so the Next apps can read `data` through a typed client.
      expect(isDefined).toBe(true)
    }
    expect(await stored(t.workspaceId)).toEqual(["acme.com"])
    expect(await auditRows(t.workspaceId)).toHaveLength(1)
  })

  test("more than 20 distinct domains: BAD_REQUEST invite_domain_limit; 20 plus duplicates is fine", async () => {
    const t = await team()
    const twenty = Array.from({ length: 20 }, (_, i) => `d${i}.example.com`)
    const set = (domains: string[]) =>
      safe(
        t.owner.client.workspaces.security.setInviteDomains({ workspaceId: t.workspaceId, domains })
      )
    const [over, , isDefined] = await set([...twenty, "one-more.com"])
    expect(over).toMatchObject({
      code: "BAD_REQUEST",
      message: "You can list up to 20 domains.",
    })
    expect((over as unknown as { data: object }).data).toEqual({ reason: "invite_domain_limit" })
    expect(isDefined).toBe(true)
    expect(await stored(t.workspaceId)).toEqual([])

    const [error, result] = await set([...twenty, "D0.example.com", "d1.example.com."])
    expect(error).toBeNull()
    expect(result?.inviteDomains).toEqual(twenty)
  })

  test("owner only: an admin is refused", async () => {
    const t = await team()
    const [error] = await safe(
      t.admin.client.workspaces.security.setInviteDomains({
        workspaceId: t.workspaceId,
        domains: ["acme.com"],
      })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the owner role" })
    expect(await stored(t.workspaceId)).toEqual([])
  })

  test("a non-member gets NOT_FOUND", async () => {
    const t = await team()
    const outsider = await signUpVerified(app)
    const [error] = await safe(
      outsider.client.workspaces.security.setInviteDomains({
        workspaceId: t.workspaceId,
        domains: ["acme.com"],
      })
    )
    expect(error).toMatchObject({ code: "NOT_FOUND" })
  })

  test("a workspace deleted after the membership check: NOT_FOUND, no audit row", async () => {
    const owner = await signUpWithWorkspace(app)
    // The middleware has already loaded the workspace; delete it just before the handler's
    // transaction begins, so `lockForOwnership` finds no row.
    const original = app.db.transaction
    app.db.transaction = async (fn) => {
      app.db.transaction = original
      await app.db.sql`DELETE FROM workspaces WHERE id = ${owner.workspaceId}`
      return original(fn)
    }
    try {
      const [error] = await safe(
        owner.client.workspaces.security.setInviteDomains({
          workspaceId: owner.workspaceId,
          domains: ["acme.com"],
        })
      )
      expect(error).toMatchObject({ code: "NOT_FOUND", message: "Workspace not found" })
    } finally {
      app.db.transaction = original
    }
    expect(await auditRows(owner.workspaceId)).toEqual([])
    expect(await app.db.workspaces.find(owner.workspaceId)).toBeFalsy()
  })

  test("refused while impersonating; reading stays allowed", async () => {
    const owner = await signUpWithWorkspace(app)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
    })
    const asOwner = clientFor(app, token)
    const [error] = await safe(
      asOwner.workspaces.security.setInviteDomains({
        workspaceId: owner.workspaceId,
        domains: ["acme.com"],
      })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Not available while impersonating" })
    expect(await stored(owner.workspaceId)).toEqual([])
    expect(
      (await asOwner.workspaces.security.get({ workspaceId: owner.workspaceId })).inviteDomains
    ).toEqual([])
    await asOwner.admin.stopImpersonation()
  })
})

describe("workspaces.security.get inviteDomains", () => {
  test("admin and up; below admin it is refused (role first)", async () => {
    const t = await team()
    const [error] = await safe(
      t.member.client.workspaces.security.get({ workspaceId: t.workspaceId })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN", message: "Requires the admin role" })
  })

  test("a stored value that is not a list of strings reads as empty", async () => {
    const t = await team()
    for (const value of ["not json", "{}", '[1,"a.com"]']) {
      await app.db.sql`UPDATE workspaces SET invite_domains = ${value} WHERE id = ${t.workspaceId}`
      const read = await t.owner.client.workspaces.security.get({ workspaceId: t.workspaceId })
      expect(read.inviteDomains).toEqual([])
    }
  })
})

describe("the activity log and the data export", () => {
  test("the change is listed with only added/removed, and the export keeps only those", async () => {
    const owner = await signUpWithWorkspace(app)
    const workspaceId = owner.workspaceId
    await owner.client.workspaces.security.setInviteDomains({ workspaceId, domains: ["acme.com"] })
    const page = await owner.client.workspaces.activity.list({ workspaceId, action: ACTION })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      action: ACTION,
      actor: { kind: "member", userId: owner.user.id },
      target: { type: "workspace", id: String(workspaceId) },
      details: { added: ["acme.com"], removed: [] },
    })

    expect(activityDetails(ACTION, { added: ["a.com"], removed: [], extra: "x" })).toEqual({
      added: ["a.com"],
      removed: [],
    })
    expect(activityDetails(ACTION, { added: "a.com", removed: [1] })).toEqual({})
    expect(
      exportedMetadata(ACTION, JSON.stringify({ added: ["a.com"], removed: ["b.com"], extra: 1 }))
    ).toEqual({ added: ["a.com"], removed: ["b.com"] })
  })
})

// --- Enforcement ----------------------------------------------------------------------------

let seq = 0
/** A fresh address on `domain`, unique across the file (and across engines' shared runs). */
const addressAt = (domain: string) => `invitee${++seq}-${Date.now().toString(36)}@${domain}`

const inviteLinkOf = (text: string | undefined) =>
  text?.match(/http:\/\/app\.example\.com\/invitations\/([A-Za-z0-9_-]+)/)?.[1] ?? ""

/** Invites `email` (it must be allowed) and returns the token from the mailed link. */
async function invite(target: App, client: ApiClient, workspaceId: number, email: string) {
  const { name } = await client.workspaces.get({ workspaceId })
  const subject = invitationSubject(name)
  const before = target.mailer.sent.filter((m) => m.to === email && m.subject === subject).length
  await client.workspaces.invitations.create({ workspaceId, email, role: "member" })
  const mails = await mailsTo(target, email, subject, before + 1)
  return inviteLinkOf(mails.at(-1)?.text)
}

const setDomains = (owner: { client: ApiClient; workspaceId: number }, domains: string[]) =>
  owner.client.workspaces.security.setInviteDomains({ workspaceId: owner.workspaceId, domains })

const pendingFor = (workspaceId: number) =>
  app.db.sql`
    SELECT id, email, token_hash, created_at, accepted_at FROM invitations
    WHERE workspace_id = ${workspaceId} ORDER BY id
  ` as Promise<
    Array<{ id: number; email: string; token_hash: string; created_at: string; accepted_at: null }>
  >

/** The refusal's `data`, read off the thrown error. */
const dataOf = (error: unknown) => (error as { data?: unknown }).data

describe("workspaces.invitations.create under a domain list", () => {
  test("an address outside the list: FORBIDDEN invite_domain naming the list, never the address; nothing stored or sent", async () => {
    const owner = await signUpWithWorkspace(app)
    await setDomains(owner, ["acme.com", "acme.se"])
    const email = addressAt("other.com")
    const local = email.slice(0, email.indexOf("@"))
    for (const [client, message] of [
      [owner.client, "Invitations to this workspace are limited to: acme.com and acme.se."],
      [
        clientFor(app, owner.token, "sv"),
        "Inbjudningar till den här arbetsytan är begränsade till: acme.com och acme.se.",
      ],
    ] as const) {
      const [error, , isDefined] = await safe(
        client.workspaces.invitations.create({
          workspaceId: owner.workspaceId,
          email,
          role: "member",
        })
      )
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403, message })
      expect(dataOf(error)).toEqual({ reason: "invite_domain" })
      expect(isDefined).toBe(true)
      expect(JSON.stringify(error)).not.toContain(local)
      expect(JSON.stringify(error)).not.toContain("other.com")
    }
    expect(await pendingFor(owner.workspaceId)).toEqual([])
    await app.drain()
    expect(app.mailer.sent.some((mail) => mail.to === email)).toBe(false)
  })

  test("exact match only: a subdomain is refused, the listed domain (any case) is allowed", async () => {
    const owner = await signUpWithWorkspace(app)
    await setDomains(owner, ["acme.com"])
    const [sub] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: addressAt("eu.acme.com"),
        role: "member",
      })
    )
    expect(sub).toMatchObject({
      code: "FORBIDDEN",
      message: "Invitations to this workspace are limited to: acme.com.",
    })
    // A look-alike parent and a suffix trick are refused too.
    for (const domain of ["acme.com.evil.com", "notacme.com", "acme.co"]) {
      const [error] = await safe(
        owner.client.workspaces.invitations.create({
          workspaceId: owner.workspaceId,
          email: addressAt(domain),
          role: "member",
        })
      )
      expect(dataOf(error)).toEqual({ reason: "invite_domain" })
    }
    const email = addressAt("acme.com")
    const created = await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email: email.toUpperCase(),
      role: "member",
    })
    expect(created.email).toBe(email)
    expect((await pendingFor(owner.workspaceId)).map((row) => row.email)).toEqual([email])
  })

  test("an IDN entry matches the address's A-label form", async () => {
    const owner = await signUpWithWorkspace(app)
    expect((await setDomains(owner, ["Bücher.de"])).inviteDomains).toEqual(["xn--bcher-kva.de"])
    const email = addressAt("xn--bcher-kva.de")
    const token = await invite(app, owner.client, owner.workspaceId, email)
    expect((await clientFor(app).invitations.preview({ token })).domainAllowed).toBe(true)
    const [error] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: addressAt("bucher.de"),
        role: "member",
      })
    )
    expect(error).toMatchObject({
      code: "FORBIDDEN",
      message: "Invitations to this workspace are limited to: xn--bcher-kva.de.",
    })
  })

  test("re-inviting an address outside the list is refused and leaves its pending invitation as it was", async () => {
    const owner = await signUpWithWorkspace(app)
    const email = addressAt("other.com")
    const token = await invite(app, owner.client, owner.workspaceId, email)
    const before = await pendingFor(owner.workspaceId)
    expect(before).toHaveLength(1)

    await setDomains(owner, ["acme.com"])
    const [error] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email,
        role: "admin",
      })
    )
    expect(error).toMatchObject({ code: "FORBIDDEN" })
    expect(dataOf(error)).toEqual({ reason: "invite_domain" })
    // Same row, same token, same role: the replace never ran.
    expect(await pendingFor(owner.workspaceId)).toEqual(before)
    const preview = await clientFor(app).invitations.preview({ token })
    expect(preview).toMatchObject({ role: "member", domainAllowed: false })
  })

  test("an empty list behaves as before: any address is invited, previewed and accepted", async () => {
    const owner = await signUpWithWorkspace(app)
    await setDomains(owner, ["acme.com"])
    await setDomains(owner, [])
    const invitee = await signUpVerified(app, addressAt("anything.example"))
    const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
    expect(await clientFor(app).invitations.preview({ token })).toMatchObject({
      role: "member",
      domainAllowed: true,
    })
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ id: owner.workspaceId, memberCount: 2 })

    const second = await signUpVerified(app, addressAt("elsewhere.example"))
    await invite(app, owner.client, owner.workspaceId, second.email)
    const [pending] = (await second.client.workspaces.list()).pendingInvitations
    const accepted = await second.client.invitations.acceptById({ id: pending?.id as number })
    expect(accepted.workspace).toMatchObject({ memberCount: 3 })
  })
})

describe("a refused create spends no limiter budget and runs before the seat check", () => {
  let limited: App
  beforeAll(async () => {
    limited = await start({
      inviteLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      inviterLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
  })
  afterAll(() => limited.stop())

  test("three refusals, then the one allowed invite still goes through", async () => {
    const owner = await signUpWithWorkspace(limited)
    await setDomains(owner, ["acme.com"])
    for (let n = 0; n < 3; n++) {
      const [error] = await safe(
        owner.client.workspaces.invitations.create({
          workspaceId: owner.workspaceId,
          email: addressAt("other.com"),
          role: "member",
        })
      )
      expect(dataOf(error)).toEqual({ reason: "invite_domain" })
    }
    // Both limiters allow exactly one hit: had a refusal counted, this would be TOO_MANY_REQUESTS.
    const email = addressAt("acme.com")
    await owner.client.workspaces.invitations.create({
      workspaceId: owner.workspaceId,
      email,
      role: "member",
    })
    const [over] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: addressAt("acme.com"),
        role: "member",
      })
    )
    expect(over).toMatchObject({ code: "TOO_MANY_REQUESTS" })
  })

  test("a full workspace: outside the list answers invite_domain, inside it the seat limit", async () => {
    const owner = await signUpWithWorkspace(app)
    for (const _ of [1, 2]) {
      const user = await signUp(app)
      await app.db.memberships.add({
        workspaceId: owner.workspaceId,
        userId: user.user.id,
        role: "member",
      })
    }
    await setDomains(owner, ["acme.com"])
    const create = (email: string) =>
      safe(
        owner.client.workspaces.invitations.create({
          workspaceId: owner.workspaceId,
          email,
          role: "member",
        })
      )
    const [outside] = await create(addressAt("other.com"))
    expect(outside).toMatchObject({ code: "FORBIDDEN" })
    expect(dataOf(outside)).toEqual({ reason: "invite_domain" })
    const [inside] = await create(addressAt("acme.com"))
    expect(inside).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })
    expect(dataOf(inside)).toBeUndefined()
  })
})

describe("accepting after the list tightens", () => {
  test("accept and acceptById are refused, nothing is consumed, and it works again once allowed", async () => {
    const owner = await signUpWithWorkspace(app)
    const invitee = await signUpVerified(app, addressAt("other.com"))
    const local = invitee.email.slice(0, invitee.email.indexOf("@"))
    const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
    await setDomains(owner, ["acme.com"])

    expect((await clientFor(app).invitations.preview({ token })).domainAllowed).toBe(false)

    const [byToken, , tokenDefined] = await safe(invitee.client.invitations.accept({ token }))
    expect(byToken).toMatchObject({
      code: "FORBIDDEN",
      message: "This workspace no longer accepts invitations to this address.",
    })
    expect(dataOf(byToken)).toEqual({ reason: "invite_domain" })
    expect(tokenDefined).toBe(true)
    expect(JSON.stringify(byToken)).not.toContain(local)

    const [pending] = (await invitee.client.workspaces.list()).pendingInvitations
    const id = pending?.id as number
    const sv = clientFor(app, invitee.token, "sv")
    const [byId, , idDefined] = await safe(sv.invitations.acceptById({ id }))
    expect(byId).toMatchObject({
      code: "FORBIDDEN",
      message: "Den här arbetsytan tar inte längre emot inbjudningar till den här adressen.",
    })
    expect(dataOf(byId)).toEqual({ reason: "invite_domain" })
    expect(idDefined).toBe(true)

    // Still pending, no membership.
    const rows = await pendingFor(owner.workspaceId)
    expect(rows.map((row) => [row.id, row.accepted_at])).toEqual([[id, null]])
    expect(await app.db.memberships.find(owner.workspaceId, invitee.user.id)).toBeUndefined()
    expect((await invitee.client.workspaces.list()).pendingInvitations.map((p) => p.id)).toEqual([
      id,
    ])

    // Allowed again (its domain added): the same invitation is accepted.
    await setDomains(owner, ["acme.com", "other.com"])
    expect((await clientFor(app).invitations.preview({ token })).domainAllowed).toBe(true)
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ id: owner.workspaceId, memberCount: 2 })
  })

  test("the domain refusal comes before the seat limit", async () => {
    const owner = await signUpWithWorkspace(app)
    const invitee = await signUpVerified(app, addressAt("other.com"))
    const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
    for (const _ of [1, 2]) {
      const user = await signUp(app)
      await app.db.memberships.add({
        workspaceId: owner.workspaceId,
        userId: user.user.id,
        role: "member",
      })
    }
    const [full] = await safe(invitee.client.invitations.accept({ token }))
    expect(full).toMatchObject({ code: "FORBIDDEN", message: SEAT_LIMIT_MESSAGE })

    await setDomains(owner, ["acme.com"])
    const [both] = await safe(invitee.client.invitations.accept({ token }))
    expect(both).toMatchObject({
      code: "FORBIDDEN",
      message: "This workspace no longer accepts invitations to this address.",
    })
    expect(dataOf(both)).toEqual({ reason: "invite_domain" })
    expect((await pendingFor(owner.workspaceId))[0]?.accepted_at).toBeNull()
  })

  test("the earlier refusals keep their order: wrong address and unverified email come first", async () => {
    const owner = await signUpWithWorkspace(app)
    const email = addressAt("other.com")
    const token = await invite(app, owner.client, owner.workspaceId, email)
    await setDomains(owner, ["acme.com"])

    const stranger = await signUpVerified(app, addressAt("acme.com"))
    const [wrong] = await safe(stranger.client.invitations.accept({ token }))
    expect(wrong).toMatchObject({ code: "FORBIDDEN" })
    expect((wrong as Error).message).toContain("This invitation was sent to")
    expect(dataOf(wrong)).toBeUndefined()

    const invitee = await signUp(app, email)
    const [unverified] = await safe(invitee.client.invitations.accept({ token }))
    expect(unverified).toMatchObject({
      code: "FORBIDDEN",
      message: "Verify your email to accept this invitation",
    })
    await verify(app, email)
    const [domain] = await safe(invitee.client.invitations.accept({ token }))
    expect(dataOf(domain)).toEqual({ reason: "invite_domain" })
  })
})

describe("an unreadable stored list fails closed", () => {
  let own: App
  const logged: Array<[string, unknown]> = []
  beforeAll(async () => {
    own = await start({ log: (message: string, error?: unknown) => logged.push([message, error]) })
  })
  afterAll(() => own.stop())

  test("create and accept are refused as invite_domain and recorded by id; get shows it empty; saving repairs it", async () => {
    const owner = await signUpWithWorkspace(own)
    const invitee = await signUpVerified(own, addressAt("other.com"))
    const token = await invite(own, owner.client, owner.workspaceId, invitee.email)
    await own.db
      .sql`UPDATE workspaces SET invite_domains = ${"not json"} WHERE id = ${owner.workspaceId}`
    const failures = () =>
      logged.filter(([message]) => message.includes("invite_domains unreadable"))

    const [create] = await safe(
      owner.client.workspaces.invitations.create({
        workspaceId: owner.workspaceId,
        email: addressAt("other.com"),
        role: "member",
      })
    )
    expect(create).toMatchObject({
      code: "FORBIDDEN",
      message: "This workspace no longer accepts invitations to this address.",
    })
    expect(dataOf(create)).toEqual({ reason: "invite_domain" })

    const [accept] = await safe(invitee.client.invitations.accept({ token }))
    expect(accept).toMatchObject({ code: "FORBIDDEN" })
    expect(dataOf(accept)).toEqual({ reason: "invite_domain" })
    expect(await own.db.memberships.find(owner.workspaceId, invitee.user.id)).toBeUndefined()
    expect((await clientFor(own).invitations.preview({ token })).domainAllowed).toBe(false)

    // Recorded with the workspace id only: no address.
    expect(failures().length).toBeGreaterThanOrEqual(2)
    for (const entry of failures()) {
      expect(JSON.stringify(entry)).toContain(String(owner.workspaceId))
      expect(JSON.stringify(entry)).not.toContain("@")
    }

    const read = await owner.client.workspaces.security.get({ workspaceId: owner.workspaceId })
    expect(read.inviteDomains).toEqual([])

    // Saving the empty list is not a no-op over an unreadable value: it rewrites it.
    expect(await setDomains(owner, [])).toEqual({ inviteDomains: [] })
    const [row] = (await own.db.sql`
      SELECT invite_domains FROM workspaces WHERE id = ${owner.workspaceId}
    `) as Array<{ invite_domains: string }>
    expect(row?.invite_domains).toBe("[]")
    const { workspace } = await invitee.client.invitations.accept({ token })
    expect(workspace).toMatchObject({ id: owner.workspaceId, memberCount: 2 })
  })
})

/**
 * Holds the next `n` transactions open (each has begun) until all `n` have, then lets them run
 * together: real overlap on Postgres. The same helper the api-key and passkey tests use.
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

/**
 * Holds the next transaction open (it has begun) until `gate` resolves; `entered` resolves once
 * it has begun.
 */
function holdNextTransaction(gate: Promise<void>) {
  const original = app.db.transaction
  let entered = () => {}
  const began = new Promise<void>((resolve) => {
    entered = resolve
  })
  app.db.transaction = (fn) => {
    app.db.transaction = original
    return original(async (tx) => {
      entered()
      await gate
      return fn(tx)
    })
  }
  return { began, restore: () => (app.db.transaction = original) }
}

describe.skipIf(!Bun.env.TEST_DATABASE_URL)("under real overlap (Postgres)", () => {
  test("accept and a workspace delete at once: no deadlock — accepted then deleted, or NOT_FOUND", async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await signUpWithWorkspace(app)
      const invitee = await signUpVerified(app, addressAt("other.com"))
      const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
      const restore = overlapNextTransactions(2)
      const [[acceptError], [deleteError]] = await Promise.all([
        safe(invitee.client.invitations.accept({ token })),
        safe(owner.client.workspaces.delete({ workspaceId: owner.workspaceId })),
      ]).finally(restore)
      expect(deleteError).toBeNull()
      if (acceptError) expect(acceptError).toMatchObject({ code: "NOT_FOUND" })
      expect(JSON.stringify(acceptError ?? "")).not.toContain("40P01")
      expect(await app.db.workspaces.find(owner.workspaceId)).toBeUndefined()
      expect(await pendingFor(owner.workspaceId)).toEqual([])
      expect(await app.db.memberships.find(owner.workspaceId, invitee.user.id)).toBeUndefined()
    }
  })

  test("a list that committed first is always seen by an accept already under way", async () => {
    const owner = await signUpWithWorkspace(app)
    const invitee = await signUpVerified(app, addressAt("other.com"))
    const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
    let open = () => {}
    const gate = new Promise<void>((resolve) => {
      open = resolve
    })
    const held = holdNextTransaction(gate)
    try {
      // The accept's transaction begins, then waits; the tightening commits meanwhile.
      const accepting = safe(invitee.client.invitations.accept({ token }))
      await held.began
      await setDomains(owner, ["acme.com"])
      open()
      const [error] = await accepting
      expect(error).toMatchObject({ code: "FORBIDDEN" })
      expect(dataOf(error)).toEqual({ reason: "invite_domain" })
    } finally {
      held.restore()
    }
    expect((await pendingFor(owner.workspaceId))[0]?.accepted_at).toBeNull()
    expect(await app.db.memberships.find(owner.workspaceId, invitee.user.id)).toBeUndefined()
  })

  test("accept and a tightening at once: either the accept committed first or it was refused", async () => {
    for (let round = 0; round < 5; round++) {
      const owner = await signUpWithWorkspace(app)
      const invitee = await signUpVerified(app, addressAt("other.com"))
      const token = await invite(app, owner.client, owner.workspaceId, invitee.email)
      const restore = overlapNextTransactions(2)
      const [[acceptError], [setError]] = await Promise.all([
        safe(invitee.client.invitations.accept({ token })),
        safe(setDomains(owner, ["acme.com"])),
      ]).finally(restore)
      expect(setError).toBeNull()
      const member = await app.db.memberships.find(owner.workspaceId, invitee.user.id)
      const [row] = await pendingFor(owner.workspaceId)
      if (acceptError) {
        expect(dataOf(acceptError)).toEqual({ reason: "invite_domain" })
        expect(member).toBeUndefined()
        expect(row?.accepted_at).toBeNull()
      } else {
        expect(member).toBeDefined()
        expect(row?.accepted_at).not.toBeNull()
      }
    }
  })
})
