import { afterEach, describe, expect, test } from "bun:test"
import { TELEMETRY_LIMITS } from "@repo/api-contract/telemetry-limits"
import {
  collapseRoute,
  createBrowserHandlers,
  createDedupe,
  isForeignStack,
  readConsent,
  sendBatch,
  shapeError,
  shapeVital,
  stripRoute,
} from "./browser"

// Guards against the exact regression caught in review: this file ships in every app's client
// bundle, static apps included, so it must never pull zod in. `collapseRoute` has to come from
// the zod-free `@repo/api-contract/route`, never `@repo/api-contract/analytics` (which is
// zod-only, not zod-free) — a wrong import there went undetected by every other test (same
// runtime behaviour, same exports) and only showed up here, in the actual bundle. Measured before
// this guard existed: 3.33 KB / 0 zod references the right way, 62.18 KB / 263 zod references the
// wrong way.
describe("browser bundle stays zod-free", () => {
  test("a minified, browser-target build of browser.ts has no zod reference", async () => {
    const result = await Bun.build({
      entrypoints: [new URL("./browser.ts", import.meta.url).pathname],
      target: "browser",
      minify: true,
    })
    expect(result.success).toBe(true)
    const code = await result.outputs[0]?.text()
    expect(code).toBeDefined()
    expect(code).not.toMatch(/zod/i)
    // A loose ceiling, not just a zod check: catches any other heavy dependency that sneaks in.
    expect((code as string).length).toBeLessThan(10_000)
  })
})

describe("shaping", () => {
  test("stripRoute keeps the pathname only and caps it", () => {
    expect(stripRoute("/notes?x=1#top")).toBe("/notes")
    expect(stripRoute("/ab".repeat(100))).toHaveLength(200)
    expect(stripRoute("")).toBe("/")
  })

  test("opaque path segments collapse to :id", () => {
    expect(stripRoute("/invitations/abcDEF123456789012345")).toBe("/invitations/:id")
    expect(stripRoute("/notes/42")).toBe("/notes/:id")
    expect(stripRoute("/admin/users/4")).toBe("/admin/users/:id")
    expect(stripRoute("/magic?token=x")).toBe("/magic")
    expect(stripRoute("/login")).toBe("/login")
    expect(collapseRoute("/w/3f2504e0-4f89-11d3-9a0c-0305e82c3301/edit")).toBe("/w/:id/edit")
    // A long ordinary word (16+ letters) is opaque by the rule too; short words are kept.
    expect(collapseRoute("/workspaces/new")).toBe("/workspaces/new")
  })

  test("readConsent mirrors the consent cookie rule", () => {
    expect(readConsent("theme=dark; consent=all")).toBe("all")
    expect(readConsent("consent=necessary")).toBe("necessary")
    expect(readConsent("consent=maybe; consent=all")).toBe("all")
    expect(readConsent("")).toBeNull()
  })

  test("shapeError: message, stack, digest, route; userAgent only with consent all", () => {
    const error = new Error("boom")
    const base = {
      kind: "boundary" as const,
      digest: "d1",
      pathname: "/notes?q=1",
      userAgent: "UA",
    }
    const withConsent = shapeError(error, { ...base, consent: "all" })
    expect(withConsent).toMatchObject({
      kind: "boundary",
      message: "boom",
      digest: "d1",
      route: "/notes",
      userAgent: "UA",
    })
    expect(withConsent.stack).toContain("boom")
    expect(shapeError(error, { ...base, consent: "necessary" }).userAgent).toBeUndefined()
    expect(shapeError(error, { ...base, consent: null }).userAgent).toBeUndefined()
  })

  test("shapeError copes with non-Error values and truncates", () => {
    expect(
      shapeError("just a string", { kind: "unhandled", pathname: "/", consent: null }).message
    ).toBe("just a string")
    expect(shapeError(undefined, { kind: "unhandled", pathname: "/", consent: null }).message).toBe(
      "Unknown error"
    )
    const long = new Error("m".repeat(1000))
    long.stack = "s".repeat(10_000)
    const shaped = shapeError(long, { kind: "boundary", pathname: "/", consent: null })
    expect(shaped.message).toHaveLength(500)
    expect(shaped.stack).toHaveLength(4000)
  })

  test("shapeVital maps a web-vitals metric and ignores unknown names", () => {
    expect(
      shapeVital(
        { name: "LCP", value: 1234.5, rating: "good", navigationType: "navigate" },
        { pathname: "/x?y" }
      )
    ).toEqual({
      name: "LCP",
      value: 1234.5,
      rating: "good",
      navigationType: "navigate",
      route: "/x",
    })
    expect(shapeVital({ name: "FID", value: 1, rating: "good" }, { pathname: "/" })).toBeNull()
  })
})

describe("isForeignStack", () => {
  const origin = "http://app.brand.localhost:3001"
  test("true when every frame is from another origin", () => {
    expect(
      isForeignStack(
        "Error\n    at x (chrome-extension://abc/inject.js:1:1)\n    at y (https://cdn.example.com/a.js:2:2)",
        origin
      )
    ).toBe(true)
  })
  test("false when one frame is ours or the stack has no frames", () => {
    expect(
      isForeignStack(
        `Error\n    at x (https://cdn.example.com/a.js:2:2)\n    at render (${origin}/_next/static/chunks/app.js:1:1)`,
        origin
      )
    ).toBe(false)
    expect(isForeignStack("Error: boom", origin)).toBe(false)
    expect(isForeignStack(undefined, origin)).toBe(false)
  })

  test("a foreign URL frame plus a native (URL-less) frame is still foreign", () => {
    expect(
      isForeignStack(
        "Error\n    at inject (chrome-extension://abc/x.js:1:1)\n    at new Promise (<anonymous>)\n    at Array.forEach (<anonymous>)",
        origin
      )
    ).toBe(true)
  })

  test("a relative first-party frame alongside a foreign one is not foreign", () => {
    expect(
      isForeignStack(
        "Error\n    at render (/_next/static/chunks/app.js:1:1)\n    at y (https://cdn.example.com/a.js:2:2)",
        origin
      )
    ).toBe(false)
  })

  test("path-only frames (no URL at all) are not foreign", () => {
    expect(
      isForeignStack(
        "Error: real\n    at <anonymous> (/private/tmp/stackcheck.test.ts:3:17)",
        origin
      )
    ).toBe(false)
  })
})

describe("dedupe and handlers", () => {
  test("createDedupe allows a key once per window and at most max events", () => {
    let t = 0
    const allow = createDedupe({ windowMs: 60_000, max: 3, now: () => t })
    expect(allow("a")).toBe(true)
    expect(allow("a")).toBe(false)
    t = 61_000
    expect(allow("a")).toBe(true)
    expect(allow("b")).toBe(true)
    expect(allow("c")).toBe(false) // max reached (a, a, b)
  })

  test("handlers report unhandled errors and rejections, drop Script error. and foreign stacks", () => {
    const reported: unknown[] = []
    const h = createBrowserHandlers((e) => reported.push(e), {
      origin: "http://app.brand.localhost:3001",
      pathname: () => "/notes",
      consent: () => "necessary",
    })
    h.onError({ message: "Script error.", error: undefined })
    h.onError({
      message: "x",
      error: Object.assign(new Error("ext"), {
        stack: "Error: ext\n    at f (chrome-extension://abc/x.js:1:1)",
      }),
    })
    h.onError({ message: "real", error: new Error("real") })
    h.onUnhandledRejection({ reason: new Error("rejected") })
    h.onUnhandledRejection({ reason: "plain" })
    expect(reported.map((e) => (e as { message: string }).message)).toEqual([
      "real",
      "rejected",
      "plain",
    ])
    expect(reported.every((e) => (e as { kind: string }).kind === "unhandled")).toBe(true)
  })

  test("an Error whose message/stack getters throw does not throw out of the listener", () => {
    const reported: unknown[] = []
    const h = createBrowserHandlers((e) => reported.push(e), {
      origin: "http://x",
      pathname: () => "/",
      consent: () => null,
    })
    const hostile = new Error("x")
    Object.defineProperty(hostile, "message", {
      get() {
        throw new Error("getter")
      },
    })
    Object.defineProperty(hostile, "stack", {
      get() {
        throw new Error("getter")
      },
    })
    expect(() => h.onError({ message: "x", error: hostile })).not.toThrow()
    expect(() => h.onUnhandledRejection({ reason: hostile })).not.toThrow()
  })

  test("handlers dedupe repeats and stop after 10 per page", () => {
    const reported: unknown[] = []
    const h = createBrowserHandlers((e) => reported.push(e), {
      origin: "http://x",
      pathname: () => "/",
      consent: () => null,
    })
    for (let i = 0; i < 5; i++) h.onError({ message: "same", error: new Error("same") })
    expect(reported).toHaveLength(1)
    for (let i = 0; i < 20; i++) h.onError({ message: `e${i}`, error: new Error(`e${i}`) })
    expect(reported).toHaveLength(10)
  })
})

describe("sendBatch", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const capture = () => {
    const sent: string[] = []
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sent.push(String(init?.body))
      return new Response(null, { status: 204 })
    }) as unknown as typeof fetch
    return sent
  }
  // The JSON envelope around a single message; the message fills the rest of the budget.
  const withMessage = (message: string) => ({
    errors: [{ kind: "boundary" as const, message }],
    vitals: [],
  })
  const overhead = JSON.stringify(withMessage("")).length

  test("measures the body in bytes, not characters", () => {
    const sent = capture()
    // Under the cap in UTF-16 code units, over it in UTF-8 bytes (each "é" is 2 bytes).
    const chars = TELEMETRY_LIMITS.bodyBytes - overhead - 10
    const multibyte = withMessage("é".repeat(chars))
    expect(JSON.stringify(multibyte).length).toBeLessThan(TELEMETRY_LIMITS.bodyBytes)
    sendBatch(multibyte)
    expect(sent).toHaveLength(0)
    // The same length in ASCII fits and is sent.
    sendBatch(withMessage("e".repeat(chars)))
    expect(sent).toHaveLength(1)
  })
})
