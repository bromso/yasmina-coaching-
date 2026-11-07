import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  API_KEY_PATTERN,
  apiKeyStatus,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  parseScopes,
  verifyApiKey,
} from "./api-keys"

describe("generateApiKey", () => {
  test("bb_live_<8 base62>_<43 base64url>, hashed as SHA-256 hex of the whole key", () => {
    const { key, prefix, secretHash } = generateApiKey()
    expect(key).toMatch(/^bb_live_[0-9A-Za-z]{8}_[A-Za-z0-9_-]{43}$/)
    expect(key).toMatch(API_KEY_PATTERN)
    expect(key.slice(8, 16)).toBe(prefix)
    expect(prefix).toMatch(/^[0-9A-Za-z]{8}$/)
    expect(secretHash).toMatch(/^[0-9a-f]{64}$/)
    expect(secretHash).toBe(hashApiKey(key))
    expect(secretHash).toBe(new Bun.CryptoHasher("sha256").update(key).digest("hex"))
  })

  test("never repeats, and the prefix uses the whole base62 alphabet", () => {
    const keys = Array.from({ length: 500 }, generateApiKey)
    expect(new Set(keys.map((k) => k.key)).size).toBe(500)
    const chars = new Set(keys.flatMap((k) => [...k.prefix]))
    expect(chars.size).toBe(62)
  })
})

describe("parseApiKey", () => {
  const { key, prefix } = generateApiKey()

  test("a well-formed key gives its prefix", () => {
    expect(parseApiKey(key)).toEqual({ prefix })
  })

  test("strict: anything else is null", () => {
    const secret = key.slice(17)
    for (const bad of [
      "",
      `Bearer ${key}`,
      ` ${key}`,
      `${key} `,
      `${key}\n`,
      key.replace("bb_live_", "bb_test_"),
      key.replace("bb_live_", "BB_LIVE_"),
      `bb_live_${prefix.slice(1)}_${secret}`,
      `bb_live_${prefix}x_${secret}`,
      `bb_live_${prefix}_${secret.slice(1)}`,
      `bb_live_${prefix}_${secret}A`,
      `bb_live_${prefix}-${secret}`,
      `bb_live_${"!".repeat(8)}_${secret}`,
      `bb_live_${prefix}_${"=".repeat(43)}`,
      `x${key}`,
    ])
      expect(parseApiKey(bad)).toBeNull()
  })
})

describe("verifyApiKey", () => {
  test("the stored hash of the same key verifies; any other key or hash does not", () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(verifyApiKey(a.key, a.secretHash)).toBe(true)
    expect(verifyApiKey(b.key, a.secretHash)).toBe(false)
    expect(verifyApiKey(a.key, "")).toBe(false)
    expect(verifyApiKey(a.key, a.secretHash.slice(1))).toBe(false)
    expect(verifyApiKey(a.key, a.secretHash.toUpperCase())).toBe(false)
  })
})

describe("apiKeyStatus", () => {
  const now = new Date("2026-10-18T12:00:00.000Z")
  test("revoked wins, then expired, else active", () => {
    expect(apiKeyStatus({ revoked_at: null, expires_at: null }, now)).toBe("active")
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-10-18T12:00:00.001Z" }, now)).toBe(
      "active"
    )
    expect(apiKeyStatus({ revoked_at: null, expires_at: "2026-10-18T12:00:00.000Z" }, now)).toBe(
      "expired"
    )
    expect(
      apiKeyStatus(
        { revoked_at: "2026-10-01T00:00:00.000Z", expires_at: "2026-10-02T00:00:00.000Z" },
        now
      )
    ).toBe("revoked")
  })
})

describe("parseScopes", () => {
  test("keeps the known scopes in API_SCOPES order and drops anything else", () => {
    expect(parseScopes('["notes:write","bogus","workspace:read"]')).toEqual([
      "workspace:read",
      "notes:write",
    ])
    expect(parseScopes("not json")).toEqual([])
    expect(parseScopes('{"a":1}')).toEqual([])
  })
})

describe("the Gitleaks rule", () => {
  test("finds every key this module generates, alone or inside other text", async () => {
    const config = Bun.TOML.parse(
      await Bun.file(join(import.meta.dirname, "..", "..", "..", ".gitleaks.toml")).text()
    ) as { rules?: Array<{ id: string; regex: string; secretGroup?: number }> }
    const rule = config.rules?.find((r) => r.id === "bb-live-api-key")
    expect(rule).toBeDefined()
    const pattern = new RegExp(rule?.regex as string)
    for (let i = 0; i < 200; i++) {
      const { key } = generateApiKey()
      for (const text of [key, `API_KEY=${key}\n`, `"${key}"`, `Bearer ${key}`])
        expect(pattern.exec(text)?.[rule?.secretGroup ?? 0]).toBe(key)
    }
  })
})
