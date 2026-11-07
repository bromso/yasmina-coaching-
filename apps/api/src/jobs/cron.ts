// 5 fields, UTC, minute precision. Day-of-month and day-of-week: when both are restricted, either
// matches (Vixie cron semantics) — matched by cronMatches below.
type Field = Set<number>
export type CronSpec = {
  minute: Field
  hour: Field
  dom: Field
  month: Field
  dow: Field
  domAny: boolean
  dowAny: boolean
}

const RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
] as const

// Plain digits only: `Number("")` is 0, and `Number` also accepts "1e1" and "0x1" — none of
// those are valid cron numbers, so every numeric token is checked against this before use.
const DIGITS = /^\d+$/

function toInt(text: string | undefined, part: string): number {
  if (text === undefined || !DIGITS.test(text)) throw new Error(`bad number in "${part}"`)
  return Number(text)
}

function field(text: string, [min, max]: readonly [number, number]): Field {
  const out = new Set<number>()
  for (const part of text.split(",")) {
    const [range, stepText, ...extra] = part.split("/")
    if (extra.length > 0) throw new Error(`bad step in "${part}"`)
    const step = stepText === undefined ? 1 : toInt(stepText, part)
    if (step < 1) throw new Error(`bad step in "${part}"`)
    let lo: number
    let hi: number
    if (range === "*") [lo, hi] = [min, max]
    else if (range?.includes("-")) {
      const bounds = range.split("-")
      if (bounds.length !== 2) throw new Error(`bad range in "${part}"`)
      lo = toInt(bounds[0], part)
      hi = toInt(bounds[1], part)
    } else {
      lo = toInt(range, part)
      hi = stepText === undefined ? lo : max
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`bad range in "${part}"`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

/** Parses a 5-field cron expression (minute hour dom month dow). Throws on anything invalid. */
export function parseCron(expression: string): CronSpec {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`cron needs 5 fields: "${expression}"`)
  const [minute, hour, dom, month, dow] = parts.map((p, i) =>
    field(p, RANGES[i] as readonly [number, number])
  )
  if (dow?.has(7)) dow.add(0)
  // Vixie semantics: a field counts as "unspecified" (and so drops out of the dom/dow OR) when
  // the user wrote it starting with "*", even "*/2" — not only when the resulting value set
  // happens to be the full range.
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domAny: (parts[2] ?? "").startsWith("*"),
    dowAny: (parts[4] ?? "").startsWith("*"),
  } as CronSpec
}

/** Whether `at` (read in UTC) falls on a minute `spec` matches. */
export function cronMatches(spec: CronSpec, at: Date): boolean {
  if (!spec.minute.has(at.getUTCMinutes()) || !spec.hour.has(at.getUTCHours())) return false
  if (!spec.month.has(at.getUTCMonth() + 1)) return false
  const domOk = spec.dom.has(at.getUTCDate())
  const dowOk = spec.dow.has(at.getUTCDay())
  if (spec.domAny && spec.dowAny) return true
  if (spec.domAny) return dowOk
  if (spec.dowAny) return domOk
  return domOk || dowOk
}
