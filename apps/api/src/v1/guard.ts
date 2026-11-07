// The /v1 guard: an API key is the only credential `/v1/*` accepts — never the service token,
// never a session. Every refusal answers the same `401 unauthorized` (no oracle for why), and
// every check reads the database on each request, so a revoked key, an expired one or a
// workspace that lost the `api` feature is refused at once, with no cache window.
import { hasFeature } from "@repo/api-contract"
import type { ApiScope } from "@repo/api-contract/api-keys-limits"
import type { RateLimiter } from "@repo/service-kit"
import { apiKeyStatus, hashApiKey, parseApiKey, parseScopes, verifyApiKey } from "../api-keys"
import { entitlementsForWorkspace } from "../billing/entitlements"
import type { BillingProvider } from "../billing/provider"
import { tokenHash } from "../credentials"
import type { Db } from "../db"
import { RATE_LIMITED_MESSAGE, UNAUTHORIZED_MESSAGE, v1Error } from "./errors"

/** The key a /v1 request acts as. Never the key itself, never its hash. */
export type V1Key = { id: number; workspaceId: number; name: string; scopes: ApiScope[] }

/** `last_used_at` is written at most this often per key. */
export const LAST_USED_THROTTLE_MS = 60_000

/** A revoked key's use is logged and recorded as telemetry at most this often per key; the uses
 * in between are counted and the next report carries the count. */
export const REVOKED_REPORT_INTERVAL_MS = 60_000

/**
 * What a prefix miss compares the presented key against: the SHA-256 of a string no key can be
 * (it lacks the `bb_live_` format). Without it, an unknown prefix would answer before any hashing
 * while a known one hashes and compares first — a timing difference that tells a caller whether a
 * prefix exists. The prefix is not secret, but there is no reason to answer that question.
 */
export const DUMMY_KEY_HASH = hashApiKey("not-an-api-key")

export type ApiKeyGuardDeps = {
  db: Db
  billing: Pick<BillingProvider, "kind">
  now: () => Date
  /** `api-key:<id>`, 600 a minute by default: counts only fully authenticated requests. */
  limiter: RateLimiter
  /**
   * `v1-anon:<ip hash>`, 60 a minute by default: counts every refused request (no key, a
   * malformed, unknown, revoked or expired one, a deleted workspace, a lost feature) per caller
   * address — the socket's, as `protect`'s own fallback key uses; behind a proxy that is the
   * proxy's, so every caller behind it shares one budget. A valid key is never counted or held.
   */
  anonLimiter: RateLimiter
  /** Logs and records a failure as telemetry (`recordFailure`): a revoked key's use, a failed
   * `last_used_at` write. Never given key material. */
  recordFailure: (message: string, error: unknown) => void
  /** Counts a limiter refusal (`/metrics`), by limiter label. */
  onRateLimited?: (limiter: "api-key" | "api-anon") => void
  /** The hash compare; `verifyApiKey` unless a test watches it. */
  verify?: (key: string, storedHash: string) => boolean
}

const rateLimited = (retryAfterSeconds: number) =>
  v1Error("rate_limited", RATE_LIMITED_MESSAGE, {
    headers: { "retry-after": String(retryAfterSeconds) },
  })

/** `v1-anon:` + 32 hex chars of SHA-256(address) — the same scheme as `@repo/session`'s
 * `anon:<hash>` client ids — so the raw address is never a limiter key. */
export const anonKey = (ip: string | null) =>
  `v1-anon:${ip === null ? "unknown" : tokenHash(ip).slice(0, 32)}`

const unauthorized = () =>
  v1Error("unauthorized", UNAUTHORIZED_MESSAGE, { headers: { "www-authenticate": "Bearer" } })

/** Exactly `Bearer <key>`: one space, no other scheme, no trimming of the key itself. */
const BEARER = /^Bearer (\S+)$/i

/**
 * Resolves a request's key, or the response refusing it. The order: parse, look up by prefix,
 * compare the hash in constant time (against `DUMMY_KEY_HASH` on a miss), then revoked/expired
 * (from the row, no further read), then the workspace's existence and its `api` feature (read
 * now, every time), and only then the per-key limiter — so a key of a workspace without the
 * feature is refused 401, never counted or answered 429.
 */
export function createApiKeyGuard(deps: ApiKeyGuardDeps) {
  const verify = deps.verify ?? verifyApiKey
  // In memory, per process: when each key's `last_used_at` was last written. So `last_used_at` is
  // approximate: up to a minute stale, and with several replicas (each throttling on its own) two
  // writes can commit out of order and step it back by up to that minute.
  const touched = new Map<number, number>()

  async function touch(id: number, now: Date) {
    const at = now.getTime()
    const last = touched.get(id)
    if (last !== undefined && at - last < LAST_USED_THROTTLE_MS) return
    if (touched.size >= 10_000) {
      for (const [key, value] of touched)
        if (at - value >= LAST_USED_THROTTLE_MS) touched.delete(key)
    }
    touched.set(id, at)
    try {
      await deps.db.apiKeys.touchLastUsed(id, now.toISOString())
    } catch (error) {
      // A use stamp must never fail the request it rides on.
      deps.recordFailure("api key: last_used_at write failed", error)
    }
  }

  // In memory, per process: when each revoked key's use was last reported, and the uses since.
  // A leaked, revoked key in a stuck loop would otherwise write a log line and a telemetry upsert
  // per request; this keeps it to one a minute per key, the count carried in the message.
  const revokedReports = new Map<number, { at: number; uses: number }>()

  function reportRevokedUse(row: { id: number; workspace_id: number }, now: Date) {
    const at = now.getTime()
    const last = revokedReports.get(row.id)
    if (last && at - last.at < REVOKED_REPORT_INTERVAL_MS) {
      last.uses += 1
      return
    }
    if (revokedReports.size >= 10_000) {
      for (const [key, value] of revokedReports)
        if (at - value.at >= REVOKED_REPORT_INTERVAL_MS) revokedReports.delete(key)
    }
    const uses = (last?.uses ?? 0) + 1
    revokedReports.set(row.id, { at, uses: 0 })
    // Ids only: no key, no prefix, no hash.
    deps.recordFailure(
      "api key: revoked key used",
      new Error(
        `revoked API key ${row.id} of workspace ${row.workspace_id} was used ` +
          `(${uses} ${uses === 1 ? "use" : "uses"} since the last report)`
      )
    )
  }

  /** A refusal: counted against the caller's address; past its budget, 429 instead of 401. */
  async function refuse(ip: string | null): Promise<{ response: Response }> {
    const verdict = await deps.anonLimiter.hit(anonKey(ip))
    if (verdict.allowed) return { response: unauthorized() }
    deps.onRateLimited?.("api-anon")
    return { response: rateLimited(verdict.retryAfterSeconds) }
  }

  /**
   * Authenticates fully first — parse, look up, compare, revoked/expired, the workspace exists,
   * the `api` feature — then the per-key limiter. A refusal at any step is 401 (or 429 once the
   * caller's address is past `anonLimiter`'s budget); a key that passes is never counted there.
   */
  return async (
    req: Request,
    ip: string | null
  ): Promise<{ key: V1Key } | { response: Response }> => {
    const raw = BEARER.exec(req.headers.get("authorization") ?? "")?.[1]
    const parsed = raw ? parseApiKey(raw) : null
    if (!raw || !parsed) return refuse(ip)
    const row = await deps.db.apiKeys.findByPrefix(parsed.prefix)
    // A miss still hashes and compares (see `DUMMY_KEY_HASH`), so it costs what a hit does.
    if (!verify(raw, row?.secret_hash ?? DUMMY_KEY_HASH) || !row) return refuse(ip)

    const now = deps.now()
    const status = apiKeyStatus(row, now)
    if (status === "revoked") {
      // Every use is counted, a 429'd one too; reported at most once a minute per key.
      reportRevokedUse(row, now)
      return refuse(ip)
    }
    if (status === "expired") return refuse(ip)

    // The cascade deletes a workspace's keys; this still refuses a key whose workspace is gone.
    if (!(await deps.db.workspaces.find(row.workspace_id))) return refuse(ip)
    const entitlements = await entitlementsForWorkspace(deps.db, row.workspace_id, deps.billing)
    if (!hasFeature(entitlements, "api")) return refuse(ip)

    const verdict = await deps.limiter.hit(`api-key:${row.id}`)
    if (!verdict.allowed) {
      deps.onRateLimited?.("api-key")
      return { response: rateLimited(verdict.retryAfterSeconds) }
    }

    await touch(row.id, now)
    return {
      key: {
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        scopes: parseScopes(row.scopes),
      },
    }
  }
}
