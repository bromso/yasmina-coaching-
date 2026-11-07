/**
 * Virtual time for the runner's tests: `sleep` registers a timer, and `drive(promise)` fires timers
 * in order — advancing `now()` to each — whenever every microtask has settled, until the promise
 * does. Concurrent sleeps overlap exactly as real ones would.
 */
export function fakeClock() {
  let time = 0
  let seq = 0
  const timers: Array<{ at: number; seq: number; resolve: () => void }> = []

  const now = () => time
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.push({ at: time + Math.max(0, ms), seq: seq++, resolve })
    })

  async function drive<T>(promise: Promise<T>): Promise<T> {
    let settled = false
    promise.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    for (;;) {
      await new Promise((resolve) => setImmediate(resolve))
      if (settled) return promise
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq)
      const next = timers.shift()
      if (!next) throw new Error("fakeClock: nothing scheduled and the promise never settled")
      time = next.at
      next.resolve()
    }
  }

  return { now, sleep, drive }
}
