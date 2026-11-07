// Workspace API keys: format, hashing, parsing and comparison. Pure — nothing here touches the
// database, the clock or a logger, so nothing here can leak a key anywhere.
//
// A key is `bb_live_<prefix>_<secret>`: `prefix` 8 base62 characters (the lookup key, unique,
// shown in the UI), `secret` 32 random bytes base64url (256 bits). The database stores only the
// SHA-256 of the whole key; the key itself is returned once, by `workspaces.apiKeys.create`.
// The distinctive `bb_live_` tag is what makes a leaked key findable by a secrets scanner.
import { timingSafeEqual } from "node:crypto"
import { API_SCOPES, type ApiKeyStatus, type ApiScope } from "@repo/api-contract/api-keys-limits"
import { newToken, tokenHash } from "./credentials"

/** Every key starts with this. */
export const API_KEY_TAG = "bb_live_"
export const API_KEY_PREFIX_LENGTH = 8

/** The whole key, strictly: no surrounding whitespace, no other tag, exact lengths. */
export const API_KEY_PATTERN = /^bb_live_([0-9A-Za-z]{8})_([A-Za-z0-9_-]{43})$/

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
/** The largest multiple of 62 a byte can hold: bytes at or above it are redrawn, so every
 * character is equally likely (no modulo bias). */
const BASE62_CUTOFF = 248

function randomBase62(length: number): string {
  let out = ""
  while (out.length < length) {
    const bytes = new Uint8Array(length * 2)
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= BASE62_CUTOFF) continue
      out += BASE62[byte % 62]
      if (out.length === length) break
    }
  }
  return out
}

/** SHA-256 hex of the whole key: what `api_keys.secret_hash` holds. */
export const hashApiKey = (key: string): string => tokenHash(key)

/** A fresh key, its prefix and the hash to store. The caller returns `key` once and drops it. */
export function generateApiKey(): { key: string; prefix: string; secretHash: string } {
  const prefix = randomBase62(API_KEY_PREFIX_LENGTH)
  const key = `${API_KEY_TAG}${prefix}_${newToken()}`
  return { key, prefix, secretHash: hashApiKey(key) }
}

/** The prefix of a well-formed key, or null for anything else (strict on format). */
export function parseApiKey(raw: string): { prefix: string } | null {
  const match = API_KEY_PATTERN.exec(raw)
  return match?.[1] ? { prefix: match[1] } : null
}

/** Whether `key` hashes to `storedHash`, compared in constant time. */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const given = Buffer.from(hashApiKey(key))
  const expected = Buffer.from(storedHash)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** A key's status at `now`: revoked wins over expired; expired once `now` reaches `expires_at`. */
export function apiKeyStatus(
  row: { revoked_at: string | null; expires_at: string | null },
  now: Date
): ApiKeyStatus {
  if (row.revoked_at !== null) return "revoked"
  if (row.expires_at !== null && Date.parse(row.expires_at) <= now.getTime()) return "expired"
  return "active"
}

/** A stored scopes column as the known scopes it names (anything else is dropped, never shown). */
export const parseScopes = (text: string): ApiScope[] => {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? API_SCOPES.filter((scope) => value.includes(scope)) : []
  } catch {
    return []
  }
}
