import { describe, expect, test } from "bun:test"
import {
  API_KEY_LIMIT_MESSAGE,
  API_SCOPES,
  ApiKeyIdSchema,
  ApiKeySummarySchema,
  CreateApiKeySchema,
  MAX_API_KEYS,
} from "./api-keys"
import * as limits from "./api-keys-limits"
import { FEATURE_MESSAGES, FEATURES, PLANS } from "./billing"
import { contract } from "./index"

describe("API key schemas", () => {
  const base = { workspaceId: 1, name: "CI", scopes: ["notes:read"], expiresInDays: 90 }

  test("the four scopes, in order", () => {
    expect(API_SCOPES).toEqual(["workspace:read", "members:read", "notes:read", "notes:write"])
  })

  test("create: a trimmed 1–60 char name without control characters", () => {
    expect(CreateApiKeySchema.parse({ ...base, name: "  CI  " }).name).toBe("CI")
    expect(CreateApiKeySchema.safeParse({ ...base, name: " " }).success).toBe(false)
    expect(CreateApiKeySchema.safeParse({ ...base, name: "x".repeat(60) }).success).toBe(true)
    expect(CreateApiKeySchema.safeParse({ ...base, name: "x".repeat(61) }).success).toBe(false)
    expect(CreateApiKeySchema.safeParse({ ...base, name: "a\nb" }).success).toBe(false)
  })

  test("create: at least one known scope, each at most once", () => {
    expect(CreateApiKeySchema.safeParse({ ...base, scopes: [] }).success).toBe(false)
    expect(CreateApiKeySchema.safeParse({ ...base, scopes: ["admin"] }).success).toBe(false)
    expect(
      CreateApiKeySchema.safeParse({ ...base, scopes: ["notes:read", "notes:read"] }).success
    ).toBe(false)
    expect(CreateApiKeySchema.safeParse({ ...base, scopes: [...API_SCOPES] }).success).toBe(true)
  })

  test("create: 30, 90 or 365 days, or null; the field is required", () => {
    for (const days of [30, 90, 365, null])
      expect(CreateApiKeySchema.safeParse({ ...base, expiresInDays: days }).success).toBe(true)
    for (const days of [0, 1, 7, 180, "90"])
      expect(CreateApiKeySchema.safeParse({ ...base, expiresInDays: days }).success).toBe(false)
    const { expiresInDays: _, ...without } = base
    expect(CreateApiKeySchema.safeParse(without).success).toBe(false)
  })

  test("the summary carries no key and no hash", () => {
    const keys = Object.keys(ApiKeySummarySchema.shape)
    expect(keys).not.toContain("key")
    expect(keys).not.toContain("secretHash")
    expect(keys).not.toContain("secret_hash")
  })

  test("revoke's id coerces like every path parameter", () => {
    expect(ApiKeyIdSchema.parse({ workspaceId: "2", id: "3" })).toEqual({ workspaceId: 2, id: 3 })
  })

  test("the limit message names MAX_API_KEYS", () => {
    expect(API_KEY_LIMIT_MESSAGE).toContain(String(MAX_API_KEYS))
  })
})

describe("the api-keys-limits subpath", () => {
  test("is Zod-free: plain values only, the same ones the schemas use", () => {
    expect(limits.MAX_API_KEYS).toBe(20)
    expect(limits.API_KEY_EXPIRY_DAYS).toEqual([30, 90, 365])
    expect(limits.DEFAULT_API_KEY_EXPIRY_DAYS).toBe(90)
    expect(limits.API_KEY_NAME_MAX).toBe(60)
    expect(limits.API_KEY_STATUSES).toEqual(["active", "expired", "revoked"])
    expect(limits.API_SCOPES).toBe(API_SCOPES)
  })
})

describe("the api feature", () => {
  test("is a paid feature (Pro and Team) with an upgrade message", () => {
    expect(FEATURES).toContain("api")
    expect(PLANS.free.features).not.toContain("api")
    expect(PLANS.pro.features).toContain("api")
    expect(PLANS.team.features).toContain("api")
    expect(FEATURE_MESSAGES.api).toBe("Upgrade to use the API")
  })
})

describe("workspaces.apiKeys in the contract", () => {
  test("list, create and revoke exist", () => {
    expect(contract.workspaces.apiKeys.list).toBeDefined()
    expect(contract.workspaces.apiKeys.create).toBeDefined()
    expect(contract.workspaces.apiKeys.revoke).toBeDefined()
  })
})
