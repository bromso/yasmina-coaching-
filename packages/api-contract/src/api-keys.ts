import { z } from "zod"
import {
  API_KEY_EXPIRY_DAYS,
  API_KEY_NAME_MAX,
  API_KEY_NAME_MIN,
  API_KEY_STATUSES,
  API_SCOPES,
  type ApiKeyExpiryDays,
  type ApiKeyStatus,
  type ApiScope,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  MAX_API_KEYS,
} from "./api-keys-limits"
import { WorkspaceIdSchema } from "./ids"

// Kept narrow like passkeys.ts: zod and ./ids only. The `workspaces.apiKeys.*` procedures in
// index.ts use these shapes. The plain constants live in the dependency-free `./api-keys-limits`
// (re-exported below) so a client component can import them without zod or the contract.

export type { ApiKeyExpiryDays, ApiKeyStatus, ApiScope }
export {
  API_KEY_EXPIRY_DAYS,
  API_KEY_NAME_MAX,
  API_KEY_NAME_MIN,
  API_KEY_STATUSES,
  API_SCOPES,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  MAX_API_KEYS,
}

export const ApiScopeSchema = z.enum(API_SCOPES)
export const ApiKeyStatusSchema = z.enum(API_KEY_STATUSES)

// No control characters: the name reaches audit rows and, later, the notes list.
export const ApiKeyNameSchema = z
  .string()
  .trim()
  .min(API_KEY_NAME_MIN)
  .max(API_KEY_NAME_MAX)
  .regex(/^[^\p{Cc}]*$/u, "Name contains an invalid character")

/** At least one scope, each at most once. */
export const ApiScopesSchema = z
  .array(ApiScopeSchema)
  .min(1)
  .max(API_SCOPES.length)
  .refine((scopes) => new Set(scopes).size === scopes.length, "Each scope at most once")

/** 30, 90 or 365 days, or `null` for a key that never expires. */
export const ApiKeyExpirySchema = z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable()

/** `workspaces.apiKeys.list`'s rows: never the key, never its hash. */
export const ApiKeySummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  /** The 8 characters after `bb_live_`: enough to recognise a key, never enough to use one. */
  prefix: z.string(),
  scopes: z.array(ApiScopeSchema),
  /** Null when the creator's account is gone (purged) or was never recorded. */
  createdBy: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  /** True when the creator is no longer a member of the workspace (or is gone). The key keeps
   * working: it belongs to the workspace, not to them. */
  creatorLeft: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  status: ApiKeyStatusSchema,
})
export type ApiKeySummary = z.infer<typeof ApiKeySummarySchema>

export const ApiKeyListSchema = z.object({ items: z.array(ApiKeySummarySchema) })
export type ApiKeyList = z.infer<typeof ApiKeyListSchema>

export const CreateApiKeySchema = WorkspaceIdSchema.extend({
  name: ApiKeyNameSchema,
  scopes: ApiScopesSchema,
  expiresInDays: ApiKeyExpirySchema,
})
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>

/** `create`'s answer: the full key, here and nowhere else, ever. */
export const CreatedApiKeySchema = z.object({
  key: z.string(),
  apiKey: ApiKeySummarySchema,
})
export type CreatedApiKey = z.infer<typeof CreatedApiKeySchema>

export const ApiKeyIdSchema = WorkspaceIdSchema.extend({ id: z.coerce.number().int().positive() })
export type ApiKeyId = z.infer<typeof ApiKeyIdSchema>

/** Creating a key in a workspace that already holds `MAX_API_KEYS` live ones. */
export const API_KEY_LIMIT_MESSAGE =
  "A workspace can have up to 20 active API keys. Revoke one to create another."

/** `revoke` for an id that is not one of this workspace's keys. */
export const API_KEY_NOT_FOUND_MESSAGE = "API key not found"
