export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/** Implement this over a shared store (e.g. Bun.redis) when running more than one instance. */
export interface RateLimiter {
  hit(key: string): RateLimitResult | Promise<RateLimitResult>
  /** Peeks whether `key` is over budget, without counting — optional until every store has it. */
  check?(key: string): RateLimitResult | Promise<RateLimitResult>
}

/**
 * A limiter that counts only failures, atomically: a caller reserves an attempt with `hit` before
 * it checks anything (so a concurrent burst cannot all pass a peek first), then gives the
 * reservation back with `refund` once the attempt turns out to have succeeded.
 */
export type FailureLimiter = {
  hit(key: string): RateLimitResult | Promise<RateLimitResult>
  refund(key: string): void | Promise<void>
}

type Window = { start: number; count: number }

/**
 * Fixed-window counter held in memory, per process. At most `maxKeys` windows are kept: a new key
 * at the cap first drops expired windows, then evicts the oldest one (whose counter restarts if it
 * comes back), so a flood of distinct keys cannot grow memory without bound.
 */
export function createMemoryRateLimiter({
  limit,
  windowMs,
  maxKeys = 50_000,
  now = Date.now,
}: {
  limit: number
  windowMs: number
  maxKeys?: number
  now?: () => number
}): Omit<RateLimiter, "hit" | "check"> & {
  hit(key: string): RateLimitResult
  check(key: string): RateLimitResult
  refund(key: string): void
  size(): number
} {
  // Insertion order is start order: a window is re-inserted whenever it restarts.
  const windows = new Map<string, Window>()
  let lastSweep = now()

  // Every window has the same length, so the expired ones are always at the front: stop at the
  // first live one. A full scan here would cost O(keys) on every new key during a flood.
  const sweep = (t: number) => {
    for (const [k, w] of windows) {
      if (t - w.start < windowMs) break
      windows.delete(k)
    }
    lastSweep = t
  }

  return {
    hit(key) {
      const t = now()

      // Drop expired windows at most once per window length.
      if (t - lastSweep >= windowMs) sweep(t)

      const current = windows.get(key)
      if (!current || t - current.start >= windowMs) {
        if (!current && windows.size >= maxKeys) {
          sweep(t)
          const oldest = windows.keys().next()
          if (windows.size >= maxKeys && !oldest.done) windows.delete(oldest.value)
        }
        windows.delete(key)
        windows.set(key, { start: t, count: 1 })
        return { allowed: true }
      }
      if (current.count < limit) {
        current.count++
        return { allowed: true }
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((current.start + windowMs - t) / 1000))
      return { allowed: false, retryAfterSeconds }
    },
    check(key) {
      const t = now()
      const current = windows.get(key)
      if (!current || t - current.start >= windowMs || current.count < limit)
        return { allowed: true }
      const retryAfterSeconds = Math.max(1, Math.ceil((current.start + windowMs - t) / 1000))
      return { allowed: false, retryAfterSeconds }
    },
    // Gives back one counted hit of the live window: never below 0, and nothing to give back
    // once the window has expired (the next hit starts a fresh one anyway).
    refund(key) {
      const current = windows.get(key)
      if (!current || now() - current.start >= windowMs) return
      current.count = Math.max(0, current.count - 1)
    },
    size: () => windows.size,
  }
}
