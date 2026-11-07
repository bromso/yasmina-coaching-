/**
 * Dependency-free API key constants: safe for a browser bundle that must not pull in zod or the
 * oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not part
 * of). `api-keys.ts` imports these and re-exports them, so every `@repo/api-contract` import keeps
 * working; a client component (the account app's API keys card) imports them from here instead.
 */

/** What a key may do on `/v1`. A key carries at least one; none is preselected in the UI. */
export const API_SCOPES = ["workspace:read", "members:read", "notes:read", "notes:write"] as const
export type ApiScope = (typeof API_SCOPES)[number]

/** The lifetimes a key may be created with, in days; `null` (no expiry) is the fourth choice. */
export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const
export type ApiKeyExpiryDays = (typeof API_KEY_EXPIRY_DAYS)[number]
/** The create form's preselected lifetime. */
export const DEFAULT_API_KEY_EXPIRY_DAYS: ApiKeyExpiryDays = 90

/** The most live (not revoked, not expired) keys one workspace may hold. Past it
 * `workspaces.apiKeys.create` answers `CONFLICT` `API_KEY_LIMIT_MESSAGE`, decided inside the
 * inserting transaction under the workspace row's lock, so two concurrent creates at
 * `MAX_API_KEYS - 1` cannot both pass. */
export const MAX_API_KEYS = 20

/** A key's name: 1–60 characters after trimming. */
export const API_KEY_NAME_MIN = 1
export const API_KEY_NAME_MAX = 60

/** A key's status, computed at read time from `revoked_at` and `expires_at`. */
export const API_KEY_STATUSES = ["active", "expired", "revoked"] as const
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number]
