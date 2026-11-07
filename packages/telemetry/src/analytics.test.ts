import { afterEach, describe, expect, test } from "bun:test"
import { sendPageview, track } from "./analytics"

// Guards the same regression `browser.test.ts` guards for `browser.ts`: this file ships in every
// app's client bundle, static apps included, so it must never pull zod in.
describe("analytics bundle stays zod-free", () => {
  test("a minified, browser-target build of analytics.ts has no zod reference", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./analytics.ts", import.meta.url).pathname],
      target: "browser",
      minify: true,
    })
    expect(result.success).toBe(true)
    const code = await result.outputs[0]?.text()
    expect(code).toBeDefined()
    expect(code).not.toMatch(/zod/i)
    expect((code as string).length).toBeLessThan(10_000)
  })
})

describe("sendPageview / track", () => {
  const realFetch = globalThis.fetch
  const realDescriptor = Object.getOwnPropertyDescriptor(navigator, "doNotTrack")
  const realNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    globalThis.fetch = realFetch
    process.env.NODE_ENV = realNodeEnv
    if (realDescriptor) {
      Object.defineProperty(navigator, "doNotTrack", realDescriptor)
    } else {
      // @ts-expect-error — test cleanup only
      delete navigator.doNotTrack
    }
  })

  const capture = () => {
    const sent: { url: string; body: string }[] = []
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      sent.push({ url: String(input), body: String(init?.body) })
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    return sent
  }

  test("sendPageview posts the collapsed path without the query string, and the referrer's host", () => {
    const sent = capture()
    sendPageview("/notes/42?x=1#top", "https://google.com/search?q=x")
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe("/api/analytics")
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({
      kind: "pageview",
      path: "/notes/:id",
      referrerHost: "google.com",
    })
  })

  // The referrer is reduced to a host before it ever leaves the browser — never the raw URL,
  // which can carry a same-origin one-time token (e.g. `/magic?token=…`).
  test("sendPageview never sends the raw referrer URL, only its host", () => {
    const sent = capture()
    sendPageview("/notes", "https://auth.brand.localhost:3002/magic?token=super-secret-token")
    const body = sent[0]?.body ?? ""
    expect(body).not.toContain("token")
    expect(body).not.toContain("magic")
    expect(JSON.parse(body).referrerHost).toBe("auth.brand.localhost:3002")
  })

  test("sendPageview sends an empty referrerHost for a client-side navigation", () => {
    const sent = capture()
    sendPageview("/pricing", "")
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({
      kind: "pageview",
      path: "/pricing",
      referrerHost: "",
    })
  })

  test("sendPageview sends an empty referrerHost when the referrer is unparsable", () => {
    const sent = capture()
    sendPageview("/pricing", "not a url")
    expect(JSON.parse(sent[0]?.body ?? "").referrerHost).toBe("")
  })

  test("sendPageview is skipped entirely with Do Not Track", () => {
    const sent = capture()
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true })
    sendPageview("/notes", "")
    expect(sent).toHaveLength(0)
  })

  test("sendPageview and track are skipped entirely in development", () => {
    const sent = capture()
    process.env.NODE_ENV = "development"
    sendPageview("/notes", "")
    track("pricing_viewed")
    expect(sent).toHaveLength(0)
  })

  test("track posts the event name and props", () => {
    const sent = capture()
    track("pricing_viewed", { plan: "pro" })
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({
      kind: "event",
      name: "pricing_viewed",
      props: { plan: "pro" },
    })
  })

  test("track with no props omits the key rather than sending null", () => {
    const sent = capture()
    track("pricing_viewed")
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({ kind: "event", name: "pricing_viewed" })
  })

  test("track is also skipped with Do Not Track", () => {
    const sent = capture()
    Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true })
    track("pricing_viewed")
    expect(sent).toHaveLength(0)
  })
})
