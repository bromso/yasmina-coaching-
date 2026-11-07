// The guard on its own, with fake dependencies: the paths a real server cannot observe cheaply —
// how often a revoked key's use is recorded, and that a prefix miss still pays for a hash compare.
import { describe, expect, test } from "bun:test"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { generateApiKey, hashApiKey, verifyApiKey } from "../api-keys"
import type { Db } from "../db"
import { createApiKeyGuard, DUMMY_KEY_HASH, REVOKED_REPORT_INTERVAL_MS } from "./guard"

type Row = {
  id: number
  workspace_id: number
  name: string
  prefix: string
  secret_hash: string
  scopes: string
  revoked_at: string | null
  expires_at: string | null
}

function setup(rows: Row[] = []) {
  const clock = { at: Date.parse("2026-10-18T12:00:00.000Z") }
  const failures: Array<{ message: string; error: string }> = []
  const verified: string[] = []
  const db = {
    apiKeys: {
      findByPrefix: async (prefix: string) => rows.find((row) => row.prefix === prefix),
      touchLastUsed: async () => {},
    },
    workspaces: { find: async () => undefined },
  } as unknown as Db
  const guard = createApiKeyGuard({
    db,
    billing: { kind: "mock" },
    now: () => new Date(clock.at),
    limiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    anonLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    recordFailure: (message, error) =>
      void failures.push({ message, error: error instanceof Error ? error.message : "" }),
    verify: (key, hash) => {
      verified.push(hash)
      return verifyApiKey(key, hash)
    },
  })
  const call = (key: string) =>
    guard(
      new Request("http://api.test/v1/notes", { headers: { authorization: `Bearer ${key}` } }),
      "1.2.3.4"
    )
  return { clock, failures, verified, call }
}

function revokedRow(id = 7) {
  const { key, prefix, secretHash } = generateApiKey()
  const row: Row = {
    id,
    workspace_id: 3,
    name: "CI",
    prefix,
    secret_hash: secretHash,
    scopes: '["notes:read"]',
    revoked_at: "2026-10-01T00:00:00.000Z",
    expires_at: null,
  }
  return { key, row }
}

describe("a revoked key's use is recorded at most once per key per interval, with a count", () => {
  test("a burst writes one line; the next after the interval carries how many uses it covers", async () => {
    const { key, row } = revokedRow()
    const { clock, failures, call } = setup([row])
    for (let i = 0; i < 50; i++) expect("response" in (await call(key))).toBe(true)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.message).toBe("api key: revoked key used")
    expect(failures[0]?.error).toBe(
      "revoked API key 7 of workspace 3 was used (1 use since the last report)"
    )

    clock.at += REVOKED_REPORT_INTERVAL_MS
    await call(key)
    expect(failures).toHaveLength(2)
    // The 49 held back plus this one.
    expect(failures[1]?.error).toBe(
      "revoked API key 7 of workspace 3 was used (50 uses since the last report)"
    )
  })

  test("each key has its own interval", async () => {
    const a = revokedRow(7)
    const b = revokedRow(8)
    const { failures, call } = setup([a.row, b.row])
    await call(a.key)
    await call(b.key)
    await call(a.key)
    expect(failures.map((f) => f.error)).toEqual([
      "revoked API key 7 of workspace 3 was used (1 use since the last report)",
      "revoked API key 8 of workspace 3 was used (1 use since the last report)",
    ])
  })
})

describe("a prefix miss still compares a hash", () => {
  test("an unknown prefix verifies against the dummy hash, so a hit and a miss take the same work", async () => {
    const { key } = generateApiKey()
    const { verified, call } = setup()
    expect("response" in (await call(key))).toBe(true)
    expect(verified).toEqual([DUMMY_KEY_HASH])
  })

  test("the dummy hash is a real SHA-256 hex digest no key hashes to", () => {
    expect(DUMMY_KEY_HASH).toMatch(/^[0-9a-f]{64}$/)
    expect(DUMMY_KEY_HASH).toHaveLength(hashApiKey(generateApiKey().key).length)
  })

  test("a known prefix verifies against its own stored hash", async () => {
    const { key, row } = revokedRow()
    const { verified, call } = setup([row])
    await call(key)
    expect(verified).toEqual([row.secret_hash])
  })
})
