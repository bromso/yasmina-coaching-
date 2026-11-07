import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { waitlistWelcomeSubject } from "@repo/email"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { clientFor, mailsTo, start } from "./test-server"

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

describe("waitlist.join", () => {
  test("a new email joins, is stored once and gets the welcome mail; a repeat answers alike with no second mail", async () => {
    const anon = clientFor(app)
    expect(await anon.waitlist.join({ email: "Ada@Example.com " })).toEqual({ joined: true })
    await app.drain()
    const [mail] = await mailsTo(app, "ada@example.com", waitlistWelcomeSubject)
    expect(mail?.text).toContain("http://www.")
    expect(await anon.waitlist.join({ email: "ada@example.com" })).toEqual({ joined: true })
    await app.drain()
    expect(
      app.mailer.sent.filter(
        (m) => m.to === "ada@example.com" && m.subject === waitlistWelcomeSubject
      )
    ).toHaveLength(1)
    expect(await app.db.waitlist.count()).toBe(1)
  })

  test("source defaults to www and is stored", async () => {
    await clientFor(app).waitlist.join({ email: "default@example.com" })
    await clientFor(app).waitlist.join({ email: "src@example.com", source: "docs" })
    expect((await app.db.waitlist.find("default@example.com"))?.source).toBe("www")
    expect((await app.db.waitlist.find("src@example.com"))?.source).toBe("docs")
  })

  test("the limiter trips on the 6th call from one client, before anything is stored", async () => {
    const own = await start({
      waitlistLimiter: createMemoryRateLimiter({ limit: 5, windowMs: 60_000 }),
    })
    try {
      const c = clientFor(own)
      for (let i = 0; i < 5; i++) await c.waitlist.join({ email: `w${i}@example.com` })
      const [err] = await safe(c.waitlist.join({ email: "w6@example.com" }))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      expect(await own.db.waitlist.find("w6@example.com")).toBeUndefined()
      expect(await own.db.waitlist.count()).toBe(5)
    } finally {
      await own.stop()
    }
  })

  test("an invalid email is BAD_REQUEST and stores nothing", async () => {
    const before = await app.db.waitlist.count()
    const [err] = await safe(clientFor(app).waitlist.join({ email: "nope" }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
    expect(await app.db.waitlist.count()).toBe(before)
  })
})
