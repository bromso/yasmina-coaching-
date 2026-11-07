import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { safe } from "@orpc/client"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { siteDomain, siteUrl } from "@repo/sites"
import { clientFor, start } from "../test-server"
import { toForwardItem } from "./ingest"
import type { AnalyticsProvider, ForwardItem } from "./providers/provider"

const today = () => new Date().toISOString().slice(0, 10)

describe("toForwardItem", () => {
  test("a pageview carries app/path/referrerHost/visitorId/userId/workspaceId/uuid", () => {
    expect(
      toForwardItem(
        {
          kind: "pageview",
          app: "www",
          path: "/pricing",
          referrerHost: "google.com",
          visitorId: "v1",
          userId: 7,
          workspaceId: 9,
        },
        "2026-10-06T12:00:00.000Z",
        "11111111-1111-1111-1111-111111111111"
      )
    ).toEqual({
      kind: "pageview",
      app: "www",
      path: "/pricing",
      referrerHost: "google.com",
      visitorId: "v1",
      userId: 7,
      workspaceId: 9,
      at: "2026-10-06T12:00:00.000Z",
      uuid: "11111111-1111-1111-1111-111111111111",
    })
  })

  test("an event keeps source (Plausible needs it) and workspaceId", () => {
    expect(
      toForwardItem(
        {
          kind: "event",
          name: "pricing_viewed",
          source: "www",
          props: {},
          visitorId: "v1",
          userId: null,
          workspaceId: null,
        },
        "2026-10-06T12:00:01.000Z",
        "22222222-2222-2222-2222-222222222222"
      )
    ).toEqual({
      kind: "event",
      name: "pricing_viewed",
      source: "www",
      props: {},
      visitorId: "v1",
      userId: null,
      workspaceId: null,
      at: "2026-10-06T12:00:01.000Z",
      uuid: "22222222-2222-2222-2222-222222222222",
    })
  })
})

let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start()
})
afterAll(() => app.stop())

describe("analytics.ingest", () => {
  test("a pageview with ip/ua stores a 16-hex visitor_id and never an ip or user agent", async () => {
    // Computed before the request, not after: a midnight rollover between the two would otherwise
    // have the query look at the wrong day's bucket.
    const day = today()
    await clientFor(app).analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/pv-test",
      ip: "203.0.113.5",
      userAgent: "TestAgent/1.0 (visitor)",
    })
    const rows = await app.db.analytics.pageviewsForDay(day)
    const row = rows.find((r) => r.path === "/pv-test")
    expect(row?.visitor_id).toMatch(/^[0-9a-f]{16}$/)
    const serialised = JSON.stringify(row)
    expect(serialised).not.toContain("203.0.113.5")
    expect(serialised).not.toContain("TestAgent")
  })

  test("same ip/ua/app/day hash to the same visitor id; another app or ip differs", async () => {
    const day = today()
    const ip = "203.0.113.9"
    const userAgent = "SameUA/1.0"
    const client = clientFor(app)
    await client.analytics.ingest({ app: "www", kind: "pageview", path: "/same-a", ip, userAgent })
    await client.analytics.ingest({ app: "www", kind: "pageview", path: "/same-b", ip, userAgent })
    await client.analytics.ingest({ app: "app", kind: "pageview", path: "/same-c", ip, userAgent })
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/same-d",
      ip: "203.0.113.10",
      userAgent,
    })
    const rows = await app.db.analytics.pageviewsForDay(day)
    const visitorFor = (path: string) => rows.find((r) => r.path === path)?.visitor_id
    const a = visitorFor("/same-a")
    expect(a).toBeTruthy()
    expect(visitorFor("/same-b")).toBe(a)
    expect(visitorFor("/same-c")).not.toBe(a)
    expect(visitorFor("/same-d")).not.toBe(a)
  })

  test("an opaque path segment collapses to :id and the query string is dropped", async () => {
    const day = today()
    await clientFor(app).analytics.ingest({
      app: "app",
      kind: "pageview",
      path: "/invitations/abc123def456ghi789?token=x",
    })
    const rows = await app.db.analytics.pageviewsForDay(day)
    expect(rows.some((r) => r.path === "/invitations/:id")).toBe(true)
  })

  test("a path without a leading slash is refused (never collapses to an empty path)", async () => {
    const [bareQuery] = await safe(
      clientFor(app).analytics.ingest({ app: "www", kind: "pageview", path: "?token=x" })
    )
    expect(bareQuery).toMatchObject({ code: "BAD_REQUEST" })
    const [noSlash] = await safe(
      clientFor(app).analytics.ingest({ app: "www", kind: "pageview", path: "pricing" })
    )
    expect(noSlash).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("referrerHost: same-site and any of our own apps dropped, a junk value dropped, another site's host kept", async () => {
    const day = today()
    const ownHost = new URL(siteUrl("www")).hostname
    const client = clientFor(app)
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ref-same",
      referrerHost: ownHost,
    })
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ref-junk",
      referrerHost: "Not A Host!",
    })
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ref-other",
      referrerHost: "google.com",
    })
    // Another of our own apps (www → app), and the parent domain itself: not external referrals.
    const appHost = new URL(siteUrl("app")).hostname
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ref-sibling",
      referrerHost: appHost,
    })
    await client.analytics.ingest({
      app: "app",
      kind: "pageview",
      path: "/ref-parent",
      referrerHost: siteDomain(),
    })
    // A host that merely ends with the domain's text, without the dot, is someone else's.
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ref-lookalike",
      referrerHost: `evil${siteDomain()}`,
    })
    const rows = await app.db.analytics.pageviewsForDay(day)
    const referrerFor = (path: string) => rows.find((r) => r.path === path)?.referrer_host
    expect(referrerFor("/ref-sibling")).toBeNull()
    expect(referrerFor("/ref-parent")).toBeNull()
    expect(referrerFor("/ref-lookalike")).toBe(`evil${siteDomain()}`)
    expect(referrerFor("/ref-same")).toBeNull()
    expect(referrerFor("/ref-junk")).toBeNull()
    expect(referrerFor("/ref-other")).toBe("google.com")
  })

  test("a client event is stored; a server-only event, an unknown name and a bad prop are refused", async () => {
    const day = today()
    const client = clientFor(app)
    await client.analytics.ingest({ app: "www", kind: "event", name: "pricing_viewed" })
    const rows = await app.db.analytics.eventsForDay(day)
    expect(rows.some((r) => r.name === "pricing_viewed" && r.source === "www")).toBe(true)

    const [serverOnly] = await safe(
      client.analytics.ingest({
        app: "api",
        kind: "event",
        name: "signed_up",
        props: { method: "password" },
      })
    )
    expect(serverOnly).toMatchObject({ code: "BAD_REQUEST" })

    const [unknown] = await safe(
      client.analytics.ingest({ app: "www", kind: "event", name: "nonexistent_event" })
    )
    expect(unknown).toMatchObject({ code: "BAD_REQUEST" })

    const [badProp] = await safe(
      client.analytics.ingest({
        app: "www",
        kind: "event",
        name: "pricing_viewed",
        props: { nope: 1 },
      })
    )
    expect(badProp).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("a pageview with no path is refused", async () => {
    const [error] = await safe(clientFor(app).analytics.ingest({ app: "www", kind: "pageview" }))
    expect(error).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("userId/workspaceId are stored only when the request sends them", async () => {
    const day = today()
    const client = clientFor(app)
    await client.analytics.ingest({ app: "www", kind: "pageview", path: "/ids-without" })
    await client.analytics.ingest({
      app: "www",
      kind: "pageview",
      path: "/ids-with",
      userId: 7,
      workspaceId: 9,
    })
    const rows = await app.db.analytics.pageviewsForDay(day)
    const without = rows.find((r) => r.path === "/ids-without")
    const withIds = rows.find((r) => r.path === "/ids-with")
    expect(without?.user_id).toBeNull()
    expect(without?.workspace_id).toBeNull()
    expect(Number(withIds?.user_id)).toBe(7)
    expect(Number(withIds?.workspace_id)).toBe(9)
  })

  test("needs the service token", async () => {
    const res = await fetch(new URL("/openapi/analytics/ingest", app.server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "www", kind: "pageview", path: "/" }),
    })
    expect(res.status).toBe(401)
  })

  test("limiter: a tripped analyticsLimiter answers success without storing anything", async () => {
    const limited = await start({
      analyticsLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const day = today()
      const client = clientFor(limited)
      await client.analytics.ingest({ app: "www", kind: "pageview", path: "/limiter-a" })
      await client.analytics.ingest({ app: "www", kind: "pageview", path: "/limiter-b" })
      await expect(
        client.analytics.ingest({ app: "www", kind: "pageview", path: "/limiter-c" })
      ).resolves.toBeUndefined()
      const rows = await limited.db.analytics.pageviewsForDay(day)
      expect(rows.map((r) => r.path).sort()).toEqual(["/limiter-a", "/limiter-b"])
    } finally {
      await limited.stop()
    }
  })

  test("limiter: a tripped analyticsAppLimiter also answers success without storing anything", async () => {
    const limited = await start({
      analyticsAppLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const day = today()
      const client = clientFor(limited)
      await client.analytics.ingest({ app: "www", kind: "pageview", path: "/app-limiter-a" })
      await client.analytics.ingest({ app: "www", kind: "pageview", path: "/app-limiter-b" })
      await expect(
        client.analytics.ingest({ app: "www", kind: "pageview", path: "/app-limiter-c" })
      ).resolves.toBeUndefined()
      const rows = await limited.db.analytics.pageviewsForDay(day)
      expect(rows.map((r) => r.path).sort()).toEqual(["/app-limiter-a", "/app-limiter-b"])
    } finally {
      await limited.stop()
    }
  })

  test("concurrent saltFor(day) calls create exactly one salt row, all equal", async () => {
    // A day untouched by any ip/ua pageview above, so this is not racing those inserts too.
    const day = "2030-01-01"
    const salts = await Promise.all(Array.from({ length: 10 }, () => app.db.analytics.saltFor(day)))
    expect(new Set(salts).size).toBe(1)
    expect(salts[0]).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a store provider (the default) enqueues no analytics.forward job", async () => {
    await clientFor(app).analytics.ingest({ app: "www", kind: "pageview", path: "/store-only" })
    await app.drain()
    expect((await app.db.jobs.counts()).succeeded).toBe(0)
  })

  test("a non-store provider gets an analytics.forward job for the stored row", async () => {
    const forwarded: ForwardItem[] = []
    const analytics: AnalyticsProvider = {
      kind: "posthog",
      forward: async (item) => void forwarded.push(item),
    }
    const withProvider = await start({ analytics })
    try {
      await clientFor(withProvider).analytics.ingest({
        app: "www",
        kind: "pageview",
        path: "/forwarded",
        referrerHost: "google.com",
      })
      await withProvider.drain()
      expect(forwarded).toHaveLength(1)
      expect(forwarded[0]).toMatchObject({
        kind: "pageview",
        app: "www",
        path: "/forwarded",
        referrerHost: "google.com",
      })
      expect(forwarded[0]?.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      )
    } finally {
      await withProvider.stop()
    }
  })
})
