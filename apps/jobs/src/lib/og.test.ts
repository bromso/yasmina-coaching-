import { describe, expect, test } from "bun:test"
import { jobSlugOf, OG_CACHE_CONTROL, ogImageMetadata, ogImagePath, withOgCache } from "./og"

describe("ogImagePath / jobSlugOf", () => {
  test("a posting's OG path and its slug round-trip", () => {
    expect(ogImagePath("senior-fullstack-engineer")).toBe("/og/senior-fullstack-engineer/image.png")
    expect(jobSlugOf(["senior-fullstack-engineer", "image.png"])).toBe("senior-fullstack-engineer")
  })

  test("a path not ending in the image file, or not exactly one segment deep, names no posting", () => {
    expect(jobSlugOf(["senior-fullstack-engineer"])).toBeUndefined()
    expect(jobSlugOf(["image.png"])).toBeUndefined()
    expect(jobSlugOf(["a", "b", "image.png"])).toBeUndefined()
  })
})

describe("ogImageMetadata", () => {
  test("the posting's image path, size, alt text and PNG type", () => {
    expect(
      ogImageMetadata("senior-fullstack-engineer", "Senior Full-stack Engineer", "Acme")
    ).toEqual({
      url: "/og/senior-fullstack-engineer/image.png",
      width: 1200,
      height: 630,
      alt: "Acme — Senior Full-stack Engineer",
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
