/**
 * The security allowlist (`security/allowlist.json`) and the pure rules every scanner in
 * `scripts/security/` applies to its findings: validation, the severity gate, expiry and
 * staleness. See `docs/superpowers/specs/2026-10-17-security-scanning-design.md` section 1 and
 * `.superpowers/sdd/2026-10-17-security-scanning/constraints.md`.
 *
 * `bun test scripts` runs before `bun install`, so this file imports nothing beyond Bun/Node
 * built-ins and repo-relative files — no `apps/*` or `packages/*` dependency.
 *
 * This module does no I/O except `loadAllowlist`: everything else is a pure function over plain
 * data, so the scanners (and their tests) can inject `today` and fixture JSON instead of relying
 * on the clock or the filesystem.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

export const SCANNERS = ["audit", "image", "secrets"] as const
export type Scanner = (typeof SCANNERS)[number]

export const IMAGES = ["app", "api", "ai"] as const
export type Image = (typeof IMAGES)[number]

/**
 * `bun audit` reports low/moderate/high/critical; Trivy reports LOW/MEDIUM/HIGH/CRITICAL
 * (normalised lowercase by `image.ts`, hence `"medium"` alongside `"moderate"`); a secret is
 * always `"secret"`. Only `GATING_SEVERITIES` fail a run — the rest are reported only.
 */
export const SEVERITIES = ["low", "moderate", "medium", "high", "critical", "secret"] as const
export type Severity = (typeof SEVERITIES)[number]

export const GATING_SEVERITIES: ReadonlySet<Severity> = new Set(["high", "critical", "secret"])

/** No `expires` may be more than this many days after the run's own date. */
export const MAX_EXPIRES_DAYS = 180

export const DEFAULT_ALLOWLIST_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "security",
  "allowlist.json"
)

/** One normalised result row from a scanner, after its own tool's JSON has been parsed. */
export type Finding = {
  scanner: Scanner
  id: string
  severity: Severity
  package?: string
  image?: string
  file?: string
  line?: number
  installed?: string
  fixed?: string
  url?: string
  title?: string
}

/** One reviewed, expiring exception in `security/allowlist.json`. */
export type Entry = {
  scanner: Scanner
  id: string
  package?: string
  image?: string
  file?: string
  line?: number
  reason: string
  /** ISO date (`YYYY-MM-DD`); the last day the entry is still valid (inclusive). */
  expires: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isScanner = (value: unknown): value is Scanner =>
  typeof value === "string" && (SCANNERS as readonly string[]).includes(value)

const isImage = (value: unknown): value is Image =>
  typeof value === "string" && (IMAGES as readonly string[]).includes(value)

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a strict `YYYY-MM-DD` string into a UTC midnight `Date`, or `null` when the string
 * isn't that shape or isn't a real calendar date (`Date.UTC` silently rolls `2026-02-30` into
 * March, so the result is round-tripped back through its own fields to catch that).
 */
function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

const toUtcMidnight = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from `b` to `a` (positive when `a` is later), both already UTC midnight. */
const diffDays = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / DAY_MS)

/**
 * Validates raw JSON against the allowlist shape and returns the entries that passed, plus one
 * error per problem found — each naming the entry's index and field, so a reviewer (or CI's log)
 * can find it in the file without a line number. An entry with any problem is left out of
 * `entries` entirely, never partially included.
 *
 * `today` is the run's own date (UTC), injected rather than read from the clock so this stays a
 * pure function: it is only used to cap how far in the future `expires` may be. Whether an entry
 * has *already* expired is judged later, by `decide`, against its own `today`.
 */
export function parseAllowlist(raw: unknown, today: Date): { entries: Entry[]; errors: string[] } {
  if (!Array.isArray(raw)) {
    return { entries: [], errors: ["the allowlist must be a JSON array"] }
  }

  const todayUtc = toUtcMidnight(today)
  const entries: Entry[] = []
  const errors: string[] = []

  raw.forEach((item, i) => {
    const fail = (field: string, message: string) =>
      errors.push(`allowlist[${i}].${field}: ${message}`)

    if (!isRecord(item)) {
      errors.push(`allowlist[${i}]: must be an object`)
      return
    }

    let ok = true

    if (!isScanner(item.scanner)) {
      fail("scanner", `must be one of ${SCANNERS.map((s) => `"${s}"`).join(", ")}`)
      ok = false
    }
    const scanner = item.scanner as Scanner | undefined

    if (typeof item.id !== "string" || item.id.length === 0) {
      fail("id", "must be a non-empty string")
      ok = false
    }

    if (scanner === "audit" || scanner === "image") {
      if (typeof item.package !== "string" || item.package.length === 0) {
        fail("package", 'is required for "audit" and "image" entries')
        ok = false
      }
    }

    if (scanner === "image" && !isImage(item.image)) {
      fail("image", `must be one of ${IMAGES.map((i) => `"${i}"`).join(", ")} for "image" entries`)
      ok = false
    }

    if (scanner === "secrets") {
      if (typeof item.file !== "string" || item.file.length === 0) {
        fail("file", 'is required for "secrets" entries')
        ok = false
      }
      if (
        item.line !== undefined &&
        (typeof item.line !== "number" || !Number.isInteger(item.line) || item.line <= 0)
      ) {
        fail("line", "must be a positive integer when present")
        ok = false
      }
    }

    if (typeof item.reason !== "string" || item.reason.length < 20) {
      fail("reason", "must be at least 20 characters")
      ok = false
    }

    const expiresDate = typeof item.expires === "string" ? parseIsoDate(item.expires) : null
    if (!expiresDate) {
      fail("expires", 'must be an ISO date ("YYYY-MM-DD")')
      ok = false
    } else if (diffDays(expiresDate, todayUtc) > MAX_EXPIRES_DAYS) {
      fail("expires", `must be no more than ${MAX_EXPIRES_DAYS} days after today`)
      ok = false
    }

    if (!ok) return

    entries.push({
      scanner: scanner as Scanner,
      id: item.id as string,
      package: item.package as string | undefined,
      image: item.image as string | undefined,
      file: item.file as string | undefined,
      line: item.line as number | undefined,
      reason: item.reason as string,
      expires: item.expires as string,
    })
  })

  return { entries, errors }
}

/** Exact per-field match: same scanner and id, plus whatever else that scanner cares about. */
function matches(finding: Finding, entry: Entry): boolean {
  if (finding.scanner !== entry.scanner || finding.id !== entry.id) return false
  if (finding.scanner === "audit" || finding.scanner === "image") {
    if (finding.package !== entry.package) return false
  }
  if (finding.scanner === "image" && finding.image !== entry.image) return false
  if (finding.scanner === "secrets") {
    if (finding.file !== entry.file) return false
    if (entry.line !== undefined && finding.line !== entry.line) return false
  }
  return true
}

/**
 * Applies the allowlist to one scanner run's findings.
 *
 * - A gating finding (high, critical or secret) fails unless an unexpired entry matches it
 *   exactly; otherwise it is `allowed`.
 * - Anything below the gate is always `reported`: matching never changes its fate, and it is
 *   never counted toward `failing`, `allowed` or staleness's "matched" set below.
 * - `expired` is every entry in `entries` whose `expires` is before `today` — this is a date
 *   check only, so it is not scoped to `run`: a shared file with one expired entry fails every
 *   scanner's run until it is renewed or removed, not just the scanner that happens to own it.
 *   `expires` is the last valid day (inclusive): an entry expiring today is still active today.
 * - `stale` is only judged for entries *this run could possibly have matched* — same scanner as
 *   `run.scanner`, and for `image` entries, the same image as `run.image` — so a run that legitimately
 *   skipped a scanner or an image never calls that scanner's or image's entries stale.
 * - `run.judgeStale: false` turns staleness off for the run entirely (default `true`). A secrets
 *   scan of a commit range (CI's `--range base..head`) sees only that range's own commits, so an
 *   entry for a finding in an older commit would match nothing there and read as stale on every
 *   PR that does not touch it; only working-tree and `--history` runs, which see everything,
 *   judge secrets entries stale. Expiry is unaffected.
 */
export function decide(
  findings: Finding[],
  entries: Entry[],
  run: { scanner: Scanner; image?: string; judgeStale?: boolean },
  today: Date
): {
  failing: Finding[]
  allowed: Finding[]
  reported: Finding[]
  expired: Entry[]
  stale: Entry[]
} {
  const todayUtc = toUtcMidnight(today)

  const isExpired = (entry: Entry): boolean => {
    const expiresDate = parseIsoDate(entry.expires)
    // parseAllowlist already rejects an unparseable expires; treat one here defensively as
    // expired so a hand-edited or otherwise corrupt entry can never silently allow anything.
    if (!expiresDate) return true
    return expiresDate.getTime() < todayUtc.getTime()
  }

  const failing: Finding[] = []
  const allowed: Finding[] = []
  const reported: Finding[] = []

  for (const finding of findings) {
    if (!GATING_SEVERITIES.has(finding.severity)) {
      reported.push(finding)
      continue
    }
    const isAllowed = entries.some((entry) => matches(finding, entry) && !isExpired(entry))
    ;(isAllowed ? allowed : failing).push(finding)
  }

  const expired = entries.filter(isExpired)

  const inScope = entries.filter(
    (entry) =>
      run.judgeStale !== false &&
      entry.scanner === run.scanner &&
      (entry.scanner !== "image" || entry.image === run.image)
  )
  const stale = inScope.filter((entry) => !findings.some((finding) => matches(finding, entry)))

  return { failing, allowed, reported, expired, stale }
}

const pad = (rows: string[][]): string[] => {
  // Every row the callers below build has the same number of columns (a header plus rows all
  // constructed from the same fixed column list), so `row[col]`/`widths[col]` are always present
  // in practice — the `?? ` fallbacks are only to satisfy `noUncheckedIndexedAccess`.
  const first = rows[0]
  if (!first) return []
  const widths = first.map((_, col) => Math.max(...rows.map((row) => row[col]?.length ?? 0)))
  return rows.map((row) =>
    row
      .map((cell, col) => cell.padEnd(widths[col] ?? 0))
      .join("  ")
      .trimEnd()
  )
}

const dash = (value: string | number | undefined): string =>
  value === undefined ? "-" : String(value)

/**
 * Renders findings as a plain-text table for logs. Vulnerability findings (`audit`/`image`) and
 * secret findings are rendered as separate sections, because a secret finding's row must never
 * carry a field beyond its rule id, file and line — not severity, not any of the vulnerability
 * columns — even if a `Finding` object constructed upstream happens to set one. That is a
 * deliberate, narrow column list, not an oversight: Task 3's redaction tests rely on it.
 */
export function formatTable(findings: Finding[]): string {
  if (findings.length === 0) return "(no findings)"

  const sections: string[] = []

  const vulns = findings.filter((f) => f.scanner === "audit" || f.scanner === "image")
  if (vulns.length > 0) {
    const header = ["SEVERITY", "SCANNER", "ID", "PACKAGE", "IMAGE", "INSTALLED", "FIXED", "URL"]
    const rows = vulns.map((f) => [
      f.severity,
      f.scanner,
      f.id,
      dash(f.package),
      dash(f.image),
      dash(f.installed),
      dash(f.fixed),
      dash(f.url),
    ])
    sections.push(pad([header, ...rows]).join("\n"))
  }

  const secrets = findings.filter((f) => f.scanner === "secrets")
  if (secrets.length > 0) {
    const header = ["RULE", "FILE", "LINE"]
    const rows = secrets.map((f) => [f.id, dash(f.file), dash(f.line)])
    sections.push(pad([header, ...rows]).join("\n"))
  }

  return sections.join("\n\n")
}

/**
 * Reads and validates `security/allowlist.json` (or `path`, for a fixture). The only I/O in this
 * module — everything else is a pure function over the data this loads. Uses the real clock
 * (`today` is for the pure functions' tests, not for the committed file).
 */
export function loadAllowlist(path: string = DEFAULT_ALLOWLIST_PATH): {
  entries: Entry[]
  errors: string[]
} {
  const raw = JSON.parse(readFileSync(path, "utf8"))
  return parseAllowlist(raw, new Date())
}
