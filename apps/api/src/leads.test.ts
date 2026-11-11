import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { type ApiClient, LEAD_RATE_MESSAGE, type LeadCreateInput } from "@repo/api-contract"
import { leadNewSubject, leadReceivedSubject } from "@repo/email"
import { createMemoryRateLimiter, type RateLimiter } from "@repo/service-kit"
import { siteUrl } from "@repo/sites"
import { SQL } from "bun"
import { leadsPruneJob } from "./jobs/builtin/leads"
import { testDatabase } from "./test-db"
import { auth, clientFor, mailsTo, signUp, signUpVerified, start } from "./test-server"

const BOOKING = "yasmina@example.com"
const ROOT = "leads-root@example.com"
const DAY = 24 * 60 * 60 * 1000
const open = (): RateLimiter => createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 })

let counter = 0
/** A valid contact request from a fresh address (so the per-recipient limit never carries over). */
function lead(patch: Partial<LeadCreateInput> = {}): LeadCreateInput {
  counter += 1
  return {
    audience: "private",
    need: "inner_coaching",
    timeline: "month",
    message: "I have just become a manager and want to find my own way of leading.",
    name: "Vic Visitor",
    email: `Visitor${counter}@Example.com`,
    contactMethod: "email",
    consent: true,
    page: "/kontakt",
    ...patch,
  }
}

const idOf = (reference: string) => Number(reference.replace(/^LEAD-/, ""))

/** A client with its own x-api-client-id, as the www action sends one per browser ip. */
function clientWithId(target: { server: { url: URL } }, clientId: string): ApiClient {
  return createORPCClient(
    new RPCLink({
      url: new URL("/rpc", target.server.url).href,
      headers: { ...auth, "x-api-client-id": clientId },
    })
  )
}

let app: Awaited<ReturnType<typeof start>>
let root: Awaited<ReturnType<typeof signUpVerified>>
/** A second connection to the server's own database, to back-date a row for the prune test. */
let raw: SQL
let cleanup: () => Promise<void>
const clock = { offset: 0 }

beforeAll(async () => {
  let databaseUrl: string
  if (Bun.env.TEST_DATABASE_URL) {
    const db = await testDatabase()
    databaseUrl = db.url
    cleanup = db.cleanup
  } else {
    const dir = await mkdtemp(join(tmpdir(), "leads-"))
    databaseUrl = `sqlite://${join(dir, "t.db")}`
    cleanup = () => rm(dir, { recursive: true, force: true })
  }
  app = await start({
    databaseUrl,
    bookingEmail: BOOKING,
    supportEmail: "help@example.com",
    superadminEmails: [ROOT],
    leadsLimiter: open(),
    leadsRecipientLimiter: open(),
    leadsGlobalLimiter: open(),
    now: () => new Date(Date.now() + clock.offset),
  })
  raw = new SQL(databaseUrl)
  root = await signUpVerified(app, ROOT)
})
afterAll(async () => {
  await app.stop()
  await raw.close()
  await cleanup()
})

describe("leads.create", () => {
  test("stores the lead and queues both mails: to Yasmina (reply-to the sender) and a copy", async () => {
    const input = lead({
      audience: "organisation",
      organisation: "Analytical Engines AB",
      role: "Head of unit",
      phone: "+46 70 123 45 67",
      contactMethod: "phone",
      newsletter: true,
    })
    const { reference } = await clientFor(app, undefined, "sv").leads.create(input)
    expect(reference).toMatch(/^LEAD-\d+$/)
    const row = await app.db.leads.find(idOf(reference))
    expect(row).toMatchObject({
      audience: "organisation",
      need: "inner_coaching",
      timeline: "month",
      message: input.message,
      name: "Vic Visitor",
      email: input.email.toLowerCase(),
      phone: "+46 70 123 45 67",
      organisation: "Analytical Engines AB",
      role: "Head of unit",
      contact_method: "phone",
      newsletter: true,
      locale: "sv",
      page: "/kontakt",
      ip_hash: "test-client",
      status: "new",
      notes: null,
      status_changed_by: null,
    })
    expect(row?.consent_at).toBe(row?.created_at)
    // Twelve months later, to the day.
    const created = new Date(row?.created_at ?? "")
    const deleteAt = new Date(row?.delete_after ?? "")
    expect(deleteAt.getUTCFullYear() - created.getUTCFullYear()).toBe(1)
    expect(deleteAt.getUTCMonth()).toBe(created.getUTCMonth())

    const [toYasmina] = await mailsTo(
      app,
      BOOKING,
      leadNewSubject(reference, "Ledarskap inifrån: coaching")
    )
    expect(toYasmina?.replyTo).toBe(input.email.toLowerCase())
    expect(toYasmina?.text).toContain(`http://auth.example.com/admin/leads/${idOf(reference)}`)
    expect(toYasmina?.text).toContain(input.message)
    expect(toYasmina?.text).toContain("Analytical Engines AB")
    expect(toYasmina?.text).toContain("Newsletter: Yes")

    // The copy is in the request's locale (Swedish), says the next step, and never repeats the
    // sender's own text.
    await app.drain()
    const copy = app.mailer.sent.filter((m) => m.to === input.email.toLowerCase())
    expect(copy).toHaveLength(1)
    expect(copy[0]?.subject).not.toBe(leadReceivedSubject(reference))
    expect(copy[0]?.subject).toContain(reference)
    expect(copy[0]?.replyTo).toBe(BOOKING)
    expect(copy[0]?.text).toContain(`${siteUrl("www")}/book/inner_start_coaching`)
    for (const part of [copy[0]?.text ?? "", copy[0]?.html ?? ""]) {
      expect(part).not.toContain("just become a manager")
      expect(part).not.toContain("Vic")
      expect(part).not.toContain("Analytical Engines")
    }
  })

  test("without x-locale the copy is in English, and the next step follows the answers", async () => {
    const input = lead({ need: "talk", audience: "organisation", organisation: "Acme" })
    const { reference } = await clientFor(app).leads.create(input)
    const [copy] = await mailsTo(app, input.email.toLowerCase(), leadReceivedSubject(reference))
    expect(copy?.text).toContain(`${siteUrl("www")}/book/keynote`)
    expect(copy?.text).toContain("Suggest dates")
    expect((await app.db.leads.find(idOf(reference)))?.locale).toBeNull()
  })

  test("a private person's organisation and role are dropped; empty optionals are null", async () => {
    const { reference } = await clientFor(app).leads.create(
      lead({ organisation: "Should not stay", role: "Neither", message: "  ", phone: "" })
    )
    expect(await app.db.leads.find(idOf(reference))).toMatchObject({
      organisation: null,
      role: null,
      message: null,
      phone: null,
      newsletter: false,
    })
  })

  test("an invalid page is dropped, not refused", async () => {
    for (const page of [
      "https://evil.example/x",
      "//evil.example",
      "/Upper",
      `/${"a".repeat(200)}`,
    ]) {
      const { reference } = await clientFor(app).leads.create(lead({ page }))
      expect((await app.db.leads.find(idOf(reference)))?.page).toBeNull()
    }
  })

  test("each invalid answer is BAD_REQUEST and stores nothing", async () => {
    const bad: Array<Record<string, unknown>> = [
      { email: "nope" },
      { need: "sales" },
      { consent: false },
      { name: "" },
      { message: "x".repeat(2001) },
      { audience: "organisation" },
      { contactMethod: "phone" },
    ]
    await app.drain()
    for (const patch of bad) {
      const before = app.mailer.sent.length
      const [err] = await safe(
        clientFor(app).leads.create({ ...lead(), ...patch } as LeadCreateInput)
      )
      expect({ patch, code: (err as { code?: string })?.code }).toEqual({
        patch,
        code: "BAD_REQUEST",
      })
      await app.drain()
      expect(app.mailer.sent.length).toBe(before)
    }
  })

  test("records lead_submitted with the answers only, never who sent it", async () => {
    await clientFor(app).leads.create(lead({ need: "team", timeline: "quarter" }))
    await app.drain()
    const day = new Date().toISOString().slice(0, 10)
    const events = (await app.db.analytics.eventsForDay(day)).filter(
      (e) => e.name === "lead_submitted"
    )
    const last = events.at(-1)
    expect(last).toMatchObject({ user_id: null, workspace_id: null, source: "api" })
    expect(JSON.parse(String(last?.props))).toEqual({
      audience: "private",
      need: "team",
      timeline: "quarter",
    })
  })

  test("the per-client limit trips on the 6th request, before anything is stored", async () => {
    const own = await start({ bookingEmail: BOOKING })
    try {
      const c = clientWithId(own, "anon:one")
      for (let i = 0; i < 5; i++) await c.leads.create(lead())
      const [err] = await safe(c.leads.create(lead()))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS", message: LEAD_RATE_MESSAGE })
      expect(await own.db.leads.find(6)).toBeUndefined()
      const other = await clientWithId(own, "anon:two").leads.create(lead())
      expect(idOf(other.reference)).toBe(6)
    } finally {
      await own.stop()
    }
  })

  test("the per-recipient limit trips on the 4th request to one address, from any client", async () => {
    const own = await start({ bookingEmail: BOOKING })
    try {
      const emails = ["target@example.com", "Target@Example.com", " TARGET@example.com "]
      for (const [i, email] of emails.entries()) {
        await clientWithId(own, `anon:r${i}`).leads.create(lead({ email }))
      }
      const [err] = await safe(
        clientWithId(own, "anon:r9").leads.create(lead({ email: "target@example.com" }))
      )
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS", message: LEAD_RATE_MESSAGE })
      await own.drain()
      expect(own.mailer.sent.filter((m) => m.to === "target@example.com")).toHaveLength(3)
    } finally {
      await own.stop()
    }
  })

  test("the api-wide cap refuses every client once it trips, in the caller's language", async () => {
    const own = await start({
      bookingEmail: BOOKING,
      leadsGlobalLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      await clientWithId(own, "anon:a").leads.create(lead())
      await clientWithId(own, "anon:b").leads.create(lead())
      const [err] = await safe(clientWithId(own, "anon:c").leads.create(lead()))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      const [sv] = await safe(clientFor(own, undefined, "sv").leads.create(lead()))
      expect(sv).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: "För många förfrågningar, försök igen senare.",
      })
      expect(await own.db.leads.find(3)).toBeUndefined()
    } finally {
      await own.stop()
    }
  })

  test("without bookingEmail the lead goes wherever support requests go", async () => {
    const own = await start({ supportEmail: "help@example.com" })
    try {
      const { reference } = await clientFor(own).leads.create(lead({ need: "coaching" }))
      await mailsTo(
        own,
        "help@example.com",
        leadNewSubject(reference, "Leadership coaching, one to one")
      )
    } finally {
      await own.stop()
    }
  })
})

describe("admin.leads", () => {
  test("anyone but a superadmin gets NOT_FOUND", async () => {
    const user = await signUpVerified(app)
    const { reference } = await clientFor(app).leads.create(lead())
    const calls: Array<() => Promise<unknown>> = [
      () => user.client.admin.leads.list({}),
      () => user.client.admin.leads.get({ id: idOf(reference) }),
      () => user.client.admin.leads.update({ id: idOf(reference), status: "won" }),
    ]
    for (const call of calls) {
      const [err] = await safe(call())
      expect((err as { code?: string })?.code).toBe("NOT_FOUND")
    }
  })

  test("list: newest first, every status by default, a status filter and counts per status", async () => {
    const a = await clientFor(app).leads.create(lead())
    const b = await clientFor(app).leads.create(lead())
    await root.client.admin.leads.update({ id: idOf(b.reference), status: "contacted" })

    const all = await root.client.admin.leads.list({})
    const ids = all.items.map((x) => x.id)
    expect(ids.indexOf(idOf(b.reference))).toBeLessThan(ids.indexOf(idOf(a.reference)))
    const contacted = await root.client.admin.leads.list({ status: "contacted" })
    expect(contacted.items.map((x) => x.id)).toContain(idOf(b.reference))
    expect(contacted.items.map((x) => x.id)).not.toContain(idOf(a.reference))
    expect(all.counts.contacted).toBeGreaterThanOrEqual(1)
    expect(all.counts.new).toBeGreaterThanOrEqual(1)
    expect(Object.keys(all.counts).sort()).toEqual(
      ["call_booked", "contacted", "lost", "new", "won"].sort()
    )
    expect(contacted.counts).toEqual(all.counts)
  })

  test("get shapes the lead: reference, answers, consent and who set the status", async () => {
    const { reference } = await clientFor(app).leads.create(
      lead({ audience: "organisation", organisation: "Acme", role: "HR", newsletter: true })
    )
    await root.client.admin.leads.update({ id: idOf(reference), status: "call_booked" })
    const got = await root.client.admin.leads.get({ id: idOf(reference) })
    expect(got).toMatchObject({
      id: idOf(reference),
      reference,
      audience: "organisation",
      need: "inner_coaching",
      timeline: "month",
      organisation: "Acme",
      role: "HR",
      contactMethod: "email",
      newsletter: true,
      page: "/kontakt",
      status: "call_booked",
      statusChangedBy: { id: root.user.id, email: ROOT },
    })
    const [err] = await safe(root.client.admin.leads.get({ id: 999_999 }))
    expect((err as { code?: string })?.code).toBe("NOT_FOUND")
  })

  test("update: a status change is audited with from/to; the same status again is a no-op", async () => {
    const { reference } = await clientFor(app).leads.create(lead())
    const id = idOf(reference)
    await root.client.admin.leads.update({ id, status: "contacted" })
    await root.client.admin.leads.update({ id, status: "contacted" })
    const { items } = await root.client.admin.audit.list({
      targetType: "lead",
      targetId: String(id),
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      action: "lead.updated",
      actor: { id: root.user.id },
      metadata: { from: "new", to: "contacted" },
    })
  })

  test("update: notes are saved (empty clears them) and audited without their text", async () => {
    const { reference } = await clientFor(app).leads.create(lead())
    const id = idOf(reference)
    await root.client.admin.leads.update({ id, notes: "  Called Tuesday, follow up in May.  " })
    expect((await app.db.leads.find(id))?.notes).toBe("Called Tuesday, follow up in May.")
    const { items } = await root.client.admin.audit.list({
      targetType: "lead",
      targetId: String(id),
    })
    const entry = items[0]
    expect(entry).toMatchObject({ action: "lead.updated", metadata: { notes: true } })
    expect(JSON.stringify(entry)).not.toContain("Called Tuesday")
    await root.client.admin.leads.update({ id, notes: "" })
    expect((await app.db.leads.find(id))?.notes).toBeNull()
    const [err] = await safe(root.client.admin.leads.update({ id: 999_999, status: "won" }))
    expect((err as { code?: string })?.code).toBe("NOT_FOUND")
  })
})

describe("leads.prune", () => {
  test("deletes leads past delete_after; keeps the rest", async () => {
    const expired = await clientFor(app).leads.create(lead())
    const kept = await clientFor(app).leads.create(lead())
    await raw.unsafe(
      `UPDATE leads SET delete_after = '2026-01-01T00:00:00.000Z' WHERE id = ${idOf(expired.reference)}`
    )
    await app.enqueue(leadsPruneJob, {})
    await app.drain()
    expect(await app.db.leads.find(idOf(expired.reference))).toBeUndefined()
    expect(await app.db.leads.find(idOf(kept.reference))).toBeDefined()
  })

  test("twelve months on, the worker's clock expires everything sent today", async () => {
    const { reference } = await clientFor(app).leads.create(lead())
    clock.offset = 370 * DAY
    try {
      await app.enqueue(leadsPruneJob, {})
      await app.drain()
    } finally {
      clock.offset = 0
    }
    expect(await app.db.leads.find(idOf(reference))).toBeUndefined()
  })
})

describe("the data export", () => {
  test("lists the leads sent from the account's verified address only, never Yasmina's notes", async () => {
    const user = await signUpVerified(app)
    const { reference } = await clientFor(app).leads.create(
      lead({ email: user.email.toUpperCase() })
    )
    await root.client.admin.leads.update({ id: idOf(reference), notes: "Private note about Vic" })
    await clientFor(app).leads.create(lead({ email: "someone-else@example.com" }))
    await user.client.account.export.request()
    await app.drain()
    const ready = await user.client.account.export.get()
    if (!ready) throw new Error("no export")
    const text = await (await user.client.account.export.download({ id: ready.id })).text()
    expect(JSON.parse(text).leads).toEqual([
      {
        reference,
        audience: "private",
        need: "inner_coaching",
        timeline: "month",
        message: expect.any(String),
        name: "Vic Visitor",
        email: user.email,
        phone: null,
        organisation: null,
        role: null,
        contactMethod: "email",
        consentAt: expect.any(String),
        newsletter: false,
        status: "new",
        createdAt: expect.any(String),
      },
    ])
    expect(text).not.toContain("Private note about Vic")

    const unverified = await signUp(app)
    await clientFor(app).leads.create(lead({ email: unverified.email }))
    await unverified.client.account.export.request()
    await app.drain()
    const pending = await unverified.client.account.export.get()
    if (!pending) throw new Error("no export")
    const theirs = await unverified.client.account.export.download({ id: pending.id })
    expect(JSON.parse(await theirs.text()).leads).toEqual([])
  })

  test("a superadmin who set a status is unlinked when their account is purged", async () => {
    const admin = await signUpVerified(app, "leads-root-2@example.com")
    const { reference } = await clientFor(app).leads.create(lead())
    await raw.unsafe(
      `UPDATE leads SET status_changed_by = ${admin.user.id}, status = 'won' WHERE id = ${idOf(reference)}`
    )
    await app.db.transaction((tx) => tx.users.purge(admin.user.id, new Date().toISOString()))
    expect(await app.db.leads.find(idOf(reference))).toMatchObject({
      status: "won",
      status_changed_by: null,
    })
  })
})
