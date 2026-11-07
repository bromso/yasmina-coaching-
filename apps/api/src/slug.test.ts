import { describe, expect, test } from "bun:test"
import { slugify, uniqueSlug } from "./slug"

describe("slugify", () => {
  test("lowercases and replaces non-alphanumerics with hyphens", () => {
    expect(slugify("Ada's Team!")).toBe("ada-s-team")
  })

  test("strips accents: combining marks go after NFKD", () => {
    expect(slugify("Ünïcode")).toBe("unicode")
  })

  test("an empty name becomes workspace", () => {
    expect(slugify("")).toBe("workspace")
  })

  test("a too-short base is padded with -workspace", () => {
    expect(slugify("ab")).toBe("ab-workspace")
  })

  test("is capped at 50 characters", () => {
    const name = "a".repeat(60)
    expect(slugify(name)).toHaveLength(50)
  })
})

describe("uniqueSlug", () => {
  test("appends -2 when the base is taken", async () => {
    expect(await uniqueSlug("My team", async (s) => s === "my-team")).toBe("my-team-2")
  })

  test("returns the base when it is free", async () => {
    expect(await uniqueSlug("My team", async () => false)).toBe("my-team")
  })
})
