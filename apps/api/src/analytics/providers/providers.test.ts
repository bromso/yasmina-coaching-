import { describe, expect, test } from "bun:test"
import { createAnalyticsProvider } from "./create-provider"
import { plausibleProvider } from "./plausible"
import { posthogProvider } from "./posthog"
import type { ForwardItem } from "./provider"

const siteUrl = (app: string) => `https://${app}.brand.com`

const pageview: ForwardItem = {
  kind: "pageview",
  app: "www",
  path: "/pricing",
  referrerHost: "google.com",
  visitorId: "v1",
  userId: null,
  workspaceId: null,
  at: "2026-10-06T12:00:00.000Z",
  uuid: "11111111-1111-1111-1111-111111111111",
}

const event: ForwardItem = {
  kind: "event",
  name: "note_created",
  source: "app",
  props: { foo: "bar" },
  visitorId: null,
  userId: 7,
  workspaceId: 3,
  at: "2026-10-06T12:00:01.000Z",
  uuid: "22222222-2222-2222-2222-222222222222",
}

describe("posthogProvider", () => {
  test("a pageview posts $pageview with $current_url, uuid, and no ip/user agent", async () => {
    const calls: Request[] = []
    const provider = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("{}", { status: 200 })
      },
    })
    await provider.forward(pageview)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://us.i.posthog.com/i/v0/e/")
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body).toEqual({
      api_key: "phc_x",
      event: "$pageview",
      distinct_id: "visitor:v1",
      properties: {
        $current_url: "https://www.brand.com/pricing",
        $ip: null,
        $geoip_disable: true,
      },
      timestamp: "2026-10-06T12:00:00.000Z",
      uuid: "11111111-1111-1111-1111-111111111111",
    })
    expect(JSON.stringify(body)).not.toContain("user_agent")
    expect(JSON.stringify(body)).not.toContain("userAgent")
  })

  test("an event keeps its name/props/uuid, with $ip null, $geoip_disable, no $current_url", async () => {
    const calls: Request[] = []
    const provider = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("{}", { status: 200 })
      },
    })
    await provider.forward(event)
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body).toEqual({
      api_key: "phc_x",
      event: "note_created",
      distinct_id: "user:7",
      properties: { foo: "bar", $ip: null, $geoip_disable: true },
      timestamp: "2026-10-06T12:00:01.000Z",
      uuid: "22222222-2222-2222-2222-222222222222",
    })
    expect(body.properties.$current_url).toBeUndefined()
  })

  test("distinct_id: user, else workspace, else visitor, else anonymous without a person profile", async () => {
    const seen: string[] = []
    const profiles: unknown[] = []
    const provider = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body))
        seen.push(body.distinct_id)
        profiles.push(body.properties.$process_person_profile)
        return new Response("{}", { status: 200 })
      },
    })
    await provider.forward({ ...pageview, userId: 42, workspaceId: 5, visitorId: "v1" })
    await provider.forward({ ...event, userId: null, workspaceId: 5, visitorId: null })
    await provider.forward({ ...pageview, userId: null, workspaceId: 5, visitorId: "v1" })
    await provider.forward({ ...pageview, userId: null, workspaceId: null, visitorId: "v1" })
    await provider.forward({ ...pageview, userId: null, workspaceId: null, visitorId: null })
    expect(seen).toEqual(["user:42", "workspace:5", "workspace:5", "visitor:v1", "anonymous"])
    // Only the shared "anonymous" id opts out of a person profile.
    expect(profiles).toEqual([undefined, undefined, undefined, undefined, false])
  })

  test("a retried forward (same ForwardItem) sends the same uuid every attempt", async () => {
    const uuids: string[] = []
    const provider = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async (_input, init) => {
        uuids.push(JSON.parse(String(init?.body)).uuid)
        return new Response("{}", { status: 200 })
      },
    })
    // The job worker re-runs `forward` with the exact same stored payload on each attempt — never
    // a freshly built one — so simulating a retry here is just calling it more than once.
    await provider.forward(pageview)
    await provider.forward(pageview)
    await provider.forward(pageview)
    expect(uuids).toEqual([pageview.uuid, pageview.uuid, pageview.uuid])
  })

  test("a network error / 5xx / 429 throws (retried); any other 4xx resolves and logs", async () => {
    const networkDown = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async () => {
        throw new Error("fetch failed")
      },
    })
    await expect(networkDown.forward(pageview)).rejects.toThrow()

    const fiveHundred = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async () => new Response("", { status: 503 }),
    })
    await expect(fiveHundred.forward(pageview)).rejects.toThrow("posthog answered 503")

    const rateLimited = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: () => {},
      fetch: async () => new Response("", { status: 429 }),
    })
    await expect(rateLimited.forward(pageview)).rejects.toThrow("posthog answered 429")

    const logs: unknown[] = []
    const badRequest = posthogProvider({
      host: "https://us.i.posthog.com",
      apiKey: "phc_x",
      siteUrl,
      log: (message) => logs.push(message),
      fetch: async () => new Response("", { status: 400 }),
    })
    await expect(badRequest.forward(pageview)).resolves.toBeUndefined()
    expect(logs).toEqual(["posthog answered 400"])
  })
})

describe("plausibleProvider", () => {
  test("a pageview posts domain/name/url/referrer with the plausible user agent, no x-forwarded-for", async () => {
    const calls: Request[] = []
    const provider = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("", { status: 202 })
      },
    })
    await provider.forward(pageview)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://plausible.io/api/event")
    expect(calls[0]?.headers.get("content-type")).toBe("application/json")
    expect(calls[0]?.headers.get("user-agent")).toBe("boilerplate-bun analytics")
    expect(calls[0]?.headers.get("x-forwarded-for")).toBeNull()
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body).toEqual({
      domain: "brand.com",
      name: "pageview",
      url: "https://www.brand.com/pricing",
      referrer: "https://google.com",
    })
  })

  test("no referrerHost omits referrer entirely", async () => {
    const calls: Request[] = []
    const provider = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("", { status: 202 })
      },
    })
    await provider.forward({ ...pageview, referrerHost: null })
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body.referrer).toBeUndefined()
  })

  test("an event from a site app posts name/url/props, grouped under that app's site", async () => {
    const calls: Request[] = []
    const provider = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("", { status: 202 })
      },
    })
    await provider.forward(event)
    expect(calls).toHaveLength(1)
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body).toEqual({
      domain: "brand.com",
      name: "note_created",
      url: "https://app.brand.com/",
      props: { foo: "bar" },
    })
  })

  test("a server-sourced event (source \"api\") groups under the app's site, not api's", async () => {
    const calls: Request[] = []
    const provider = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async (input, init) => {
        calls.push(new Request(input, init))
        return new Response("", { status: 202 })
      },
    })
    await provider.forward({ ...event, source: "api" })
    const body = JSON.parse((await calls[0]?.text()) ?? "")
    expect(body).toEqual({
      domain: "brand.com",
      name: "note_created",
      url: "https://app.brand.com/",
      props: { foo: "bar" },
    })
  })

  test("a network error / 5xx / 429 throws (retried); any other 4xx resolves and logs", async () => {
    const networkDown = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async () => {
        throw new Error("fetch failed")
      },
    })
    await expect(networkDown.forward(pageview)).rejects.toThrow()

    const fiveHundred = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async () => new Response("", { status: 500 }),
    })
    await expect(fiveHundred.forward(pageview)).rejects.toThrow("plausible answered 500")

    const rateLimited = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: () => {},
      fetch: async () => new Response("", { status: 429 }),
    })
    await expect(rateLimited.forward(pageview)).rejects.toThrow("plausible answered 429")

    const logs: unknown[] = []
    const badRequest = plausibleProvider({
      host: "https://plausible.io",
      domain: "brand.com",
      siteUrl,
      log: (message) => logs.push(message),
      fetch: async () => new Response("", { status: 400 }),
    })
    await expect(badRequest.forward(pageview)).resolves.toBeUndefined()
    expect(logs).toEqual(["plausible answered 400"])
  })
})

describe("createAnalyticsProvider", () => {
  test("store (the default) needs nothing and forwards nothing", async () => {
    const provider = createAnalyticsProvider({ ANALYTICS_PROVIDER: "store" }, { siteUrl }, () => {})
    expect(provider.kind).toBe("store")
    await expect(provider.forward(pageview)).resolves.toBeUndefined()
  })

  test("posthog needs POSTHOG_KEY, POSTHOG_HOST (same wording as loadEnv)", () => {
    expect(() =>
      createAnalyticsProvider({ ANALYTICS_PROVIDER: "posthog" }, { siteUrl }, () => {})
    ).toThrow("ANALYTICS_PROVIDER=posthog needs POSTHOG_KEY, POSTHOG_HOST")
    expect(() =>
      createAnalyticsProvider(
        { ANALYTICS_PROVIDER: "posthog", POSTHOG_KEY: "phc_x" },
        { siteUrl },
        () => {}
      )
    ).toThrow("ANALYTICS_PROVIDER=posthog needs POSTHOG_HOST")
    const provider = createAnalyticsProvider(
      { ANALYTICS_PROVIDER: "posthog", POSTHOG_KEY: "phc_x", POSTHOG_HOST: "https://x" },
      { siteUrl },
      () => {}
    )
    expect(provider.kind).toBe("posthog")
  })

  test("plausible needs PLAUSIBLE_DOMAIN, PLAUSIBLE_HOST (same wording as loadEnv)", () => {
    expect(() =>
      createAnalyticsProvider({ ANALYTICS_PROVIDER: "plausible" }, { siteUrl }, () => {})
    ).toThrow("ANALYTICS_PROVIDER=plausible needs PLAUSIBLE_DOMAIN, PLAUSIBLE_HOST")
    expect(() =>
      createAnalyticsProvider(
        { ANALYTICS_PROVIDER: "plausible", PLAUSIBLE_DOMAIN: "brand.com" },
        { siteUrl },
        () => {}
      )
    ).toThrow("ANALYTICS_PROVIDER=plausible needs PLAUSIBLE_HOST")
    const provider = createAnalyticsProvider(
      {
        ANALYTICS_PROVIDER: "plausible",
        PLAUSIBLE_DOMAIN: "brand.com",
        PLAUSIBLE_HOST: "https://plausible.io",
      },
      { siteUrl },
      () => {}
    )
    expect(provider.kind).toBe("plausible")
  })
})
