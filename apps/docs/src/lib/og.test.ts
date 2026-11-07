import { describe, expect, test } from "bun:test"
import { OG_CACHE_CONTROL, ogImageMetadata, ogImagePath, pageSlugsOf, withOgCache } from "./og"

describe("ogImagePath / pageSlugsOf", () => {
  test("the landing page and nested pages round-trip", () => {
    expect(ogImagePath("/")).toBe("/og/image.png")
    expect(ogImagePath("/guides/deploying")).toBe("/og/guides/deploying/image.png")
    expect(pageSlugsOf(["image.png"])).toEqual([])
    expect(pageSlugsOf(["guides", "deploying", "image.png"])).toEqual(["guides", "deploying"])
  })

  test("a slug not ending in the image file names no page", () => {
    expect(pageSlugsOf(["guides"])).toBeUndefined()
  })
})

describe("ogImageMetadata", () => {
  test("the page's image path, size, alt text and PNG type", () => {
    expect(ogImageMetadata("/guides/deploying", "Deploying", "Acme")).toEqual({
      url: "/og/guides/deploying/image.png",
      width: 1200,
      height: 630,
      alt: "Acme — Deploying",
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
