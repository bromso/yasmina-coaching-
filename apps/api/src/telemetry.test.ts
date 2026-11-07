import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import type { ErrorRow } from "./queries/telemetry"
import type { TelemetryProvider } from "./telemetry/provider"
import { recordServerError } from "./telemetry/record"
import { auth, clientFor, start } from "./test-server"

const forwarded: ErrorRow[] = []
const spy: TelemetryProvider = {
  kind: "sentry",
  onNewError: async (row) => {
    forwarded.push(row)
  },
}
let app: Awaited<ReturnType<typeof start>>
beforeAll(async () => {
  app = await start({ telemetry: spy })
})
afterAll(() => app.stop())

const waitFor = async (check: () => boolean | Promise<boolean>, ms = 2_000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(5)
  }
}
const boom = (message: string, stack = "Error: x\n    at render (app.js:1:1)") => ({
  kind: "boundary" as const,
  message,
  stack,
  route: "/notes",
})

describe("telemetry.ingest", () => {
  test("stores errors per fingerprint-day with a count, forwards only new rows", async () => {
    const client = clientFor(app)
    forwarded.length = 0
    await client.telemetry.ingest({ app: "app", errors: [boom("Note 1 missing")], vitals: [] })
    await client.telemetry.ingest({ app: "app", errors: [boom("Note 2 missing")], vitals: [] })
    await client.telemetry.ingest({ app: "www", errors: [boom("Note 1 missing")], vitals: [] })
    const since = new Date(Date.now() - 60_000).toISOString()
    const totals = await app.db.telemetry.errorTotals(since)
    expect(totals).toEqual({ distinct: 2, total: 3 })
    const [top] = await app.db.telemetry.errorSummary(since, 5)
    expect(top).toMatchObject({ app: "app", kind: "boundary", route: "/notes" })
    expect(Number(top?.count)).toBe(2)
    // Forwarding is a telemetry.forward job now (the worker is off in tests): drain it.
    await app.drain()
    expect(forwarded.map((r) => r.app).sort()).toEqual(["app", "www"])
  })

  test("stores vitals and the p75 is picked in SQL", async () => {
    const client = clientFor(app)
    await client.telemetry.ingest({
      app: "docs",
      errors: [],
      vitals: [1000, 2000, 3000, 4000].map((value) => ({
        name: "LCP" as const,
        value,
        rating: "good" as const,
        route: "/",
      })),
    })
    const rows = await app.db.telemetry.vitalP75(new Date(Date.now() - 60_000).toISOString())
    expect(rows.filter((r) => r.app === "docs")).toEqual([
      { app: "docs", name: "LCP", samples: 4, p75: 3000 },
    ])
  })

  test("refuses an oversize batch and an unknown app", async () => {
    const client = clientFor(app)
    const [tooBig] = await safe(
      client.telemetry.ingest({
        app: "app",
        errors: Array.from({ length: 21 }, (_, i) => boom(`e${i}`)),
        vitals: [],
      })
    )
    expect(tooBig).toMatchObject({ code: "BAD_REQUEST" })
    const [badApp] = await safe(
      client.telemetry.ingest({ app: "evil" as never, errors: [boom("x")], vitals: [] })
    )
    expect(badApp).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("needs the service token", async () => {
    const res = await fetch(new URL("/openapi/telemetry", app.server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "app", errors: [], vitals: [] }),
    })
    expect(res.status).toBe(401)
  })

  test("limiter: telemetry:<clientId>", async () => {
    const limited = await start({
      telemetryLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const client = clientFor(limited)
      await client.telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await client.telemetry.ingest({ app: "app", errors: [], vitals: [] })
      const [error] = await safe(client.telemetry.ingest({ app: "app", errors: [], vitals: [] }))
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("limiter key: a telemetry: client id as-is, anything else prefixed once", async () => {
    const keys: string[] = []
    const limited = await start({
      telemetryLimiter: {
        hit: (key) => {
          keys.push(key)
          return { allowed: true as const }
        },
      },
    })
    try {
      const as = (clientId: string) =>
        createORPCClient<ApiClient>(
          new RPCLink({
            url: new URL("/rpc", limited.server.url),
            headers: { ...auth, "x-api-client-id": clientId },
          })
        )
      await as("telemetry:abc").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await as("svc").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      expect(keys).toEqual(["telemetry:abc", "telemetry:svc"])
    } finally {
      await limited.stop()
    }
  })

  test("unidentified browsers (telemetry:<app>) skip the per-client limit; the per-app cap applies", async () => {
    const limited = await start({
      telemetryLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      telemetryAppLimiter: createMemoryRateLimiter({ limit: 3, windowMs: 60_000 }),
    })
    try {
      const as = (clientId: string) =>
        createORPCClient<ApiClient>(
          new RPCLink({
            url: new URL("/rpc", limited.server.url),
            headers: { ...auth, "x-api-client-id": clientId },
          })
        )
      // The route sends telemetry:<app> when it cannot see the browser's ip: many browsers share it.
      await as("telemetry:app").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await as("telemetry:app").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await as("telemetry:app").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      const [capped] = await safe(
        as("telemetry:app").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      )
      expect(capped).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      // An identified browser is still limited per client (limit 1 here), on another app's budget.
      const browser = "telemetry:0123456789abcdef0123456789abcdef"
      await as(browser).telemetry.ingest({ app: "www", errors: [], vitals: [] })
      const [perClient] = await safe(
        as(browser).telemetry.ingest({ app: "www", errors: [], vitals: [] })
      )
      expect(perClient).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("per-app backstop: telemetry:app:<app> across client ids", async () => {
    const limited = await start({
      telemetryAppLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    })
    try {
      const as = (clientId: string) =>
        createORPCClient<ApiClient>(
          new RPCLink({
            url: new URL("/rpc", limited.server.url),
            headers: { ...auth, "x-api-client-id": clientId },
          })
        )
      await as("telemetry:a").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      await as("telemetry:b").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      const [error] = await safe(
        as("telemetry:c").telemetry.ingest({ app: "app", errors: [], vitals: [] })
      )
      expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" })
      // Another app has its own bucket.
      await as("telemetry:c").telemetry.ingest({ app: "www", errors: [], vitals: [] })
    } finally {
      await limited.stop()
    }
  })

  test("prune drops old rows", async () => {
    const old = "2020-01-01T00:00:00.000Z"
    await app.db.telemetry.upsertError({
      fingerprint: "old-fp",
      app: "api",
      event: { kind: "server", message: "old" },
      now: old,
    })
    await app.db.telemetry.insertVitals(
      "api",
      [{ name: "CLS", value: 0.01, rating: "good", route: "/" }],
      old
    )
    await app.db.telemetry.prune("2021-01-01T00:00:00.000Z", "2021-01-01T00:00:00.000Z")
    expect(
      (await app.db.telemetry.errorSummary("2019-01-01T00:00:00.000Z", 50)).some(
        (r) => r.fingerprint === "old-fp"
      )
    ).toBe(false)
    expect(
      (await app.db.telemetry.vitalP75("2019-01-01T00:00:00.000Z")).some((r) => r.app === "api")
    ).toBe(false)
  })

  test("strips the query string and hash from routes before storing", async () => {
    const client = clientFor(app)
    await client.telemetry.ingest({
      app: "auth",
      errors: [{ kind: "boundary", message: "route sanitise check", route: "/magic?token=abc#x" }],
      vitals: [{ name: "LCP", value: 1, rating: "good", route: "/magic?token=abc#x" }],
    })
    const since = new Date(Date.now() - 60_000).toISOString()
    const rows = await app.db.telemetry.errorSummary(since, 50)
    expect(rows.find((r) => r.message === "route sanitise check")?.route).toBe("/magic")
  })

  test("collapses opaque path segments before storing", async () => {
    const client = clientFor(app)
    await client.telemetry.ingest({
      app: "app",
      errors: [
        {
          kind: "boundary",
          message: "segment collapse check",
          route: "/invitations/abcDEF123456789012345?x=1",
        },
      ],
      vitals: [],
    })
    const rows = await app.db.telemetry.errorSummary(
      new Date(Date.now() - 60_000).toISOString(),
      50
    )
    expect(rows.find((r) => r.message === "segment collapse check")?.route).toBe("/invitations/:id")
  })

  test("a mail job that never stops failing dies into a masked server row for app api", async () => {
    // The verify mail job retries with backoff (up to 1 h) before it dies: a controllable clock
    // drives it through every attempt without a real sleep, as worker.test.ts does.
    const clock = { at: new Date("2026-10-06T12:00:00.000Z") }
    const failing = await start({
      mailer: {
        kind: "log",
        send: async (message) => {
          throw new Error(`550 ${message.to} rejected`)
        },
      },
      now: () => clock.at,
    })
    try {
      const email = `bounce${Date.now()}@example.com`
      await clientFor(failing).auth.signUp({ email, password: "correct horse battery" })
      // mail.send's default maxAttempts is 5: drain, then advance past the backoff, four times.
      for (let i = 0; i < 5; i++) {
        await failing.drain()
        clock.at = new Date(clock.at.getTime() + 3_600_000)
      }
      const since = "2000-01-01T00:00:00.000Z"
      // recordFailure's own write is detached (a macrotask), so the dead job's kill is not
      // enough on its own: wait for the row to actually land.
      await waitFor(async () => (await failing.db.telemetry.errorTotals(since)).total >= 1)
      const rows = await failing.db.telemetry.errorSummary(since, 50)
      const row = rows.find((r) => r.app === "api" && r.kind === "server")
      expect(row?.message).toContain("<email>")
      expect(row?.message).not.toContain(email)
    } finally {
      await failing.stop()
    }
  })

  test("recordServerError survives a value String() cannot convert, and still forwards it", async () => {
    const logged: [string, unknown][] = []
    const log = (message: string, error: unknown) => {
      logged.push([message, error])
    }
    recordServerError(
      { db: app.db, provider: spy, enqueue: app.enqueue, log },
      "api",
      Object.create(null)
    )
    // The enqueue is itself detached (recordServerError's own macrotask): drain on every poll, so
    // a telemetry.forward row not queued yet is not mistaken for one that will never arrive. Match
    // on the message, not just array growth — an earlier test's own forward job may still be
    // sitting in the queue (unrelated to this one) when this one drains.
    await waitFor(async () => {
      await app.drain()
      return forwarded.some((r) => r.message === "Unknown error")
    })
    expect(logged).toEqual([])
    const since = new Date(Date.now() - 60_000).toISOString()
    const rows = await app.db.telemetry.errorSummary(since, 50)
    expect(rows.some((r) => r.app === "api" && r.message === "Unknown error")).toBe(true)
    expect(forwarded.some((r) => r.app === "api" && r.message === "Unknown error")).toBe(true)
  })

  test("a handler that answers 500 becomes a server row for app api", async () => {
    // A deterministic 500: workspaces.delete cancels a live subscription first, and a provider whose
    // cancel throws makes the handler answer INTERNAL_SERVER_ERROR, which logUnexpected sees.
    const { mockProvider } = await import("./billing/mock")
    const { signUpWithWorkspace } = await import("./test-server")
    const broken = await start({
      billing: ({ db }) => ({
        ...mockProvider(db),
        cancelSubscription: async () => {
          throw new Error("provider exploded")
        },
      }),
    })
    try {
      const owner = await signUpWithWorkspace(broken)
      await broken.billing.change(owner.workspaceId, "pro", "month")
      const [error] = await safe(owner.client.workspaces.delete({ workspaceId: owner.workspaceId }))
      expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
      await waitFor(
        async () => (await broken.db.telemetry.errorTotals("2000-01-01T00:00:00.000Z")).total >= 1
      )
      const [row] = await broken.db.telemetry.errorSummary("2000-01-01T00:00:00.000Z", 1)
      // The recorded error is the ORPCError the handler threw (its message is the contract's
      // "Internal error"), not the provider's: what matters is that the 500 left a row.
      expect(row).toMatchObject({ app: "api", kind: "server" })
      expect(row?.message.length).toBeGreaterThan(0)
    } finally {
      await broken.stop()
    }
  })
})

describe("admin.telemetry", () => {
  test("errors: 24h totals and top five; vitals: p75 per app; NOT_FOUND for non-admins", async () => {
    const adminApp = await start({ superadminEmails: ["root@example.com"] })
    try {
      const { signUpVerified } = await import("./test-server")
      const root = await signUpVerified(adminApp, "root@example.com")
      const user = await signUpVerified(adminApp)
      const svc = clientFor(adminApp)
      for (let i = 0; i < 3; i++)
        await svc.telemetry.ingest({ app: "app", errors: [boom("hot")], vitals: [] })
      await svc.telemetry.ingest({
        app: "www",
        errors: [boom("cold")],
        vitals: [1000, 2000, 3000, 4000].map((value) => ({
          name: "LCP" as const,
          value,
          rating: "good" as const,
          route: "/",
        })),
      })
      const errors = await root.client.admin.telemetry.errors()
      expect(errors).toMatchObject({ window: "24h", distinct: 2, total: 4 })
      expect(errors.top[0]).toMatchObject({ app: "app", message: "hot", count: 3 })
      const vitals = await root.client.admin.telemetry.vitals()
      expect(vitals.apps.find((a) => a.app === "www")).toEqual({
        app: "www",
        samples: 4,
        lcp: 3000,
        inp: null,
        cls: null,
      })
      const [denied] = await safe(user.client.admin.telemetry.errors())
      expect(denied).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await adminApp.stop()
    }
  })
})
