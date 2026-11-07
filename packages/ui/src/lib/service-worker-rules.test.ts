import { describe, expect, test } from "bun:test"
import { cacheNames, OFFLINE_URL, runtimeCaching, type SiteKind } from "./service-worker-rules"

const ORIGIN = "http://app.brand.localhost:3001"

type FakeRequest = { mode: string; destination: string; headers: Headers }
const request = (over: Partial<FakeRequest> = {}): FakeRequest => ({
  mode: "cors",
  destination: "",
  headers: new Headers(),
  ...over,
})

/** The handler Serwist would pick: the first rule whose matcher returns truthy. */
function handlerFor(kind: SiteKind, path: string, req: FakeRequest = request()) {
  const url = new URL(path, ORIGIN)
  for (const rule of runtimeCaching(kind)) {
    const { matcher } = rule
    if (typeof matcher !== "function") throw new Error("rules use match callbacks only")
    // biome-ignore lint/suspicious/noExplicitAny: a fake Request/event is enough for the matchers
    if (matcher({ url, request: req as any, sameOrigin: true, event: {} as any })) {
      return rule.handler.constructor.name
    }
  }
  return undefined
}

const navigation = request({ mode: "navigate", destination: "document" })
const rscFetch = request({ headers: new Headers({ RSC: "1" }) })

describe("private apps (app, auth, account)", () => {
  test("pages, client-side navigation payloads and API calls never touch Cache Storage", () => {
    expect(handlerFor("private", "/notes", navigation)).toBe("NetworkOnly")
    expect(handlerFor("private", "/notes?_rsc=abc", rscFetch)).toBe("NetworkOnly")
    expect(handlerFor("private", "/api/chat")).toBe("NetworkOnly")
    // Anything else same-origin (a fetch of a page, an optimised image) goes to the network as is.
    expect(handlerFor("private", "/workspaces/new")).toBeUndefined()
    expect(
      handlerFor("private", "/_next/image?url=%2Favatar.png", request({ destination: "image" }))
    ).toBeUndefined()
  })

  test("only build assets, fonts and the app's icons are cached", () => {
    expect(
      handlerFor("private", "/_next/static/chunks/main.js", request({ destination: "script" }))
    ).toBe("CacheFirst")
    expect(
      handlerFor("private", "/icons/icon-192x192.png", request({ destination: "image" }))
    ).toBe("CacheFirst")
  })
})

describe("public apps (www, docs, help, jobs)", () => {
  test("pages are network-first, so they open offline once seen; RSC payloads are not cached", () => {
    expect(handlerFor("public", "/terms", navigation)).toBe("NetworkFirst")
    // Link prefetches would crowd the pages out; a failed RSC fetch falls back to a full navigation.
    expect(handlerFor("public", "/terms?_rsc=abc", rscFetch)).toBe("NetworkOnly")
  })

  test("API calls are never cached; build assets are cache-first; images revalidate", () => {
    expect(handlerFor("public", "/api/telemetry")).toBe("NetworkOnly")
    expect(
      handlerFor("public", "/_next/static/css/app.css", request({ destination: "style" }))
    ).toBe("CacheFirst")
    expect(handlerFor("public", "/logo.svg", request({ destination: "image" }))).toBe(
      "StaleWhileRevalidate"
    )
  })
})

test("cache names match the caches the rules write to", () => {
  for (const kind of ["private", "public"] as const) {
    const written = new Set(
      runtimeCaching(kind)
        .map((rule) => rule.handler)
        .filter((handler) => handler.constructor.name !== "NetworkOnly")
        .map((handler) => (handler as { cacheName?: string }).cacheName)
    )
    expect(written).toEqual(cacheNames(kind))
  }
})

test("cache names: a private app keeps no page cache; each kind's names are stable", () => {
  expect([...cacheNames("private")].sort()).toEqual(["static"])
  expect([...cacheNames("public")].sort()).toEqual(["images", "pages", "static"])
})

test("the offline fallback is a static file, so it never carries a signed-in header", () => {
  expect(OFFLINE_URL).toBe("/offline.html")
})
