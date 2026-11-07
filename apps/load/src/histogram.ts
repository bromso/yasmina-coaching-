/**
 * A log-linear latency histogram (HDR-style, no dependency). Values are recorded in milliseconds
 * and bucketed in whole microseconds: below 128 µs every microsecond is its own bucket; above,
 * each power of two is split into 128 equal buckets, so a reported percentile is within 1/256
 * (≈ 0.4 %) of a recorded value. Range 1 µs … 60 s; anything longer is clamped to 60 s (and `max`
 * still reports the true value).
 */

const SUB_BUCKETS = 128
const SUB_BITS = 7 // log2(SUB_BUCKETS)
const MAX_MICROS = 60_000_000
const MAX_EXPONENT = Math.floor(Math.log2(MAX_MICROS)) - SUB_BITS
const BUCKETS = SUB_BUCKETS + (MAX_EXPONENT + 1) * SUB_BUCKETS

function indexOf(micros: number): number {
  if (micros < SUB_BUCKETS) return micros
  const exponent = Math.floor(Math.log2(micros)) - SUB_BITS
  const sub = Math.floor(micros / 2 ** exponent) - SUB_BUCKETS
  return SUB_BUCKETS + exponent * SUB_BUCKETS + sub
}

/** The bucket's midpoint, in microseconds. */
function midpointOf(index: number): number {
  if (index < SUB_BUCKETS) return index
  const exponent = Math.floor((index - SUB_BUCKETS) / SUB_BUCKETS)
  const sub = (index - SUB_BUCKETS) % SUB_BUCKETS
  const width = 2 ** exponent
  return (SUB_BUCKETS + sub) * width + (width - 1) / 2
}

export type HistogramSummary = {
  count: number
  min: number
  max: number
  mean: number
  p50: number
  p90: number
  p95: number
  p99: number
}

export class Histogram {
  #counts = new Float64Array(BUCKETS)
  #count = 0
  #sum = 0
  #min = Number.POSITIVE_INFINITY
  #max = 0

  /** Records one duration in milliseconds; negative or non-finite values count as 0. */
  record(ms: number): void {
    const value = Number.isFinite(ms) && ms > 0 ? ms : 0
    const micros = Math.min(MAX_MICROS, Math.max(0, Math.round(value * 1000)))
    const index = indexOf(micros)
    this.#counts[index] = (this.#counts[index] ?? 0) + 1
    this.#count += 1
    this.#sum += value
    if (value < this.#min) this.#min = value
    if (value > this.#max) this.#max = value
  }

  get count(): number {
    return this.#count
  }

  get max(): number {
    return this.#count === 0 ? 0 : this.#max
  }

  get min(): number {
    return this.#count === 0 ? 0 : this.#min
  }

  get mean(): number {
    return this.#count === 0 ? 0 : this.#sum / this.#count
  }

  /**
   * The value at percentile `p` (0–100) in milliseconds: the smallest recorded value with at least
   * p % of the samples at or below it. 0 for an empty histogram; always within [min, max].
   */
  percentile(p: number): number {
    if (this.#count === 0) return 0
    if (p >= 100) return this.#max
    if (p <= 0) return this.#min
    const rank = Math.max(1, Math.ceil((Math.min(100, Math.max(0, p)) / 100) * this.#count))
    let seen = 0
    for (let i = 0; i < BUCKETS; i++) {
      seen += this.#counts[i] ?? 0
      if (seen >= rank) {
        return Math.min(this.#max, Math.max(this.#min, midpointOf(i) / 1000))
      }
    }
    return this.#max
  }

  /** Adds every sample of `other` to this histogram. */
  merge(other: Histogram): void {
    for (let i = 0; i < BUCKETS; i++) {
      this.#counts[i] = (this.#counts[i] ?? 0) + (other.#counts[i] ?? 0)
    }
    this.#count += other.#count
    this.#sum += other.#sum
    if (other.#count > 0) {
      this.#min = Math.min(this.#min, other.#min)
      this.#max = Math.max(this.#max, other.#max)
    }
  }

  toJSON(): HistogramSummary {
    return {
      count: this.count,
      min: this.min,
      max: this.max,
      mean: this.mean,
      p50: this.percentile(50),
      p90: this.percentile(90),
      p95: this.percentile(95),
      p99: this.percentile(99),
    }
  }
}

export const createHistogram = (): Histogram => new Histogram()
