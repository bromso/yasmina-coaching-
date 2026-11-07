import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { type ApiClient, SUPPORT_RATE_MESSAGE } from "@repo/api-contract"
import { supportReceivedSubject, supportRequestSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { newToken, tokenHash } from "./credentials"
import { auth, clientFor, mailsTo, signUpVerified, signUpWithWorkspace, start } from "./test-server"

const ROOT = "support-root@example.com"
const SUPPORT = "help@example.com"
const valid = {
  email: "Visitor@Example.com",
  name: "Vic",
  topic: "billing" as const,
  message: "My invoice looks wrong, please help.",
  page: "/billing/invoices",
}

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({
    supportEmail: SUPPORT,
    superadminEmails: [ROOT],
    supportLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    supportRecipientLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    supportGlobalLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
  })
})
afterAll(() => app.stop())

const idOf = (reference: string) => Number(reference.replace(/^HELP-/, ""))

/** A client with its own x-api-client-id, as the help action sends one per browser ip. */
function clientWithId(
  target: { server: { url: URL } },
  clientId: string,
  sessionToken?: string
): ApiClient {
  const headers: Record<string, string> = { ...auth, "x-api-client-id": clientId }
  if (sessionToken) headers["x-session-token"] = sessionToken
  return createORPCClient(new RPCLink({ url: new URL("/rpc", target.server.url).href, headers }))
}

describe("support.create", () => {
  test("stores the request and queues both mails: to support (reply-to the sender) and a copy", async () => {
    const { reference } = await clientFor(app, undefined, "sv").support.create(valid)
    expect(reference).toMatch(/^HELP-\d+$/)
    const row = await app.db.support.find(idOf(reference))
    expect(row).toMatchObject({
      email: "visitor@example.com",
      name: "Vic",
      topic: "billing",
      message: valid.message,
      page: "/billing/invoices",
      user_id: null,
      ip_hash: "test-client",
      status: "open",
      resolved_at: null,
      resolved_by: null,
    })

    const [toSupport] = await mailsTo(app, SUPPORT, supportRequestSubject(reference, "billing"))
    expect(toSupport?.replyTo).toBe("visitor@example.com")
    expect(toSupport?.text).toContain("http://auth.example.com/admin/support")
    expect(toSupport?.text).toContain(valid.message)
    expect(toSupport?.text).toContain("/billing/invoices")

    // The copy is in the request's locale (Swedish here), so it is not the English subject.
    await app.drain()
    const copy = app.mailer.sent.filter((m) => m.to === "visitor@example.com")
    expect(copy).toHaveLength(1)
    expect(copy[0]?.subject).not.toBe(supportReceivedSubject(reference))
    expect(copy[0]?.subject).toContain(reference)
    // A reply to the confirmation reaches the support inbox, not a no-reply address.
    expect(copy[0]?.replyTo).toBe(SUPPORT)
    // The copy goes to any typed address: it carries the reference only, never the sender's text.
    for (const part of [copy[0]?.text ?? "", copy[0]?.html ?? ""]) {
      expect(part).not.toContain("My invoice looks wrong")
      expect(part).not.toContain("Vic")
      expect(part).not.toContain("/billing/invoices")
    }
  })

  test("without x-locale the copy is in English", async () => {
    const email = "english@example.com"
    const { reference } = await clientFor(app).support.create({ ...valid, email })
    await mailsTo(app, email, supportReceivedSubject(reference))
  })

  test("an invalid page is dropped, not refused; name and page are optional", async () => {
    for (const page of [
      "https://evil.example/x",
      "//evil.example",
      "/Upper",
      `/${"a".repeat(200)}`,
    ]) {
      const { reference } = await clientFor(app).support.create({ ...valid, page })
      expect((await app.db.support.find(idOf(reference)))?.page).toBeNull()
    }
    const { email, topic, message } = valid
    const { reference } = await clientFor(app).support.create({ email, topic, message })
    expect(await app.db.support.find(idOf(reference))).toMatchObject({ name: null, page: null })
  })

  test("each invalid field is BAD_REQUEST and stores nothing", async () => {
    const bad: Array<Record<string, unknown>> = [
      { email: "nope" },
      { topic: "sales" },
      { message: "short" },
      { message: "x".repeat(5001) },
      { name: "x".repeat(101) },
    ]
    await app.drain()
    for (const patch of bad) {
      const before = app.mailer.sent.length
      const [err] = await safe(
        clientFor(app).support.create({ ...valid, ...patch } as typeof valid)
      )
      expect({ patch, code: (err as { code?: string })?.code }).toEqual({
        patch,
        code: "BAD_REQUEST",
      })
      await app.drain()
      expect(app.mailer.sent.length).toBe(before)
    }
  })

  test("a signed-in caller's request is linked to them; no session or a dead one is not", async () => {
    const user = await signUpVerified(app)
    const linked = await clientFor(app, user.token).support.create(valid)
    expect((await app.db.support.find(idOf(linked.reference)))?.user_id).toBe(user.user.id)
    const anon = await clientFor(app).support.create(valid)
    expect((await app.db.support.find(idOf(anon.reference)))?.user_id).toBeNull()
    const dead = await clientFor(app, "not-a-session").support.create(valid)
    expect((await app.db.support.find(idOf(dead.reference)))?.user_id).toBeNull()
  })

  test("a real session past its expires_at does not link the request", async () => {
    const user = await signUpVerified(app)
    const token = newToken()
    await app.db.sessions.create({
      userId: user.user.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      userAgent: null,
      ip: null,
      impersonatedBy: null,
    })
    const { reference } = await clientFor(app, token).support.create(valid)
    expect((await app.db.support.find(idOf(reference)))?.user_id).toBeNull()
  })

  test("an impersonation session never links the request", async () => {
    const root = await signUpVerified(app, ROOT)
    const owner = await signUpWithWorkspace(app)
    const { token } = await root.client.admin.users.impersonate({
      id: owner.user.id,
      reason: "support",
      client: { userAgent: "AdminBrowser/1", ip: "203.0.113.7" },
    })
    const { reference } = await clientFor(app, token).support.create(valid)
    expect((await app.db.support.find(idOf(reference)))?.user_id).toBeNull()
  })

  test("the per-client limit trips on the 6th request, before anything is stored", async () => {
    const own = await start({ supportEmail: SUPPORT })
    try {
      const c = clientWithId(own, "anon:one")
      for (let i = 0; i < 5; i++) await c.support.create({ ...valid, email: `c${i}@example.com` })
      const [err] = await safe(c.support.create({ ...valid, email: "c5@example.com" }))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS", message: SUPPORT_RATE_MESSAGE })
      // Another browser still gets through.
      const other = await clientWithId(own, "anon:two").support.create({
        ...valid,
        email: "other@example.com",
      })
      expect(idOf(other.reference)).toBe(6)
    } finally {
      await own.stop()
    }
  })

  test("the api-wide cap refuses every client once it trips", async () => {
    const own = await start({
      supportEmail: SUPPORT,
      supportGlobalLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const to = (email: string) => ({ ...valid, email })
      await clientWithId(own, "anon:a").support.create(to("a@example.com"))
      await clientWithId(own, "anon:b").support.create(to("b@example.com"))
      const [err] = await safe(clientWithId(own, "anon:c").support.create(to("c@example.com")))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      const [sv] = await safe(
        createORPCClient<ApiClient>(
          new RPCLink({
            url: new URL("/rpc", own.server.url).href,
            headers: { ...auth, "x-api-client-id": "anon:d", "x-locale": "sv" },
          })
        ).support.create(to("d@example.com"))
      )
      expect(sv).toMatchObject({
        code: "TOO_MANY_REQUESTS",
        message: "För många förfrågningar – försök igen senare.",
      })
      expect(await own.db.support.find(3)).toBeUndefined()
    } finally {
      await own.stop()
    }
  })

  test("the per-recipient limit trips on the 4th request to one address, from any client", async () => {
    const own = await start({ supportEmail: SUPPORT })
    try {
      // Three browsers, one target address (any case): the confirmation mail is what is capped.
      const emails = ["target@example.com", "Target@Example.com", " TARGET@example.com "]
      for (const [i, email] of emails.entries()) {
        await clientWithId(own, `anon:r${i}`).support.create({ ...valid, email })
      }
      const [err] = await safe(
        clientWithId(own, "anon:r9").support.create({ ...valid, email: "target@example.com" })
      )
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS", message: SUPPORT_RATE_MESSAGE })
      expect(await own.db.support.find(4)).toBeUndefined()
      await own.drain()
      expect(own.mailer.sent.filter((m) => m.to === "target@example.com")).toHaveLength(3)
      // Another address still gets through.
      const next = await clientWithId(own, "anon:r9").support.create({
        ...valid,
        email: "someone-else@example.com",
      })
      expect(idOf(next.reference)).toBe(4)
    } finally {
      await own.stop()
    }
  })

  test("without supportEmail the request goes to MAIL_FROM's dev address", async () => {
    const own = await start()
    try {
      const { reference } = await clientFor(own).support.create(valid)
      await mailsTo(own, "no-reply@brand.localhost", supportRequestSubject(reference, "billing"))
    } finally {
      await own.stop()
    }
  })
})
