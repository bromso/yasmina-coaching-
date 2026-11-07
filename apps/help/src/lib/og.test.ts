import { describe, expect, test } from "bun:test"
import { articleSlugsOf, OG_CACHE_CONTROL, ogImageMetadata, ogImagePath, withOgCache } from "./og"

describe("ogImagePath / articleSlugsOf", () => {
  test("an article's OG path and its slugs round-trip", () => {
    expect(ogImagePath("getting-started", "create-an-account")).toBe(
      "/og/getting-started/create-an-account/image.png"
    )
    expect(articleSlugsOf(["getting-started", "create-an-account", "image.png"])).toEqual([
      "getting-started",
      "create-an-account",
    ])
  })

  test("a path not ending in the image file, or not exactly two slugs deep, names no article", () => {
    expect(articleSlugsOf(["getting-started", "create-an-account"])).toBeUndefined()
    expect(articleSlugsOf(["getting-started", "image.png"])).toBeUndefined()
    expect(articleSlugsOf(["a", "b", "c", "image.png"])).toBeUndefined()
  })
})

describe("ogImageMetadata", () => {
  test("the article's image path, size, alt text and PNG type", () => {
    expect(
      ogImageMetadata("getting-started", "create-an-account", "Create an account", "Acme")
    ).toEqual({
      url: "/og/getting-started/create-an-account/image.png",
      width: 1200,
      height: 630,
      alt: "Acme — Create an account",
      type: "image/png",
    })
  })
})

describe("withOgCache", () => {
  test("an hour in browsers, a day in shared caches, never immutable", () => {
    expect(OG_CACHE_CONTROL).toBe("public, max-age=3600, s-maxage=86400")
    const response = withOgCache(
      new Response("png", { headers: { "cache-control": "public, immutable, max-age=31536000" } })
    )
    expect(response.headers.get("cache-control")).toBe(OG_CACHE_CONTROL)
  })
})
