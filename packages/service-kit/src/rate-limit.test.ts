import { expect, test } from "bun:test"
import { createMemoryRateLimiter } from "./rate-limit"

function clock(start = 0) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

test("allows `limit` hits per window, then reports when to retry", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 60_000, now: c.now })
  expect(limiter.hit("a")).toEqual({ allowed: true })
  expect(limiter.hit("a")).toEqual({ allowed: true })
  c.advance(15_000)
  expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 45 })
})

test("keys are independent", () => {
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now })
  expect(limiter.hit("a").allowed).toBe(true)
  expect(limiter.hit("b").allowed).toBe(true)
  expect(limiter.hit("a").allowed).toBe(false)
})

test("a new window starts after the old one expires", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, now: c.now })
  limiter.hit("a")
  expect(limiter.hit("a").allowed).toBe(false)
  c.advance(1_000)
  expect(limiter.hit("a").allowed).toBe(true)
})

test("retryAfterSeconds is at least 1", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, now: c.now })
  limiter.hit("a")
  c.advance(999)
  expect(limiter.hit("a")).toEqual({ allowed: false, retryAfterSeconds: 1 })
})

test("expired windows are pruned so memory does not grow with every client", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 5, windowMs: 1_000, now: c.now })
  for (let i = 0; i < 100; i++) limiter.hit(`client-${i}`)
  expect(limiter.size()).toBe(100)
  c.advance(1_000)
  limiter.hit("late")
  expect(limiter.size()).toBe(1)
})

test("maxKeys bounds memory: expired windows go first, then the oldest key", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2, now: c.now })
  limiter.hit("a")
  c.advance(600)
  limiter.hit("b")
  c.advance(500) // "a" (1100 ms old) has expired, "b" (500 ms) has not
  limiter.hit("c")
  expect(limiter.size()).toBe(2)
  expect(limiter.hit("b").allowed).toBe(false) // survived: its window is still live
  limiter.hit("d") // full of live windows ("b", "c"): the oldest, "b", is evicted
  expect(limiter.size()).toBe(2)
  expect(limiter.hit("c").allowed).toBe(false)
  expect(limiter.hit("b").allowed).toBe(true) // evicted, so it starts a fresh window
})

test("maxKeys defaults to 50,000", () => {
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 60_000 })
  for (let i = 0; i < 50_001; i++) limiter.hit(`k${i}`)
  expect(limiter.size()).toBe(50_000)
})

test("a window that restarts moves to the back, so eviction takes the oldest start", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2, now: c.now })
  c.advance(500)
  limiter.hit("a") // start 500
  c.advance(500)
  limiter.hit("b") // start 1000; the periodic sweep runs here, "a" is still live
  c.advance(500)
  limiter.hit("a") // expired, no sweep due: restarts at 1500 and must move behind "b"
  c.advance(100)
  limiter.hit("c") // at the cap, nothing expired: "b" (oldest start) goes, not "a"
  expect(limiter.hit("a").allowed).toBe(false)
  expect(limiter.hit("b").allowed).toBe(true)
})

test("maxKeys: 1 keeps only the newest key", () => {
  const c = clock()
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 1, now: c.now })
  limiter.hit("a")
  limiter.hit("b")
  expect(limiter.size()).toBe(1)
  expect(limiter.hit("b").allowed).toBe(false)
  expect(limiter.hit("a").allowed).toBe(true)
})

test("check peeks without counting", () => {
  let t = 0
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => t })
  expect(limiter.check("k")).toEqual({ allowed: true })
  expect(limiter.check("k")).toEqual({ allowed: true })
  limiter.hit("k")
  limiter.hit("k")
  expect(limiter.check("k").allowed).toBe(false) // the budget is spent
  expect(limiter.hit("k").allowed).toBe(false)
  t = 1000
  expect(limiter.check("k")).toEqual({ allowed: true }) // the window passed
  expect(limiter.size()).toBe(1) // check never creates a window
})

test("refund gives back one hit of the live window, never below 0", () => {
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 })
  limiter.hit("k")
  limiter.hit("k")
  expect(limiter.hit("k").allowed).toBe(false)
  limiter.refund("k")
  expect(limiter.hit("k").allowed).toBe(true) // the refunded slot
  expect(limiter.hit("k").allowed).toBe(false)
  limiter.refund("k")
  limiter.refund("k")
  limiter.refund("k") // more refunds than hits: the count stops at 0
  expect(limiter.hit("k").allowed).toBe(true)
  expect(limiter.hit("k").allowed).toBe(true)
  expect(limiter.hit("k").allowed).toBe(false)
})

test("refund without a live window is a no-op", () => {
  let t = 0
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 1000, now: () => t })
  limiter.refund("missing")
  expect(limiter.size()).toBe(0) // refund never creates a window
  limiter.hit("k")
  t = 1000
  limiter.refund("k") // the window expired: nothing to give back
  expect(limiter.hit("k").allowed).toBe(true) // a fresh window
  expect(limiter.hit("k").allowed).toBe(false)
})

test("a new key at the cap stays cheap with many live windows", () => {
  // Relative, not absolute: CI runs the service suites in parallel (one of them starts a real api
  // and ai), so a wall-clock threshold flakes. Measured on one machine: a hit below the cap ~0.5 µs,
  // a new key at the cap with the early stop ~30 µs (~60×), a full sweep ~300 µs (~600×). 150×
  // sits between the two and moves with the machine's speed.
  const timeHits = (limiter: ReturnType<typeof createMemoryRateLimiter>, prefix: string) => {
    const started = performance.now()
    for (let i = 0; i < 20_000; i++) limiter.hit(`${prefix}${i}`)
    return performance.now() - started
  }
  const baseline = timeHits(
    createMemoryRateLimiter({ limit: 1, windowMs: 600_000, maxKeys: 50_000 }),
    "base"
  )
  const limiter = createMemoryRateLimiter({ limit: 1, windowMs: 600_000, maxKeys: 50_000 })
  for (let i = 0; i < 50_000; i++) limiter.hit(`k${i}`)
  const atCap = timeHits(limiter, "new")
  expect(atCap).toBeLessThan(Math.max(baseline * 150, 50))
  expect(limiter.size()).toBe(50_000)
})
