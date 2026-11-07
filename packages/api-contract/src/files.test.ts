import { describe, expect, test } from "bun:test"
import { EXPORT_KEY_PATTERN, FileKeySchema } from "./files"

describe("FileKeySchema", () => {
  test("accepts well-formed keys", () => {
    expect(FileKeySchema.safeParse("avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png").success).toBe(true)
    expect(FileKeySchema.safeParse("logos/42/abcdefghijklmnopqrstuv.webp").success).toBe(true)
  })

  test("refuses path traversal, zero/invalid workspace ids, bad extensions and wrong lengths", () => {
    expect(FileKeySchema.safeParse("../avatars/1/x.png").success).toBe(false)
    expect(FileKeySchema.safeParse("avatars/0/AAAAAAAAAAAAAAAAAAAAAA.png").success).toBe(false)
    expect(FileKeySchema.safeParse("avatars/1/AAAAAAAAAAAAAAAAAAAAAA.svg").success).toBe(false)
    expect(FileKeySchema.safeParse("avatars/1/short.png").success).toBe(false)
    expect(FileKeySchema.safeParse("avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png/x").success).toBe(false)
  })
})

describe("EXPORT_KEY_PATTERN", () => {
  test("matches an export key, which files.get's FileKeySchema refuses", () => {
    const key = "exports/7/AAAAAAAAAAAAAAAAAAAAAA.json"
    expect(EXPORT_KEY_PATTERN.test(key)).toBe(true)
    expect(FileKeySchema.safeParse(key).success).toBe(false)
  })

  test("refuses traversal, a zero user id, other extensions and wrong lengths", () => {
    expect(EXPORT_KEY_PATTERN.test("../exports/7/AAAAAAAAAAAAAAAAAAAAAA.json")).toBe(false)
    expect(EXPORT_KEY_PATTERN.test("exports/0/AAAAAAAAAAAAAAAAAAAAAA.json")).toBe(false)
    expect(EXPORT_KEY_PATTERN.test("exports/7/AAAAAAAAAAAAAAAAAAAAAA.png")).toBe(false)
    expect(EXPORT_KEY_PATTERN.test("exports/7/short.json")).toBe(false)
    expect(EXPORT_KEY_PATTERN.test("avatars/7/AAAAAAAAAAAAAAAAAAAAAA.json")).toBe(false)
  })
})
