const BASE_MS = 30_000
const CAP_MS = 60 * 60_000

/** Delay before the next try after `attempts` failed ones: 30 s doubling, capped at 1 h, ±20 %. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BASE_MS * 2 ** Math.max(0, attempts - 1), CAP_MS)
  return Math.round(base * (0.8 + 0.4 * random()))
}
