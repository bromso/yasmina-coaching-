import { describe, expect, test } from "bun:test"
import { DUMMY_HASH, hashPassword, newToken, tokenHash, verifyPassword } from "./credentials"

describe("tokens", () => {
  test("are 43 url-safe characters and never repeat", () => {
    const tokens = new Set(Array.from({ length: 100 }, newToken))
    expect(tokens.size).toBe(100)
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  test("hash deterministically to 64 hex chars and differ from the token", () => {
    const t = newToken()
    expect(tokenHash(t)).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash(t)).toBe(tokenHash(t))
    expect(tokenHash(t)).not.toContain(t)
  })
})

describe("passwords", () => {
  test("hash with argon2id and verify", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(hash.startsWith("$argon2id$")).toBe(true)
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true)
    expect(await verifyPassword("wrong", hash)).toBe(false)
  })

  test("the dummy hash never verifies", async () => {
    expect(await verifyPassword("anything", await DUMMY_HASH)).toBe(false)
  })
})
